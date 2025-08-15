package metrics

import (
	"context"
	"fmt"

	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned/typed/metrics/v1beta1"
)

// NodeCPUUsage represents CPU usage for a node
type NodeCPUUsage struct {
	Name     string  `json:"name"`
	CPUCores float64 `json:"cpuCores"`
}

// APIMetricsAdapter provides Metrics API integration for CPU usage
type APIMetricsAdapter struct {
	logger           *zap.Logger
	kubeClient       kubernetes.Interface
	metricsClient    metricsv1beta1.MetricsV1beta1Interface
	hasMetricsAPI    bool
	apiCheckComplete bool
}

// NewAPIMetricsAdapter creates a new API metrics adapter
func NewAPIMetricsAdapter(logger *zap.Logger, kubeClient kubernetes.Interface, metricsClient metricsv1beta1.MetricsV1beta1Interface) *APIMetricsAdapter {
	return &APIMetricsAdapter{
		logger:        logger,
		kubeClient:    kubeClient,
		metricsClient: metricsClient,
	}
}

// HasMetricsAPI returns true if the Metrics API (metrics.k8s.io) is available
func (ama *APIMetricsAdapter) HasMetricsAPI(ctx context.Context) bool {
	if ama.apiCheckComplete {
		return ama.hasMetricsAPI
	}

	// Check if metrics.k8s.io API group is available
	discoveryClient := ama.kubeClient.Discovery()
	apiGroupList, err := discoveryClient.ServerGroups()
	if err != nil {
		ama.logger.Warn("Failed to discover API groups", zap.Error(err))
		ama.hasMetricsAPI = false
		ama.apiCheckComplete = true
		return false
	}

	for _, group := range apiGroupList.Groups {
		if group.Name == "metrics.k8s.io" {
			ama.hasMetricsAPI = true
			ama.apiCheckComplete = true
			ama.logger.Info("Metrics API (metrics.k8s.io) detected as available")
			return true
		}
	}

	// Try to make a test call to be sure
	if ama.metricsClient != nil {
		_, err := ama.metricsClient.NodeMetricses().List(ctx, metav1.ListOptions{Limit: 1})
		if err != nil {
			ama.logger.Info("Metrics API not available - metrics-server likely not installed", zap.Error(err))
			ama.hasMetricsAPI = false
		} else {
			ama.logger.Info("Metrics API confirmed available via test call")
			ama.hasMetricsAPI = true
		}
	} else {
		ama.logger.Info("Metrics API client not configured")
		ama.hasMetricsAPI = false
	}

	ama.apiCheckComplete = true
	return ama.hasMetricsAPI
}

// ListNodeCPUUsage returns CPU usage for all nodes in cores
// Returns empty map if Metrics API is not available
func (ama *APIMetricsAdapter) ListNodeCPUUsage(ctx context.Context) (map[string]float64, error) {
	if !ama.HasMetricsAPI(ctx) {
		ama.logger.Debug("Metrics API not available, returning empty CPU usage data")
		return make(map[string]float64), nil
	}

	if ama.metricsClient == nil {
		return nil, fmt.Errorf("metrics client is nil but HasMetricsAPI returned true")
	}

	nodeMetrics, err := ama.metricsClient.NodeMetricses().List(ctx, metav1.ListOptions{})
	if err != nil {
		ama.logger.Error("Failed to list node metrics", zap.Error(err))
		return nil, fmt.Errorf("failed to list node metrics: %w", err)
	}

	usage := make(map[string]float64)

	for _, nodeMetric := range nodeMetrics.Items {
		// Convert nanocores to cores
		nanocores := nodeMetric.Usage.Cpu().ScaledValue(resource.Nano)
		cores := float64(nanocores) / 1e9

		usage[nodeMetric.Name] = cores

		ama.logger.Debug("Node CPU usage collected",
			zap.String("node", nodeMetric.Name),
			zap.Float64("cores", cores),
			zap.Int64("nanocores", nanocores),
		)
	}

	ama.logger.Debug("Collected CPU usage for all nodes",
		zap.Int("nodeCount", len(usage)),
	)

	return usage, nil
}

// GetTotalClusterCPUUsage returns the sum of CPU usage across all nodes in cores
func (ama *APIMetricsAdapter) GetTotalClusterCPUUsage(ctx context.Context) (float64, error) {
	nodeUsage, err := ama.ListNodeCPUUsage(ctx)
	if err != nil {
		return 0, err
	}

	var totalCores float64
	for _, cores := range nodeUsage {
		totalCores += cores
	}

	ama.logger.Debug("Total cluster CPU usage calculated",
		zap.Float64("totalCores", totalCores),
	)

	return totalCores, nil
}
