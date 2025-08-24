package aggregator

import (
	"context"
	"fmt"
	"sync"
	"time"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	metricsv1beta1types "k8s.io/metrics/pkg/apis/metrics/v1beta1"
	metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned/typed/metrics/v1beta1"

	kubemetrics "github.com/aaronlmathis/kaptn/internal/kube/metrics"
	"github.com/aaronlmathis/kaptn/internal/metrics"
	"github.com/aaronlmathis/kaptn/internal/timeseries"
)

// hostSnap represents a snapshot of host-level metrics
type hostSnap struct {
	// Node capacity and usage
	Cores        float64 // CPU capacity in cores
	CPUUsedCores float64 // Current CPU usage in cores

	// Network counters (monotonic)
	LastRx        uint64    // Last received bytes
	LastTx        uint64    // Last transmitted bytes
	LastRxPackets uint64    // Last received packets
	LastTxPackets uint64    // Last transmitted packets
	LastTs        time.Time // Timestamp of last measurement
}

type nsRestartState struct {
	lastTotal int64
	lastTime  time.Time
}

// Aggregator maintains cluster-level time series by aggregating node-level metrics
type Aggregator struct {
	logger     *zap.Logger
	store      timeseries.Store
	kubeClient kubernetes.Interface

	// Kubernetes adapters
	nodesAdapter      *kubemetrics.NodesAdapter
	apiMetricsAdapter *kubemetrics.APIMetricsAdapter
	summaryAdapter    *kubemetrics.SummaryStatsAdapter

	// State management
	mu                  sync.RWMutex
	hostSnapshots       map[string]*hostSnap
	lastCapacityRefresh time.Time

	// New: poll interval tracking for gating expensive operations
	lastResourcePoll time.Time
	lastSummaryPoll  time.Time
	lastStateRecon   time.Time

	// New: restart tracking for rate calculation
	lastRestartsTotal int64
	lastRestartsTime  time.Time
	nsRestartsState   map[string]*nsRestartState

	// Configuration
	config                  Config
	capacityRefreshInterval time.Duration

	// Shutdown management
	stopCh chan struct{}
	done   chan struct{}
}

// Config holds configuration for the aggregator
type Config struct {
	// Collection intervals
	TickInterval            time.Duration `yaml:"tick_interval"`
	CapacityRefreshInterval time.Duration `yaml:"capacity_refresh_interval"`

	// New poll intervals for gating expensive operations
	ResourcePollInterval   time.Duration `yaml:"resource_poll_interval"`   // metrics.k8s.io
	SummaryPollInterval    time.Duration `yaml:"summary_poll_interval"`    // Summary API
	StateReconcileInterval time.Duration `yaml:"state_reconcile_interval"` // Core API counts
	PruneInterval          time.Duration `yaml:"prune_interval"`           // Background pruning

	// Feature flags
	Enabled                     bool `yaml:"enabled"`
	DisableNetworkIfUnavailable bool `yaml:"disable_network_if_unavailable"`

	// TLS configuration
	InsecureTLS bool `yaml:"insecure_tls"`
}

// DefaultConfig returns the default aggregator configuration
func DefaultConfig() Config {
	return Config{
		TickInterval:                1 * time.Second,
		CapacityRefreshInterval:     30 * time.Second,
		ResourcePollInterval:        5 * time.Second,  // Reduced from 15s for faster testing
		SummaryPollInterval:         10 * time.Second, // Reduced from 30s for faster testing
		StateReconcileInterval:      10 * time.Second, // Reduced from 60s for faster testing
		PruneInterval:               30 * time.Second, // Background pruning
		Enabled:                     true,
		DisableNetworkIfUnavailable: true,
	}
}

// NewAggregator creates a new metrics aggregator
func NewAggregator(
	logger *zap.Logger,
	store timeseries.Store,
	kubeClient kubernetes.Interface,
	metricsClient metricsv1beta1.MetricsV1beta1Interface,
	restConfig *rest.Config,
	config Config,
) *Aggregator {
	return &Aggregator{
		logger:                  logger,
		store:                   store,
		kubeClient:              kubeClient,
		hostSnapshots:           make(map[string]*hostSnap),
		config:                  config,
		capacityRefreshInterval: config.CapacityRefreshInterval,
		stopCh:                  make(chan struct{}),
		done:                    make(chan struct{}),
		nsRestartsState:         make(map[string]*nsRestartState),

		// Initialize adapters
		nodesAdapter:      kubemetrics.NewNodesAdapter(logger, kubeClient),
		apiMetricsAdapter: kubemetrics.NewAPIMetricsAdapter(logger, kubeClient, metricsClient),
		summaryAdapter:    kubemetrics.NewSummaryStatsAdapter(logger, kubeClient, restConfig, config.InsecureTLS),
	}
}

// Start begins the aggregation process
func (a *Aggregator) Start(ctx context.Context) error {
	if !a.config.Enabled {
		a.logger.Info("Time series aggregation is disabled")
		return nil
	}

	a.logger.Info("Starting time series aggregator",
		zap.Duration("tickInterval", a.config.TickInterval),
		zap.Duration("capacityRefreshInterval", a.capacityRefreshInterval),
		zap.Duration("resourcePollInterval", a.config.ResourcePollInterval),
		zap.Duration("summaryPollInterval", a.config.SummaryPollInterval),
		zap.Duration("stateReconcileInterval", a.config.StateReconcileInterval),
		zap.Duration("pruneInterval", a.config.PruneInterval),
	)

	// Check capabilities on startup
	hasMetricsAPI := a.apiMetricsAdapter.HasMetricsAPI(ctx)
	hasSummaryAPI := a.summaryAdapter.HasSummaryAPI(ctx)

	a.logger.Info("Metrics capabilities detected",
		zap.Bool("metricsAPI", hasMetricsAPI),
		zap.Bool("summaryAPI", hasSummaryAPI),
	)

	go a.run(ctx)
	go a.pruneLoop(ctx) // Start background pruning
	return nil
}

// Stop gracefully shuts down the aggregator
func (a *Aggregator) Stop() {
	close(a.stopCh)

	// Only wait for done channel if aggregation is enabled
	if a.config.Enabled {
		<-a.done
	}
}

// run executes the main aggregation loop
func (a *Aggregator) run(ctx context.Context) {
	defer close(a.done)

	ticker := time.NewTicker(a.config.TickInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			a.logger.Info("Aggregator stopped due to context cancellation")
			return
		case <-a.stopCh:
			a.logger.Info("Aggregator stopped gracefully")
			return
		case <-ticker.C:
			a.tick(ctx)
		}
	}
}

// tick performs one collection cycle
func (a *Aggregator) tick(ctx context.Context) {
	now := time.Now()

	// Refresh node capacities periodically
	a.mu.RLock()
	shouldRefreshCapacity := now.Sub(a.lastCapacityRefresh) >= a.capacityRefreshInterval
	shouldCollectResource := now.Sub(a.lastResourcePoll) >= a.config.ResourcePollInterval
	shouldCollectSummary := now.Sub(a.lastSummaryPoll) >= a.config.SummaryPollInterval
	shouldReconcileState := now.Sub(a.lastStateRecon) >= a.config.StateReconcileInterval
	a.mu.RUnlock()

	if shouldRefreshCapacity {
		a.refreshNodeCapacities(ctx, now)
	}

	// Gate expensive resource metrics collection
	// These metrics are typically available from Kubelet /metrics/resource or /stats/summary
	if shouldCollectResource {
		a.collectCPUMetrics(ctx, now)
		a.collectMemoryUsageMetrics(ctx, now)
		a.collectNodeResourceCapacityMetrics(ctx, now) // Collects CPU, Mem, Pods capacity/allocatable
		a.collectResourceRequests(ctx, now)            // Cluster-wide requests
		a.collectResourceLimits(ctx, now)
		a.collectPodResourceMetrics(ctx, now)
		a.collectPodRestartMetrics(ctx, now)
		a.collectNamespaceMetrics(ctx, now)
		a.collectClusterRestartMetrics(ctx, now)
		a.collectClusterNodeReadiness(ctx, now)
		a.collectClusterImageFsMetrics(ctx, now)
		a.collectPodMetrics(ctx, now)
		a.collectContainerMetrics(ctx, now)
		a.mu.Lock()
		a.lastResourcePoll = now
		a.mu.Unlock()
	}

	// Gate expensive network/summary metrics collection
	if shouldCollectSummary {
		a.collectNetworkMetrics(ctx, now) // Includes PPS calculation now
		a.collectNodeFilesystemMetrics(ctx, now)
		a.collectNodeDetailedMetrics(ctx, now)
		a.collectBasicNodeMetrics(ctx, now)
		a.collectBasicPodNetworkMetrics(ctx, now)
		a.mu.Lock()
		a.lastSummaryPoll = now
		a.mu.Unlock()
	}

	// Gate state reconciliation (pod/node counts)
	if shouldReconcileState {
		a.collectNodeConditionMetrics(ctx, now) // Collects node ready/pressure conditions
		a.collectStateMetrics(ctx, now)
		a.mu.Lock()
		a.lastStateRecon = now
		a.mu.Unlock()
	}
}

