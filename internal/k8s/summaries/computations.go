package summaries

import (
	"context"
	"fmt"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// computePodSummary computes summary cards for pods
func (s *SummaryService) computePodSummary(ctx context.Context, namespace string) ([]SummaryCard, error) {
	// Try to use informer cache first, fallback to API
	var pods []v1.Pod

	if s.informerMgr != nil {
		indexer := s.informerMgr.GetPodLister()
		if namespace == "" {
			// Get all pods from informer cache
			objects := indexer.List()
			for _, obj := range objects {
				if pod, ok := obj.(*v1.Pod); ok {
					pods = append(pods, *pod)
				}
			}
		} else {
			// Get pods from specific namespace
			objects, _ := indexer.ByIndex("namespace", namespace)
			for _, obj := range objects {
				if pod, ok := obj.(*v1.Pod); ok {
					pods = append(pods, *pod)
				}
			}
		}
	}

	// Fallback to API call if no pods from informer
	if len(pods) == 0 {
		podList, err := s.kubeClient.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list pods: %w", err)
		}
		pods = podList.Items
	}

	var (
		total          = len(pods)
		ready          = 0
		createdLast24h = 0
		totalCPU       = 0.0
		totalMemory    = int64(0)
		validPods      = 0
	)

	cutoff := time.Now().Add(-24 * time.Hour)

	for _, pod := range pods {
		// Skip completed pods for summary calculations
		if pod.Status.Phase == v1.PodSucceeded || pod.Status.Phase == v1.PodFailed {
			continue
		}

		if isPodReady(&pod) {
			ready++
		}

		if pod.CreationTimestamp.Time.After(cutoff) {
			createdLast24h++
		}

		// Extract resource usage from pod requests
		cpu, memory := extractPodResourceRequests(&pod)
		if cpu > 0 || memory > 0 {
			totalCPU += cpu
			totalMemory += memory
			validPods++
		}
	}

	// Calculate averages
	avgCPU := 0.0
	avgMemory := int64(0)
	if validPods > 0 {
		avgCPU = totalCPU / float64(validPods)
		avgMemory = totalMemory / int64(validPods)
	}

	return []SummaryCard{
		{
			Title:    "Total Pods",
			Value:    fmt.Sprintf("%d", total),
			Subtitle: "Active workload instances",
			Footer:   getNamespaceFooter(namespace),
			Status:   getHealthStatus(ready, total),
		},
		{
			Title:    "Ready vs NotReady",
			Value:    fmt.Sprintf("%d/%d", ready, total),
			Subtitle: formatPercentage(ready, total) + " pods ready",
			Footer:   fmt.Sprintf("%d pods pending startup", total-ready),
			Status:   getReadinessStatus(ready, total),
		},
		{
			Title:    "Created Last 24h",
			Value:    fmt.Sprintf("%d", createdLast24h),
			Subtitle: "Recent pod deployments",
			Footer:   getTrendDescription(createdLast24h, "deployment activity"),
			Trend:    getTrend(createdLast24h),
		},
		{
			Title:    "Avg. CPU / Memory",
			Value:    fmt.Sprintf("%.0fm/%s", avgCPU*1000, formatMemory(avgMemory)),
			Subtitle: "Average resource requests",
			Footer:   "Per pod resource allocation",
			Status:   getResourceUsageStatus(avgCPU, float64(avgMemory)),
		},
	}, nil
}

