package routes

import (
	"github.com/go-chi/chi/v5"
)

// MountRead mounts read-only routes (require read permissions). It accepts the
// ReadHandlers interface (declared in contracts.go) so routes never import the
// concrete server package.
func MountRead(r chi.Router, h ReadHandlers) {
	// --- Permissions / Capabilities ---
	r.Get("/permissions/check", h.HandleCheckPermission)
	r.Get("/permissions/actions", h.HandleGetActionPermissions)
	r.Get("/permissions/actions/{namespace}", h.HandleGetActionPermissions)
	r.Get("/permissions/page-access", h.HandleCheckPageAccess)
	r.Get("/permissions/namespaces", h.HandleGetUserNamespacePermissions)
	r.Post("/permissions/bulk", h.HandleBulkPermissionCheck)
	r.Post("/permissions/bulk-check", h.HandleBulkPermissionCheck)

	r.Post("/authz/capabilities", h.HandleAuthzCapabilities)
	r.Get("/authz/capabilities/registry", h.HandleAuthzCapabilitiesRegistry)
	r.Get("/authz/capabilities/stats", h.HandleAuthzCapabilitiesStats)

	r.Get("/capabilities", h.HandleGetCapabilities)

	// --- Search ---
	r.Get("/search", h.HandleSearch)
	r.Get("/search/stats", h.HandleSearchStats)
	r.Post("/search/refresh", h.HandleRefreshSearchCache)

	// --- TimeSeries (HTTP) ---
	r.Get("/timeseries/cluster", h.HandleGetClusterTimeSeries)
	r.Get("/timeseries/health", h.HandleTimeSeriesHealth)
	r.Get("/timeseries/capabilities", h.HandleGetTimeSeriesCapabilities)

	// TimeSeries Entities (discovery)
	r.Get("/timeseries/entities/nodes", h.HandleGetTimeSeriesNodes)
	r.Get("/timeseries/entities/namespaces", h.HandleGetTimeSeriesNamespaces)
	r.Get("/timeseries/entities/pods", h.HandleGetTimeSeriesPods)

	// TimeSeries Entity-specific queries
	r.Get("/timeseries/nodes", h.HandleGetNodesTimeSeries)
	r.Get("/timeseries/nodes/{nodeName}", h.HandleGetNodeTimeSeries)
	r.Get("/timeseries/pods", h.HandleGetPodsTimeSeries)
	r.Get("/timeseries/pods/{namespace}/{podName}", h.HandleGetPodTimeSeries)
	r.Get("/timeseries/namespaces", h.HandleGetNamespacesTimeSeries)
	r.Get("/timeseries/namespaces/{namespace}", h.HandleGetNamespaceTimeSeries)

	// HPAs
	r.Get("/hpas", h.HandleListHPAs)
	r.Get("/hpas/{namespace}/{name}", h.HandleGetHPA)
	r.Get("/timeseries/hpas", h.HandleGetHPATimeseries)

	// --- Core K8s Resources (Read) ---
	r.Get("/nodes", h.HandleListNodes)
	r.Get("/nodes/{name}", h.HandleGetNode)

	r.Get("/pods", h.HandleListPods)
	r.Get("/pods/{namespace}/{name}", h.HandleGetPod)

	r.Get("/deployments", h.HandleListDeployments)
	r.Get("/deployments/{namespace}/{name}", h.HandleGetDeployment)

	r.Get("/statefulsets", h.HandleListStatefulSets)
	r.Get("/statefulsets/{namespace}/{name}", h.HandleGetStatefulSet)

	r.Get("/replicasets", h.HandleListReplicaSets)
	r.Get("/replicasets/{namespace}/{name}", h.HandleGetReplicaSet)

	r.Get("/daemonsets", h.HandleListDaemonSets)
	r.Get("/daemonsets/{namespace}/{name}", h.HandleGetDaemonSet)

	r.Get("/k8s-jobs", h.HandleListJobs)
	r.Get("/k8s-jobs/{namespace}/{name}", h.HandleGetJob)

	r.Get("/cronjobs", h.HandleListCronJobs)
	r.Get("/cronjobs/{namespace}/{name}", h.HandleGetCronJob)

	// Overview / Jobs (Kaptn app concepts)
	r.Get("/overview", h.HandleGetOverview)
	r.Get("/jobs", h.HandleListActionJobs)
	r.Get("/jobs/{jobId}", h.HandleGetActionJob)

	// Metrics / Namespaces
	r.Get("/metrics", h.HandleGetMetrics)
	r.Get("/metrics/namespace/{namespace}", h.HandleGetNamespaceMetrics)

	r.Get("/namespaces", h.HandleListNamespaces)
	r.Get("/namespaces/{name}", h.HandleGetNamespace)

	// Services
	r.Get("/services", h.HandleListServices)
	r.Get("/services/{namespace}", h.HandleListServicesInNamespace)
	r.Get("/services/{namespace}/{name}", h.HandleGetService)

	// Events
	r.Get("/events", h.HandleListEvents)
	r.Get("/events/{namespace}", h.HandleListEventsInNamespace)
	r.Get("/events/{namespace}/{name}", h.HandleGetEvent)

	// Ingress / IngressClass
	r.Get("/ingresses", h.HandleListAllIngresses)
	r.Get("/ingresses/{namespace}", h.HandleListIngresses)
	r.Get("/ingresses/{namespace}/{name}", h.HandleGetIngress)
	r.Get("/ingress-classes", h.HandleListIngressClasses)
	r.Get("/ingress-classes/{name}", h.HandleGetIngressClass)

	// Endpoints / EndpointSlices
	r.Get("/endpoints", h.HandleListEndpoints)
	r.Get("/endpoints/{namespace}/{name}", h.HandleGetEndpoints)
	r.Get("/endpoint-slices", h.HandleListEndpointSlices)
	r.Get("/endpoint-slices/{namespace}/{name}", h.HandleGetEndpointSlice)

	// ConfigMaps
	r.Get("/config-maps", h.HandleListConfigMaps)
	r.Get("/config-maps/{namespace}/{name}", h.HandleGetConfigMap)

	// Secrets (read-only endpoints)
	r.Get("/secrets", h.HandleListSecrets)
	r.Get("/secrets/types", h.HandleListSecretTypes)
	r.Get("/secrets/{namespace}/{name}", h.HandleGetSecret)
	r.Get("/secrets/{namespace}/{name}/data/{key}", h.HandleGetSecretData)
	r.Get("/secrets/{namespace}/{name}/usage", h.HandleGetSecretUsageExamples)

	// NetworkPolicies
	r.Get("/network-policies", h.HandleListNetworkPolicies)
	r.Get("/network-policies/{namespace}/{name}", h.HandleGetNetworkPolicy)

	// RBAC
	r.Get("/roles", h.HandleListRoles)
	r.Get("/roles/{namespace}/{name}", h.HandleGetRole)
	r.Get("/role-bindings", h.HandleListRoleBindings)
	r.Get("/role-bindings/{namespace}/{name}", h.HandleGetRoleBinding)
	r.Get("/cluster-roles", h.HandleListClusterRoles)
	r.Get("/cluster-roles/{name}", h.HandleGetClusterRole)
	r.Get("/cluster-role-bindings", h.HandleListClusterRoleBindings)
	r.Get("/cluster-role-bindings/{name}", h.HandleGetClusterRoleBinding)
	r.Get("/identities", h.HandleListRBACIdentities)

	// Storage
	r.Get("/persistent-volumes", h.HandleListPersistentVolumes)
	r.Get("/persistent-volumes/{name}", h.HandleGetPersistentVolume)
	r.Get("/persistent-volume-claims", h.HandleListPersistentVolumeClaims)
	r.Get("/persistent-volume-claims/{namespace}/{name}", h.HandleGetPersistentVolumeClaim)
	r.Get("/storage-classes", h.HandleListStorageClasses)
	r.Get("/storage-classes/{name}", h.HandleGetStorageClass)
	r.Get("/csi-drivers", h.HandleListCSIDrivers)
	r.Get("/csi-drivers/{name}", h.HandleGetCSIDriver)
	r.Get("/volume-snapshots", h.HandleListVolumeSnapshots)
	r.Get("/volume-snapshots/{namespace}/{name}", h.HandleGetVolumeSnapshot)
	r.Get("/volume-snapshot-classes", h.HandleListVolumeSnapshotClasses)
	r.Get("/volume-snapshot-classes/{name}", h.HandleGetVolumeSnapshotClass)

	// Quotas
	r.Get("/resource-quotas", h.HandleListResourceQuotas)
	r.Get("/resource-quotas/{namespace}/{name}", h.HandleGetResourceQuota)

	// API Resources / CRDs
	r.Get("/api-resources", h.HandleListAPIResources)
	r.Get("/api-resources/{name}", h.HandleGetAPIResource)
	r.Get("/crds", h.HandleListCustomResourceDefinitions)
	r.Get("/crds/{name}", h.HandleGetCustomResourceDefinition)

	// Export
	r.Get("/export/{namespace}/{kind}/{name}", h.HandleExportResource)
	r.Get("/export/{kind}/{name}", h.HandleExportClusterScopedResource)

	// Pod logs
	r.Get("/pods/{namespace}/{podName}/logs", h.HandleGetPodLogs)

	// Logs cache (replay-only)
	r.Get("/logs", h.HandleGetLogs)
	r.Get("/logs/export", h.HandleExportLogs)

	// Analytics
	r.Get("/analytics/visitors", h.HandleGetVisitors)

	// Istio
	r.Get("/istio/virtualservices", h.HandleListVirtualServices)
	r.Get("/istio/virtualservices/{namespace}/{name}", h.HandleGetVirtualService)
	r.Get("/istio/virtualservices/{namespace}/{name}/yaml", h.HandleGetVirtualServiceYAML)
	r.Get("/istio/gateways", h.HandleListGateways)
	r.Get("/istio/gateways/{namespace}/{name}", h.HandleGetGateway)
	r.Get("/istio/gateways/{namespace}/{name}/yaml", h.HandleGetGatewayYAML)

	// Summaries
	r.Get("/summaries/cards", h.HandleGetSummaryCards)
	r.Get("/summaries/{resource}", h.HandleGetResourceSummary)
	r.Get("/summaries/{resource}/namespaces/{namespace}", h.HandleGetNamespacedResourceSummary)

	// --- WebSockets (authenticated) ---
	r.Get("/stream/nodes", h.HandleNodesWebSocket)
	r.Get("/stream/pods", h.HandlePodsWebSocket)
	r.Get("/stream/services", h.HandleServicesWebSocket)
	r.Get("/stream/deployments", h.HandleDeploymentsWebSocket)
	r.Get("/stream/secrets", h.HandleSecretsWebSocket)
	r.Get("/stream/overview", h.HandleOverviewWebSocket)
	r.Get("/stream/jobs/{jobId}", h.HandleJobWebSocket)
	r.Get("/stream/logs/{streamId}", h.HandleLogsWebSocket)
	// HPA stream
	r.Get("/stream/hpas", h.HandleHPAsWebSocket)

	// TimeSeries live streams
	r.Get("/timeseries/live", h.HandleTimeSeriesLiveWebSocket)
	r.Get("/timeseries/cluster/live", h.HandleClusterTimeSeriesLiveWebSocket)
}