// refreshNodeCapacities updates node capacity information
func (a *Aggregator) refreshNodeCapacities(ctx context.Context, now time.Time) {
	nodeCapacities, err := a.nodesAdapter.ListNodes(ctx)
	if err != nil {
		a.logger.Error("Failed to refresh node capacities", zap.Error(err))
		return
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	// Update capacity for existing nodes and add new nodes
	for _, node := range nodeCapacities {
		if _, exists := a.hostSnapshots[node.Name]; !exists {
			a.hostSnapshots[node.Name] = &hostSnap{}
		}
		a.hostSnapshots[node.Name].Cores = node.CPUCores
	}

	// Remove nodes that no longer exist
	currentNodes := make(map[string]bool)
	for _, node := range nodeCapacities {
		currentNodes[node.Name] = true
	}

	for nodeName := range a.hostSnapshots {
		if !currentNodes[nodeName] {
			delete(a.hostSnapshots, nodeName)
		}
	}

	a.lastCapacityRefresh = now

	a.logger.Debug("Refreshed node capacities",
		zap.Int("nodeCount", len(nodeCapacities)),
	)
}

// collectMemoryUsageMetrics collects and aggregates memory usage metrics from the Metrics API
func (a *Aggregator) collectMemoryUsageMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		// Using "resource" as the collector name to group with CPU
		metrics.RecordCollectorScrape("resource_memory", time.Since(start), hasError)
	}()

	if !a.apiMetricsAdapter.HasMetricsAPI(ctx) {
		a.logger.Debug("Metrics API not available, skipping memory usage metrics")
		return
	}

	// Get individual node usage for node-level metrics.
	// This assumes APIMetricsAdapter has a ListNodeMemoryUsage method similar to ListNodeCPUUsage.
	nodeUsageMap, err := a.apiMetricsAdapter.ListNodeMemoryUsage(ctx)
	if err != nil {
		hasError = true
		a.logger.Warn("Failed to collect node memory usage", zap.Error(err))
		return
	}

	var totalUsage float64

	// Store individual node usage metrics
	for nodeName, usage := range nodeUsageMap {
		nodeEntity := map[string]string{"node": nodeName}
		totalUsage += usage

		// Store node.mem.usage.bytes
		nodeUsageSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeMemUsageBase, nodeName))
		if nodeUsageSeries != nil {
			nodeUsageSeries.Add(timeseries.NewPointWithEntity(now, usage, nodeEntity))
		}

		// Store node.mem.working_set.bytes. For metrics-server, this is often the same value as usage.
		nodeWorkingSetSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeMemWorkingSetBase, nodeName))
		if nodeWorkingSetSeries != nil {
			nodeWorkingSetSeries.Add(timeseries.NewPointWithEntity(now, usage, nodeEntity))
		}
	}

	// Store cluster total usage, which is required for the headroom chart
	usageSeries := a.store.Upsert(timeseries.ClusterMemUsedBytes)
	if usageSeries != nil {
		usageSeries.Add(timeseries.Point{T: now, V: totalUsage})
	}

	a.logger.Debug("Collected memory usage metrics",
		zap.Float64("total_usage_gb", totalUsage/(1024*1024*1024)),
		zap.Int("nodes", len(nodeUsageMap)),
	)
}

// collectCPUMetrics collects and aggregates CPU metrics
func (a *Aggregator) collectCPUMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("resource", time.Since(start), hasError)
	}()

	// Collect CPU capacity (sum of all nodes)
	var totalCapacity float64
	a.mu.RLock()
	for _, snap := range a.hostSnapshots {
		totalCapacity += snap.Cores
	}
	a.mu.RUnlock()

	// Store CPU capacity
	if totalCapacity > 0 {
		capacitySeries := a.store.Upsert(timeseries.ClusterCPUCapacityCores)
		if capacitySeries != nil {
			capacitySeries.Add(timeseries.Point{T: now, V: totalCapacity})
		}

		// Store CPU allocatable (same as capacity for now)
		allocatableSeries := a.store.Upsert(timeseries.ClusterCPUAllocatableCores)
		if allocatableSeries != nil {
			allocatableSeries.Add(timeseries.Point{T: now, V: totalCapacity})
		}
	}

	// Collect CPU usage if Metrics API is available
	if a.apiMetricsAdapter.HasMetricsAPI(ctx) {
		// Get individual node usage for node-level metrics
		nodeUsageMap, err := a.apiMetricsAdapter.ListNodeCPUUsage(ctx)
		if err != nil {
			hasError = true
			a.logger.Warn("Failed to collect node CPU usage", zap.Error(err))
		} else {
			var totalUsage float64

			// Store individual node usage metrics
			for nodeName, usage := range nodeUsageMap {
				nodeEntity := map[string]string{"node": nodeName}
				totalUsage += usage

				nodeUsageSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeCPUUsageBase, nodeName))
				if nodeUsageSeries != nil {
					nodeUsageSeries.Add(timeseries.NewPointWithEntity(now, usage, nodeEntity))
				}
			}

			// Store cluster total usage
			usageSeries := a.store.Upsert(timeseries.ClusterCPUUsedCores)
			if usageSeries != nil {
				usageSeries.Add(timeseries.Point{T: now, V: totalUsage})
			}

			a.logger.Debug("Collected CPU metrics",
				zap.Float64("capacity", totalCapacity),
				zap.Float64("usage", totalUsage),
				zap.Int("nodes", len(nodeUsageMap)),
			)
		}
	}
}

// collectNetworkMetrics collects and aggregates network metrics
func (a *Aggregator) collectNetworkMetrics(ctx context.Context, now time.Time) { // Renamed from collectNetworkMetrics
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("summary", time.Since(start), hasError)
	}()

	hasSummaryAPI := a.summaryAdapter.HasSummaryAPI(ctx)

	// If network is disabled when unavailable and we don't have Summary API, skip
	if a.config.DisableNetworkIfUnavailable && !hasSummaryAPI {
		return
	}

	if !hasSummaryAPI {
		return
	}

	networkStats, err := a.summaryAdapter.ListNodeNetworkStats(ctx)

	if err != nil {
		hasError = true
		a.logger.Warn("Failed to collect network stats", zap.Error(err))
		return
	}

	var totalRxRate, totalTxRate float64

	a.mu.Lock()
	defer a.mu.Unlock()

	for _, stat := range networkStats {
		nodeEntity := map[string]string{"node": stat.NodeName}
		snap, exists := a.hostSnapshots[stat.NodeName]
		if !exists {
			// Initialize new snapshot
			snap = &hostSnap{
				LastRx:        stat.RxBytes,
				LastTx:        stat.TxBytes,
				LastRxPackets: stat.RxPackets,
				LastTxPackets: stat.TxPackets,
				LastTs:        now,
			}
			a.hostSnapshots[stat.NodeName] = snap
			continue
		}

		// Calculate rates if we have previous data
		if !snap.LastTs.IsZero() {
			dt := now.Sub(snap.LastTs).Seconds()
			if dt > 0 {
				// Handle counter resets (new value less than old value)
				// Calculate BPS
				if stat.RxBytes >= snap.LastRx {
					rxRate := float64(stat.RxBytes-snap.LastRx) / dt
					totalRxRate += rxRate
					nodeRxSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeNetRxBase, stat.NodeName))
					if nodeRxSeries != nil {
						nodeRxSeries.Add(timeseries.NewPointWithEntity(now, rxRate, nodeEntity))
					}
				}

				if stat.TxBytes >= snap.LastTx {
					txRate := float64(stat.TxBytes-snap.LastTx) / dt
					totalTxRate += txRate
					nodeTxSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeNetTxBase, stat.NodeName))
					if nodeTxSeries != nil {
						nodeTxSeries.Add(timeseries.NewPointWithEntity(now, txRate, nodeEntity))
					}
				}

				// Calculate PPS (packets per second)
				if stat.RxPackets >= snap.LastRxPackets {
					nodeRxPps := float64(stat.RxPackets-snap.LastRxPackets) / dt
					ppsSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeNetRxPpsBase, stat.NodeName))
					if ppsSeries != nil {
						ppsSeries.Add(timeseries.NewPointWithEntity(now, nodeRxPps, nodeEntity))
					}
				}
				if stat.TxPackets >= snap.LastTxPackets {
					nodeTxPps := float64(stat.TxPackets-snap.LastTxPackets) / dt
					ppsSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeNetTxPpsBase, stat.NodeName))
					if ppsSeries != nil {
						ppsSeries.Add(timeseries.NewPointWithEntity(now, nodeTxPps, nodeEntity))
					}
				}
			}
		}

		// Update snapshot
		snap.LastRx = stat.RxBytes
		snap.LastTx = stat.TxBytes
		snap.LastRxPackets = stat.RxPackets
		snap.LastTxPackets = stat.TxPackets
		snap.LastTs = now
	}

	// Store network rates
	rxSeries := a.store.Upsert(timeseries.ClusterNetRxBps)
	if rxSeries != nil {
		rxSeries.Add(timeseries.Point{T: now, V: totalRxRate})
	}

	txSeries := a.store.Upsert(timeseries.ClusterNetTxBps)
	if txSeries != nil {
		txSeries.Add(timeseries.Point{T: now, V: totalTxRate})
	}

	a.logger.Debug("Collected network metrics",
		zap.Float64("rxBps", totalRxRate),
		zap.Float64("txBps", totalTxRate),
		zap.Int("nodes", len(networkStats)),
	)
}

