package api

import (
	"fmt"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/metrics"
	appsv1 "k8s.io/api/apps/v1"
	v1 "k8s.io/api/core/v1"
)

// Response formatting functions

// nodeToSummary creates a basic node summary
func (s *Server) nodeToSummary(node *v1.Node) map[string]interface{} {
	// Extract node roles from labels
	roles := []string{}
	if _, isMaster := node.Labels["node-role.kubernetes.io/master"]; isMaster {
		roles = append(roles, "master")
	}
	if _, isControlPlane := node.Labels["node-role.kubernetes.io/control-plane"]; isControlPlane {
		roles = append(roles, "control-plane")
	}
	if len(roles) == 0 {
		roles = append(roles, "worker")
	}

	// Check if node is ready
	ready := false
	for _, condition := range node.Status.Conditions {
		if condition.Type == v1.NodeReady && condition.Status == v1.ConditionTrue {
			ready = true
			break
		}
	}

	// Extract taints
	taints := []map[string]string{}
	for _, taint := range node.Spec.Taints {
		taints = append(taints, map[string]string{
			"key":    taint.Key,
			"value":  taint.Value,
			"effect": string(taint.Effect),
		})
	}

	return map[string]interface{}{
		"name":              node.Name,
		"roles":             roles,
		"kubeletVersion":    node.Status.NodeInfo.KubeletVersion,
		"ready":             ready,
		"unschedulable":     node.Spec.Unschedulable,
		"taints":            taints,
		"capacity":          node.Status.Capacity,
		"allocatable":       node.Status.Allocatable,
		"creationTimestamp": node.CreationTimestamp.Time,
	}
}

