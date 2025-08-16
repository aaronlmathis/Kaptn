package aggregator

import (
	"context"
	"sync"
	"time"

	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned/typed/metrics/v1beta1"

	"github.com/aaronlmathis/kaptn/internal/kube/metrics"
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
	logger *zap.Logger
	store  timeseries.Store

	// Kubernetes adapters
	nodesAdapter      *metrics.NodesAdapter
	apiMetricsAdapter *metrics.APIMetricsAdapter
	summaryAdapter    *metrics.SummaryStatsAdapter

	// State management
	mu                  sync.RWMutex
	hostSnapshots       map[string]*hostSnap
	lastCapacityRefresh time.Time

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
		hostSnapshots:           make(map[string]*hostSnap),
		config:                  config,
		capacityRefreshInterval: config.CapacityRefreshInterval,
		stopCh:                  make(chan struct{}),
		done:                    make(chan struct{}),

		// Initialize adapters
		nodesAdapter:      metrics.NewNodesAdapter(logger, kubeClient),
		apiMetricsAdapter: metrics.NewAPIMetricsAdapter(logger, kubeClient, metricsClient),
		summaryAdapter:    metrics.NewSummaryStatsAdapter(logger, kubeClient, restConfig, config.InsecureTLS),
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
	)

	// Check capabilities on startup
	hasMetricsAPI := a.apiMetricsAdapter.HasMetricsAPI(ctx)
	hasSummaryAPI := a.summaryAdapter.HasSummaryAPI(ctx)

	a.logger.Info("Metrics capabilities detected",
		zap.Bool("metricsAPI", hasMetricsAPI),
		zap.Bool("summaryAPI", hasSummaryAPI),
	)

	go a.run(ctx)
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
	a.mu.RUnlock()

	if shouldRefreshCapacity {
		a.refreshNodeCapacities(ctx, now)
	}

	// Collect CPU metrics
	a.collectCPUMetrics(ctx, now)

	// Collect network metrics
	a.collectNetworkMetrics(ctx, now)
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
	}

	// Collect CPU usage if Metrics API is available
	if a.apiMetricsAdapter.HasMetricsAPI(ctx) {
		totalUsage, err := a.apiMetricsAdapter.GetTotalClusterCPUUsage(ctx)
		if err != nil {
			a.logger.Warn("Failed to collect CPU usage", zap.Error(err))
		} else {
			usageSeries := a.store.Upsert(timeseries.ClusterCPUUsedCores)
			if usageSeries != nil {
				usageSeries.Add(timeseries.Point{T: now, V: totalUsage})
			}

			a.logger.Debug("Collected CPU metrics",
				zap.Float64("capacity", totalCapacity),
				zap.Float64("usage", totalUsage),
			)
		}
	}
}

// collectNetworkMetrics collects and aggregates network metrics
func (a *Aggregator) collectNetworkMetrics(ctx context.Context, now time.Time) {
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
