package api

import (
	"fmt"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/metrics"
	"github.com/aaronlmathis/kaptn/internal/k8s/resources"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	v1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	storagev1 "k8s.io/api/storage/v1"
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

// daemonSetToResponse converts a Kubernetes daemonset to response format
func (s *Server) daemonSetToResponse(daemonSet appsv1.DaemonSet) map[string]interface{} {
	// Calculate age
	age := calculateAge(daemonSet.CreationTimestamp.Time)

	// DaemonSet status numbers
	desired := daemonSet.Status.DesiredNumberScheduled
	current := daemonSet.Status.CurrentNumberScheduled
	ready := daemonSet.Status.NumberReady
	available := daemonSet.Status.NumberAvailable
	unavailable := daemonSet.Status.NumberUnavailable

	status := map[string]int32{
		"desired":     desired,
		"current":     current,
		"ready":       ready,
		"available":   available,
		"unavailable": unavailable,
	}

	// Convert conditions
	var conditions []map[string]string
	for _, condition := range daemonSet.Status.Conditions {
		conditions = append(conditions, map[string]string{
			"type":    string(condition.Type),
			"status":  string(condition.Status),
			"reason":  condition.Reason,
			"message": condition.Message,
		})
	}

	return map[string]interface{}{
		"name":              daemonSet.Name,
		"namespace":         daemonSet.Namespace,
		"status":            status,
		"conditions":        conditions,
		"age":               age,
		"labels":            daemonSet.Labels,
		"creationTimestamp": daemonSet.CreationTimestamp.Time,
		"updateStrategy":    daemonSet.Spec.UpdateStrategy.Type,
		"currentRevision":   daemonSet.Status.CurrentNumberScheduled, // Using current number as revision info isn't always available
		"selector":          daemonSet.Spec.Selector,
	}
}

// replicaSetToResponse converts a Kubernetes replicaset to response format
func (s *Server) replicaSetToResponse(replicaSet appsv1.ReplicaSet) map[string]interface{} {
	// Calculate age
	age := calculateAge(replicaSet.CreationTimestamp.Time)

	// Prepare replica counts
	desired := int32(0)
	if replicaSet.Spec.Replicas != nil {
		desired = *replicaSet.Spec.Replicas
	}

	replicas := map[string]int32{
		"desired":      desired,
		"ready":        replicaSet.Status.ReadyReplicas,
		"available":    replicaSet.Status.AvailableReplicas,
		"fullyLabeled": replicaSet.Status.FullyLabeledReplicas,
	}

	// Convert conditions
	var conditions []map[string]string
	for _, condition := range replicaSet.Status.Conditions {
		conditions = append(conditions, map[string]string{
			"type":    string(condition.Type),
			"status":  string(condition.Status),
			"reason":  condition.Reason,
			"message": condition.Message,
		})
	}

	return map[string]interface{}{
		"name":              replicaSet.Name,
		"namespace":         replicaSet.Namespace,
		"replicas":          replicas,
		"conditions":        conditions,
		"age":               age,
		"labels":            replicaSet.Labels,
		"creationTimestamp": replicaSet.CreationTimestamp.Time,
		"selector":          replicaSet.Spec.Selector,
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

// jobToResponse converts a Kubernetes job to response format
func (s *Server) jobToResponse(job batchv1.Job) map[string]interface{} {
	// Calculate age
	ageStr := calculateAge(job.CreationTimestamp.Time)

	// Get job status
	status := "Unknown"
	if job.Status.CompletionTime != nil {
		status = "Complete"
	} else if job.Status.Failed > 0 {
		status = "Failed"
	} else if job.Status.Active > 0 {
		status = "Running"
	} else if job.Status.Succeeded > 0 {
		status = "Complete"
	}

	// Calculate completions
	completions := "0/1"
	if job.Spec.Completions != nil {
		completions = fmt.Sprintf("%d/%d", job.Status.Succeeded, *job.Spec.Completions)
	} else {
		completions = fmt.Sprintf("%d", job.Status.Succeeded)
	}

	// Calculate duration
	duration := "N/A"
	if job.Status.StartTime != nil {
		var endTime time.Time
		if job.Status.CompletionTime != nil {
			endTime = job.Status.CompletionTime.Time
		} else {
			endTime = time.Now()
		}
		jobDuration := endTime.Sub(job.Status.StartTime.Time)
		duration = calculateAge(time.Now().Add(-jobDuration))
	}

	// Get container image from job spec
	image := "N/A"
	if len(job.Spec.Template.Spec.Containers) > 0 {
		image = job.Spec.Template.Spec.Containers[0].Image
	}

	return map[string]interface{}{
		"name":              job.Name,
		"namespace":         job.Namespace,
		"status":            status,
		"completions":       completions,
		"duration":          duration,
		"age":               ageStr,
		"image":             image,
		"labels":            job.Labels,
		"creationTimestamp": job.CreationTimestamp.Format(time.RFC3339),
		"parallelism": func() int32 {
			if job.Spec.Parallelism != nil {
				return *job.Spec.Parallelism
			}
			return 1
		}(),
		"backoffLimit": func() int32 {
			if job.Spec.BackoffLimit != nil {
				return *job.Spec.BackoffLimit
			}
			return 6
		}(),
		"activeDeadlineSeconds": job.Spec.ActiveDeadlineSeconds,
		"conditions": func() []map[string]interface{} {
			var conditions []map[string]interface{}
			for _, condition := range job.Status.Conditions {
				conditions = append(conditions, map[string]interface{}{
					"type":               condition.Type,
					"status":             condition.Status,
					"lastTransitionTime": condition.LastTransitionTime.Format(time.RFC3339),
					"reason":             condition.Reason,
					"message":            condition.Message,
				})
			}
			return conditions
		}(),
	}
}

// cronJobToResponse converts a Kubernetes cronjob to response format
func (s *Server) cronJobToResponse(cronJob batchv1.CronJob) map[string]interface{} {
	// Calculate age
	ageStr := calculateAge(cronJob.CreationTimestamp.Time)

	// Get suspend status
	suspend := false
	if cronJob.Spec.Suspend != nil {
		suspend = *cronJob.Spec.Suspend
	}

	// Get last schedule time
	lastScheduleTime := "Never"
	if cronJob.Status.LastScheduleTime != nil {
		lastScheduleTime = cronJob.Status.LastScheduleTime.Format("2006-01-02 15:04:05")
	}

	// Get next schedule time (this is a simplified calculation)
	nextScheduleTime := "N/A"
	if !suspend && cronJob.Status.LastScheduleTime != nil {
		// This is a basic estimation, real cron parsing would be more complex
		nextScheduleTime = "Check cron schedule"
	}

	// Count active jobs
	activeJobs := len(cronJob.Status.Active)

	// Get container image from cronjob spec
	image := "N/A"
	if len(cronJob.Spec.JobTemplate.Spec.Template.Spec.Containers) > 0 {
		image = cronJob.Spec.JobTemplate.Spec.Template.Spec.Containers[0].Image
	}

	return map[string]interface{}{
		"name":                    cronJob.Name,
		"namespace":               cronJob.Namespace,
		"schedule":                cronJob.Spec.Schedule,
		"suspend":                 suspend,
		"active":                  activeJobs,
		"lastSchedule":            lastScheduleTime,
		"nextSchedule":            nextScheduleTime,
		"age":                     ageStr,
		"image":                   image,
		"labels":                  cronJob.Labels,
		"creationTimestamp":       cronJob.CreationTimestamp.Format(time.RFC3339),
		"concurrencyPolicy":       string(cronJob.Spec.ConcurrencyPolicy),
		"startingDeadlineSeconds": cronJob.Spec.StartingDeadlineSeconds,
		"successfulJobsHistoryLimit": func() int32 {
			if cronJob.Spec.SuccessfulJobsHistoryLimit != nil {
				return *cronJob.Spec.SuccessfulJobsHistoryLimit
			}
			return 3
		}(),
		"failedJobsHistoryLimit": func() int32 {
			if cronJob.Spec.FailedJobsHistoryLimit != nil {
				return *cronJob.Spec.FailedJobsHistoryLimit
			}
			return 1
		}(),
	}
}

// ingressToResponse converts an Ingress to a response format
func (s *Server) ingressToResponse(ingress interface{}) map[string]interface{} {
	// Handle both unstructured and typed ingresses
	var ingressObj map[string]interface{}

	switch ing := ingress.(type) {
	case map[string]interface{}:
		ingressObj = ing
	default:
		// This should not happen with the current implementation, but handle it gracefully
		return map[string]interface{}{
			"name":      "unknown",
			"namespace": "unknown",
			"error":     "unsupported ingress type",
		}
	}

	metadata, _ := ingressObj["metadata"].(map[string]interface{})
	spec, _ := ingressObj["spec"].(map[string]interface{})
	status, _ := ingressObj["status"].(map[string]interface{})

	name, _ := metadata["name"].(string)
	namespace, _ := metadata["namespace"].(string)
	creationTimestamp, _ := metadata["creationTimestamp"].(string)
	labels, _ := metadata["labels"].(map[string]interface{})
	annotations, _ := metadata["annotations"].(map[string]interface{})

	// Calculate age
	age := "Unknown"
	if creationTimestamp != "" {
		if createdTime, err := time.Parse(time.RFC3339, creationTimestamp); err == nil {
			age = calculateAge(createdTime)
		}
	}

	// Extract ingress class
	ingressClass := "Unknown"
	if ic, ok := spec["ingressClassName"].(string); ok && ic != "" {
		ingressClass = ic
	} else if annotations != nil {
		if ic, ok := annotations["kubernetes.io/ingress.class"].(string); ok && ic != "" {
			ingressClass = ic
		}
	}

	// Extract hosts and paths
	hosts := []string{}
	paths := []string{}

	if rules, ok := spec["rules"].([]interface{}); ok {
		for _, ruleInterface := range rules {
			if rule, ok := ruleInterface.(map[string]interface{}); ok {
				if host, ok := rule["host"].(string); ok && host != "" {
					hosts = append(hosts, host)
				}

				if http, ok := rule["http"].(map[string]interface{}); ok {
					if pathsArray, ok := http["paths"].([]interface{}); ok {
						for _, pathInterface := range pathsArray {
							if pathObj, ok := pathInterface.(map[string]interface{}); ok {
								if pathStr, ok := pathObj["path"].(string); ok && pathStr != "" {
									paths = append(paths, pathStr)
								}
							}
						}
					}
				}
			}
		}
	}

	// Extract external IPs/load balancer ingress
	externalIPs := []string{}
	if status != nil {
		if loadBalancer, ok := status["loadBalancer"].(map[string]interface{}); ok {
			if ingressArray, ok := loadBalancer["ingress"].([]interface{}); ok {
				for _, ingressInterface := range ingressArray {
					if ingressItem, ok := ingressInterface.(map[string]interface{}); ok {
						if ip, ok := ingressItem["ip"].(string); ok && ip != "" {
							externalIPs = append(externalIPs, ip)
						}
						if hostname, ok := ingressItem["hostname"].(string); ok && hostname != "" {
							externalIPs = append(externalIPs, hostname)
						}
					}
				}
			}
		}
	}

	// Format hosts display
	hostsDisplay := "N/A"
	if len(hosts) > 0 {
		if len(hosts) == 1 {
			hostsDisplay = hosts[0]
		} else {
			hostsDisplay = fmt.Sprintf("%s (+%d more)", hosts[0], len(hosts)-1)
		}
	}

	// Format external IPs display
	externalIPsDisplay := "N/A"
	if len(externalIPs) > 0 {
		if len(externalIPs) == 1 {
			externalIPsDisplay = externalIPs[0]
		} else {
			externalIPsDisplay = fmt.Sprintf("%s (+%d more)", externalIPs[0], len(externalIPs)-1)
		}
	}

	return map[string]interface{}{
		"name":               name,
		"namespace":          namespace,
		"age":                age,
		"ingressClass":       ingressClass,
		"hosts":              hosts,
		"hostsDisplay":       hostsDisplay,
		"paths":              paths,
		"externalIPs":        externalIPs,
		"externalIPsDisplay": externalIPsDisplay,
		"creationTimestamp":  creationTimestamp,
		"labels":             labels,
		"annotations":        annotations,
	}
}

// endpointsToResponse converts a Kubernetes endpoints to response format
func (s *Server) endpointsToResponse(endpoint v1.Endpoints) map[string]interface{} {
	age := calculateAge(endpoint.CreationTimestamp.Time)

	// Calculate total addresses across all subsets
	totalAddresses := 0
	totalPorts := 0
	var addresses []string
	var ports []string

	for _, subset := range endpoint.Subsets {
		totalAddresses += len(subset.Addresses) + len(subset.NotReadyAddresses)
		totalPorts += len(subset.Ports)

		// Collect unique addresses
		for _, addr := range subset.Addresses {
			addresses = append(addresses, addr.IP)
		}
		for _, addr := range subset.NotReadyAddresses {
			addresses = append(addresses, addr.IP+" (not ready)")
		}

		// Collect unique ports
		for _, port := range subset.Ports {
			portStr := fmt.Sprintf("%d", port.Port)
			if port.Name != "" {
				portStr = fmt.Sprintf("%s:%d", port.Name, port.Port)
			}
			if port.Protocol != "" {
				portStr = fmt.Sprintf("%s/%s", portStr, port.Protocol)
			}
			ports = append(ports, portStr)
		}
	}

	// Format addresses display
	addressesDisplay := "None"
	if totalAddresses > 0 {
		if totalAddresses == 1 && len(addresses) > 0 {
			addressesDisplay = addresses[0]
		} else {
			addressesDisplay = fmt.Sprintf("%d address(es)", totalAddresses)
		}
	}

	// Format ports display
	portsDisplay := "None"
	if totalPorts > 0 {
		if totalPorts == 1 && len(ports) > 0 {
			portsDisplay = ports[0]
		} else {
			portsDisplay = fmt.Sprintf("%d port(s)", totalPorts)
		}
	}

	return map[string]interface{}{
		"name":              endpoint.Name,
		"namespace":         endpoint.Namespace,
		"age":               age,
		"subsets":           len(endpoint.Subsets),
		"totalAddresses":    totalAddresses,
		"totalPorts":        totalPorts,
		"addresses":         addresses,
		"ports":             ports,
		"addressesDisplay":  addressesDisplay,
		"portsDisplay":      portsDisplay,
		"creationTimestamp": endpoint.CreationTimestamp.Time,
		"labels":            endpoint.Labels,
		"annotations":       endpoint.Annotations,
	}
}

// endpointSliceToResponse converts a Kubernetes EndpointSlice to response format
func (s *Server) endpointSliceToResponse(endpointSlice interface{}) map[string]interface{} {
	endpointSliceMap, ok := endpointSlice.(map[string]interface{})
	if !ok {
		return map[string]interface{}{}
	}

	// Extract metadata
	metadata, _ := endpointSliceMap["metadata"].(map[string]interface{})
	name, _ := metadata["name"].(string)
	namespace, _ := metadata["namespace"].(string)
	labels, _ := metadata["labels"].(map[string]interface{})
	annotations, _ := metadata["annotations"].(map[string]interface{})

	// Extract creation timestamp and calculate age
	var age string
	var creationTimestamp interface{}
	if creationTimestampStr, ok := metadata["creationTimestamp"].(string); ok {
		if creationTime, err := time.Parse(time.RFC3339, creationTimestampStr); err == nil {
			age = calculateAge(creationTime)
			creationTimestamp = creationTime
		}
	}

	// Extract addressType from spec
	spec, _ := endpointSliceMap["spec"].(map[string]interface{})
	addressType, _ := spec["addressType"].(string)

	// Extract endpoints from spec
	endpoints, _ := spec["endpoints"].([]interface{})
	endpointCount := len(endpoints)

	// Count ready and not ready endpoints
	readyCount := 0
	notReadyCount := 0
	addresses := make([]string, 0) // Initialize as empty slice, not nil

	for _, ep := range endpoints {
		if epMap, ok := ep.(map[string]interface{}); ok {
			// Check if endpoint is ready
			conditions, _ := epMap["conditions"].(map[string]interface{})
			ready, _ := conditions["ready"].(bool)

			if ready {
				readyCount++
			} else {
				notReadyCount++
			}

			// Extract addresses
			if addressesSlice, ok := epMap["addresses"].([]interface{}); ok {
				for _, addr := range addressesSlice {
					if addrStr, ok := addr.(string); ok {
						statusSuffix := ""
						if !ready {
							statusSuffix = " (not ready)"
						}
						addresses = append(addresses, addrStr+statusSuffix)
					}
				}
			}
		}
	}

	// Extract ports from spec
	ports, _ := spec["ports"].([]interface{})
	portCount := len(ports)
	portStrings := make([]string, 0) // Initialize as empty slice, not nil

	for _, port := range ports {
		if portMap, ok := port.(map[string]interface{}); ok {
			portNum, _ := portMap["port"].(float64) // JSON numbers are float64
			portName, _ := portMap["name"].(string)
			protocol, _ := portMap["protocol"].(string)

			portStr := fmt.Sprintf("%.0f", portNum)
			if portName != "" {
				portStr = fmt.Sprintf("%s:%.0f", portName, portNum)
			}
			if protocol != "" {
				portStr = fmt.Sprintf("%s/%s", portStr, protocol)
			}
			portStrings = append(portStrings, portStr)
		}
	}

	// Format addresses display
	addressesDisplay := "None"
	if len(addresses) > 0 {
		if len(addresses) == 1 {
			addressesDisplay = addresses[0]
		} else {
			addressesDisplay = fmt.Sprintf("%d address(es)", len(addresses))
		}
	}

	// Format ready status
	readyStatus := fmt.Sprintf("%d/%d", readyCount, endpointCount)

	// Format ports display
	portsDisplay := "None"
	if len(portStrings) > 0 {
		if len(portStrings) == 1 {
			portsDisplay = portStrings[0]
		} else {
			portsDisplay = fmt.Sprintf("%d port(s)", len(portStrings))
		}
	}

	return map[string]interface{}{
		"name":              name,
		"namespace":         namespace,
		"age":               age,
		"addressType":       addressType,
		"endpoints":         endpointCount,
		"ready":             readyStatus,
		"readyCount":        readyCount,
		"notReadyCount":     notReadyCount,
		"ports":             portCount,
		"addresses":         addresses,
		"portStrings":       portStrings,
		"addressesDisplay":  addressesDisplay,
		"portsDisplay":      portsDisplay,
		"creationTimestamp": creationTimestamp,
		"labels":            labels,
		"annotations":       annotations,
	}
}

// networkPolicyToResponse converts a NetworkPolicy to a response format
func (s *Server) networkPolicyToResponse(networkPolicy networkingv1.NetworkPolicy) map[string]interface{} {
	age := calculateAge(networkPolicy.CreationTimestamp.Time)

	// Format pod selector
	podSelector := "All Pods"
	if networkPolicy.Spec.PodSelector.MatchLabels != nil && len(networkPolicy.Spec.PodSelector.MatchLabels) > 0 {
		selectorParts := make([]string, 0, len(networkPolicy.Spec.PodSelector.MatchLabels))
		for key, value := range networkPolicy.Spec.PodSelector.MatchLabels {
			selectorParts = append(selectorParts, fmt.Sprintf("%s=%s", key, value))
		}
		podSelector = fmt.Sprintf("%d label(s)", len(selectorParts))
	}

	// Count ingress and egress rules
	ingressRules := len(networkPolicy.Spec.Ingress)
	egressRules := len(networkPolicy.Spec.Egress)

	// Format policy types
	policyTypes := ""
	if len(networkPolicy.Spec.PolicyTypes) > 0 {
		for i, policyType := range networkPolicy.Spec.PolicyTypes {
			if i > 0 {
				policyTypes += ", "
			}
			policyTypes += string(policyType)
		}
	} else {
		policyTypes = "Ingress"
	}

	// For now, we'll set affectedPods to 0 as calculating this requires querying pods
	// This could be enhanced later with actual pod counting
	affectedPods := 0

	return map[string]interface{}{
		"name":              networkPolicy.Name,
		"namespace":         networkPolicy.Namespace,
		"age":               age,
		"podSelector":       podSelector,
		"ingressRules":      ingressRules,
		"egressRules":       egressRules,
		"policyTypes":       policyTypes,
		"affectedPods":      affectedPods,
		"creationTimestamp": networkPolicy.CreationTimestamp.Time,
		"labels":            networkPolicy.Labels,
		"annotations":       networkPolicy.Annotations,
	}
}

// configMapToResponse converts a Kubernetes ConfigMap to response format
func (s *Server) configMapToResponse(configMap v1.ConfigMap) map[string]interface{} {
	age := calculateAge(configMap.CreationTimestamp.Time)

	// Count data keys
	dataKeysCount := len(configMap.Data)
	binaryDataKeysCount := len(configMap.BinaryData)
	totalKeys := dataKeysCount + binaryDataKeysCount

	// Calculate approximate data size
	var dataSize int
	for _, value := range configMap.Data {
		dataSize += len(value)
	}
	for _, value := range configMap.BinaryData {
		dataSize += len(value)
	}

	// Format data size
	dataSizeStr := "0 B"
	if dataSize > 0 {
		if dataSize < 1024 {
			dataSizeStr = fmt.Sprintf("%d B", dataSize)
		} else if dataSize < 1024*1024 {
			dataSizeStr = fmt.Sprintf("%.1f KB", float64(dataSize)/1024)
		} else {
			dataSizeStr = fmt.Sprintf("%.1f MB", float64(dataSize)/(1024*1024))
		}
	}

	// Get data keys for display
	var dataKeys []string
	for key := range configMap.Data {
		dataKeys = append(dataKeys, key)
	}
	for key := range configMap.BinaryData {
		dataKeys = append(dataKeys, key+" (binary)")
	}

	// Count labels and annotations
	labelsCount := len(configMap.Labels)
	annotationsCount := len(configMap.Annotations)

	return map[string]interface{}{
		"id":                fmt.Sprintf("%s-%s", configMap.Namespace, configMap.Name), // For table sorting
		"name":              configMap.Name,
		"namespace":         configMap.Namespace,
		"age":               age,
		"dataKeysCount":     totalKeys,
		"dataSize":          dataSizeStr,
		"dataSizeBytes":     dataSize,
		"dataKeys":          dataKeys,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"creationTimestamp": configMap.CreationTimestamp.Time,
		"labels":            configMap.Labels,
		"annotations":       configMap.Annotations,
	}
}

// PersistentVolume response formatter
func (s *Server) persistentVolumeToResponse(pv *v1.PersistentVolume) map[string]interface{} {
	// Calculate age
	age := time.Since(pv.CreationTimestamp.Time).Round(time.Second).String()
	if age == "0s" {
		age = "1s"
	}

	// Get capacity
	capacity := "Unknown"
	if pv.Spec.Capacity != nil {
		if storageQuantity, ok := pv.Spec.Capacity[v1.ResourceStorage]; ok {
			capacity = storageQuantity.String()
		}
	}

	// Get access modes
	accessModes := make([]string, len(pv.Spec.AccessModes))
	for i, mode := range pv.Spec.AccessModes {
		switch mode {
		case v1.ReadWriteOnce:
			accessModes[i] = "RWO"
		case v1.ReadOnlyMany:
			accessModes[i] = "ROX"
		case v1.ReadWriteMany:
			accessModes[i] = "RWX"
		case v1.ReadWriteOncePod:
			accessModes[i] = "RWOP"
		default:
			accessModes[i] = string(mode)
		}
	}

	// Get reclaim policy
	reclaimPolicy := "Unknown"
	if pv.Spec.PersistentVolumeReclaimPolicy != "" {
		reclaimPolicy = string(pv.Spec.PersistentVolumeReclaimPolicy)
	}

	// Get status/phase
	status := string(pv.Status.Phase)

	// Get claim reference
	claimRef := ""
	if pv.Spec.ClaimRef != nil {
		claimRef = fmt.Sprintf("%s/%s", pv.Spec.ClaimRef.Namespace, pv.Spec.ClaimRef.Name)
	}

	// Get storage class
	storageClass := pv.Spec.StorageClassName
	if storageClass == "" {
		storageClass = "<none>"
	}

	// Get volume source type
	volumeSource := "Unknown"
	if pv.Spec.HostPath != nil {
		volumeSource = "HostPath"
	} else if pv.Spec.NFS != nil {
		volumeSource = "NFS"
	} else if pv.Spec.GCEPersistentDisk != nil {
		volumeSource = "GCE"
	} else if pv.Spec.AWSElasticBlockStore != nil {
		volumeSource = "AWS EBS"
	} else if pv.Spec.CSI != nil {
		volumeSource = fmt.Sprintf("CSI (%s)", pv.Spec.CSI.Driver)
	} else if pv.Spec.Local != nil {
		volumeSource = "Local"
	}

	// Count labels and annotations
	labelsCount := len(pv.Labels)
	annotationsCount := len(pv.Annotations)

	return map[string]interface{}{
		"id":                 pv.Name, // For table sorting
		"name":               pv.Name,
		"capacity":           capacity,
		"accessModes":        accessModes,
		"accessModesDisplay": fmt.Sprintf("[%s]", fmt.Sprintf("%v", accessModes)),
		"reclaimPolicy":      reclaimPolicy,
		"status":             status,
		"claim":              claimRef,
		"storageClass":       storageClass,
		"volumeSource":       volumeSource,
		"age":                age,
		"labelsCount":        labelsCount,
		"annotationsCount":   annotationsCount,
		"creationTimestamp":  pv.CreationTimestamp.Time,
		"labels":             pv.Labels,
		"annotations":        pv.Annotations,
	}
}

// PersistentVolumeClaim response formatter
func (s *Server) persistentVolumeClaimToResponse(pvc *v1.PersistentVolumeClaim) map[string]interface{} {
	// Calculate age
	age := time.Since(pvc.CreationTimestamp.Time).Round(time.Second).String()
	if age == "0s" {
		age = "1s"
	}

	// Get status/phase
	status := string(pvc.Status.Phase)

	// Get volume name (bound PV)
	volumeName := ""
	if pvc.Spec.VolumeName != "" {
		volumeName = pvc.Spec.VolumeName
	}

	// Get capacity - from status if available, otherwise from spec
	capacity := "Unknown"
	if pvc.Status.Capacity != nil {
		if storageQuantity, ok := pvc.Status.Capacity[v1.ResourceStorage]; ok {
			capacity = storageQuantity.String()
		}
	} else if pvc.Spec.Resources.Requests != nil {
		if storageQuantity, ok := pvc.Spec.Resources.Requests[v1.ResourceStorage]; ok {
			capacity = storageQuantity.String()
		}
	}

	// Get access modes
	accessModes := make([]string, len(pvc.Spec.AccessModes))
	for i, mode := range pvc.Spec.AccessModes {
		switch mode {
		case v1.ReadWriteOnce:
			accessModes[i] = "RWO"
		case v1.ReadOnlyMany:
			accessModes[i] = "ROX"
		case v1.ReadWriteMany:
			accessModes[i] = "RWX"
		case v1.ReadWriteOncePod:
			accessModes[i] = "RWOP"
		default:
			accessModes[i] = string(mode)
		}
	}

	// Get storage class
	storageClass := ""
	if pvc.Spec.StorageClassName != nil {
		storageClass = *pvc.Spec.StorageClassName
	}
	if storageClass == "" {
		storageClass = "<none>"
	}

	// Count labels and annotations
	labelsCount := len(pvc.Labels)
	annotationsCount := len(pvc.Annotations)

	return map[string]interface{}{
		"id":                 fmt.Sprintf("%s-%s", pvc.Namespace, pvc.Name), // For table sorting
		"name":               pvc.Name,
		"namespace":          pvc.Namespace,
		"status":             status,
		"volume":             volumeName,
		"capacity":           capacity,
		"accessModes":        accessModes,
		"accessModesDisplay": fmt.Sprintf("[%s]", fmt.Sprintf("%v", accessModes)),
		"storageClass":       storageClass,
		"age":                age,
		"labelsCount":        labelsCount,
		"annotationsCount":   annotationsCount,
		"creationTimestamp":  pvc.CreationTimestamp.Time,
		"labels":             pvc.Labels,
		"annotations":        pvc.Annotations,
	}
}

// StorageClass response formatter
func (s *Server) storageClassToResponse(sc storagev1.StorageClass) map[string]interface{} {
	// Calculate age
	age := "unknown"
	if !sc.CreationTimestamp.IsZero() {
		age = time.Since(sc.CreationTimestamp.Time).String()
	}

	// Get provisioner
	provisioner := sc.Provisioner

	// Get reclaim policy
	reclaimPolicy := "Delete" // Default reclaim policy for StorageClass
	if sc.ReclaimPolicy != nil {
		reclaimPolicy = string(*sc.ReclaimPolicy)
	}

	// Get volume binding mode
	volumeBindingMode := "Immediate" // Default volume binding mode
	if sc.VolumeBindingMode != nil {
		volumeBindingMode = string(*sc.VolumeBindingMode)
	}

	// Get allow volume expansion
	allowVolumeExpansion := false
	if sc.AllowVolumeExpansion != nil {
		allowVolumeExpansion = *sc.AllowVolumeExpansion
	}

	// Count parameters
	parametersCount := len(sc.Parameters)

	// Count labels and annotations
	labelsCount := len(sc.Labels)
	annotationsCount := len(sc.Annotations)

	// Check if default storage class
	isDefault := false
	if sc.Annotations != nil {
		if value, exists := sc.Annotations["storageclass.kubernetes.io/is-default-class"]; exists {
			isDefault = value == "true"
		}
		// Also check the beta annotation for backward compatibility
		if !isDefault {
			if value, exists := sc.Annotations["storageclass.beta.kubernetes.io/is-default-class"]; exists {
				isDefault = value == "true"
			}
		}
	}

	return map[string]interface{}{
		"id":                   sc.Name, // For table sorting (StorageClass is cluster-scoped)
		"name":                 sc.Name,
		"provisioner":          provisioner,
		"reclaimPolicy":        reclaimPolicy,
		"volumeBindingMode":    volumeBindingMode,
		"allowVolumeExpansion": allowVolumeExpansion,
		"parametersCount":      parametersCount,
		"age":                  age,
		"labelsCount":          labelsCount,
		"annotationsCount":     annotationsCount,
		"isDefault":            isDefault,
		"creationTimestamp":    sc.CreationTimestamp.Time,
		"labels":               sc.Labels,
		"annotations":          sc.Annotations,
		"parameters":           sc.Parameters,
	}
}

// csiDriverToResponse converts a CSIDriver object to a response format
func (s *Server) csiDriverToResponse(csi storagev1.CSIDriver) map[string]interface{} {
	// Calculate age
	age := "unknown"
	if !csi.CreationTimestamp.IsZero() {
		age = time.Since(csi.CreationTimestamp.Time).String()
	}

	// Get spec fields
	attachRequired := true // Default value
	if csi.Spec.AttachRequired != nil {
		attachRequired = *csi.Spec.AttachRequired
	}

	podInfoOnMount := false // Default value
	if csi.Spec.PodInfoOnMount != nil {
		podInfoOnMount = *csi.Spec.PodInfoOnMount
	}

	requiresRepublish := false // Default value
	if csi.Spec.RequiresRepublish != nil {
		requiresRepublish = *csi.Spec.RequiresRepublish
	}

	storageCapacity := false // Default value
	if csi.Spec.StorageCapacity != nil {
		storageCapacity = *csi.Spec.StorageCapacity
	}

	fsGroupPolicy := "None" // Default value
	if csi.Spec.FSGroupPolicy != nil {
		fsGroupPolicy = string(*csi.Spec.FSGroupPolicy)
	}

	// Count volume lifecycle modes
	volumeLifecycleModes := len(csi.Spec.VolumeLifecycleModes)

	// Count token requests
	tokenRequests := len(csi.Spec.TokenRequests)

	// Count labels and annotations
	labelsCount := len(csi.Labels)
	annotationsCount := len(csi.Annotations)

	return map[string]interface{}{
		"id":                   csi.Name, // For table sorting (CSIDriver is cluster-scoped)
		"name":                 csi.Name,
		"attachRequired":       attachRequired,
		"podInfoOnMount":       podInfoOnMount,
		"requiresRepublish":    requiresRepublish,
		"storageCapacity":      storageCapacity,
		"fsGroupPolicy":        fsGroupPolicy,
		"volumeLifecycleModes": volumeLifecycleModes,
		"tokenRequests":        tokenRequests,
		"age":                  age,
		"labelsCount":          labelsCount,
		"annotationsCount":     annotationsCount,
		"creationTimestamp":    csi.CreationTimestamp.Time,
		"labels":               csi.Labels,
		"annotations":          csi.Annotations,
	}
}

// volumeSnapshotToResponse converts a VolumeSnapshot object to a response format
func (s *Server) volumeSnapshotToResponse(obj interface{}) map[string]interface{} {
	vsMap, ok := obj.(map[string]interface{})
	if !ok {
		return map[string]interface{}{
			"name":      "unknown",
			"namespace": "unknown",
			"error":     "invalid volume snapshot format",
		}
	}

	// Extract metadata
	metadata, _ := vsMap["metadata"].(map[string]interface{})
	name, _ := metadata["name"].(string)
	namespace, _ := metadata["namespace"].(string)
	creationTimestamp, _ := metadata["creationTimestamp"].(string)
	labels, _ := metadata["labels"].(map[string]interface{})
	annotations, _ := metadata["annotations"].(map[string]interface{})

	// Calculate age
	age := "unknown"
	if creationTimestamp != "" {
		if parsedTime, err := time.Parse(time.RFC3339, creationTimestamp); err == nil {
			age = calculateAge(parsedTime)
		}
	}

	// Extract spec
	spec, _ := vsMap["spec"].(map[string]interface{})
	sourcePVC := "unknown"
	volumeSnapshotClassName := "unknown"

	if source, ok := spec["source"].(map[string]interface{}); ok {
		if pvcSource, ok := source["persistentVolumeClaimName"].(string); ok {
			sourcePVC = pvcSource
		}
	}

	if className, ok := spec["volumeSnapshotClassName"].(string); ok {
		volumeSnapshotClassName = className
	}

	// Extract status
	status, _ := vsMap["status"].(map[string]interface{})
	readyToUse := false
	restoreSize := "unknown"
	creationTime := "unknown"
	snapshotHandle := "unknown"

	if readyValue, ok := status["readyToUse"].(bool); ok {
		readyToUse = readyValue
	}

	if size, ok := status["restoreSize"].(string); ok {
		restoreSize = size
	}

	if createdAt, ok := status["creationTime"].(string); ok {
		creationTime = createdAt
	}

	if handle, ok := status["snapshotHandle"].(string); ok {
		snapshotHandle = handle
	}

	// Count labels and annotations
	labelsCount := len(labels)
	annotationsCount := len(annotations)

	return map[string]interface{}{
		"id":                      fmt.Sprintf("%s-%s", namespace, name), // For table sorting
		"name":                    name,
		"namespace":               namespace,
		"sourcePVC":               sourcePVC,
		"volumeSnapshotClassName": volumeSnapshotClassName,
		"readyToUse":              readyToUse,
		"restoreSize":             restoreSize,
		"creationTime":            creationTime,
		"snapshotHandle":          snapshotHandle,
		"age":                     age,
		"labelsCount":             labelsCount,
		"annotationsCount":        annotationsCount,
		"creationTimestamp":       creationTimestamp,
		"labels":                  labels,
		"annotations":             annotations,
	}
}

// volumeSnapshotClassToResponse converts a VolumeSnapshotClass object to a response format
func (s *Server) volumeSnapshotClassToResponse(obj interface{}) map[string]interface{} {
	vscMap, ok := obj.(map[string]interface{})
	if !ok {
		return map[string]interface{}{
			"id":               "unknown",
			"name":             "unknown",
			"driver":           "unknown",
			"deletionPolicy":   "unknown",
			"age":              "unknown",
			"labelsCount":      0,
			"annotationsCount": 0,
			"parametersCount":  0,
		}
	}

	// Get metadata
	metadata, _ := vscMap["metadata"].(map[string]interface{})
	name := "unknown"
	var creationTimestamp time.Time
	var labels map[string]interface{}
	var annotations map[string]interface{}

	if metadata != nil {
		if nameVal, ok := metadata["name"].(string); ok {
			name = nameVal
		}

		// Parse creation timestamp
		if creationTime, ok := metadata["creationTimestamp"].(string); ok {
			if parsed, err := time.Parse(time.RFC3339, creationTime); err == nil {
				creationTimestamp = parsed
			}
		}

		// Get labels and annotations
		if labelsVal, ok := metadata["labels"].(map[string]interface{}); ok {
			labels = labelsVal
		}
		if annotationsVal, ok := metadata["annotations"].(map[string]interface{}); ok {
			annotations = annotationsVal
		}
	}

	// Calculate age
	age := "unknown"
	if !creationTimestamp.IsZero() {
		age = time.Since(creationTimestamp).String()
	}

	// Get driver from spec
	driver := "unknown"
	deletionPolicy := "Delete" // Default deletion policy
	var parameters map[string]interface{}

	if specVal, ok := vscMap["spec"].(map[string]interface{}); ok {
		if driverVal, ok := specVal["driver"].(string); ok {
			driver = driverVal
		}
		if deletionPolicyVal, ok := specVal["deletionPolicy"].(string); ok {
			deletionPolicy = deletionPolicyVal
		}
		if parametersVal, ok := specVal["parameters"].(map[string]interface{}); ok {
			parameters = parametersVal
		}
	}

	// Count labels, annotations, and parameters
	labelsCount := len(labels)
	annotationsCount := len(annotations)
	parametersCount := len(parameters)

	return map[string]interface{}{
		"id":                name, // For table sorting (VolumeSnapshotClass is cluster-scoped)
		"name":              name,
		"driver":            driver,
		"deletionPolicy":    deletionPolicy,
		"age":               age,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"parametersCount":   parametersCount,
		"creationTimestamp": creationTimestamp,
		"labels":            labels,
		"annotations":       annotations,
		"parameters":        parameters,
	}
}

// formatNamespaceSummary creates a basic namespace summary
func formatNamespaceSummary(namespace *v1.Namespace) map[string]interface{} {
	// Calculate age
	age := "unknown"
	if !namespace.CreationTimestamp.IsZero() {
		age = time.Since(namespace.CreationTimestamp.Time).String()
	}

	// Count labels and annotations
	labelsCount := 0
	annotationsCount := 0
	if namespace.Labels != nil {
		labelsCount = len(namespace.Labels)
	}
	if namespace.Annotations != nil {
		annotationsCount = len(namespace.Annotations)
	}

	return map[string]interface{}{
		"name":              namespace.Name,
		"status":            string(namespace.Status.Phase),
		"age":               age,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"creationTimestamp": namespace.CreationTimestamp.Time,
		"labels":            namespace.Labels,
		"annotations":       namespace.Annotations,
	}
}

// resourceQuotaToResponse converts a ResourceQuota to a response format
func (s *Server) resourceQuotaToResponse(resourceQuota v1.ResourceQuota) map[string]interface{} {
	age := "unknown"
	if !resourceQuota.CreationTimestamp.IsZero() {
		age = calculateAge(resourceQuota.CreationTimestamp.Time)
	}

	// Count labels and annotations
	labelsCount := 0
	annotationsCount := 0
	if resourceQuota.Labels != nil {
		labelsCount = len(resourceQuota.Labels)
	}
	if resourceQuota.Annotations != nil {
		annotationsCount = len(resourceQuota.Annotations)
	}

	// Extract resource limits and used
	var hardLimits []map[string]interface{}
	var usedResources []map[string]interface{}

	if resourceQuota.Spec.Hard != nil {
		for resourceName, quantity := range resourceQuota.Spec.Hard {
			used := ""
			if resourceQuota.Status.Used != nil {
				if usedQuantity, exists := resourceQuota.Status.Used[resourceName]; exists {
					used = usedQuantity.String()
				} else {
					used = "0"
				}
			}

			hardLimits = append(hardLimits, map[string]interface{}{
				"name":  string(resourceName),
				"limit": quantity.String(),
				"used":  used,
			})
		}
	}

	if resourceQuota.Status.Used != nil {
		for resourceName, quantity := range resourceQuota.Status.Used {
			usedResources = append(usedResources, map[string]interface{}{
				"name":     string(resourceName),
				"quantity": quantity.String(),
			})
		}
	}

	// Count resource types
	hardResourcesCount := len(resourceQuota.Spec.Hard)
	usedResourcesCount := len(resourceQuota.Status.Used)

	return map[string]interface{}{
		"id":                 fmt.Sprintf("%s-%s", resourceQuota.Namespace, resourceQuota.Name), // For table sorting
		"name":               resourceQuota.Name,
		"namespace":          resourceQuota.Namespace,
		"age":                age,
		"hardLimits":         hardLimits,
		"usedResources":      usedResources,
		"hardResourcesCount": hardResourcesCount,
		"usedResourcesCount": usedResourcesCount,
		"labelsCount":        labelsCount,
		"annotationsCount":   annotationsCount,
		"creationTimestamp":  resourceQuota.CreationTimestamp.Time,
		"labels":             resourceQuota.Labels,
		"annotations":        resourceQuota.Annotations,
	}
}

// apiResourceToResponse converts an API resource to response format
func (s *Server) apiResourceToResponse(resource resources.APIResource) map[string]interface{} {
	shortNamesStr := ""
	if len(resource.ShortNames) > 0 {
		for i, shortName := range resource.ShortNames {
			if i > 0 {
				shortNamesStr += ","
			}
			shortNamesStr += shortName
		}
	}

	categoriesStr := ""
	if len(resource.Categories) > 0 {
		for i, category := range resource.Categories {
			if i > 0 {
				categoriesStr += ","
			}
			categoriesStr += category
		}
	}

	verbsStr := ""
	if len(resource.Verbs) > 0 {
		for i, verb := range resource.Verbs {
			if i > 0 {
				verbsStr += ","
			}
			verbsStr += verb
		}
	}

	namespacedStr := "false"
	if resource.Namespaced {
		namespacedStr = "true"
	}

	return map[string]interface{}{
		"id":           resource.ID,
		"name":         resource.Name,
		"singularName": resource.SingularName,
		"shortNames":   shortNamesStr,
		"kind":         resource.Kind,
		"group":        resource.Group,
		"version":      resource.Version,
		"apiVersion":   resource.APIVersion,
		"namespaced":   namespacedStr,
		"categories":   categoriesStr,
		"verbs":        verbsStr,
	}
}

// apiResourceToEnrichedResponse converts an API resource to enriched response format
func (s *Server) apiResourceToEnrichedResponse(resource resources.APIResource) map[string]interface{} {
	// Create summary-like response for details view
	return map[string]interface{}{
		"summary": map[string]interface{}{
			"name":            resource.Name,
			"singularName":    resource.SingularName,
			"shortNames":      resource.ShortNames,
			"kind":            resource.Kind,
			"group":           resource.Group,
			"version":         resource.Version,
			"apiVersion":      resource.APIVersion,
			"namespaced":      resource.Namespaced,
			"categories":      resource.Categories,
			"verbs":           resource.Verbs,
			"shortNamesCount": len(resource.ShortNames),
			"categoriesCount": len(resource.Categories),
			"verbsCount":      len(resource.Verbs),
		},
		"metadata": map[string]interface{}{
			"name":       resource.Name,
			"kind":       resource.Kind,
			"apiVersion": resource.APIVersion,
		},
		"kind":       resource.Kind,
		"apiVersion": resource.APIVersion,
	}
}