// nodeToEnrichedResponse converts a Kubernetes node to enriched response format with maintenance alerts
func (s *Server) nodeToEnrichedResponse(node *v1.Node) map[string]interface{} {
	// Calculate age
	age := calculateAge(node.CreationTimestamp.Time)

	// Extract node roles from labels
	roles := []string{}
	if _, isMaster := node.Labels["node-role.kubernetes.io/master"]; isMaster {
		roles = append(roles, "master")
	}
	if _, isControlPlane := node.Labels["node-role.kubernetes.io/control-plane"]; isControlPlane {
		roles = append(roles, "control-plane")
	}
	if len(roles) == 0 {
		roles = append(roles, "worker")
	}

	// Analyze node status and conditions
	ready := false
	var conditions []map[string]interface{}
	var alerts []map[string]interface{}

	for _, condition := range node.Status.Conditions {
		conditionMap := map[string]interface{}{
			"type":               string(condition.Type),
			"status":             string(condition.Status),
			"lastTransitionTime": condition.LastTransitionTime.Time,
			"reason":             condition.Reason,
			"message":            condition.Message,
		}
		conditions = append(conditions, conditionMap)

		// Check for maintenance alerts
		if condition.Type == v1.NodeReady && condition.Status != v1.ConditionTrue {
			alerts = append(alerts, map[string]interface{}{
				"type":      "error",
				"message":   "Node is not ready",
				"reason":    condition.Reason,
				"details":   condition.Message,
				"timestamp": condition.LastTransitionTime.Time,
			})
		} else if condition.Type == v1.NodeReady && condition.Status == v1.ConditionTrue {
			ready = true
		}

		// Check for disk pressure
		if condition.Type == v1.NodeDiskPressure && condition.Status == v1.ConditionTrue {
			alerts = append(alerts, map[string]interface{}{
				"type":      "warning",
				"message":   "Node experiencing disk pressure",
				"reason":    condition.Reason,
				"details":   condition.Message,
				"timestamp": condition.LastTransitionTime.Time,
			})
		}

		// Check for memory pressure
		if condition.Type == v1.NodeMemoryPressure && condition.Status == v1.ConditionTrue {
			alerts = append(alerts, map[string]interface{}{
				"type":      "warning",
				"message":   "Node experiencing memory pressure",
				"reason":    condition.Reason,
				"details":   condition.Message,
				"timestamp": condition.LastTransitionTime.Time,
			})
		}

		// Check for PID pressure
		if condition.Type == v1.NodePIDPressure && condition.Status == v1.ConditionTrue {
			alerts = append(alerts, map[string]interface{}{
				"type":      "warning",
				"message":   "Node experiencing PID pressure",
				"reason":    condition.Reason,
				"details":   condition.Message,
				"timestamp": condition.LastTransitionTime.Time,
			})
		}
	}

	// Extract taints
	var taints []map[string]interface{}
	for _, taint := range node.Spec.Taints {
		taintMap := map[string]interface{}{
			"key":    taint.Key,
			"value":  taint.Value,
			"effect": string(taint.Effect),
		}
		if taint.TimeAdded != nil {
			taintMap["timeAdded"] = taint.TimeAdded.Time
		}
		taints = append(taints, taintMap)

		// Add maintenance alerts for certain taints
		if taint.Key == "node.kubernetes.io/not-ready" {
			alerts = append(alerts, map[string]interface{}{
				"type":    "error",
				"message": "Node is tainted as not ready",
				"reason":  "NodeNotReady",
				"details": "Node has not-ready taint",
			})
		}
		if taint.Key == "node.kubernetes.io/unreachable" {
			alerts = append(alerts, map[string]interface{}{
				"type":    "error",
				"message": "Node is unreachable",
				"reason":  "NodeUnreachable",
				"details": "Node has unreachable taint",
			})
		}
	}

	// Calculate resource usage percentages
	var resourceUsage map[string]interface{}
	if node.Status.Capacity != nil && node.Status.Allocatable != nil {
		cpuCapacity := node.Status.Capacity["cpu"]
		cpuAllocatable := node.Status.Allocatable["cpu"]
		memCapacity := node.Status.Capacity["memory"]
		memAllocatable := node.Status.Allocatable["memory"]

		resourceUsage = map[string]interface{}{
			"cpu": map[string]interface{}{
				"capacity":    cpuCapacity.String(),
				"allocatable": cpuAllocatable.String(),
			},
			"memory": map[string]interface{}{
				"capacity":    memCapacity.String(),
				"allocatable": memAllocatable.String(),
			},
		}
	}

	// Node addresses
	var addresses []map[string]interface{}
	for _, addr := range node.Status.Addresses {
		addresses = append(addresses, map[string]interface{}{
			"type":    string(addr.Type),
			"address": addr.Address,
		})
	}

	return map[string]interface{}{
		"name":  node.Name,
		"roles": roles,
		"status": map[string]interface{}{
			"ready":         ready,
			"unschedulable": node.Spec.Unschedulable,
			"conditions":    conditions,
		},
		"alerts":    alerts,
		"taints":    taints,
		"addresses": addresses,
		"nodeInfo": map[string]interface{}{
			"kubeletVersion":   node.Status.NodeInfo.KubeletVersion,
			"kubeProxyVersion": node.Status.NodeInfo.KubeProxyVersion,
			"containerRuntime": node.Status.NodeInfo.ContainerRuntimeVersion,
			"osImage":          node.Status.NodeInfo.OSImage,
			"kernel":           node.Status.NodeInfo.KernelVersion,
			"architecture":     node.Status.NodeInfo.Architecture,
		},
		"resourceUsage":     resourceUsage,
		"capacity":          node.Status.Capacity,
		"allocatable":       node.Status.Allocatable,
		"age":               age,
		"labels":            node.Labels,
		"annotations":       node.Annotations,
		"creationTimestamp": node.CreationTimestamp.Time,
	}
}

// podToSummary creates a basic pod summary
func (s *Server) podToSummary(pod *v1.Pod) map[string]interface{} {
	// Determine pod status
	phase := string(pod.Status.Phase)
	ready := false

	// Check if all containers are ready
	readyContainers := 0
	totalContainers := len(pod.Spec.Containers)

	for _, condition := range pod.Status.Conditions {
		if condition.Type == v1.PodReady && condition.Status == v1.ConditionTrue {
			ready = true
			break
		}
	}

	for _, containerStatus := range pod.Status.ContainerStatuses {
		if containerStatus.Ready {
			readyContainers++
		}
	}

	return map[string]interface{}{
		"name":              pod.Name,
		"namespace":         pod.Namespace,
		"phase":             phase,
		"ready":             ready,
		"readyContainers":   readyContainers,
		"totalContainers":   totalContainers,
		"nodeName":          pod.Spec.NodeName,
		"podIP":             pod.Status.PodIP,
		"hostIP":            pod.Status.HostIP,
		"labels":            pod.Labels,
		"creationTimestamp": pod.CreationTimestamp.Time,
		"deletionTimestamp": pod.DeletionTimestamp,
		"restartPolicy":     string(pod.Spec.RestartPolicy),
	}
}

