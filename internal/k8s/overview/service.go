package overview

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/metrics"
	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	internalmetrics "github.com/aaronlmathis/kaptn/internal/metrics"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// OverviewData represents the cluster overview data for the dashboard
type OverviewData struct {
	Pods struct {
		Running int `json:"running"`
		Total   int `json:"total"`
		Pending int `json:"pending"`
	} `json:"pods"`
	Nodes struct {
		Ready int `json:"ready"`
		Total int `json:"total"`
	} `json:"nodes"`
	CPU struct {
		UsagePercent float64 `json:"usagePercent"`
	} `json:"cpu"`
	Memory struct {
		UsagePercent float64 `json:"usagePercent"`
	} `json:"memory"`
	Advisories []string  `json:"advisories"`
	AsOf       time.Time `json:"asOf"`
}

// CachedOverview represents cached overview data with TTL
type CachedOverview struct {
	Data      *OverviewData
	ExpiresAt time.Time
	mutex     sync.RWMutex
}

// OverviewService provides cluster overview data aggregation
type OverviewService struct {
	logger         *zap.Logger
	kubeClient     kubernetes.Interface
	metricsService *metrics.MetricsService
	wsHub          *ws.Hub
	cache          *CachedOverview
	cacheTTL       time.Duration

	// Background streaming
	streamCtx    context.Context
	streamCancel context.CancelFunc
	streaming    bool
	streamMutex  sync.Mutex
}

// NewOverviewService creates a new overview service
func NewOverviewService(logger *zap.Logger, kubeClient kubernetes.Interface, metricsService *metrics.MetricsService) *OverviewService {
	streamCtx, streamCancel := context.WithCancel(context.Background())
	return &OverviewService{
		logger:         logger,
		kubeClient:     kubeClient,
		metricsService: metricsService,
		cache: &CachedOverview{
			mutex: sync.RWMutex{},
		},
		cacheTTL:     3 * time.Second, // 3 second TTL to avoid API thundering
		streamCtx:    streamCtx,
		streamCancel: streamCancel,
	}
}

// SetWebSocketHub sets the WebSocket hub for streaming overview updates
func (os *OverviewService) SetWebSocketHub(hub *ws.Hub) {
	os.wsHub = hub
}

// GetOverview returns cluster overview data, using cache when available
func (os *OverviewService) GetOverview(ctx context.Context) (*OverviewData, error) {
	// Check cache first
	os.cache.mutex.RLock()
	if os.cache.Data != nil && time.Now().Before(os.cache.ExpiresAt) {
		data := os.cache.Data
		os.cache.mutex.RUnlock()
		os.logger.Debug("Returning cached overview data")
		return data, nil
	}
	os.cache.mutex.RUnlock()

	// Cache miss or expired, fetch fresh data
	os.logger.Debug("Fetching fresh overview data")
	data, err := os.fetchOverviewData(ctx)
	if err != nil {
		return nil, err
	}

	// Update cache
	os.cache.mutex.Lock()
	os.cache.Data = data
	os.cache.ExpiresAt = time.Now().Add(os.cacheTTL)
	os.cache.mutex.Unlock()

	// Update Prometheus metrics
	internalmetrics.UpdateClusterMetrics(
		data.CPU.UsagePercent,
		data.Memory.UsagePercent,
		data.Pods.Running,
		data.Pods.Total,
		data.Nodes.Ready,
		data.Nodes.Total,
	)

	return data, nil
}