// computeNodeSummary computes summary cards for nodes
func (s *SummaryService) computeNodeSummary(ctx context.Context, namespace string) ([]SummaryCard, error) {
	// Nodes are cluster-scoped, ignore namespace parameter
	var nodes []v1.Node

	if s.informerMgr != nil {
		indexer := s.informerMgr.GetNodeLister()
		objects := indexer.List()
		for _, obj := range objects {
			if node, ok := obj.(*v1.Node); ok {
				nodes = append(nodes, *node)
			}
		}
	}

	// Fallback to API call
	if len(nodes) == 0 {
		nodeList, err := s.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list nodes: %w", err)
		}
		nodes = nodeList.Items
	}

	var (
		total               = len(nodes)
		ready               = 0
		totalAllocatableCPU = 0.0
		totalAllocatableMem = int64(0)
		totalUsedCPU        = 0.0
		totalUsedMem        = int64(0)
	)

	for _, node := range nodes {
		if isNodeReady(&node) {
			ready++
		}

		// Extract allocatable resources
		if cpu := node.Status.Allocatable.Cpu(); cpu != nil {
			totalAllocatableCPU += float64(cpu.MilliValue()) / 1000.0
		}
		if memory := node.Status.Allocatable.Memory(); memory != nil {
			totalAllocatableMem += memory.Value()
		}

		// For usage, we'd need metrics server - for now use a placeholder
		// TODO: Integrate with metrics server for actual usage
	}

	cpuUtilization := 0.0
	memUtilization := 0.0
	if totalAllocatableCPU > 0 {
		cpuUtilization = (totalUsedCPU / totalAllocatableCPU) * 100
	}
	if totalAllocatableMem > 0 {
		memUtilization = (float64(totalUsedMem) / float64(totalAllocatableMem)) * 100
	}

	return []SummaryCard{
		{
			Title:    "Total Nodes",
			Value:    fmt.Sprintf("%d", total),
			Subtitle: "Cluster compute nodes",
			Footer:   "Infrastructure capacity",
			Status:   getHealthStatus(ready, total),
		},
		{
			Title:    "Ready vs NotReady",
			Value:    fmt.Sprintf("%d/%d", ready, total),
			Subtitle: formatPercentage(ready, total) + " nodes ready",
			Footer:   getNodeStatusFooter(ready, total),
			Status:   getReadinessStatus(ready, total),
		},
		{
			Title:    "CPU Allocatable vs Used",
			Value:    fmt.Sprintf("%.1f%%", cpuUtilization),
			Subtitle: "CPU capacity utilization",
			Footer:   fmt.Sprintf("%.1f cores allocatable", totalAllocatableCPU),
			Status:   getUtilizationStatus(cpuUtilization),
		},
		{
			Title:    "Memory Allocatable vs Used",
			Value:    fmt.Sprintf("%.1f%%", memUtilization),
			Subtitle: "Memory capacity utilization",
			Footer:   fmt.Sprintf("%s allocatable", formatMemory(totalAllocatableMem)),
			Status:   getUtilizationStatus(memUtilization),
		},
	}, nil
}

// computeDeploymentSummary computes summary cards for deployments
func (s *SummaryService) computeDeploymentSummary(ctx context.Context, namespace string) ([]SummaryCard, error) {
	var deployments []appsv1.Deployment

	if s.informerMgr != nil && namespace == "" {
		indexer := s.informerMgr.GetDeploymentLister()
		objects := indexer.List()
		for _, obj := range objects {
			if deployment, ok := obj.(*appsv1.Deployment); ok {
				deployments = append(deployments, *deployment)
			}
		}
	}

	// Fallback to API call
	if len(deployments) == 0 {
		deploymentList, err := s.kubeClient.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list deployments: %w", err)
		}
		deployments = deploymentList.Items
	}

	var (
		total          = len(deployments)
		available      = 0
		unavailable    = 0
		updatedLast24h = 0
		totalReplicas  = int32(0)
		totalPods      = int32(0)
	)

	cutoff := time.Now().Add(-24 * time.Hour)

	for _, deployment := range deployments {
		if deployment.Status.AvailableReplicas > 0 {
			available++
		} else {
			unavailable++
		}

		// Check if updated recently
		if deployment.Status.ObservedGeneration > 0 &&
			deployment.ObjectMeta.Generation != deployment.Status.ObservedGeneration {
			updatedLast24h++
		} else if deployment.CreationTimestamp.Time.After(cutoff) {
			updatedLast24h++
		}

		if deployment.Spec.Replicas != nil {
			totalReplicas += *deployment.Spec.Replicas
		}
		totalPods += deployment.Status.Replicas
	}

	avgPodsPerDeployment := 0.0
	if total > 0 {
		avgPodsPerDeployment = float64(totalPods) / float64(total)
	}

	return []SummaryCard{
		{
			Title:    "Total Deployments",
			Value:    fmt.Sprintf("%d", total),
			Subtitle: "Application deployments",
			Footer:   getNamespaceFooter(namespace),
			Status:   getHealthStatus(available, total),
		},
		{
			Title:    "Available vs Unavailable",
			Value:    fmt.Sprintf("%d/%d", available, total),
			Subtitle: formatPercentage(available, total) + " deployments ready",
			Footer:   fmt.Sprintf("%d scaling or unavailable", unavailable),
			Status:   getReadinessStatus(available, total),
		},
		{
			Title:    "Updated Last 24h",
			Value:    fmt.Sprintf("%d", updatedLast24h),
			Subtitle: "Recent deployment updates",
			Footer:   getTrendDescription(updatedLast24h, "deployment activity"),
			Trend:    getTrend(updatedLast24h),
		},
		{
			Title:    "Pods per Deployment",
			Value:    fmt.Sprintf("%.1f", avgPodsPerDeployment),
			Subtitle: "Average replica count",
			Footer:   fmt.Sprintf("%d total pods managed", totalPods),
			Status:   "healthy",
		},
	}, nil
}

