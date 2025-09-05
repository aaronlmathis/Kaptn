package server

import (
	"time"

	apiFormatters "github.com/aaronlmathis/kaptn/internal/api/v1/formatters"
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
	return apiFormatters.NewClusterFormatter().NodeToSummary(node)
}

// nodeToEnrichedResponse converts a Kubernetes node to enriched response format with maintenance alerts
func (s *Server) nodeToEnrichedResponse(node *v1.Node) map[string]interface{} {
	return apiFormatters.NewClusterFormatter().NodeToEnrichedResponse(node)
}

// podToSummary creates a basic pod summary
func (s *Server) podToSummary(pod *v1.Pod) map[string]interface{} {
	return apiFormatters.NewWorkloadsFormatter().PodToSummary(pod)
}

// enhancedPodToSummary creates an enhanced pod summary with metrics integration
func (s *Server) enhancedPodToSummary(pod *v1.Pod, podMetricsMap map[string]map[string]interface{}) map[string]interface{} {
	return apiFormatters.NewWorkloadsFormatter().EnhancedPodToSummary(pod, podMetricsMap)
}

// deploymentToResponse converts a Kubernetes deployment to response format
func (s *Server) deploymentToResponse(deployment appsv1.Deployment) map[string]interface{} {
	return apiFormatters.NewWorkloadsFormatter().DeploymentToResponse(deployment)
}

// statefulSetToResponse converts a Kubernetes statefulset to response format
func (s *Server) statefulSetToResponse(statefulSet appsv1.StatefulSet) map[string]interface{} {
	return apiFormatters.NewWorkloadsFormatter().StatefulSetToResponse(statefulSet)
}

// daemonSetToResponse converts a Kubernetes daemonset to response format
func (s *Server) daemonSetToResponse(daemonSet appsv1.DaemonSet) map[string]interface{} {
	return apiFormatters.NewWorkloadsFormatter().DaemonSetToResponse(daemonSet)
}

// replicaSetToResponse converts a Kubernetes replicaset to response format
func (s *Server) replicaSetToResponse(replicaSet appsv1.ReplicaSet) map[string]interface{} {
	return apiFormatters.NewWorkloadsFormatter().ReplicaSetToResponse(replicaSet)
}

// serviceToResponse converts a Kubernetes service to response format
func (s *Server) serviceToResponse(service v1.Service) map[string]interface{} {
	return apiFormatters.NewNetworkingFormatter().ServiceToResponse(service)
}

// calculatePodCPUUsage calculates CPU usage metrics for a pod
func calculatePodCPUUsage(podMetric metrics.PodMetrics) map[string]interface{} {
	return apiFormatters.CalculatePodCPUUsage(podMetric)
}

// calculatePodMemoryUsage calculates memory usage metrics for a pod
func calculatePodMemoryUsage(podMetric metrics.PodMetrics) map[string]interface{} {
	return apiFormatters.CalculatePodMemoryUsage(podMetric)
}

// calculateAge calculates a human-readable age string
func calculateAge(creationTime time.Time) string {
	return apiFormatters.CalculateAge(creationTime)
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
	return apiFormatters.NewWorkloadsFormatter().JobToResponse(job)
}

// cronJobToResponse converts a Kubernetes cronjob to response format
func (s *Server) cronJobToResponse(cronJob batchv1.CronJob) map[string]interface{} {
	return apiFormatters.NewWorkloadsFormatter().CronJobToResponse(cronJob)
}

// ingressToResponse converts an Ingress to a response format
func (s *Server) ingressToResponse(ingress interface{}) map[string]interface{} {
	return apiFormatters.NewNetworkingFormatter().IngressToResponse(ingress)
}

// endpointsToResponse converts a Kubernetes endpoints to response format
func (s *Server) endpointsToResponse(endpoint v1.Endpoints) map[string]interface{} {
	return apiFormatters.NewNetworkingFormatter().EndpointsToResponse(endpoint)
}

// endpointSliceToResponse converts a Kubernetes EndpointSlice to response format
func (s *Server) endpointSliceToResponse(endpointSlice interface{}) map[string]interface{} {
	return apiFormatters.NewNetworkingFormatter().EndpointSliceToResponse(endpointSlice)
}

// networkPolicyToResponse converts a NetworkPolicy to a response format
func (s *Server) networkPolicyToResponse(networkPolicy networkingv1.NetworkPolicy) map[string]interface{} {
	return apiFormatters.NewNetworkingFormatter().NetworkPolicyToResponse(networkPolicy)
}

// configMapToResponse converts a Kubernetes ConfigMap to response format
func (s *Server) configMapToResponse(configMap v1.ConfigMap) map[string]interface{} {
	return apiFormatters.NewConfigFormatter().ConfigMapToResponse(configMap)
}

// PersistentVolume response formatter
func (s *Server) persistentVolumeToResponse(pv *v1.PersistentVolume) map[string]interface{} {
	return apiFormatters.NewStorageFormatter().PersistentVolumeToResponse(pv)
}

// PersistentVolumeClaim response formatter
func (s *Server) persistentVolumeClaimToResponse(pvc *v1.PersistentVolumeClaim) map[string]interface{} {
	return apiFormatters.NewStorageFormatter().PersistentVolumeClaimToResponse(pvc)
}

// StorageClass response formatter
func (s *Server) storageClassToResponse(sc storagev1.StorageClass) map[string]interface{} {
	return apiFormatters.NewStorageFormatter().StorageClassToResponse(sc)
}

// csiDriverToResponse converts a CSIDriver object to a response format
func (s *Server) csiDriverToResponse(csi storagev1.CSIDriver) map[string]interface{} {
	return apiFormatters.NewStorageFormatter().CSIDriverToResponse(csi)
}

// volumeSnapshotToResponse converts a VolumeSnapshot object to a response format
func (s *Server) volumeSnapshotToResponse(obj interface{}) map[string]interface{} {
	return apiFormatters.NewStorageFormatter().VolumeSnapshotToResponse(obj)
}

// volumeSnapshotClassToResponse converts a VolumeSnapshotClass object to a response format
func (s *Server) volumeSnapshotClassToResponse(obj interface{}) map[string]interface{} {
	return apiFormatters.NewStorageFormatter().VolumeSnapshotClassToResponse(obj)
}

// formatNamespaceSummary creates a basic namespace summary
func formatNamespaceSummary(namespace *v1.Namespace) map[string]interface{} {
	return apiFormatters.NewClusterFormatter().NamespaceToResponse(namespace)
}

// resourceQuotaToResponse converts a ResourceQuota to a response format
func (s *Server) resourceQuotaToResponse(resourceQuota v1.ResourceQuota) map[string]interface{} {
	return apiFormatters.NewConfigFormatter().ResourceQuotaToResponse(resourceQuota)
}

// apiResourceToResponse converts an API resource to response format
func (s *Server) apiResourceToResponse(resource resources.APIResource) map[string]interface{} {
	return apiFormatters.NewClusterFormatter().APIResourceToResponse(resource)
}

// apiResourceToEnrichedResponse converts an API resource to enriched response format
func (s *Server) apiResourceToEnrichedResponse(resource resources.APIResource) map[string]interface{} {
	return apiFormatters.NewClusterFormatter().APIResourceToEnrichedResponse(resource)
}