// GetCapabilities returns the current capabilities of the aggregator
func (a *Aggregator) GetCapabilities(ctx context.Context) map[string]bool {
	return map[string]bool{
		"metricsAPI": a.apiMetricsAdapter.HasMetricsAPI(ctx),
		"summaryAPI": a.summaryAdapter.HasSummaryAPI(ctx),
	}
}

// pruneLoop runs background pruning at configured intervals
func (a *Aggregator) pruneLoop(ctx context.Context) {
	ticker := time.NewTicker(a.config.PruneInterval)
	defer ticker.Stop()

	a.logger.Info("Starting background pruner",
		zap.Duration("interval", a.config.PruneInterval))

	for {
		select {
		case <-ctx.Done():
			a.logger.Info("Pruner stopped due to context cancellation")
			return
		case <-a.stopCh:
			a.logger.Info("Pruner stopped gracefully")
			return
		case <-ticker.C:
			a.logger.Debug("Running background prune")
			a.store.Prune()
		}
	}
}

// collectMemoryMetrics collects both cluster and node-level memory metrics
func (a *Aggregator) collectNodeResourceCapacityMetrics(ctx context.Context, now time.Time) {
	// Get node list for both capacity and individual node metrics
	nodeList, err := a.nodesAdapter.ListNodes(ctx)
	if err != nil {
		a.logger.Error("Failed to collect nodes for memory metrics", zap.Error(err))
		return
	}

	var totalMemoryCapacity float64
	var totalCPUCapacity float64
	// Collect individual node capacity metrics
	for _, node := range nodeList {
		nodeEntity := map[string]string{"node": node.Name}
		totalMemoryCapacity += node.MemoryBytes

		// Store individual node capacity metrics
		nodeCapSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeCapacityMemBase, node.Name))
		if nodeCapSeries != nil {
			nodeCapSeries.Add(timeseries.NewPointWithEntity(now, node.MemoryBytes, nodeEntity))
		}

		// Store individual node allocatable metrics (same as capacity for now)
		nodeAllocSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeAllocatableMemBase, node.Name))
		if nodeAllocSeries != nil {
			nodeAllocSeries.Add(timeseries.NewPointWithEntity(now, node.MemoryBytes, nodeEntity))
		}

		// Collect CPU capacity at node level
		totalCPUCapacity += node.CPUCores
		// Also collect CPU capacity at node level
		nodeCapCPUSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeCapacityCPUBase, node.Name))
		if nodeCapCPUSeries != nil {
			nodeCapCPUSeries.Add(timeseries.NewPointWithEntity(now, node.CPUCores, nodeEntity))
		}
		nodeAllocCPUSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeAllocatableCPUBase, node.Name))
		if nodeAllocCPUSeries != nil {
			nodeAllocCPUSeries.Add(timeseries.NewPointWithEntity(now, node.CPUCores, nodeEntity))
		}

		// Collect Pods capacity at node level
		nodePodsCapacitySeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeCapacityPodsBase, node.Name))
		if nodePodsCapacitySeries != nil {
			nodePodsCapacitySeries.Add(timeseries.NewPointWithEntity(now, float64(node.Pods), nodeEntity))
		}
		nodePodsAllocatableSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeAllocatablePodsBase, node.Name))
		if nodePodsAllocatableSeries != nil {
			nodePodsAllocatableSeries.Add(timeseries.NewPointWithEntity(now, float64(node.AllocatablePods), nodeEntity))
		}
	}

	// Store cluster-level memory allocatable
	if totalMemoryCapacity > 0 {
		allocatableSeries := a.store.Upsert(timeseries.ClusterMemAllocatableBytes)
		if allocatableSeries != nil {
			allocatableSeries.Add(timeseries.Point{T: now, V: totalMemoryCapacity})
		}

		// Store cluster-level memory capacity
		capacitySeries := a.store.Upsert(timeseries.ClusterMemCapacityBytes)
		if capacitySeries != nil {
			capacitySeries.Add(timeseries.Point{T: now, V: totalMemoryCapacity})
		}
	}
	// Store cluster CPU capacity
	if totalCPUCapacity > 0 {
		capacitySeries := a.store.Upsert(timeseries.ClusterCPUCapacityCores)
		if capacitySeries != nil {
			capacitySeries.Add(timeseries.Point{T: now, V: totalCPUCapacity})
		}
		allocatableSeries := a.store.Upsert(timeseries.ClusterCPUAllocatableCores)
		if allocatableSeries != nil {
			allocatableSeries.Add(timeseries.Point{T: now, V: totalCPUCapacity})
		}
	}

	a.logger.Debug("Collected node resource capacity metrics",
		zap.Float64("cluster_allocatable_gb", totalMemoryCapacity/(1024*1024*1024)),
		zap.Int("node_count", len(nodeList)))
}

// collectNodeConditionMetrics collects node condition metrics (ready, pressure)
func (a *Aggregator) collectNodeConditionMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("node_conditions", time.Since(start), hasError)
	}()

	nodeList, err := a.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to list nodes for condition metrics", zap.Error(err))
		return
	}

	for _, node := range nodeList.Items {
		nodeEntity := map[string]string{"node": node.Name}

		// Node Ready condition
		readyStatus := 0.0
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeReady && condition.Status == corev1.ConditionTrue {
				readyStatus = 1.0
				break
			}
		}
		readySeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeConditionReadyBase, node.Name))
		if readySeries != nil {
			readySeries.Add(timeseries.NewPointWithEntity(now, readyStatus, nodeEntity))
		}

		// Node Disk Pressure
		diskPressure := 0.0
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeDiskPressure && condition.Status == corev1.ConditionTrue {
				diskPressure = 1.0
				break
			}
		}
		diskPressureSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeConditionDiskPressureBase, node.Name))
		if diskPressureSeries != nil {
			diskPressureSeries.Add(timeseries.NewPointWithEntity(now, diskPressure, nodeEntity))
		}

		// Node Memory Pressure
		memPressure := 0.0
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeMemoryPressure && condition.Status == corev1.ConditionTrue {
				memPressure = 1.0
				break
			}
		}
		memPressureSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeConditionMemoryPressureBase, node.Name))
		if memPressureSeries != nil {
			memPressureSeries.Add(timeseries.NewPointWithEntity(now, memPressure, nodeEntity))
		}

		// Node PID Pressure
		pidPressure := 0.0
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodePIDPressure && condition.Status == corev1.ConditionTrue {
				pidPressure = 1.0
				break
			}
		}
		pidPressureSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeConditionPIDPressureBase, node.Name))
		if pidPressureSeries != nil {
			pidPressureSeries.Add(timeseries.NewPointWithEntity(now, pidPressure, nodeEntity))
		}
	}

	a.logger.Debug("Collected node condition metrics",
		zap.Int("node_count", len(nodeList.Items)),
	)
}

