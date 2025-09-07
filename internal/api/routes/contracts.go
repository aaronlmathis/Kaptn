package routes

import "net/http"

// PublicHandlers defines the contract for public tier handlers (no authentication required)
type PublicHandlers interface {
	HandleLogin(w http.ResponseWriter, r *http.Request)
	HandleAuthCallback(w http.ResponseWriter, r *http.Request)
	HandleLogout(w http.ResponseWriter, r *http.Request)
	HandleRefresh(w http.ResponseWriter, r *http.Request)
	HandleMe(w http.ResponseWriter, r *http.Request)
	HandleJWKS(w http.ResponseWriter, r *http.Request)
	HandleDebugUser(w http.ResponseWriter, r *http.Request)
	HandlePublicConfig(w http.ResponseWriter, r *http.Request)
}

// AdminHandlers defines the contract for admin tier handlers (authentication required)
type AdminHandlers interface {
	HandleAuthzPreview(w http.ResponseWriter, r *http.Request)
	HandlePermissionsCheck(w http.ResponseWriter, r *http.Request)
	HandleRevokeUserSessions(w http.ResponseWriter, r *http.Request)
	HandleBindingsReload(w http.ResponseWriter, r *http.Request)
	HandleGenericSAR(w http.ResponseWriter, r *http.Request)

	// Phase 10: Logs Cache Administrative Endpoints
	HandleLogsCacheClearRings(w http.ResponseWriter, r *http.Request)
	HandleLogsCacheDumpStats(w http.ResponseWriter, r *http.Request)
	HandleLogsCacheListStreams(w http.ResponseWriter, r *http.Request)
	HandleLogsCacheSetLimits(w http.ResponseWriter, r *http.Request)
}

