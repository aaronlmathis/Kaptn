package metrics

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned/typed/metrics/v1beta1"
)

// ClusterMetrics represents overall cluster health metrics
type ClusterMetrics struct {
	Timestamp      time.Time        `json:"timestamp"`
	NodeMetrics    []NodeMetrics    `json:"nodeMetrics"`
	PodMetrics     []PodMetrics     `json:"podMetrics"`
	ClusterSummary ClusterSummary   `json:"clusterSummary"`
	ResourceQuotas []NamespaceQuota `json:"resourceQuotas"`
}

// NodeMetrics represents resource usage for a node
type NodeMetrics struct {
	Name      string            `json:"name"`
	CPU       ResourceUsage     `json:"cpu"`
	Memory    ResourceUsage     `json:"memory"`
	Timestamp time.Time         `json:"timestamp"`
	Labels    map[string]string `json:"labels"`
}

// PodMetrics represents resource usage for a pod
type PodMetrics struct {
	Name       string             `json:"name"`
	Namespace  string             `json:"namespace"`
	Node       string             `json:"node"`
	Containers []ContainerMetrics `json:"containers"`
	Timestamp  time.Time          `json:"timestamp"`
	Labels     map[string]string  `json:"labels"`
}

// ContainerMetrics represents resource usage for a container
type ContainerMetrics struct {
	Name   string        `json:"name"`
	CPU    ResourceUsage `json:"cpu"`
	Memory ResourceUsage `json:"memory"`
}

// ResourceUsage represents CPU or memory usage
type ResourceUsage struct {
	Used      string  `json:"used"`      // Raw value (e.g., "100m", "256Mi")
	UsedBytes int64   `json:"usedBytes"` // Normalized to bytes/nanocores
	Percent   float64 `json:"percent"`   // Percentage of total capacity
}

// ClusterSummary provides high-level cluster statistics
type ClusterSummary struct {
	TotalNodes        int     `json:"totalNodes"`
	ReadyNodes        int     `json:"readyNodes"`
	TotalPods         int     `json:"totalPods"`
	RunningPods       int     `json:"runningPods"`
	CPUUtilization    float64 `json:"cpuUtilization"`
	MemoryUtilization float64 `json:"memoryUtilization"`
	NamespaceCount    int     `json:"namespaceCount"`
}

// NamespaceQuota represents resource quotas for a namespace
type NamespaceQuota struct {
	Namespace string                       `json:"namespace"`
	Quotas    map[string]ResourceQuotaSpec `json:"quotas"`
}

// ResourceQuotaSpec represents a resource quota specification
type ResourceQuotaSpec struct {
	Hard string `json:"hard"`
	Used string `json:"used"`
}

// MetricsService provides cluster metrics collection
type MetricsService struct {
	logger        *zap.Logger
	kubeClient    kubernetes.Interface
	metricsClient metricsv1beta1.MetricsV1beta1Interface
}

// NewMetricsService creates a new metrics service
func NewMetricsService(logger *zap.Logger, kubeClient kubernetes.Interface, metricsClient metricsv1beta1.MetricsV1beta1Interface) *MetricsService {
	return &MetricsService{
		logger:        logger,
		kubeClient:    kubeClient,
		metricsClient: metricsClient,
	}
}

