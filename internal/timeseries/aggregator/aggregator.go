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
	LastRx uint64    // Last received bytes
	LastTx uint64    // Last transmitted bytes
	LastTs time.Time // Timestamp of last measurement
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
	if shouldCollectResource {
		a.collectCPUMetrics(ctx, now)
		a.collectMemoryMetrics(ctx, now)
		a.collectResourceRequests(ctx, now)
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
		a.collectNetworkMetrics(ctx, now)
		a.collectNodeDetailedMetrics(ctx, now)
		a.collectBasicNodeMetrics(ctx, now)
		a.collectNodePodCounts(ctx, now)
		a.collectNodePacketStats(ctx, now)
		a.collectBasicPodNetworkMetrics(ctx, now)
		a.mu.Lock()
		a.lastSummaryPoll = now
		a.mu.Unlock()
	}

	// Gate state reconciliation (pod/node counts)
	if shouldReconcileState {
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
func (a *Aggregator) collectNetworkMetrics(ctx context.Context, now time.Time) {
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
		snap, exists := a.hostSnapshots[stat.NodeName]
		if !exists {
			// Initialize new snapshot
			snap = &hostSnap{
				LastRx: stat.RxBytes,
				LastTx: stat.TxBytes,
				LastTs: now,
			}
			a.hostSnapshots[stat.NodeName] = snap
			continue
		}

		// Calculate rates if we have previous data
		if !snap.LastTs.IsZero() {
			dt := now.Sub(snap.LastTs).Seconds()
			if dt > 0 {
				// Handle counter resets (new value less than old value)
				if stat.RxBytes >= snap.LastRx {
					rxRate := float64(stat.RxBytes-snap.LastRx) / dt
					totalRxRate += rxRate
				}

				if stat.TxBytes >= snap.LastTx {
					txRate := float64(stat.TxBytes-snap.LastTx) / dt
					totalTxRate += txRate
				}
			}
		}

		// Update snapshot
		snap.LastRx = stat.RxBytes
		snap.LastTx = stat.TxBytes
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
func (a *Aggregator) collectMemoryMetrics(ctx context.Context, now time.Time) {
	// Get node list for both capacity and individual node metrics
	nodeList, err := a.nodesAdapter.ListNodes(ctx)
	if err != nil {
		a.logger.Error("Failed to collect nodes for memory metrics", zap.Error(err))
		return
	}

	var totalMemoryCapacity float64

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

		// Also collect CPU capacity at node level
		nodeCapCPUSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeCapacityCPUBase, node.Name))
		if nodeCapCPUSeries != nil {
			nodeCapCPUSeries.Add(timeseries.NewPointWithEntity(now, node.CPUCores, nodeEntity))
		}

		nodeAllocCPUSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeAllocatableCPUBase, node.Name))
		if nodeAllocCPUSeries != nil {
			nodeAllocCPUSeries.Add(timeseries.NewPointWithEntity(now, node.CPUCores, nodeEntity))
		}
	}

	// Store cluster-level memory allocatable
	if totalMemoryCapacity > 0 {
		allocatableSeries := a.store.Upsert(timeseries.ClusterMemAllocatableBytes)
		if allocatableSeries != nil {
			allocatableSeries.Add(timeseries.Point{T: now, V: totalMemoryCapacity})
		}
	}

	// Collect memory usage if Metrics API is available
	if a.apiMetricsAdapter.HasMetricsAPI(ctx) {
		// For now, use simple placeholder - will implement proper memory collection later
		totalUsage := totalMemoryCapacity * 0.7 // Placeholder: assume 70% usage

		// Store cluster total usage
		usageSeries := a.store.Upsert(timeseries.ClusterMemUsedBytes)
		if usageSeries != nil {
			usageSeries.Add(timeseries.Point{T: now, V: totalUsage})
		}

		a.logger.Debug("Collected placeholder memory usage metrics",
			zap.Float64("usageGB", totalUsage/(1024*1024*1024)),
			zap.String("note", "placeholder - real collection needed"),
		)
	}

	a.logger.Debug("Collected memory metrics",
		zap.Float64("cluster_allocatable_gb", totalMemoryCapacity/(1024*1024*1024)),
		zap.Int("node_count", len(nodeList)))
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

		// Calculate restart rate (placeholder for now)
		restartsRateSeries := a.store.Upsert(timeseries.GenerateNamespaceSeriesKey(timeseries.NamespacePodsRestartsRateBase, namespace))
		if restartsRateSeries != nil {
			restartsRateSeries.Add(timeseries.NewPointWithEntity(now, 0.0, nsEntity)) // TODO: implement rate calculation
		}
	}

	a.logger.Debug("Collected namespace metrics",
		zap.Int("total_namespaces", len(namespaceData)),
		zap.Bool("has_usage_metrics", podUsageMap != nil),
	)
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

	// For each pod, store basic metrics with proper entity identification
	podCount := 0
	for range podMetricsRaw {
		// Create a synthetic pod entity for placeholder data
		podEntity := map[string]string{
			"namespace": "default",
			"pod":       fmt.Sprintf("pod-%d", podCount),
		}

		// Generate unique series keys for each pod
		podSeriesKey := timeseries.GeneratePodSeriesKey(timeseries.PodCPUUsageBase, podEntity["namespace"], podEntity["pod"])
		podCPUSeries := a.store.Upsert(podSeriesKey)
		if podCPUSeries != nil {
			// Sample: 0.1 cores per pod
			podCPUSeries.Add(timeseries.NewPointWithEntity(now, 0.1, podEntity))
		}

		podMemSeriesKey := timeseries.GeneratePodSeriesKey(timeseries.PodMemUsageBase, podEntity["namespace"], podEntity["pod"])
		podMemSeries := a.store.Upsert(podMemSeriesKey)
		if podMemSeries != nil {
			// Sample: 128MB per pod
			podMemSeries.Add(timeseries.NewPointWithEntity(now, 128*1024*1024, podEntity))
		}

		podWorkingSetSeriesKey := timeseries.GeneratePodSeriesKey(timeseries.PodMemWorkingSetBase, podEntity["namespace"], podEntity["pod"])
		podWorkingSetSeries := a.store.Upsert(podWorkingSetSeriesKey)
		if podWorkingSetSeries != nil {
			// Sample: 120MB working set per pod
			podWorkingSetSeries.Add(timeseries.NewPointWithEntity(now, 120*1024*1024, podEntity))
		}

		podCount++
	}

	a.logger.Debug("Collected pod metrics",
		zap.Int("pod_count", len(podMetricsRaw)),
		zap.String("note", "using sample values - full metrics parsing needed"),
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

	// Collect individual node memory usage if Metrics API is available
	if a.apiMetricsAdapter.HasMetricsAPI(ctx) {
		nodeUsageMap, err := a.apiMetricsAdapter.ListNodeCPUUsage(ctx)
		if err == nil {
			for _, node := range nodeList {
				if _, exists := nodeUsageMap[node.Name]; exists {
					nodeEntity := map[string]string{"node": node.Name}

					// Store individual node memory usage (using placeholder calculations)
					nodeMemSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeMemUsageBase, node.Name))
					if nodeMemSeries != nil {
						// Placeholder: 70% of capacity
						placeholderMemUsage := node.MemoryBytes * 0.7
						nodeMemSeries.Add(timeseries.NewPointWithEntity(now, placeholderMemUsage, nodeEntity))
					}

					nodeWorkingSetSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeMemWorkingSetBase, node.Name))
					if nodeWorkingSetSeries != nil {
						// Placeholder: 65% of capacity
						placeholderWorkingSet := node.MemoryBytes * 0.65
						nodeWorkingSetSeries.Add(timeseries.NewPointWithEntity(now, placeholderWorkingSet, nodeEntity))
					}
				}
			}
		}
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

		// Add placeholder filesystem usage metrics (normally from Summary API)
		nodeFilesystemSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeFsUsedBase, node.Name))
		if nodeFilesystemSeries != nil {
			// Placeholder: 30% of node capacity as filesystem usage
			placeholderFsUsage := node.MemoryBytes * 0.3 // Using memory as a proxy for disk
			nodeFilesystemSeries.Add(timeseries.NewPointWithEntity(now, placeholderFsUsage, nodeEntity))
		}

		nodeFilesystemPercentSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeFsUsedPercentBase, node.Name))
		if nodeFilesystemPercentSeries != nil {
			// Placeholder: 30% filesystem usage
			nodeFilesystemPercentSeries.Add(timeseries.NewPointWithEntity(now, 30.0, nodeEntity))
		}

		nodeImageFsSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeImageFsUsedBase, node.Name))
		if nodeImageFsSeries != nil {
			// Placeholder: 10% of memory capacity as image filesystem usage
			placeholderImageFsUsage := node.MemoryBytes * 0.1
			nodeImageFsSeries.Add(timeseries.NewPointWithEntity(now, placeholderImageFsUsage, nodeEntity))
		}

		// New: Image filesystem capacity
		nodeImageFsCapacitySeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeImageFsCapacityBase, node.Name))
		if nodeImageFsCapacitySeries != nil {
			// Placeholder: 50GB image filesystem capacity per node
			placeholderImageFsCapacity := float64(50 * 1024 * 1024 * 1024) // 50GB
			nodeImageFsCapacitySeries.Add(timeseries.NewPointWithEntity(now, placeholderImageFsCapacity, nodeEntity))
		}

		// New: Inode usage percentage
		nodeInodesPercentSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeFsInodesUsedPercentBase, node.Name))
		if nodeInodesPercentSeries != nil {
			// Placeholder: 15% inode usage
			nodeInodesPercentSeries.Add(timeseries.NewPointWithEntity(now, 15.0, nodeEntity))
		}

		nodeProcessSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeProcessCountBase, node.Name))
		if nodeProcessSeries != nil {
			// Placeholder: 200 processes per node
			nodeProcessSeries.Add(timeseries.NewPointWithEntity(now, 200, nodeEntity))
		}

		// Add the missing node network metrics you actually need!
		nodeNetRxSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeNetRxBase, node.Name))
		if nodeNetRxSeries != nil {
			// Placeholder: 10MB/s receive rate per node
			nodeNetRxSeries.Add(timeseries.NewPointWithEntity(now, 10*1024*1024, nodeEntity))
		}

		nodeNetTxSeries := a.store.Upsert(timeseries.GenerateNodeSeriesKey(timeseries.NodeNetTxBase, node.Name))
		if nodeNetTxSeries != nil {
			// Placeholder: 5MB/s transmit rate per node
			nodeNetTxSeries.Add(timeseries.NewPointWithEntity(now, 5*1024*1024, nodeEntity))
		}
	}

	a.logger.Debug("Collected basic node metrics",
		zap.Int("node_count", len(nodeList)),
		zap.String("note", "using placeholder values - Summary API needed for real data"),
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

		podIndex++
	}

	a.logger.Debug("Collected basic pod network metrics",
		zap.Int("running_pods", runningPods),
		zap.String("note", "using placeholder values - Summary API needed for real data"),
	)
}