// ReadHandlers defines the contract for read tier handlers (authentication required)
type ReadHandlers interface {
	// Permissions / Authorization
	HandleCheckPermission(w http.ResponseWriter, r *http.Request)
	HandleGetActionPermissions(w http.ResponseWriter, r *http.Request)
	HandleCheckPageAccess(w http.ResponseWriter, r *http.Request)
	HandleGetUserNamespacePermissions(w http.ResponseWriter, r *http.Request)
	HandleBulkPermissionCheck(w http.ResponseWriter, r *http.Request)
	HandleAuthzCapabilities(w http.ResponseWriter, r *http.Request)
	HandleAuthzCapabilitiesRegistry(w http.ResponseWriter, r *http.Request)
	HandleAuthzCapabilitiesStats(w http.ResponseWriter, r *http.Request)
	HandleGetCapabilities(w http.ResponseWriter, r *http.Request)

	// Search
	HandleSearch(w http.ResponseWriter, r *http.Request)
	HandleSearchStats(w http.ResponseWriter, r *http.Request)
	HandleRefreshSearchCache(w http.ResponseWriter, r *http.Request)

	// TimeSeries (HTTP)
	HandleGetClusterTimeSeries(w http.ResponseWriter, r *http.Request)
	HandleTimeSeriesHealth(w http.ResponseWriter, r *http.Request)
	HandleGetTimeSeriesCapabilities(w http.ResponseWriter, r *http.Request)

	// TimeSeries Entities (discovery)
	HandleGetTimeSeriesNodes(w http.ResponseWriter, r *http.Request)
	HandleGetTimeSeriesNamespaces(w http.ResponseWriter, r *http.Request)
	HandleGetTimeSeriesPods(w http.ResponseWriter, r *http.Request)

	// TimeSeries Entity-specific queries
	HandleGetNodesTimeSeries(w http.ResponseWriter, r *http.Request)
	HandleGetNodeTimeSeries(w http.ResponseWriter, r *http.Request)
	HandleGetPodsTimeSeries(w http.ResponseWriter, r *http.Request)
	HandleGetPodTimeSeries(w http.ResponseWriter, r *http.Request)
	HandleGetNamespacesTimeSeries(w http.ResponseWriter, r *http.Request)
	HandleGetNamespaceTimeSeries(w http.ResponseWriter, r *http.Request)

	// HPAs
	HandleListHPAs(w http.ResponseWriter, r *http.Request)
	HandleGetHPA(w http.ResponseWriter, r *http.Request)
	HandleGetHPATimeseries(w http.ResponseWriter, r *http.Request)
	HandleHPAsWebSocket(w http.ResponseWriter, r *http.Request)

	// Core K8s Resources (Read)
	HandleListNodes(w http.ResponseWriter, r *http.Request)
	HandleGetNode(w http.ResponseWriter, r *http.Request)
	HandleListPods(w http.ResponseWriter, r *http.Request)
	HandleGetPod(w http.ResponseWriter, r *http.Request)
	HandleListDeployments(w http.ResponseWriter, r *http.Request)
	HandleGetDeployment(w http.ResponseWriter, r *http.Request)
	HandleListStatefulSets(w http.ResponseWriter, r *http.Request)
	HandleGetStatefulSet(w http.ResponseWriter, r *http.Request)
	HandleListReplicaSets(w http.ResponseWriter, r *http.Request)
	HandleGetReplicaSet(w http.ResponseWriter, r *http.Request)
	HandleListDaemonSets(w http.ResponseWriter, r *http.Request)
	HandleGetDaemonSet(w http.ResponseWriter, r *http.Request)
	HandleListJobs(w http.ResponseWriter, r *http.Request)
	HandleGetJob(w http.ResponseWriter, r *http.Request)
	HandleListCronJobs(w http.ResponseWriter, r *http.Request)
	HandleGetCronJob(w http.ResponseWriter, r *http.Request)

	// Overview / Jobs (Kaptn app concepts)
	HandleGetOverview(w http.ResponseWriter, r *http.Request)
	HandleListActionJobs(w http.ResponseWriter, r *http.Request)
	HandleGetActionJob(w http.ResponseWriter, r *http.Request)

	// Metrics / Namespaces
	HandleGetMetrics(w http.ResponseWriter, r *http.Request)
	HandleGetNamespaceMetrics(w http.ResponseWriter, r *http.Request)
	HandleListNamespaces(w http.ResponseWriter, r *http.Request)
	HandleGetNamespace(w http.ResponseWriter, r *http.Request)

	// Services
	HandleListServices(w http.ResponseWriter, r *http.Request)
	HandleListServicesInNamespace(w http.ResponseWriter, r *http.Request)
	HandleGetService(w http.ResponseWriter, r *http.Request)

	// Events
	HandleListEvents(w http.ResponseWriter, r *http.Request)
	HandleListEventsInNamespace(w http.ResponseWriter, r *http.Request)
	HandleGetEvent(w http.ResponseWriter, r *http.Request)

	// Ingress / IngressClass
	HandleListAllIngresses(w http.ResponseWriter, r *http.Request)
	HandleListIngresses(w http.ResponseWriter, r *http.Request)
	HandleGetIngress(w http.ResponseWriter, r *http.Request)
	HandleListIngressClasses(w http.ResponseWriter, r *http.Request)
	HandleGetIngressClass(w http.ResponseWriter, r *http.Request)

	// Endpoints / EndpointSlices
	HandleListEndpoints(w http.ResponseWriter, r *http.Request)
	HandleGetEndpoints(w http.ResponseWriter, r *http.Request)
	HandleListEndpointSlices(w http.ResponseWriter, r *http.Request)
	HandleGetEndpointSlice(w http.ResponseWriter, r *http.Request)

	// ConfigMaps
	HandleListConfigMaps(w http.ResponseWriter, r *http.Request)
	HandleGetConfigMap(w http.ResponseWriter, r *http.Request)

	// Secrets (read-only endpoints)
	HandleListSecrets(w http.ResponseWriter, r *http.Request)
	HandleListSecretTypes(w http.ResponseWriter, r *http.Request)
	HandleGetSecret(w http.ResponseWriter, r *http.Request)
	HandleGetSecretData(w http.ResponseWriter, r *http.Request)
	HandleGetSecretUsageExamples(w http.ResponseWriter, r *http.Request)

	// NetworkPolicies
	HandleListNetworkPolicies(w http.ResponseWriter, r *http.Request)
	HandleGetNetworkPolicy(w http.ResponseWriter, r *http.Request)

	// RBAC
	HandleListRoles(w http.ResponseWriter, r *http.Request)
	HandleGetRole(w http.ResponseWriter, r *http.Request)
	HandleListRoleBindings(w http.ResponseWriter, r *http.Request)
	HandleGetRoleBinding(w http.ResponseWriter, r *http.Request)
	HandleListClusterRoles(w http.ResponseWriter, r *http.Request)
	HandleGetClusterRole(w http.ResponseWriter, r *http.Request)
	HandleListClusterRoleBindings(w http.ResponseWriter, r *http.Request)
	HandleGetClusterRoleBinding(w http.ResponseWriter, r *http.Request)
	HandleListRBACIdentities(w http.ResponseWriter, r *http.Request)

	// Storage
	HandleListPersistentVolumes(w http.ResponseWriter, r *http.Request)
	HandleGetPersistentVolume(w http.ResponseWriter, r *http.Request)
	HandleListPersistentVolumeClaims(w http.ResponseWriter, r *http.Request)
	HandleGetPersistentVolumeClaim(w http.ResponseWriter, r *http.Request)
	HandleListStorageClasses(w http.ResponseWriter, r *http.Request)
	HandleGetStorageClass(w http.ResponseWriter, r *http.Request)
	HandleListCSIDrivers(w http.ResponseWriter, r *http.Request)
	HandleGetCSIDriver(w http.ResponseWriter, r *http.Request)
	HandleListVolumeSnapshots(w http.ResponseWriter, r *http.Request)
	HandleGetVolumeSnapshot(w http.ResponseWriter, r *http.Request)
	HandleListVolumeSnapshotClasses(w http.ResponseWriter, r *http.Request)
	HandleGetVolumeSnapshotClass(w http.ResponseWriter, r *http.Request)

	// Quotas
	HandleListResourceQuotas(w http.ResponseWriter, r *http.Request)
	HandleGetResourceQuota(w http.ResponseWriter, r *http.Request)

	// API Resources / CRDs
	HandleListAPIResources(w http.ResponseWriter, r *http.Request)
	HandleGetAPIResource(w http.ResponseWriter, r *http.Request)
	HandleListCustomResourceDefinitions(w http.ResponseWriter, r *http.Request)
	HandleGetCustomResourceDefinition(w http.ResponseWriter, r *http.Request)

	// Export
	HandleExportResource(w http.ResponseWriter, r *http.Request)
	HandleExportClusterScopedResource(w http.ResponseWriter, r *http.Request)

	// Pod logs
	HandleGetPodLogs(w http.ResponseWriter, r *http.Request)

	// Logs cache (replay-only)
	HandleGetLogs(w http.ResponseWriter, r *http.Request)
	HandleExportLogs(w http.ResponseWriter, r *http.Request)

	// Analytics
	HandleGetVisitors(w http.ResponseWriter, r *http.Request)

	// Istio
	HandleListVirtualServices(w http.ResponseWriter, r *http.Request)
	HandleGetVirtualService(w http.ResponseWriter, r *http.Request)
	HandleGetVirtualServiceYAML(w http.ResponseWriter, r *http.Request)
	HandleListGateways(w http.ResponseWriter, r *http.Request)
	HandleGetGateway(w http.ResponseWriter, r *http.Request)
	HandleGetGatewayYAML(w http.ResponseWriter, r *http.Request)

	// Summaries
	HandleGetSummaryCards(w http.ResponseWriter, r *http.Request)
	HandleGetResourceSummary(w http.ResponseWriter, r *http.Request)
	HandleGetNamespacedResourceSummary(w http.ResponseWriter, r *http.Request)

	// WebSockets (authenticated)
	HandleNodesWebSocket(w http.ResponseWriter, r *http.Request)
	HandlePodsWebSocket(w http.ResponseWriter, r *http.Request)
	HandleServicesWebSocket(w http.ResponseWriter, r *http.Request)
	HandleDeploymentsWebSocket(w http.ResponseWriter, r *http.Request)
	HandleSecretsWebSocket(w http.ResponseWriter, r *http.Request)
	HandleOverviewWebSocket(w http.ResponseWriter, r *http.Request)
	HandleJobWebSocket(w http.ResponseWriter, r *http.Request)
	HandleLogsWebSocket(w http.ResponseWriter, r *http.Request)

	// TimeSeries live streams
	HandleTimeSeriesLiveWebSocket(w http.ResponseWriter, r *http.Request)
	HandleClusterTimeSeriesLiveWebSocket(w http.ResponseWriter, r *http.Request)
}