// collectNodeFilesystemMetrics collects node filesystem and image filesystem metrics
func (a *Aggregator) collectNodeFilesystemMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("node_filesystem", time.Since(start), hasError)
	}()

	if !a.summaryAdapter.HasSummaryAPI(ctx) {
		a.logger.Debug("Summary API not available, skipping node filesystem metrics")
		return
	}

	// NOTE: This assumes kubemetrics.SummaryStatsAdapter has a method ListNodeFilesystemStats
	// that returns a slice of a struct containing:
	// NodeName, FsCapacityBytes, FsAvailableBytes, FsInodesTotal, FsInodesFree,
	// ImageFsCapacityBytes, ImageFsAvailableBytes, ImageFsInodesTotal, ImageFsInodesFree.
	fsStats, err := a.summaryAdapter.ListNodeFilesystemStats(ctx) // Assumed new method
	if err != nil {
		hasError = true
		a.logger.Warn("Failed to collect node filesystem stats", zap.Error(err))
		return
	}

	for _, stat := range fsStats {
		nodeEntity := map[string]string{"node": stat.NodeName}

		// Root Filesystem Metrics
		a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeFsCapacityBase, stat.NodeName), now, float64(stat.FsCapacityBytes), nodeEntity)
		a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeFsAvailableBase, stat.NodeName), now, float64(stat.FsAvailableBytes), nodeEntity)
		a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeFsInodesTotalBase, stat.NodeName), now, float64(stat.FsInodesTotal), nodeEntity)
		a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeFsInodesFreeBase, stat.NodeName), now, float64(stat.FsInodesFree), nodeEntity)

		// Calculate used bytes and percent for rootfs
		fsUsedBytes := stat.FsCapacityBytes - stat.FsAvailableBytes
		a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeFsUsedBase, stat.NodeName), now, float64(fsUsedBytes), nodeEntity)
		if stat.FsCapacityBytes > 0 {
			fsUsedPercent := (float64(fsUsedBytes) / float64(stat.FsCapacityBytes)) * 100
			a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeFsUsedPercentBase, stat.NodeName), now, fsUsedPercent, nodeEntity)
		}
		// Calculate inodes used percent for rootfs
		fsInodesUsed := stat.FsInodesTotal - stat.FsInodesFree
		if stat.FsInodesTotal > 0 {
			fsInodesUsedPercent := (float64(fsInodesUsed) / float64(stat.FsInodesTotal)) * 100
			a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeFsInodesUsedPercentBase, stat.NodeName), now, fsInodesUsedPercent, nodeEntity)
		}

		// Image Filesystem Metrics
		a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeImageFsCapacityBase, stat.NodeName), now, float64(stat.ImageFsCapacityBytes), nodeEntity)
		a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeImageFsAvailableBase, stat.NodeName), now, float64(stat.ImageFsAvailableBytes), nodeEntity)
		a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeImageFsInodesTotalBase, stat.NodeName), now, float64(stat.ImageFsInodesTotal), nodeEntity)
		a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeImageFsInodesFreeBase, stat.NodeName), now, float64(stat.ImageFsInodesFree), nodeEntity)

		// Calculate used bytes and percent for imagefs
		imageFsUsedBytes := stat.ImageFsCapacityBytes - stat.ImageFsAvailableBytes
		a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeImageFsUsedBase, stat.NodeName), now, float64(imageFsUsedBytes), nodeEntity)
		if stat.ImageFsCapacityBytes > 0 {
			imageFsUsedPercent := (float64(imageFsUsedBytes) / float64(stat.ImageFsCapacityBytes)) * 100
			a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeImageFsUsedPercentBase, stat.NodeName), now, imageFsUsedPercent, nodeEntity)
		}
		// Calculate inodes used percent for imagefs
		imageFsInodesUsed := stat.ImageFsInodesTotal - stat.ImageFsInodesFree
		if stat.ImageFsInodesTotal > 0 {
			imageFsInodesUsedPercent := (float64(imageFsInodesUsed) / float64(stat.ImageFsInodesTotal)) * 100
			a.storeMetric(timeseries.GenerateNodeSeriesKey(timeseries.NodeImageFsInodesUsedPercentBase, stat.NodeName), now, imageFsInodesUsedPercent, nodeEntity)
		}
	}

	a.logger.Debug("Collected node filesystem metrics",
		zap.Int("node_count", len(fsStats)),
	)
}

// storeMetric is a helper to store a metric point
func (a *Aggregator) storeMetric(key string, t time.Time, v float64, entity map[string]string) {
	series := a.store.Upsert(key)
	if series != nil {
		series.Add(timeseries.NewPointWithEntity(t, v, entity))
	}
}

// collectStateMetrics collects cluster state metrics (pod counts, node counts)
func (a *Aggregator) collectStateMetrics(ctx context.Context, now time.Time) {
	// Collect node count
	nodeList, err := a.nodesAdapter.ListNodes(ctx)
	if err != nil {
		a.logger.Error("Failed to collect node count", zap.Error(err))
		return
	}

	nodeCount := float64(len(nodeList))
	nodeCountSeries := a.store.Upsert(timeseries.ClusterNodesCount)
	if nodeCountSeries != nil {
		nodeCountSeries.Add(timeseries.Point{T: now, V: nodeCount})
	}

	// Collect pod counts by phase
	pods, err := a.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		a.logger.Error("Failed to collect pod counts", zap.Error(err))
		// Fall back to placeholder zeros
		a.storePodPlaceholders(now)
		return
	}

	// Count pods by phase and check for unschedulable conditions
	var running, pending, failed, succeeded, unschedulable float64
	for _, pod := range pods.Items {
		switch pod.Status.Phase {
		case corev1.PodRunning:
			running++
		case corev1.PodPending:
			pending++
			// Check if pod is unschedulable
			for _, condition := range pod.Status.Conditions {
				if condition.Type == corev1.PodScheduled &&
					condition.Status == corev1.ConditionFalse &&
					condition.Reason == "Unschedulable" {
					unschedulable++
					break
				}
			}
		case corev1.PodFailed:
			failed++
		case corev1.PodSucceeded:
			succeeded++
		}
	}

	// Store pod counts
	runningPodsSeries := a.store.Upsert(timeseries.ClusterPodsRunning)
	if runningPodsSeries != nil {
		runningPodsSeries.Add(timeseries.Point{T: now, V: running})
	}

	pendingPodsSeries := a.store.Upsert(timeseries.ClusterPodsPending)
	if pendingPodsSeries != nil {
		pendingPodsSeries.Add(timeseries.Point{T: now, V: pending})
	}

	failedPodsSeries := a.store.Upsert(timeseries.ClusterPodsFailed)
	if failedPodsSeries != nil {
		failedPodsSeries.Add(timeseries.Point{T: now, V: failed})
	}

	succeededPodsSeries := a.store.Upsert(timeseries.ClusterPodsSucceeded)
	if succeededPodsSeries != nil {
		succeededPodsSeries.Add(timeseries.Point{T: now, V: succeeded})
	}

	unschedulablePodsSeries := a.store.Upsert(timeseries.ClusterPodsUnschedulable)
	if unschedulablePodsSeries != nil {
		unschedulablePodsSeries.Add(timeseries.Point{T: now, V: unschedulable})
	}

	a.logger.Debug("Collected state metrics",
		zap.Float64("nodes", nodeCount),
		zap.Float64("running_pods", running),
		zap.Float64("pending_pods", pending),
		zap.Float64("failed_pods", failed),
		zap.Float64("succeeded_pods", succeeded),
		zap.Float64("unschedulable_pods", unschedulable),
	)
}

// storePodPlaceholders stores zero values for pod metrics when collection fails
func (a *Aggregator) storePodPlaceholders(now time.Time) {
	runningPodsSeries := a.store.Upsert(timeseries.ClusterPodsRunning)
	if runningPodsSeries != nil {
		runningPodsSeries.Add(timeseries.Point{T: now, V: 0})
	}

	pendingPodsSeries := a.store.Upsert(timeseries.ClusterPodsPending)
	if pendingPodsSeries != nil {
		pendingPodsSeries.Add(timeseries.Point{T: now, V: 0})
	}

	failedPodsSeries := a.store.Upsert(timeseries.ClusterPodsFailed)
	if failedPodsSeries != nil {
		failedPodsSeries.Add(timeseries.Point{T: now, V: 0})
	}

	succeededPodsSeries := a.store.Upsert(timeseries.ClusterPodsSucceeded)
	if succeededPodsSeries != nil {
		succeededPodsSeries.Add(timeseries.Point{T: now, V: 0})
	}
}