// GetClusterMetrics retrieves comprehensive cluster metrics
func (ms *MetricsService) GetClusterMetrics(ctx context.Context) (*ClusterMetrics, error) {
	metrics := &ClusterMetrics{
		Timestamp: time.Now(),
	}

	// Collect metrics concurrently
	nodeMetricsCh := make(chan []NodeMetrics, 1)
	podMetricsCh := make(chan []PodMetrics, 1)
	summaryCh := make(chan ClusterSummary, 1)
	quotasCh := make(chan []NamespaceQuota, 1)
	errCh := make(chan error, 4)

	// Collect node metrics
	go func() {
		nodeMetrics, err := ms.getNodeMetrics(ctx)
		if err != nil {
			errCh <- fmt.Errorf("failed to get node metrics: %w", err)
			return
		}
		nodeMetricsCh <- nodeMetrics
	}()

	// Collect pod metrics
	go func() {
		podMetrics, err := ms.getPodMetrics(ctx)
		if err != nil {
			errCh <- fmt.Errorf("failed to get pod metrics: %w", err)
			return
		}
		podMetricsCh <- podMetrics
	}()

	// Collect cluster summary
	go func() {
		summary, err := ms.getClusterSummary(ctx)
		if err != nil {
			errCh <- fmt.Errorf("failed to get cluster summary: %w", err)
			return
		}
		summaryCh <- summary
	}()

	// Collect resource quotas
	go func() {
		quotas, err := ms.getResourceQuotas(ctx)
		if err != nil {
			errCh <- fmt.Errorf("failed to get resource quotas: %w", err)
			return
		}
		quotasCh <- quotas
	}()

	// Wait for all goroutines to complete
	completed := 0
	for completed < 4 {
		select {
		case nodeMetrics := <-nodeMetricsCh:
			metrics.NodeMetrics = nodeMetrics
			completed++
		case podMetrics := <-podMetricsCh:
			metrics.PodMetrics = podMetrics
			completed++
		case summary := <-summaryCh:
			metrics.ClusterSummary = summary
			completed++
		case quotas := <-quotasCh:
			metrics.ResourceQuotas = quotas
			completed++
		case err := <-errCh:
			ms.logger.Warn("Failed to collect some metrics", zap.Error(err))
			completed++
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	return metrics, nil
}

// getNodeMetrics retrieves metrics for all nodes
func (ms *MetricsService) getNodeMetrics(ctx context.Context) ([]NodeMetrics, error) {
	if ms.metricsClient == nil {
		return []NodeMetrics{}, nil // Metrics server not available
	}

	nodeMetricsList, err := ms.metricsClient.NodeMetricses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Get node capacities for percentage calculations
	nodes, err := ms.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	nodeCapacities := make(map[string]map[string]int64)
	for _, node := range nodes.Items {
		nodeCapacities[node.Name] = map[string]int64{
			"cpu":    node.Status.Capacity.Cpu().MilliValue(),
			"memory": node.Status.Capacity.Memory().Value(),
		}
	}

	var nodeMetrics []NodeMetrics
	for _, nodeMetric := range nodeMetricsList.Items {
		cpuUsed := nodeMetric.Usage.Cpu().MilliValue()
		memoryUsed := nodeMetric.Usage.Memory().Value()

		cpuCapacity := nodeCapacities[nodeMetric.Name]["cpu"]
		memoryCapacity := nodeCapacities[nodeMetric.Name]["memory"]

		nodeMetrics = append(nodeMetrics, NodeMetrics{
			Name:      nodeMetric.Name,
			Timestamp: nodeMetric.Timestamp.Time,
			CPU: ResourceUsage{
				Used:      nodeMetric.Usage.Cpu().String(),
				UsedBytes: cpuUsed,
				Percent:   calculatePercentage(cpuUsed, cpuCapacity),
			},
			Memory: ResourceUsage{
				Used:      nodeMetric.Usage.Memory().String(),
				UsedBytes: memoryUsed,
				Percent:   calculatePercentage(memoryUsed, memoryCapacity),
			},
		})
	}

	return nodeMetrics, nil
}

// getPodMetrics retrieves metrics for all pods
func (ms *MetricsService) getPodMetrics(ctx context.Context) ([]PodMetrics, error) {
	if ms.metricsClient == nil {
		return []PodMetrics{}, nil // Metrics server not available
	}

	podMetricsList, err := ms.metricsClient.PodMetricses("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var podMetrics []PodMetrics
	for _, podMetric := range podMetricsList.Items {
		var containerMetrics []ContainerMetrics
		for _, container := range podMetric.Containers {
			containerMetrics = append(containerMetrics, ContainerMetrics{
				Name: container.Name,
				CPU: ResourceUsage{
					Used:      container.Usage.Cpu().String(),
					UsedBytes: container.Usage.Cpu().MilliValue(),
				},
				Memory: ResourceUsage{
					Used:      container.Usage.Memory().String(),
					UsedBytes: container.Usage.Memory().Value(),
				},
			})
		}

		podMetrics = append(podMetrics, PodMetrics{
			Name:       podMetric.Name,
			Namespace:  podMetric.Namespace,
			Containers: containerMetrics,
			Timestamp:  podMetric.Timestamp.Time,
		})
	}

	return podMetrics, nil
}

// getClusterSummary retrieves high-level cluster statistics
func (ms *MetricsService) getClusterSummary(ctx context.Context) (ClusterSummary, error) {
	summary := ClusterSummary{}

	// Get nodes
	nodes, err := ms.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return summary, err
	}

	summary.TotalNodes = len(nodes.Items)
	for _, node := range nodes.Items {
		for _, condition := range node.Status.Conditions {
			if condition.Type == "Ready" && condition.Status == "True" {
				summary.ReadyNodes++
				break
			}
		}
	}

	// Get pods
	pods, err := ms.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return summary, err
	}

	summary.TotalPods = len(pods.Items)
	for _, pod := range pods.Items {
		if pod.Status.Phase == "Running" {
			summary.RunningPods++
		}
	}

	// Get namespaces
	namespaces, err := ms.kubeClient.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return summary, err
	}
	summary.NamespaceCount = len(namespaces.Items)

	// Calculate cluster-wide resource utilization if metrics are available
	if ms.metricsClient != nil {
		nodeMetrics, err := ms.getNodeMetrics(ctx)
		if err == nil {
			var totalCPUUsed, totalCPUCapacity, totalMemoryUsed, totalMemoryCapacity int64
			for _, nodeMetric := range nodeMetrics {
				totalCPUUsed += nodeMetric.CPU.UsedBytes
				totalMemoryUsed += nodeMetric.Memory.UsedBytes
			}

			for _, node := range nodes.Items {
				totalCPUCapacity += node.Status.Capacity.Cpu().MilliValue()
				totalMemoryCapacity += node.Status.Capacity.Memory().Value()
			}

			summary.CPUUtilization = calculatePercentage(totalCPUUsed, totalCPUCapacity)
			summary.MemoryUtilization = calculatePercentage(totalMemoryUsed, totalMemoryCapacity)
		}
	}

	return summary, nil
}