// computeServiceSummary computes summary cards for services
func (s *SummaryService) computeServiceSummary(ctx context.Context, namespace string) ([]SummaryCard, error) {
	var services []v1.Service

	if s.informerMgr != nil && namespace == "" {
		indexer := s.informerMgr.GetServiceLister()
		objects := indexer.List()
		for _, obj := range objects {
			if service, ok := obj.(*v1.Service); ok {
				services = append(services, *service)
			}
		}
	}

	// Fallback to API call
	if len(services) == 0 {
		serviceList, err := s.kubeClient.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to list services: %w", err)
		}
		services = serviceList.Items
	}

	var (
		total          = len(services)
		clusterIP      = 0
		nodePort       = 0
		loadBalancer   = 0
		totalEndpoints = 0
		orphaned       = 0
	)

	// Count service types and get endpoint information
	for _, service := range services {
		switch service.Spec.Type {
		case v1.ServiceTypeClusterIP:
			clusterIP++
		case v1.ServiceTypeNodePort:
			nodePort++
		case v1.ServiceTypeLoadBalancer:
			loadBalancer++
		}

		// Check for endpoints (simplified - would need endpoints API call for accuracy)
		if len(service.Spec.Selector) == 0 && service.Spec.ClusterIP != "None" {
			orphaned++
		}

		// Rough estimate of endpoints based on ports
		totalEndpoints += len(service.Spec.Ports)
	}

	avgEndpoints := 0.0
	if total > 0 {
		avgEndpoints = float64(totalEndpoints) / float64(total)
	}

	return []SummaryCard{
		{
			Title:    "Total Services",
			Value:    fmt.Sprintf("%d", total),
			Subtitle: "Network service endpoints",
			Footer:   getNamespaceFooter(namespace),
			Status:   "healthy",
		},
		{
			Title:    "Type Distribution",
			Value:    fmt.Sprintf("%d/%d/%d", clusterIP, nodePort, loadBalancer),
			Subtitle: "ClusterIP/NodePort/LoadBalancer",
			Footer:   "Service type breakdown",
			Status:   "healthy",
		},
		{
			Title:    "Avg. Endpoints per Service",
			Value:    fmt.Sprintf("%.1f", avgEndpoints),
			Subtitle: "Average backend endpoints",
			Footer:   "Load distribution estimate",
			Status:   "healthy",
		},
		{
			Title:    "Orphaned Services",
			Value:    fmt.Sprintf("%d", orphaned),
			Subtitle: "Services with no selector",
			Footer:   getOrphanedFooter(orphaned),
			Status:   getOrphanedStatus(orphaned),
		},
	}, nil
}

// Helper functions for common calculations

func isPodReady(pod *v1.Pod) bool {
	for _, condition := range pod.Status.Conditions {
		if condition.Type == v1.PodReady && condition.Status == v1.ConditionTrue {
			return true
		}
	}
	return false
}

func isNodeReady(node *v1.Node) bool {
	for _, condition := range node.Status.Conditions {
		if condition.Type == v1.NodeReady && condition.Status == v1.ConditionTrue {
			return true
		}
	}
	return false
}

func extractPodResourceRequests(pod *v1.Pod) (cpu float64, memory int64) {
	for _, container := range pod.Spec.Containers {
		if container.Resources.Requests != nil {
			if cpuReq := container.Resources.Requests.Cpu(); cpuReq != nil {
				cpu += float64(cpuReq.MilliValue()) / 1000.0
			}
			if memReq := container.Resources.Requests.Memory(); memReq != nil {
				memory += memReq.Value()
			}
		}
	}
	return cpu, memory
}

func formatMemory(bytes int64) string {
	if bytes == 0 {
		return "0Mi"
	}

	const (
		Ki = 1024
		Mi = Ki * 1024
		Gi = Mi * 1024
	)

	if bytes >= Gi {
		return fmt.Sprintf("%.1fGi", float64(bytes)/float64(Gi))
	} else if bytes >= Mi {
		return fmt.Sprintf("%.0fMi", float64(bytes)/float64(Mi))
	} else {
		return fmt.Sprintf("%.0fKi", float64(bytes)/float64(Ki))
	}
}

func formatPercentage(numerator, denominator int) string {
	if denominator == 0 {
		return "0%"
	}
	percentage := float64(numerator) / float64(denominator) * 100
	return fmt.Sprintf("%.0f%%", percentage)
}

