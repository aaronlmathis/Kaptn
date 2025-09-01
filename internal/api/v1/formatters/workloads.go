// Package formatters provides domain-specific response formatting functions
// for converting Kubernetes resources to API response formats.
package formatters

import (
	"fmt"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/metrics"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	v1 "k8s.io/api/core/v1"
)

// WorkloadsFormatter provides formatting functions for workload resources
type WorkloadsFormatter struct{}

// NewWorkloadsFormatter creates a new workloads formatter
func NewWorkloadsFormatter() *WorkloadsFormatter {
	return &WorkloadsFormatter{}
}

// PodToSummary creates a basic pod summary
func (f *WorkloadsFormatter) PodToSummary(pod *v1.Pod) map[string]interface{} {
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

// EnhancedPodToSummary creates an enhanced pod summary with metrics integration
func (f *WorkloadsFormatter) EnhancedPodToSummary(pod *v1.Pod, podMetricsMap map[string]map[string]interface{}) map[string]interface{} {
	// Start with basic summary
	summary := f.PodToSummary(pod)

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

// DeploymentToResponse converts a Kubernetes deployment to response format
func (f *WorkloadsFormatter) DeploymentToResponse(deployment appsv1.Deployment) map[string]interface{} {
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

// StatefulSetToResponse converts a Kubernetes statefulset to response format
func (f *WorkloadsFormatter) StatefulSetToResponse(statefulSet appsv1.StatefulSet) map[string]interface{} {
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

// DaemonSetToResponse converts a Kubernetes daemonset to response format
func (f *WorkloadsFormatter) DaemonSetToResponse(daemonSet appsv1.DaemonSet) map[string]interface{} {
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

// ReplicaSetToResponse converts a Kubernetes replicaset to response format
func (f *WorkloadsFormatter) ReplicaSetToResponse(replicaSet appsv1.ReplicaSet) map[string]interface{} {
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

// JobToResponse converts a Kubernetes job to response format
func (f *WorkloadsFormatter) JobToResponse(job batchv1.Job) map[string]interface{} {
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

// CronJobToResponse converts a Kubernetes cronjob to response format
func (f *WorkloadsFormatter) CronJobToResponse(cronJob batchv1.CronJob) map[string]interface{} {
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

// CalculatePodCPUUsage calculates CPU usage metrics for a pod
func CalculatePodCPUUsage(podMetric metrics.PodMetrics) map[string]interface{} {
	var totalCPUMilli int64
	for _, container := range podMetric.Containers {
		totalCPUMilli += container.CPU.UsedBytes
	}

	return map[string]interface{}{
		"milli":          totalCPUMilli,
		"ofLimitPercent": nil, // TODO: Calculate against limits when available
	}
}

// CalculatePodMemoryUsage calculates memory usage metrics for a pod
func CalculatePodMemoryUsage(podMetric metrics.PodMetrics) map[string]interface{} {
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