// WriteHandlers defines the contract for write tier handlers (authentication + write permissions required)
type WriteHandlers interface {
	// Node management
	HandleCordonNode(w http.ResponseWriter, r *http.Request)
	HandleUncordonNode(w http.ResponseWriter, r *http.Request)
	HandleDrainNode(w http.ResponseWriter, r *http.Request)

	// Generic actions
	HandleExecuteActions(w http.ResponseWriter, r *http.Request)
	HandleValidateGenericActions(w http.ResponseWriter, r *http.Request)

	// Resource management
	HandleScaleResource(w http.ResponseWriter, r *http.Request)
	HandleDeleteResource(w http.ResponseWriter, r *http.Request)
	HandleDeleteResourceQuota(w http.ResponseWriter, r *http.Request)

	// Namespace management
	HandleCreateNamespace(w http.ResponseWriter, r *http.Request)
	HandleDeleteNamespace(w http.ResponseWriter, r *http.Request)

	// WebSocket and stream management
	HandleExecWebSocket(w http.ResponseWriter, r *http.Request)
	HandleStartLogStream(w http.ResponseWriter, r *http.Request)
	HandleStopLogStream(w http.ResponseWriter, r *http.Request)

	// Secret management
	HandleCreateSecret(w http.ResponseWriter, r *http.Request)
	HandleUpdateSecret(w http.ResponseWriter, r *http.Request)
	HandleDeleteSecret(w http.ResponseWriter, r *http.Request)

	// RBAC management
	HandleGenerateRBACYAML(w http.ResponseWriter, r *http.Request)
	HandleDryRunRBAC(w http.ResponseWriter, r *http.Request)
	HandleApplyRBAC(w http.ResponseWriter, r *http.Request)
}