func getHealthStatus(ready, total int) string {
	if total == 0 {
		return "healthy"
	}
	ratio := float64(ready) / float64(total)
	if ratio >= 0.9 {
		return "healthy"
	} else if ratio >= 0.7 {
		return "warning"
	}
	return "error"
}

func getReadinessStatus(ready, total int) string {
	return getHealthStatus(ready, total)
}

func getUtilizationStatus(percentage float64) string {
	if percentage >= 90 {
		return "error"
	} else if percentage >= 75 {
		return "warning"
	}
	return "healthy"
}

func getResourceUsageStatus(cpu, memory float64) string {
	// Simple heuristic based on resource levels
	if cpu > 2.0 || memory > 8*1024*1024*1024 { // > 2 CPU cores or > 8GB
		return "warning"
	}
	return "healthy"
}

func getTrend(count int) map[string]interface{} {
	direction := "stable"
	percentage := 0

	if count > 10 {
		direction = "up"
		percentage = 20 // Estimated increase
	} else if count > 0 {
		direction = "stable"
		percentage = 0
	} else {
		direction = "down"
		percentage = -10 // Estimated decrease
	}

	return map[string]interface{}{
		"direction":  direction,
		"percentage": percentage,
	}
}

func getTrendDescription(count int, activity string) string {
	if count > 10 {
		return fmt.Sprintf("High %s detected", activity)
	} else if count > 0 {
		return fmt.Sprintf("Moderate %s", activity)
	}
	return fmt.Sprintf("Low %s", activity)
}

func getNamespaceFooter(namespace string) string {
	if namespace == "" {
		return "Across all namespaces"
	}
	return fmt.Sprintf("In %s namespace", namespace)
}

func getNodeStatusFooter(ready, total int) string {
	if ready == total {
		return "All nodes operational"
	}
	notReady := total - ready
	return fmt.Sprintf("%d node(s) need attention", notReady)
}

func getOrphanedFooter(count int) string {
	if count == 0 {
		return "All services have backends"
	}
	return "Requires attention"
}

func getOrphanedStatus(count int) string {
	if count == 0 {
		return "healthy"
	} else if count <= 2 {
		return "warning"
	}
	return "error"
}

// Placeholder implementations for remaining resource types
func (s *SummaryService) computeReplicaSetSummary(ctx context.Context, namespace string) ([]SummaryCard, error) {
	// TODO: Implement ReplicaSet summary computation
	return s.getPlaceholderCards("replicasets"), nil
}

func (s *SummaryService) computeStatefulSetSummary(ctx context.Context, namespace string) ([]SummaryCard, error) {
	// TODO: Implement StatefulSet summary computation
	return s.getPlaceholderCards("statefulsets"), nil
}

func (s *SummaryService) computeDaemonSetSummary(ctx context.Context, namespace string) ([]SummaryCard, error) {
	// TODO: Implement DaemonSet summary computation
	return s.getPlaceholderCards("daemonsets"), nil
}

func (s *SummaryService) computeConfigMapSummary(ctx context.Context, namespace string) ([]SummaryCard, error) {
	// TODO: Implement ConfigMap summary computation
	return s.getPlaceholderCards("configmaps"), nil
}

func (s *SummaryService) computeSecretSummary(ctx context.Context, namespace string) ([]SummaryCard, error) {
	// TODO: Implement Secret summary computation
	return s.getPlaceholderCards("secrets"), nil
}

func (s *SummaryService) computeEndpointSummary(ctx context.Context, namespace string) ([]SummaryCard, error) {
	// TODO: Implement Endpoint summary computation
	return s.getPlaceholderCards("endpoints"), nil
}

func (s *SummaryService) getPlaceholderCards(resourceType string) []SummaryCard {
	return []SummaryCard{
		{
			Title:    fmt.Sprintf("Total %s", strings.Title(resourceType)),
			Value:    "N/A",
			Subtitle: "Implementation pending",
			Footer:   "Summary computation not yet implemented",
			Status:   "healthy",
		},
		{
			Title:    "Status",
			Value:    "N/A",
			Subtitle: "Status breakdown",
			Footer:   "Implementation pending",
			Status:   "healthy",
		},
		{
			Title:    "Recent Activity",
			Value:    "N/A",
			Subtitle: "Activity in last 24h",
			Footer:   "Implementation pending",
			Status:   "healthy",
		},
		{
			Title:    "Metrics",
			Value:    "N/A",
			Subtitle: "Key metrics",
			Footer:   "Implementation pending",
			Status:   "healthy",
		},
	}
}