// getResourceQuotas retrieves resource quotas for all namespaces
func (ms *MetricsService) getResourceQuotas(ctx context.Context) ([]NamespaceQuota, error) {
	quotas, err := ms.kubeClient.CoreV1().ResourceQuotas("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	quotasByNamespace := make(map[string]map[string]ResourceQuotaSpec)
	for _, quota := range quotas.Items {
		if quotasByNamespace[quota.Namespace] == nil {
			quotasByNamespace[quota.Namespace] = make(map[string]ResourceQuotaSpec)
		}

		for resource, hard := range quota.Status.Hard {
			used := quota.Status.Used[resource]
			quotasByNamespace[quota.Namespace][string(resource)] = ResourceQuotaSpec{
				Hard: hard.String(),
				Used: used.String(),
			}
		}
	}

	var namespaceQuotas []NamespaceQuota
	for namespace, quotaSpecs := range quotasByNamespace {
		namespaceQuotas = append(namespaceQuotas, NamespaceQuota{
			Namespace: namespace,
			Quotas:    quotaSpecs,
		})
	}

	return namespaceQuotas, nil
}

// calculatePercentage calculates percentage of used vs total
func calculatePercentage(used, total int64) float64 {
	if total == 0 {
		return 0
	}
	return float64(used) / float64(total) * 100
}

// GetNamespaceMetrics retrieves metrics for a specific namespace
func (ms *MetricsService) GetNamespaceMetrics(ctx context.Context, namespace string) (*ClusterMetrics, error) {
	// Similar to GetClusterMetrics but filtered by namespace
	podMetrics, err := ms.getNamespacePodMetrics(ctx, namespace)
	if err != nil {
		return nil, err
	}

	quotas, err := ms.getNamespaceResourceQuotas(ctx, namespace)
	if err != nil {
		return nil, err
	}

	return &ClusterMetrics{
		Timestamp:      time.Now(),
		PodMetrics:     podMetrics,
		ResourceQuotas: quotas,
	}, nil
}

// getNamespacePodMetrics retrieves pod metrics for a specific namespace
func (ms *MetricsService) getNamespacePodMetrics(ctx context.Context, namespace string) ([]PodMetrics, error) {
	if ms.metricsClient == nil {
		return []PodMetrics{}, nil
	}

	podMetricsList, err := ms.metricsClient.PodMetricses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var podMetrics []PodMetrics
	for _, podMetric := range podMetricsList.Items {
		var containerMetrics []ContainerMetrics
		for _, container := range podMetric.Containers {
			containerMetrics = append(containerMetrics, ContainerMetrics{
				Name: container.Name,
				CPU: ResourceUsage{
					Used:      container.Usage.Cpu().String(),
					UsedBytes: container.Usage.Cpu().MilliValue(),
				},
				Memory: ResourceUsage{
					Used:      container.Usage.Memory().String(),
					UsedBytes: container.Usage.Memory().Value(),
				},
			})
		}

		podMetrics = append(podMetrics, PodMetrics{
			Name:       podMetric.Name,
			Namespace:  podMetric.Namespace,
			Containers: containerMetrics,
			Timestamp:  podMetric.Timestamp.Time,
		})
	}

	return podMetrics, nil
}

// getNamespaceResourceQuotas retrieves resource quotas for a specific namespace
func (ms *MetricsService) getNamespaceResourceQuotas(ctx context.Context, namespace string) ([]NamespaceQuota, error) {
	quotas, err := ms.kubeClient.CoreV1().ResourceQuotas(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	if len(quotas.Items) == 0 {
		return []NamespaceQuota{}, nil
	}

	quotaSpecs := make(map[string]ResourceQuotaSpec)
	for _, quota := range quotas.Items {
		for resource, hard := range quota.Status.Hard {
			used := quota.Status.Used[resource]
			quotaSpecs[string(resource)] = ResourceQuotaSpec{
				Hard: hard.String(),
				Used: used.String(),
			}
		}
	}

	return []NamespaceQuota{{
		Namespace: namespace,
		Quotas:    quotaSpecs,
	}}, nil
}