// enhancedPodToSummary creates an enhanced pod summary with metrics integration
func (s *Server) enhancedPodToSummary(pod *v1.Pod, podMetricsMap map[string]map[string]interface{}) map[string]interface{} {
	// Start with basic summary
	summary := s.podToSummary(pod)

	// Calculate restart count
	var restartCount int32
	for _, containerStatus := range pod.Status.ContainerStatuses {
		restartCount += containerStatus.RestartCount
	}

	// Format ready as "x/y"
	readyContainers := summary["readyContainers"].(int)
	totalContainers := summary["totalContainers"].(int)
	readyStr := fmt.Sprintf("%d/%d", readyContainers, totalContainers)

	// Calculate age
	age := calculateAge(pod.CreationTimestamp.Time)

	// Get status reason
	statusReason := getStatusReason(pod)

	// Get metrics if available
	key := pod.Namespace + "/" + pod.Name
	var cpuMetrics, memoryMetrics map[string]interface{}
	if metrics, exists := podMetricsMap[key]; exists {
		cpuMetrics = metrics["cpu"].(map[string]interface{})
		memoryMetrics = metrics["memory"].(map[string]interface{})
	} else {
		// Default metrics when not available
		cpuMetrics = map[string]interface{}{
			"milli":          0,
			"ofLimitPercent": nil,
		}
		memoryMetrics = map[string]interface{}{
			"bytes":          0,
			"ofLimitPercent": nil,
		}
	}

	// Create enhanced summary
	return map[string]interface{}{
		"name":         pod.Name,
		"namespace":    pod.Namespace,
		"phase":        string(pod.Status.Phase),
		"ready":        readyStr,
		"restartCount": restartCount,
		"age":          age,
		"node":         pod.Spec.NodeName,
		"cpu":          cpuMetrics,
		"memory":       memoryMetrics,
		"statusReason": statusReason,
		// Additional fields for compatibility
		"podIP":             pod.Status.PodIP,
		"labels":            pod.Labels,
		"creationTimestamp": pod.CreationTimestamp.Time,
	}
}

// deploymentToResponse converts a Kubernetes deployment to response format
func (s *Server) deploymentToResponse(deployment appsv1.Deployment) map[string]interface{} {
	// Calculate age
	age := calculateAge(deployment.CreationTimestamp.Time)

	// Prepare replica counts
	desired := int32(0)
	if deployment.Spec.Replicas != nil {
		desired = *deployment.Spec.Replicas
	}

	replicas := map[string]int32{
		"desired":   desired,
		"ready":     deployment.Status.ReadyReplicas,
		"updated":   deployment.Status.UpdatedReplicas,
		"available": deployment.Status.AvailableReplicas,
	}

	// Convert conditions
	var conditions []map[string]string
	for _, condition := range deployment.Status.Conditions {
		conditions = append(conditions, map[string]string{
			"type":    string(condition.Type),
			"status":  string(condition.Status),
			"reason":  condition.Reason,
			"message": condition.Message,
		})
	}

	return map[string]interface{}{
		"name":              deployment.Name,
		"namespace":         deployment.Namespace,
		"replicas":          replicas,
		"conditions":        conditions,
		"age":               age,
		"labels":            deployment.Labels,
		"creationTimestamp": deployment.CreationTimestamp.Time,
	}
}

// statefulSetToResponse converts a Kubernetes statefulset to response format
func (s *Server) statefulSetToResponse(statefulSet appsv1.StatefulSet) map[string]interface{} {
	// Calculate age
	age := calculateAge(statefulSet.CreationTimestamp.Time)

	// Prepare replica counts
	desired := int32(0)
	if statefulSet.Spec.Replicas != nil {
		desired = *statefulSet.Spec.Replicas
	}

	replicas := map[string]int32{
		"desired": desired,
		"ready":   statefulSet.Status.ReadyReplicas,
		"current": statefulSet.Status.CurrentReplicas,
		"updated": statefulSet.Status.UpdatedReplicas,
	}

	// Convert conditions
	var conditions []map[string]string
	for _, condition := range statefulSet.Status.Conditions {
		conditions = append(conditions, map[string]string{
			"type":    string(condition.Type),
			"status":  string(condition.Status),
			"reason":  condition.Reason,
			"message": condition.Message,
		})
	}

	return map[string]interface{}{
		"name":              statefulSet.Name,
		"namespace":         statefulSet.Namespace,
		"replicas":          replicas,
		"conditions":        conditions,
		"age":               age,
		"labels":            statefulSet.Labels,
		"creationTimestamp": statefulSet.CreationTimestamp.Time,
		"serviceName":       statefulSet.Spec.ServiceName,
		"updateStrategy":    statefulSet.Spec.UpdateStrategy.Type,
		"currentRevision":   statefulSet.Status.CurrentRevision,
		"updateRevision":    statefulSet.Status.UpdateRevision,
	}
}