// collectResourceRequests collects cluster-level resource requests from pod specs
func (a *Aggregator) collectResourceRequests(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("requests", time.Since(start), hasError)
	}()

	// Get all pods to sum up resource requests
	pods, err := a.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to collect pods for resource requests", zap.Error(err))
		return
	}

	var totalCPURequests, totalMemoryRequests float64

	for _, pod := range pods.Items {
		// Skip completed pods for resource requests calculation
		if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			continue
		}

		for _, container := range pod.Spec.Containers {
			// Sum CPU requests
			if cpuRequest, exists := container.Resources.Requests[corev1.ResourceCPU]; exists {
				cpuCores := float64(cpuRequest.MilliValue()) / 1000.0 // Convert millicores to cores
				totalCPURequests += cpuCores
			}

			// Sum memory requests
			if memRequest, exists := container.Resources.Requests[corev1.ResourceMemory]; exists {
				memoryBytes := float64(memRequest.Value())
				totalMemoryRequests += memoryBytes
			}
		}
	}

	// Store cluster-level resource requests
	cpuRequestsSeries := a.store.Upsert(timeseries.ClusterCPURequestedCores)
	if cpuRequestsSeries != nil {
		cpuRequestsSeries.Add(timeseries.Point{T: now, V: totalCPURequests})
	}

	memRequestsSeries := a.store.Upsert(timeseries.ClusterMemRequestedBytes)
	if memRequestsSeries != nil {
		memRequestsSeries.Add(timeseries.Point{T: now, V: totalMemoryRequests})
	}

	a.logger.Debug("Collected resource requests",
		zap.Float64("cpu_requests_cores", totalCPURequests),
		zap.Float64("memory_requests_gb", totalMemoryRequests/(1024*1024*1024)),
		zap.Int("total_pods", len(pods.Items)),
	)
}

// collectResourceLimits collects cluster-level resource limits from pod specs
func (a *Aggregator) collectResourceLimits(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("limits", time.Since(start), hasError)
	}()

	// Get all pods to sum up resource limits
	pods, err := a.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to collect pods for resource limits", zap.Error(err))
		return
	}

	var totalCPULimits, totalMemoryLimits float64

	for _, pod := range pods.Items {
		// Skip completed pods for resource limits calculation
		if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			continue
		}

		for _, container := range pod.Spec.Containers {
			// Sum CPU limits
			if cpuLimit, exists := container.Resources.Limits[corev1.ResourceCPU]; exists {
				cpuCores := float64(cpuLimit.MilliValue()) / 1000.0 // Convert millicores to cores
				totalCPULimits += cpuCores
			}

			// Sum memory limits
			if memLimit, exists := container.Resources.Limits[corev1.ResourceMemory]; exists {
				memoryBytes := float64(memLimit.Value())
				totalMemoryLimits += memoryBytes
			}
		}
	}

	// Store cluster-level resource limits
	cpuLimitsSeries := a.store.Upsert(timeseries.ClusterCPULimitsCores)
	if cpuLimitsSeries != nil {
		cpuLimitsSeries.Add(timeseries.Point{T: now, V: totalCPULimits})
	}

	memLimitsSeries := a.store.Upsert(timeseries.ClusterMemLimitsBytes)
	if memLimitsSeries != nil {
		memLimitsSeries.Add(timeseries.Point{T: now, V: totalMemoryLimits})
	}

	a.logger.Debug("Collected resource limits",
		zap.Float64("cpu_limits_cores", totalCPULimits),
		zap.Float64("memory_limits_gb", totalMemoryLimits/(1024*1024*1024)),
		zap.Int("total_pods", len(pods.Items)),
	)
}

// collectClusterRestartMetrics collects cluster-level pod restart metrics
func (a *Aggregator) collectClusterRestartMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("restarts", time.Since(start), hasError)
	}()

	// Get all pods to sum up restart counts
	pods, err := a.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to collect pods for restart metrics", zap.Error(err))
		return
	}

	var totalRestarts int64

	for _, pod := range pods.Items {
		for _, containerStatus := range pod.Status.ContainerStatuses {
			totalRestarts += int64(containerStatus.RestartCount)
		}
	}

	// Calculate restart rate (change per second)
	a.mu.Lock()
	var restartRate float64
	if a.lastRestartsTotal > 0 && !a.lastRestartsTime.IsZero() {
		deltaRestarts := totalRestarts - a.lastRestartsTotal
		deltaTime := now.Sub(a.lastRestartsTime).Seconds()
		if deltaTime > 0 {
			restartRate = float64(deltaRestarts) / deltaTime
		}
	}
	a.lastRestartsTotal = totalRestarts
	a.lastRestartsTime = now
	a.mu.Unlock()

	// Store cluster-level restart metrics
	restartsTotalSeries := a.store.Upsert(timeseries.ClusterPodsRestartsTotal)
	if restartsTotalSeries != nil {
		restartsTotalSeries.Add(timeseries.Point{T: now, V: float64(totalRestarts)})
	}

	restartsRateSeries := a.store.Upsert(timeseries.ClusterPodsRestartsRate)
	if restartsRateSeries != nil {
		restartsRateSeries.Add(timeseries.Point{T: now, V: restartRate})
	}

	// Calculate 1-hour restart count using sliding window
	restarts1hSeries := a.store.Upsert(timeseries.ClusterPodsRestarts1h)
	if restarts1hSeries != nil && restartsTotalSeries != nil {
		restarts1h := calculateRestartsInWindow(restartsTotalSeries, float64(totalRestarts), time.Hour)
		restarts1hSeries.Add(timeseries.Point{T: now, V: restarts1h})
	}

	a.logger.Debug("Collected restart metrics",
		zap.Int64("total_restarts", totalRestarts),
		zap.Float64("restart_rate_per_sec", restartRate),
		zap.Int("total_pods", len(pods.Items)),
	)
}

// collectClusterNodeReadiness collects cluster-level node readiness metrics
func (a *Aggregator) collectClusterNodeReadiness(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("node_readiness", time.Since(start), hasError)
	}()

	// Get all nodes to check readiness
	nodes, err := a.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to collect nodes for readiness metrics", zap.Error(err))
		return
	}

	var readyNodes, notReadyNodes int64

	for _, node := range nodes.Items {
		isReady := false
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeReady {
				isReady = condition.Status == corev1.ConditionTrue
				break
			}
		}

		if isReady {
			readyNodes++
		} else {
			notReadyNodes++
		}
	}

	// Store cluster-level node readiness metrics
	readyNodesSeries := a.store.Upsert(timeseries.ClusterNodesReady)
	if readyNodesSeries != nil {
		readyNodesSeries.Add(timeseries.Point{T: now, V: float64(readyNodes)})
	}

	notReadyNodesSeries := a.store.Upsert(timeseries.ClusterNodesNotReady)
	if notReadyNodesSeries != nil {
		notReadyNodesSeries.Add(timeseries.Point{T: now, V: float64(notReadyNodes)})
	}

	a.logger.Debug("Collected node readiness metrics",
		zap.Int64("ready_nodes", readyNodes),
		zap.Int64("not_ready_nodes", notReadyNodes),
		zap.Int("total_nodes", len(nodes.Items)),
	)
}

// collectClusterImageFsMetrics collects cluster-level image filesystem metrics
func (a *Aggregator) collectClusterImageFsMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("imagefs", time.Since(start), hasError)
	}()

	if !a.summaryAdapter.HasSummaryAPI(ctx) {
		a.logger.Debug("Summary API not available, skipping image filesystem metrics")
		return
	}

	// TODO: Implement proper image filesystem collection via Summary API
	// For now, use placeholder values

	// Get all nodes for estimating
	nodes, err := a.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to list nodes for image filesystem metrics", zap.Error(err))
		return
	}

	// Placeholder: estimate 10GB used and 50GB capacity per node
	var totalImageFsUsed = uint64(len(nodes.Items)) * 10 * 1024 * 1024 * 1024     // 10GB per node
	var totalImageFsCapacity = uint64(len(nodes.Items)) * 50 * 1024 * 1024 * 1024 // 50GB per node

	// Store cluster-level image filesystem metrics
	imageFsUsedSeries := a.store.Upsert(timeseries.ClusterFsImageUsedBytes)
	if imageFsUsedSeries != nil {
		imageFsUsedSeries.Add(timeseries.Point{T: now, V: float64(totalImageFsUsed)})
	}

	imageFsCapacitySeries := a.store.Upsert(timeseries.ClusterFsImageCapacityBytes)
	if imageFsCapacitySeries != nil {
		imageFsCapacitySeries.Add(timeseries.Point{T: now, V: float64(totalImageFsCapacity)})
	}

	a.logger.Debug("Collected image filesystem metrics (placeholder)",
		zap.Uint64("total_used_bytes", totalImageFsUsed),
		zap.Uint64("total_capacity_bytes", totalImageFsCapacity),
		zap.Int("total_nodes", len(nodes.Items)),
	)
}