// fetchOverviewData fetches fresh overview data from Kubernetes APIs
func (os *OverviewService) fetchOverviewData(ctx context.Context) (*OverviewData, error) {
	data := &OverviewData{
		AsOf: time.Now(),
	}

	// Collect data concurrently
	podsCh := make(chan struct {
		running, total, pending int
		err                     error
	}, 1)
	nodesCh := make(chan struct {
		ready, total int
		err          error
	}, 1)
	metricsCh := make(chan struct {
		cpuPercent, memoryPercent float64
		err                       error
	}, 1)

	// Fetch pods data
	go func() {
		pods, err := os.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
		if err != nil {
			podsCh <- struct {
				running, total, pending int
				err                     error
			}{err: err}
			return
		}

		running, pending := 0, 0
		for _, pod := range pods.Items {
			switch pod.Status.Phase {
			case v1.PodRunning:
				running++
			case v1.PodPending:
				pending++
			}
		}

		podsCh <- struct {
			running, total, pending int
			err                     error
		}{running: running, total: len(pods.Items), pending: pending}
	}()

	// Fetch nodes data
	go func() {
		nodes, err := os.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
		if err != nil {
			nodesCh <- struct {
				ready, total int
				err          error
			}{err: err}
			return
		}

		ready := 0
		for _, node := range nodes.Items {
			for _, condition := range node.Status.Conditions {
				if condition.Type == v1.NodeReady && condition.Status == v1.ConditionTrue {
					ready++
					break
				}
			}
		}

		nodesCh <- struct {
			ready, total int
			err          error
		}{ready: ready, total: len(nodes.Items)}
	}()

	// Fetch cluster metrics (CPU/Memory usage)
	go func() {
		if os.metricsService == nil {
			metricsCh <- struct {
				cpuPercent, memoryPercent float64
				err                       error
			}{cpuPercent: 0, memoryPercent: 0}
			return
		}

		clusterMetrics, err := os.metricsService.GetClusterMetrics(ctx)
		if err != nil {
			os.logger.Warn("Failed to get cluster metrics, using defaults", zap.Error(err))
			metricsCh <- struct {
				cpuPercent, memoryPercent float64
				err                       error
			}{cpuPercent: 0, memoryPercent: 0}
			return
		}

		metricsCh <- struct {
			cpuPercent, memoryPercent float64
			err                       error
		}{
			cpuPercent:    clusterMetrics.ClusterSummary.CPUUtilization,
			memoryPercent: clusterMetrics.ClusterSummary.MemoryUtilization,
		}
	}()

	// Collect results
	var podErr, nodeErr, metricsErr error

	// Wait for pods data
	podsResult := <-podsCh
	if podsResult.err != nil {
		podErr = fmt.Errorf("failed to fetch pods: %w", podsResult.err)
	} else {
		data.Pods.Running = podsResult.running
		data.Pods.Total = podsResult.total
		data.Pods.Pending = podsResult.pending
	}

	// Wait for nodes data
	nodesResult := <-nodesCh
	if nodesResult.err != nil {
		nodeErr = fmt.Errorf("failed to fetch nodes: %w", nodesResult.err)
	} else {
		data.Nodes.Ready = nodesResult.ready
		data.Nodes.Total = nodesResult.total
	}

	// Wait for metrics data
	metricsResult := <-metricsCh
	if metricsResult.err != nil {
		metricsErr = fmt.Errorf("failed to fetch metrics: %w", metricsResult.err)
	} else {
		data.CPU.UsagePercent = metricsResult.cpuPercent
		data.Memory.UsagePercent = metricsResult.memoryPercent
	}

	// Check for critical errors
	if podErr != nil || nodeErr != nil {
		return nil, fmt.Errorf("failed to fetch overview data: pods=%v, nodes=%v, metrics=%v", podErr, nodeErr, metricsErr)
	}

	// Generate advisories based on collected data
	data.Advisories = os.generateAdvisories(data)

	return data, nil
}

// generateAdvisories generates advisory messages based on cluster state
func (os *OverviewService) generateAdvisories(data *OverviewData) []string {
	var advisories []string

	// Pod health advisories
	if data.Pods.Total > 0 {
		runningPercent := float64(data.Pods.Running) / float64(data.Pods.Total) * 100
		if runningPercent < 70 {
			advisories = append(advisories, fmt.Sprintf("Pod health critical: only %.1f%% pods running", runningPercent))
		} else if runningPercent < 85 {
			advisories = append(advisories, fmt.Sprintf("Pod health warning: %.1f%% pods running", runningPercent))
		}

		if data.Pods.Pending > 5 {
			advisories = append(advisories, fmt.Sprintf("%d pods pending startup", data.Pods.Pending))
		}
	}

	// Node health advisories
	if data.Nodes.Total > 0 {
		readyPercent := float64(data.Nodes.Ready) / float64(data.Nodes.Total) * 100
		if readyPercent < 80 {
			advisories = append(advisories, fmt.Sprintf("Node availability critical: only %d/%d nodes ready", data.Nodes.Ready, data.Nodes.Total))
		} else if data.Nodes.Ready < data.Nodes.Total {
			advisories = append(advisories, fmt.Sprintf("%d node(s) unavailable; maintenance may be required", data.Nodes.Total-data.Nodes.Ready))
		}
	}

	// CPU usage advisories
	if data.CPU.UsagePercent > 90 {
		advisories = append(advisories, fmt.Sprintf("CPU usage critical: %.1f%%", data.CPU.UsagePercent))
	} else if data.CPU.UsagePercent > 75 {
		advisories = append(advisories, fmt.Sprintf("CPU usage high: %.1f%% - consider scaling", data.CPU.UsagePercent))
	} else if data.CPU.UsagePercent > 50 {
		advisories = append(advisories, "CPU load increasing but within normal parameters")
	}

	// Memory usage advisories
	if data.Memory.UsagePercent > 90 {
		advisories = append(advisories, fmt.Sprintf("Memory usage critical: %.1f%%", data.Memory.UsagePercent))
	} else if data.Memory.UsagePercent > 75 {
		advisories = append(advisories, fmt.Sprintf("Memory pressure detected: %.1f%% - scaling may be needed", data.Memory.UsagePercent))
	} else if data.Memory.UsagePercent > 50 {
		advisories = append(advisories, "Memory usage elevated but stable")
	}

	// Default healthy state message
	if len(advisories) == 0 {
		advisories = append(advisories, "Cluster operating within normal parameters")
	}

	return advisories
}