// ApplyHandlers defines the contract for apply tier handlers (authentication + write permissions required with higher rate limits)
type ApplyHandlers interface {
	// Apply operations
	HandleApplyConfig(w http.ResponseWriter, r *http.Request)
	HandleApplyYAML(w http.ResponseWriter, r *http.Request)
}

// SystemHandlers defines the contract for system tier handlers (system health/metrics)
type SystemHandlers interface {
	HandleHealth(w http.ResponseWriter, r *http.Request)
	HandleReady(w http.ResponseWriter, r *http.Request)
	HandleVersion(w http.ResponseWriter, r *http.Request)
}

// StaticHandlers defines the contract for static file serving handlers
type StaticHandlers interface {
	GetStaticHandler() http.Handler
}

// Tiers combines all handler interfaces for easy mounting
type Tiers struct {
	Public PublicHandlers
	Admin  AdminHandlers
	Read   ReadHandlers
	Write  WriteHandlers
	Apply  ApplyHandlers
	System SystemHandlers
	Static StaticHandlers

	// Optional middlewares to be applied per tier (provided by server)
	MW Middlewares
}

// Middlewares provides optional HTTP middlewares for route groups
// Each field is a standard chi-compatible middleware function.
type Middlewares struct {
	// RequireAuth enforces that a request has an authenticated user
	RequireAuth func(http.Handler) http.Handler
	// RequireImpersonation ensures impersonated Kubernetes clients are present in context
	RequireImpersonation func(http.Handler) http.Handler
}