// collectPodResourceMetrics collects per-pod resource requests and limits
func (a *Aggregator) collectPodResourceMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("pod_resources", time.Since(start), hasError)
	}()

	// Get all pods to collect individual resource metrics
	pods, err := a.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to collect pods for pod resource metrics", zap.Error(err))
		return
	}

	podCount := 0
	for _, pod := range pods.Items {
		// Skip completed pods
		if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			continue
		}

		podEntity := map[string]string{
			"namespace": pod.Namespace,
			"pod":       pod.Name,
		}

		var totalCPURequest, totalCPULimit, totalMemRequest, totalMemLimit float64

		// Sum up resources from all containers in the pod
		for _, container := range pod.Spec.Containers {
			// CPU requests
			if cpuRequest, exists := container.Resources.Requests[corev1.ResourceCPU]; exists {
				totalCPURequest += float64(cpuRequest.MilliValue()) / 1000.0
			}
			// CPU limits
			if cpuLimit, exists := container.Resources.Limits[corev1.ResourceCPU]; exists {
				totalCPULimit += float64(cpuLimit.MilliValue()) / 1000.0
			}
			// Memory requests
			if memRequest, exists := container.Resources.Requests[corev1.ResourceMemory]; exists {
				totalMemRequest += float64(memRequest.Value())
			}
			// Memory limits
			if memLimit, exists := container.Resources.Limits[corev1.ResourceMemory]; exists {
				totalMemLimit += float64(memLimit.Value())
			}
		}

		// Store CPU request/limit metrics
		cpuRequestSeries := a.store.Upsert(timeseries.GeneratePodSeriesKey(timeseries.PodCPURequestBase, pod.Namespace, pod.Name))
		if cpuRequestSeries != nil {
			cpuRequestSeries.Add(timeseries.NewPointWithEntity(now, totalCPURequest, podEntity))
		}

		cpuLimitSeries := a.store.Upsert(timeseries.GeneratePodSeriesKey(timeseries.PodCPULimitBase, pod.Namespace, pod.Name))
		if cpuLimitSeries != nil {
			cpuLimitSeries.Add(timeseries.NewPointWithEntity(now, totalCPULimit, podEntity))
		}

		// Store memory request/limit metrics
		memRequestSeries := a.store.Upsert(timeseries.GeneratePodSeriesKey(timeseries.PodMemRequestBase, pod.Namespace, pod.Name))
		if memRequestSeries != nil {
			memRequestSeries.Add(timeseries.NewPointWithEntity(now, totalMemRequest, podEntity))
		}

		memLimitSeries := a.store.Upsert(timeseries.GeneratePodSeriesKey(timeseries.PodMemLimitBase, pod.Namespace, pod.Name))
		if memLimitSeries != nil {
			memLimitSeries.Add(timeseries.NewPointWithEntity(now, totalMemLimit, podEntity))
		}

		podCount++
	}

	a.logger.Debug("Collected pod resource metrics",
		zap.Int("active_pods", podCount),
		zap.Int("total_pods", len(pods.Items)),
	)
}

// collectPodRestartMetrics collects per-pod restart counts and rates
func (a *Aggregator) collectPodRestartMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("pod_restarts", time.Since(start), hasError)
	}()

	// Get all pods to collect restart metrics
	pods, err := a.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to collect pods for restart metrics", zap.Error(err))
		return
	}

	podCount := 0
	for _, pod := range pods.Items {
		podEntity := map[string]string{
			"namespace": pod.Namespace,
			"pod":       pod.Name,
		}

		var totalRestarts int32
		for _, containerStatus := range pod.Status.ContainerStatuses {
			totalRestarts += containerStatus.RestartCount
		}

		// Store restart count
		restartTotalSeries := a.store.Upsert(timeseries.GeneratePodSeriesKey(timeseries.PodRestartsTotalBase, pod.Namespace, pod.Name))
		if restartTotalSeries != nil {
			restartTotalSeries.Add(timeseries.NewPointWithEntity(now, float64(totalRestarts), podEntity))
		}

		// TODO: Calculate restart rate (need to track previous values per pod)
		// For now, store 0 as placeholder
		restartRateSeries := a.store.Upsert(timeseries.GeneratePodSeriesKey(timeseries.PodRestartsRateBase, pod.Namespace, pod.Name))
		if restartRateSeries != nil {
			restartRateSeries.Add(timeseries.NewPointWithEntity(now, 0.0, podEntity))
		}

		podCount++
	}

	a.logger.Debug("Collected pod restart metrics",
		zap.Int("total_pods", podCount),
	)
}

// collectNamespaceMetrics collects namespace-level aggregated metrics
func (a *Aggregator) collectNamespaceMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("namespace_metrics", time.Since(start), hasError)
	}()

	// Get all pods to aggregate by namespace
	a.mu.Lock()
	defer a.mu.Unlock()

	pods, err := a.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to collect pods for namespace metrics", zap.Error(err))
		return
	}

	// Get pod metrics for usage data if available
	var podUsageMap map[string]map[string]float64 // namespace -> pod -> metric
	if a.apiMetricsAdapter.HasMetricsAPI(ctx) {
		_, err := a.apiMetricsAdapter.ListPodMetrics(ctx)
		if err == nil {
			podUsageMap = make(map[string]map[string]float64)
			// TODO: Parse podMetrics and populate podUsageMap
			// For now, use placeholder values
		}
	}

	// Aggregate metrics by namespace
	namespaceData := make(map[string]struct {
		cpuUsed, cpuRequest, cpuLimit float64
		memUsed, memRequest, memLimit float64
		runningPods                   int
		totalRestarts                 int64
	})

	for _, pod := range pods.Items {
		namespace := pod.Namespace

		// Initialize namespace data if not exists
		if _, exists := namespaceData[namespace]; !exists {
			namespaceData[namespace] = struct {
				cpuUsed, cpuRequest, cpuLimit float64
				memUsed, memRequest, memLimit float64
				runningPods                   int
				totalRestarts                 int64
			}{}
		}

		data := namespaceData[namespace]

		// Count running pods
		if pod.Status.Phase == corev1.PodRunning {
			data.runningPods++
		}

		// Skip completed pods for resource calculations
		if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			namespaceData[namespace] = data
			continue
		}

		// Sum up resource requests and limits
		for _, container := range pod.Spec.Containers {
			if cpuRequest, exists := container.Resources.Requests[corev1.ResourceCPU]; exists {
				data.cpuRequest += float64(cpuRequest.MilliValue()) / 1000.0
			}
			if cpuLimit, exists := container.Resources.Limits[corev1.ResourceCPU]; exists {
				data.cpuLimit += float64(cpuLimit.MilliValue()) / 1000.0
			}
			if memRequest, exists := container.Resources.Requests[corev1.ResourceMemory]; exists {
				data.memRequest += float64(memRequest.Value())
			}
			if memLimit, exists := container.Resources.Limits[corev1.ResourceMemory]; exists {
				data.memLimit += float64(memLimit.Value())
			}
		}

		// Sum up restart counts
		for _, containerStatus := range pod.Status.ContainerStatuses {
			data.totalRestarts += int64(containerStatus.RestartCount)
		}

		// Add placeholder usage if real metrics not available
		if podUsageMap == nil {
			// Placeholder: 50% of requests as usage
			data.cpuUsed += data.cpuRequest * 0.5
			data.memUsed += data.memRequest * 0.5
		}

		namespaceData[namespace] = data
	}

	// Store namespace-level metrics
	for namespace, data := range namespaceData {
		nsEntity := map[string]string{"namespace": namespace}

		// CPU metrics
		cpuUsedSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespaceCPUUsedBase, namespace))
		if cpuUsedSeries != nil {
			cpuUsedSeries.Add(timeseries.NewPointWithEntity(now, data.cpuUsed, nsEntity))
		}

		cpuRequestSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespaceCPURequestBase, namespace))
		if cpuRequestSeries != nil {
			cpuRequestSeries.Add(timeseries.NewPointWithEntity(now, data.cpuRequest, nsEntity))
		}

		cpuLimitSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespaceCPULimitBase, namespace))
		if cpuLimitSeries != nil {
			cpuLimitSeries.Add(timeseries.NewPointWithEntity(now, data.cpuLimit, nsEntity))
		}

		// Memory metrics
		memUsedSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespaceMemUsedBase, namespace))
		if memUsedSeries != nil {
			memUsedSeries.Add(timeseries.NewPointWithEntity(now, data.memUsed, nsEntity))
		}

		memRequestSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespaceMemRequestBase, namespace))
		if memRequestSeries != nil {
			memRequestSeries.Add(timeseries.NewPointWithEntity(now, data.memRequest, nsEntity))
		}

		memLimitSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespaceMemLimitBase, namespace))
		if memLimitSeries != nil {
			memLimitSeries.Add(timeseries.NewPointWithEntity(now, data.memLimit, nsEntity))
		}

		// Pod and restart metrics
		runningPodsSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespacePodsRunningBase, namespace))
		if runningPodsSeries != nil {
			runningPodsSeries.Add(timeseries.NewPointWithEntity(now, float64(data.runningPods), nsEntity))
		}

		// --- Restart Metrics ---
		// Store total restarts for this namespace
		restartsTotalSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespacePodsRestartsTotalBase, namespace))
		if restartsTotalSeries != nil {
			restartsTotalSeries.Add(timeseries.NewPointWithEntity(now, float64(data.totalRestarts), nsEntity))
		}

		// Calculate restart rate (restarts/sec)
		var restartRate float64
		state, exists := a.nsRestartsState[namespace]
		if exists && !state.lastTime.IsZero() {
			deltaRestarts := data.totalRestarts - state.lastTotal
			deltaTime := now.Sub(state.lastTime).Seconds()
			if deltaTime > 0 && deltaRestarts >= 0 { // handle counter resets gracefully
				restartRate = float64(deltaRestarts) / deltaTime
			}
		}
		// Update state for next calculation
		if !exists {
			state = &nsRestartState{}
			a.nsRestartsState[namespace] = state
		}
		state.lastTotal = data.totalRestarts
		state.lastTime = now

		restartsRateSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespacePodsRestartsRateBase, namespace))
		if restartsRateSeries != nil {
			restartsRateSeries.Add(timeseries.NewPointWithEntity(now, restartRate, nsEntity))
		}

		// Calculate restarts in the last hour
		restarts1h := calculateRestartsInWindow(restartsTotalSeries, float64(data.totalRestarts), time.Hour)
		restarts1hSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespacePodsRestarts1hBase, namespace))
		if restarts1hSeries != nil {
			restarts1hSeries.Add(timeseries.NewPointWithEntity(now, restarts1h, nsEntity))
		}
	}

	a.logger.Debug("Collected namespace metrics",
		zap.Int("total_namespaces", len(namespaceData)),
		zap.Bool("has_usage_metrics", podUsageMap != nil),
	)
}