// InvalidateCache forces cache invalidation for the next request
func (os *OverviewService) InvalidateCache() {
	os.cache.mutex.Lock()
	defer os.cache.mutex.Unlock()
	os.cache.ExpiresAt = time.Now().Add(-1 * time.Second) // Expire immediately
}

// StartStreaming starts the background overview streaming service
func (os *OverviewService) StartStreaming() {
	os.streamMutex.Lock()
	defer os.streamMutex.Unlock()

	if os.streaming {
		return // Already streaming
	}

	os.streaming = true
	go os.streamOverviewUpdates()
	os.logger.Info("Overview streaming service started")
}

// StopStreaming stops the background overview streaming service
func (os *OverviewService) StopStreaming() {
	os.streamMutex.Lock()
	defer os.streamMutex.Unlock()

	if !os.streaming {
		return // Not streaming
	}

	os.streamCancel()
	os.streaming = false
	os.logger.Info("Overview streaming service stopped")
}

// streamOverviewUpdates runs the background overview update loop
func (os *OverviewService) streamOverviewUpdates() {
	ticker := time.NewTicker(5 * time.Second) // Update every 5 seconds
	defer ticker.Stop()

	var lastData *OverviewData

	for {
		select {
		case <-os.streamCtx.Done():
			return
		case <-ticker.C:
			if os.wsHub == nil {
				continue // No WebSocket hub configured
			}

			// Get fresh overview data
			data, err := os.GetOverview(context.Background())
			if err != nil {
				os.logger.Warn("Failed to get overview data for streaming", zap.Error(err))
				continue
			}

			// Check if data has changed meaningfully
			if lastData != nil && !os.hasSignificantChange(lastData, data) {
				continue // No significant changes, skip broadcast
			}

			// Broadcast the update
			os.wsHub.BroadcastToRoom("overview", "overviewUpdate", data)
			lastData = data

			os.logger.Debug("Broadcasted overview update",
				zap.Int("podsRunning", data.Pods.Running),
				zap.Int("podsTotal", data.Pods.Total),
				zap.Int("nodesReady", data.Nodes.Ready),
				zap.Float64("cpuPercent", data.CPU.UsagePercent),
				zap.Float64("memoryPercent", data.Memory.UsagePercent))
		}
	}
}

// hasSignificantChange determines if the overview data has changed enough to warrant a broadcast
func (os *OverviewService) hasSignificantChange(old, new *OverviewData) bool {
	// Check for any change in counts
	if old.Pods.Running != new.Pods.Running ||
		old.Pods.Total != new.Pods.Total ||
		old.Pods.Pending != new.Pods.Pending ||
		old.Nodes.Ready != new.Nodes.Ready ||
		old.Nodes.Total != new.Nodes.Total {
		return true
	}

	// Check for significant CPU/Memory changes (>= 1% difference)
	cpuDiff := old.CPU.UsagePercent - new.CPU.UsagePercent
	if cpuDiff < 0 {
		cpuDiff = -cpuDiff
	}
	if cpuDiff >= 1.0 {
		return true
	}

	memoryDiff := old.Memory.UsagePercent - new.Memory.UsagePercent
	if memoryDiff < 0 {
		memoryDiff = -memoryDiff
	}
	if memoryDiff >= 1.0 {
		return true
	}

	// Check if advisories have changed
	if len(old.Advisories) != len(new.Advisories) {
		return true
	}
	for i, advisory := range old.Advisories {
		if new.Advisories[i] != advisory {
			return true
		}
	}

	return false
}