// serviceToResponse converts a Kubernetes service to response format
func (s *Server) serviceToResponse(service v1.Service) map[string]interface{} {
	// Calculate age
	age := calculateAge(service.CreationTimestamp.Time)

	// Prepare ports information
	var ports []map[string]interface{}
	for _, port := range service.Spec.Ports {
		portInfo := map[string]interface{}{
			"name":       port.Name,
			"port":       port.Port,
			"protocol":   string(port.Protocol),
			"targetPort": port.TargetPort.String(),
		}
		if port.NodePort != 0 {
			portInfo["nodePort"] = port.NodePort
		}
		ports = append(ports, portInfo)
	}

	// Prepare selector information
	selector := service.Spec.Selector
	if selector == nil {
		selector = make(map[string]string)
	}

	// Get external IPs
	var externalIPs []string
	externalIPs = append(externalIPs, service.Spec.ExternalIPs...)

	// Add LoadBalancer ingress IPs/hostnames
	for _, ingress := range service.Status.LoadBalancer.Ingress {
		if ingress.IP != "" {
			externalIPs = append(externalIPs, ingress.IP)
		}
		if ingress.Hostname != "" {
			externalIPs = append(externalIPs, ingress.Hostname)
		}
	}

	return map[string]interface{}{
		"name":              service.Name,
		"namespace":         service.Namespace,
		"type":              string(service.Spec.Type),
		"clusterIP":         service.Spec.ClusterIP,
		"externalIPs":       externalIPs,
		"ports":             ports,
		"selector":          selector,
		"age":               age,
		"labels":            service.Labels,
		"annotations":       service.Annotations,
		"creationTimestamp": service.CreationTimestamp.Time,
	}
}

// calculatePodCPUUsage calculates CPU usage metrics for a pod
func calculatePodCPUUsage(podMetric metrics.PodMetrics) map[string]interface{} {
	var totalCPUMilli int64
	for _, container := range podMetric.Containers {
		totalCPUMilli += container.CPU.UsedBytes
	}

	return map[string]interface{}{
		"milli":          totalCPUMilli,
		"ofLimitPercent": nil, // TODO: Calculate against limits when available
	}
}

// calculatePodMemoryUsage calculates memory usage metrics for a pod
func calculatePodMemoryUsage(podMetric metrics.PodMetrics) map[string]interface{} {
	var totalMemoryBytes int64
	for _, container := range podMetric.Containers {
		totalMemoryBytes += container.Memory.UsedBytes
	}

	return map[string]interface{}{
		"bytes":          totalMemoryBytes,
		"ofLimitPercent": nil, // TODO: Calculate against limits when available
	}
}

// calculateAge calculates a human-readable age string
func calculateAge(creationTime time.Time) string {
	duration := time.Since(creationTime)

	days := int(duration.Hours() / 24)
	if days > 0 {
		return fmt.Sprintf("%dd", days)
	}

	hours := int(duration.Hours())
	if hours > 0 {
		return fmt.Sprintf("%dh", hours)
	}

	minutes := int(duration.Minutes())
	if minutes > 0 {
		return fmt.Sprintf("%dm", minutes)
	}

	return fmt.Sprintf("%ds", int(duration.Seconds()))
}

// getStatusReason gets the reason for a pod's current status
func getStatusReason(pod *v1.Pod) *string {
	// Check for container states that indicate issues
	for _, containerStatus := range pod.Status.ContainerStatuses {
		if containerStatus.State.Waiting != nil {
			reason := containerStatus.State.Waiting.Reason
			return &reason
		}
		if containerStatus.State.Terminated != nil && containerStatus.State.Terminated.Reason != "Completed" {
			reason := containerStatus.State.Terminated.Reason
			return &reason
		}
	}

	// Check pod conditions for issues
	for _, condition := range pod.Status.Conditions {
		if condition.Status == v1.ConditionFalse && condition.Reason != "" {
			reason := condition.Reason
			return &reason
		}
	}

	return nil
}