// calculateRestartsInWindow calculates the number of restarts in a given time window
// by looking at the historical total restart count.
func calculateRestartsInWindow(series *timeseries.Series, currentTotal float64, window time.Duration) float64 {
	if series == nil {
		return 0
	}

	windowAgo := time.Now().Add(-window)
	var totalAtWindowStart float64 = -1

	// Find the oldest point within the window to get the starting count
	if recentPoints := series.GetSince(windowAgo, timeseries.Hi); len(recentPoints) > 0 {
		totalAtWindowStart = recentPoints[0].V
	} else if recentPoints := series.GetSince(windowAgo, timeseries.Lo); len(recentPoints) > 0 {
		totalAtWindowStart = recentPoints[0].V
	}

	if totalAtWindowStart == -1 || currentTotal < totalAtWindowStart {
		return 0 // No historical data or counter reset
	}

	return currentTotal - totalAtWindowStart
}

// collectPodMetrics collects basic pod-level metrics
func (a *Aggregator) collectPodMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("pods", time.Since(start), hasError)
	}()

	if !a.apiMetricsAdapter.HasMetricsAPI(ctx) {
		a.logger.Debug("Metrics API not available, skipping pod metrics collection")
		return
	}

	// Get pod metrics from the new ListPodMetrics method
	podMetricsRaw, err := a.apiMetricsAdapter.ListPodMetrics(ctx)
	if err != nil {
		hasError = true
		a.logger.Warn("Failed to collect pod metrics", zap.Error(err))
		return
	}

	// For each pod, store metrics with real pod names
	for _, podMetricInterface := range podMetricsRaw {
		// Type assert to get real pod metrics data
		podMetric, ok := podMetricInterface.(metricsv1beta1types.PodMetrics)
		if !ok {
			a.logger.Debug("Unable to extract pod metrics object, skipping")
			continue
		}

		// Extract real pod information
		podEntity := map[string]string{
			"namespace": podMetric.Namespace,
			"pod":       podMetric.Name,
		}

		// Generate series keys with real pod names
		podSeriesKey := timeseries.GeneratePodSeriesKey(timeseries.PodCPUUsageBase, podEntity["namespace"], podEntity["pod"])
		podCPUSeries := a.store.Upsert(podSeriesKey)
		if podCPUSeries != nil {
			// TODO: Extract actual CPU usage from podMetric instead of using sample value
			// Sample: 0.1 cores per pod
			podCPUSeries.Add(timeseries.NewPointWithEntity(now, 0.1, podEntity))
		}

		podMemSeriesKey := timeseries.GeneratePodSeriesKey(timeseries.PodMemUsageBase, podEntity["namespace"], podEntity["pod"])
		podMemSeries := a.store.Upsert(podMemSeriesKey)
		if podMemSeries != nil {
			// TODO: Extract actual memory usage from podMetric instead of using sample value
			// Sample: 128MB per pod
			podMemSeries.Add(timeseries.NewPointWithEntity(now, 128*1024*1024, podEntity))
		}

		podWorkingSetSeriesKey := timeseries.GeneratePodSeriesKey(timeseries.PodMemWorkingSetBase, podEntity["namespace"], podEntity["pod"])
		podWorkingSetSeries := a.store.Upsert(podWorkingSetSeriesKey)
		if podWorkingSetSeries != nil {
			// TODO: Extract actual working set from podMetric instead of using sample value
			// Sample: 120MB working set per pod
			podWorkingSetSeries.Add(timeseries.NewPointWithEntity(now, 120*1024*1024, podEntity))
		}
	}

	a.logger.Debug("Collected pod metrics",
		zap.Int("pod_count", len(podMetricsRaw)),
		zap.String("note", "using real pod names with sample values - full metrics parsing needed"),
	)
}

// collectContainerMetrics collects basic container-level metrics
func (a *Aggregator) collectContainerMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("containers", time.Since(start), hasError)
	}()

	if !a.apiMetricsAdapter.HasMetricsAPI(ctx) {
		a.logger.Debug("Metrics API not available, skipping container metrics collection")
		return
	}

	// Get pod metrics to estimate container count
	podMetricsRaw, err := a.apiMetricsAdapter.ListPodMetrics(ctx)
	if err != nil {
		hasError = true
		a.logger.Warn("Failed to collect container metrics", zap.Error(err))
		return
	}

	// Estimate 2 containers per pod on average
	estimatedContainers := len(podMetricsRaw) * 2

	for i := 0; i < estimatedContainers; i++ {
		// Create synthetic container entity
		containerEntity := map[string]string{
			"namespace": "default",
			"pod":       fmt.Sprintf("pod-%d", i/2),
			"container": fmt.Sprintf("container-%d", i%2),
		}

		ctrCPUSeriesKey := timeseries.GenerateContainerSeriesKey(timeseries.ContainerCPUUsageBase, containerEntity["namespace"], containerEntity["pod"], containerEntity["container"])
		ctrCPUSeries := a.store.Upsert(ctrCPUSeriesKey)
		if ctrCPUSeries != nil {
			// Sample: 0.05 cores per container
			ctrCPUSeries.Add(timeseries.NewPointWithEntity(now, 0.05, containerEntity))
		}

		ctrMemSeriesKey := timeseries.GenerateContainerSeriesKey(timeseries.ContainerMemWorkingSetBase, containerEntity["namespace"], containerEntity["pod"], containerEntity["container"])
		ctrMemSeries := a.store.Upsert(ctrMemSeriesKey)
		if ctrMemSeries != nil {
			// Sample: 64MB per container
			ctrMemSeries.Add(timeseries.NewPointWithEntity(now, 64*1024*1024, containerEntity))
		}

		// Add the missing container metrics you actually need!
		ctrRootFsSeriesKey := timeseries.GenerateContainerSeriesKey(timeseries.ContainerRootFsUsedBase, containerEntity["namespace"], containerEntity["pod"], containerEntity["container"])
		ctrRootFsSeries := a.store.Upsert(ctrRootFsSeriesKey)
		if ctrRootFsSeries != nil {
			// Sample: 500MB rootfs per container
			ctrRootFsSeries.Add(timeseries.NewPointWithEntity(now, 500*1024*1024, containerEntity))
		}

		ctrLogsSeriesKey := timeseries.GenerateContainerSeriesKey(timeseries.ContainerLogsUsedBase, containerEntity["namespace"], containerEntity["pod"], containerEntity["container"])
		ctrLogsSeries := a.store.Upsert(ctrLogsSeriesKey)
		if ctrLogsSeries != nil {
			// Sample: 50MB logs per container
			ctrLogsSeries.Add(timeseries.NewPointWithEntity(now, 50*1024*1024, containerEntity))
		}
	}

	a.logger.Debug("Collected container metrics",
		zap.Int("estimated_containers", estimatedContainers),
		zap.String("note", "using sample values - full metrics parsing needed"),
	)
}

// collectNodeDetailedMetrics collects detailed node-level metrics
func (a *Aggregator) collectNodeDetailedMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("node_details", time.Since(start), hasError)
	}()

	// Get node list
	nodeList, err := a.nodesAdapter.ListNodes(ctx)
	if err != nil {
		hasError = true
		a.logger.Error("Failed to get node list for detailed metrics", zap.Error(err))
		return
	}

	// Collect per-node network rates if Summary API is available
	if a.summaryAdapter.HasSummaryAPI(ctx) {
		networkStats, err := a.summaryAdapter.ListNodeNetworkStats(ctx)
		if err == nil {
			a.mu.Lock()
			for _, stat := range networkStats {
				snap, exists := a.hostSnapshots[stat.NodeName]
				if exists && !snap.LastTs.IsZero() {
					dt := now.Sub(snap.LastTs).Seconds()
					if dt > 0 {
						nodeEntity := map[string]string{"node": stat.NodeName}

						// Calculate per-node network rates
						if stat.RxBytes >= snap.LastRx {
							rxRate := float64(stat.RxBytes-snap.LastRx) / dt
							nodeRxSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeNetRxBase, stat.NodeName))
							if nodeRxSeries != nil {
								nodeRxSeries.Add(timeseries.NewPointWithEntity(now, rxRate, nodeEntity))
							}
						}

						if stat.TxBytes >= snap.LastTx {
							txRate := float64(stat.TxBytes-snap.LastTx) / dt
							nodeTxSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeNetTxBase, stat.NodeName))
							if nodeTxSeries != nil {
								nodeTxSeries.Add(timeseries.NewPointWithEntity(now, txRate, nodeEntity))
							}
						}
					}
				}
			}
			a.mu.Unlock()
		}
	}

	a.logger.Debug("Collected detailed node metrics",
		zap.Int("node_count", len(nodeList)),
		zap.String("note", "memory metrics are placeholders - need Summary API implementation"),
	)
}

// collectBasicNodeMetrics collects basic node metrics that don't require Summary API
func (a *Aggregator) collectBasicNodeMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("basic_nodes", time.Since(start), hasError)
	}()

	// Get node list
	nodeList, err := a.nodesAdapter.ListNodes(ctx)
	if err != nil {
		hasError = true
		a.logger.Error("Failed to get node list for basic metrics", zap.Error(err))
		return
	}

	// For each node, add metrics with proper entity identification
	for _, node := range nodeList {
		nodeEntity := map[string]string{"node": node.Name}

		// Node Process Count (placeholder as no direct K8s API for this)
		nodeProcessSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeProcessCountBase, node.Name))
		if nodeProcessSeries != nil {
			// Placeholder: 200 processes per node
			nodeProcessSeries.Add(timeseries.NewPointWithEntity(now, 200, nodeEntity))
		}
	}

	a.logger.Debug("Collected basic node metrics",
		zap.Int("node_count", len(nodeList)),
		zap.String("note", "only process count is collected here, other metrics moved to dedicated functions"),
	)
}

// collectNodePodCounts collects pod counts per node
func (a *Aggregator) collectNodePodCounts(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("node_pod_counts", time.Since(start), hasError)
	}()

	// Get all pods to count per node
	pods, err := a.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to list pods for node pod counts", zap.Error(err))
		return
	}

	// Count pods per node
	podCountPerNode := make(map[string]int)
	for _, pod := range pods.Items {
		if pod.Spec.NodeName != "" && pod.Status.Phase != corev1.PodSucceeded && pod.Status.Phase != corev1.PodFailed {
			podCountPerNode[pod.Spec.NodeName]++
		}
	}

	// Store pod counts for each node
	for nodeName, count := range podCountPerNode {
		nodeEntity := map[string]string{"node": nodeName}
		nodePodCountSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodePodsCountBase, nodeName))
		if nodePodCountSeries != nil {
			nodePodCountSeries.Add(timeseries.NewPointWithEntity(now, float64(count), nodeEntity))
		}
	}

	a.logger.Debug("Collected node pod counts",
		zap.Int("total_nodes_with_pods", len(podCountPerNode)),
		zap.Int("total_pods", len(pods.Items)),
	)
}

// collectNodePacketStats collects packet-per-second metrics for nodes
func (a *Aggregator) collectNodePacketStats(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("node_packet_stats", time.Since(start), hasError)
	}()

	if !a.summaryAdapter.HasSummaryAPI(ctx) {
		a.logger.Debug("Summary API not available, using placeholder packet stats")

		// Get node list for placeholder stats
		nodeList, err := a.nodesAdapter.ListNodes(ctx)
		if err != nil {
			hasError = true
			a.logger.Error("Failed to get node list for packet stats", zap.Error(err))
			return
		}

		// Add placeholder packet stats for each node
		for _, node := range nodeList {
			nodeEntity := map[string]string{"node": node.Name}

			// Placeholder: 1000 packets/sec RX
			nodeRxPpsSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeNetRxPpsBase, node.Name))
			if nodeRxPpsSeries != nil {
				nodeRxPpsSeries.Add(timeseries.NewPointWithEntity(now, 1000.0, nodeEntity))
			}

			// Placeholder: 800 packets/sec TX
			nodeTxPpsSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeNetTxPpsBase, node.Name))
			if nodeTxPpsSeries != nil {
				nodeTxPpsSeries.Add(timeseries.NewPointWithEntity(now, 800.0, nodeEntity))
			}
		}

		a.logger.Debug("Collected placeholder packet stats",
			zap.Int("node_count", len(nodeList)),
		)
		return
	}

	// TODO: Implement real packet stats collection via Summary API
	// For now, just use placeholder values even when Summary API is available
	a.logger.Debug("Packet stats collection from Summary API not yet implemented")
}

// collectBasicPodNetworkMetrics collects basic pod network placeholder metrics
func (a *Aggregator) collectBasicPodNetworkMetrics(ctx context.Context, now time.Time) {
	start := time.Now()
	var hasError bool
	defer func() {
		metrics.RecordCollectorScrape("pod_network", time.Since(start), hasError)
	}()

	// Get running pods to estimate network activity
	pods, err := a.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		hasError = true
		a.logger.Error("Failed to collect pods for network metrics", zap.Error(err))
		return
	}

	var runningPods int
	for _, pod := range pods.Items {
		if pod.Status.Phase == corev1.PodRunning {
			runningPods++
		}
	}

	// Add placeholder pod network metrics for running pods
	podIndex := 0
	for i := 0; i < runningPods; i++ {
		// Create synthetic pod entity
		podEntity := map[string]string{
			"namespace": "default",
			"pod":       fmt.Sprintf("running-pod-%d", podIndex),
		}

		podNetRxSeriesKey := timeseries.GeneratePodSeriesKey(timeseries.PodNetRxBase, podEntity["namespace"], podEntity["pod"])
		podNetRxSeries := a.store.Upsert(podNetRxSeriesKey)
		if podNetRxSeries != nil {
			// Placeholder: 1KB/s per pod
			podNetRxSeries.Add(timeseries.NewPointWithEntity(now, 1024, podEntity))
		}

		podNetTxSeriesKey := timeseries.GeneratePodSeriesKey(timeseries.PodNetTxBase, podEntity["namespace"], podEntity["pod"])
		podNetTxSeries := a.store.Upsert(podNetTxSeriesKey)
		if podNetTxSeries != nil {
			// Placeholder: 1KB/s per pod
			podNetTxSeries.Add(timeseries.NewPointWithEntity(now, 1024, podEntity))
		}

		podEphemeralSeriesKey := timeseries.GeneratePodSeriesKey(timeseries.PodEphemeralUsedBase, podEntity["namespace"], podEntity["pod"])
		podEphemeralSeries := a.store.Upsert(podEphemeralSeriesKey)
		if podEphemeralSeries != nil {
			// Placeholder: 100MB ephemeral storage per pod
			podEphemeralSeries.Add(timeseries.NewPointWithEntity(now, 100*1024*1024, podEntity))
		}

		// Add ephemeral storage percentage
		podEphemeralPercentKey := timeseries.GeneratePodSeriesKey(timeseries.PodEphemeralPercentBase, podEntity["namespace"], podEntity["pod"])
		podEphemeralPercentSeries := a.store.Upsert(podEphemeralPercentKey)
		if podEphemeralPercentSeries != nil {
			// Calculate percentage based on placeholder values
			// Assume ephemeral capacity of 1GB per pod for percentage calculation
			ephemeralUsed := float64(100 * 1024 * 1024)              // 100MB used (same as above)
			ephemeralCapacity := float64(1024 * 1024 * 1024)         // 1GB capacity assumption
			percentUsed := (ephemeralUsed / ephemeralCapacity) * 100 // Should be ~9.77%
			podEphemeralPercentSeries.Add(timeseries.NewPointWithEntity(now, percentUsed, podEntity))
		}

		podIndex++
	}

	a.logger.Debug("Collected basic pod network metrics",
		zap.Int("running_pods", runningPods),
		zap.String("note", "using placeholder values - Summary API needed for real data"),
	)
}
