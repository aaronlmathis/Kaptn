// Authorization types and utilities for frontend capability checking

export type CapabilityKey =
  // Dashboard capabilities
  | "dashboard.view"

  // Pod operations
  | "pods.delete"
  | "pods.logs"
  | "pods.exec"
  | "pods.portforward"
  | "pods.get"
  | "pods.list"
  | "pods.watch"
  | "pods.create"
  | "pods.update"
  | "pods.patch"
  | "pods.attach"
  | "pods.eviction"
  | "pods.ephemeralcontainers"
  | "pods.deletecollection"
  | "pods.proxy.get"
  | "pods.proxy.create"

  // Deployment operations
  | "deployments.restart"
  | "deployments.delete"
  | "deployments.get"
  | "deployments.list"
  | "deployments.watch"
  | "deployments.create"
  | "deployments.update"
  | "deployments.patch"
  | "deployments.scale.get"
  | "deployments.scale.update"
  | "deployments.scale.patch"

  // ConfigMap operations
  | "configmaps.edit"
  | "configmaps.delete"
  | "configmaps.get"
  | "configmaps.list"
  | "configmaps.create"
  | "configmaps.update"
  | "configmaps.watch"
  | "configmaps.patch"

  // Secret operations
  | "secrets.read"
  | "secrets.list"
  | "secrets.create"
  | "secrets.update"
  | "secrets.delete"
  | "secrets.watch"
  | "secrets.patch"

  // Service operations
  | "services.get"
  | "services.list"
  | "services.create"
  | "services.update"
  | "services.delete"
  | "services.watch"
  | "services.patch"
  | "services.proxy.get"
  | "services.proxy.create"

  // StatefulSet operations
  | "statefulsets.get"
  | "statefulsets.list"
  | "statefulsets.create"
  | "statefulsets.update"
  | "statefulsets.delete"
  | "statefulsets.patch"
  | "statefulsets.watch"
  | "statefulsets.scale.get"
  | "statefulsets.scale.update"
  | "statefulsets.scale.patch"

  // DaemonSet operations
  | "daemonsets.get"
  | "daemonsets.list"
  | "daemonsets.create"
  | "daemonsets.update"
  | "daemonsets.delete"
  | "daemonsets.patch"
  | "daemonsets.watch"

  // ReplicaSet operations
  | "replicasets.get"
  | "replicasets.list"
  | "replicasets.create"
  | "replicasets.update"
  | "replicasets.delete"
  | "replicasets.patch"
  | "replicasets.watch"
  | "replicasets.scale.get"
  | "replicasets.scale.update"
  | "replicasets.scale.patch"

  // Job operations
  | "jobs.get"
  | "jobs.list"
  | "jobs.create"
  | "jobs.update"
  | "jobs.delete"
  | "jobs.patch"
  | "jobs.watch"

  // CronJob operations
  | "cronjobs.get"
  | "cronjobs.list"
  | "cronjobs.create"
  | "cronjobs.update"
  | "cronjobs.delete"
  | "cronjobs.patch"
  | "cronjobs.watch"

  // Namespace operations
  | "namespaces.get"
  | "namespaces.list"
  | "namespaces.create"
  | "namespaces.update"
  | "namespaces.delete"
  | "namespaces.patch"
  | "namespaces.watch"
  | "namespaces.finalize.update"

  // Node operations (cluster-scoped)
  | "nodes.get"
  | "nodes.list"
  | "nodes.update"
  | "nodes.patch"
  | "nodes.shell"
  | "nodes.proxy.get"

  // RBAC operations
  | "roles.get"
  | "roles.list"
  | "roles.create"
  | "roles.update"
  | "roles.delete"
  | "rolebindings.get"
  | "rolebindings.list"
  | "rolebindings.create"
  | "rolebindings.update"
  | "rolebindings.delete"
  | "clusterroles.get"
  | "clusterroles.list"
  | "clusterroles.create"
  | "clusterroles.update"
  | "clusterroles.delete"
  | "clusterrolebindings.get"
  | "clusterrolebindings.list"
  | "clusterrolebindings.create"
  | "clusterrolebindings.update"
  | "clusterrolebindings.delete"

  // Event operations
  | "events.get"
  | "events.list"
  | "events.watch"
  | "events.create"
  | "events.v1.get"
  | "events.v1.list"
  | "events.v1.watch"
  | "events.v1.create"

  // Persistent Volume operations
  | "persistentvolumes.get"
  | "persistentvolumes.list"
  | "persistentvolumes.create"
  | "persistentvolumes.update"
  | "persistentvolumes.delete"
  | "persistentvolumes.patch"
  | "persistentvolumes.watch"
  | "persistentvolumeclaims.get"
  | "persistentvolumeclaims.list"
  | "persistentvolumeclaims.create"
  | "persistentvolumeclaims.update"
  | "persistentvolumeclaims.delete"
  | "persistentvolumeclaims.patch"
  | "persistentvolumeclaims.watch"

  // Storage operations
  | "storageclasses.get"
  | "storageclasses.list"
  | "storageclasses.create"
  | "storageclasses.update"
  | "storageclasses.delete"
  | "storageclasses.patch"
  | "storageclasses.watch"

  // Ingress operations
  | "ingresses.get"
  | "ingresses.list"
  | "ingresses.create"
  | "ingresses.update"
  | "ingresses.delete"
  | "ingresses.patch"
  | "ingresses.watch"

  // NetworkPolicy operations
  | "networkpolicies.get"
  | "networkpolicies.list"
  | "networkpolicies.create"
  | "networkpolicies.update"
  | "networkpolicies.delete"
  | "networkpolicies.patch"
  | "networkpolicies.watch"

  // ReplicationController operations
  | "replicationcontrollers.get"
  | "replicationcontrollers.list"
  | "replicationcontrollers.create"
  | "replicationcontrollers.update"
  | "replicationcontrollers.delete"
  | "replicationcontrollers.patch"
  | "replicationcontrollers.watch"
  | "replicationcontrollers.scale.get"
  | "replicationcontrollers.scale.update"
  | "replicationcontrollers.scale.patch"

  // HorizontalPodAutoscaler operations
  | "horizontalpodautoscalers.get"
  | "horizontalpodautoscalers.list"
  | "horizontalpodautoscalers.watch"
  | "horizontalpodautoscalers.create"
  | "horizontalpodautoscalers.update"
  | "horizontalpodautoscalers.patch"
  | "horizontalpodautoscalers.delete"

  // ControllerRevisions
  | "controllerrevisions.get"
  | "controllerrevisions.list"
  | "controllerrevisions.watch"
  | "controllerrevisions.create"
  | "controllerrevisions.update"
  | "controllerrevisions.patch"
  | "controllerrevisions.delete"

  // PodTemplates
  | "podtemplates.get"
  | "podtemplates.list"
  | "podtemplates.watch"
  | "podtemplates.create"
  | "podtemplates.update"
  | "podtemplates.patch"
  | "podtemplates.delete"

  // Bindings
  | "bindings.create"

  // RuntimeClass operations
  | "runtimeclasses.get"
  | "runtimeclasses.list"
  | "runtimeclasses.watch"
  | "runtimeclasses.create"
  | "runtimeclasses.update"
  | "runtimeclasses.patch"
  | "runtimeclasses.delete"

  // Endpoints operations
  | "endpoints.get"
  | "endpoints.list"
  | "endpoints.watch"
  | "endpoints.create"
  | "endpoints.update"
  | "endpoints.patch"
  | "endpoints.delete"

  // EndpointSlices operations
  | "endpointslices.get"
  | "endpointslices.list"
  | "endpointslices.watch"
  | "endpointslices.create"
  | "endpointslices.update"
  | "endpointslices.delete"
  | "endpointslices.patch"

  // ServiceAccount operations
  | "serviceaccounts.get"
  | "serviceaccounts.list"
  | "serviceaccounts.create"
  | "serviceaccounts.update"
  | "serviceaccounts.delete"
  | "serviceaccounts.patch"
  | "serviceaccounts.token"

  // ResourceQuota operations
  | "resourcequotas.get"
  | "resourcequotas.list"
  | "resourcequotas.create"
  | "resourcequotas.update"
  | "resourcequotas.delete"
  | "resourcequotas.patch"
  | "resourcequotas.watch"

  // LimitRange operations
  | "limitranges.get"
  | "limitranges.list"
  | "limitranges.watch"

  // IngressClass operations
  | "ingressclasses.get"
  | "ingressclasses.list"
  | "ingressclasses.watch"
  | "ingressclasses.create"
  | "ingressclasses.update"
  | "ingressclasses.delete"
  | "ingressclasses.patch"

  // Coordination operations
  | "leases.get"
  | "leases.list"
  | "leases.create"
  | "leases.update"
  | "leases.delete"
  | "leases.patch"
  | "leases.watch"

  // Scheduling operations
  | "priorityclasses.get"
  | "priorityclasses.list"
  | "priorityclasses.watch"
  | "priorityclasses.create"
  | "priorityclasses.update"
  | "priorityclasses.delete"
  | "priorityclasses.patch"

  // Admission operations
  | "mutatingwebhookconfigurations.get"
  | "mutatingwebhookconfigurations.list"
  | "mutatingwebhookconfigurations.watch"
  | "mutatingwebhookconfigurations.create"
  | "mutatingwebhookconfigurations.update"
  | "mutatingwebhookconfigurations.delete"
  | "mutatingwebhookconfigurations.patch"
  | "validatingwebhookconfigurations.get"
  | "validatingwebhookconfigurations.list"
  | "validatingwebhookconfigurations.watch"
  | "validatingwebhookconfigurations.create"
  | "validatingwebhookconfigurations.update"
  | "validatingwebhookconfigurations.delete"
  | "validatingwebhookconfigurations.patch"
  | "validatingadmissionpolicies.*"
  | "validatingadmissionpolicybindings.*"

  // CRD operations
  | "customresourcedefinitions.get"
  | "customresourcedefinitions.list"
  | "customresourcedefinitions.watch"
  | "customresourcedefinitions.create"
  | "customresourcedefinitions.update"
  | "customresourcedefinitions.delete"
  | "customresourcedefinitions.patch"

  // API service operations
  | "apiservices.get"
  | "apiservices.list"
  | "apiservices.watch"
  | "apiservices.create"
  | "apiservices.update"
  | "apiservices.delete"
  | "apiservices.patch"

  // Certificate operations
  | "certificatesigningrequests.get"
  | "certificatesigningrequests.list"
  | "certificatesigningrequests.watch"
  | "certificatesigningrequests.create"
  | "certificatesigningrequests.update"
  | "certificatesigningrequests.delete"
  | "certificatesigningrequests.patch"
  | "certificatesigningrequests.approval"
  | "certificatesigningrequests.status"

  // Authentication/Authorization review APIs
  | "selfsubjectreviews.create"
  | "tokenreviews.create"
  | "subjectaccessreviews.create"
  | "selfsubjectaccessreviews.create"
  | "selfsubjectrulesreviews.create"
  | "localsubjectaccessreviews.create"

  // Dynamic Resource Allocation
  | "resourceclaims.*"
  | "resourceclaimtemplates.*"
  | "resourceclasses.*"

  // API Priority & Fairness
  | "prioritylevelconfigurations.*"
  | "flowschemas.*"

  // Storage: CSI & attachments
  | "csidrivers.*"
  | "csinodes.*"
  | "csistoragecapacities.*"
  | "volumeattachments.*"

  // Policy: PodDisruptionBudget
  | "poddisruptionbudgets.get"
  | "poddisruptionbudgets.list"
  | "poddisruptionbudgets.watch"
  | "poddisruptionbudgets.create"
  | "poddisruptionbudgets.update"
  | "poddisruptionbudgets.delete"
  | "poddisruptionbudgets.patch"

  // RBAC special verbs
  | "rbac.roles.bind"
  | "rbac.clusterroles.bind"
  | "rbac.roles.escalate"
  | "rbac.clusterroles.escalate"

  // Impersonation
  | "rbac.impersonate.users"
  | "rbac.impersonate.groups"
  | "rbac.impersonate.serviceaccounts"
  | "rbac.impersonate.userextras.scopes";

export type CapabilityQuery = {
  cluster: string;
  namespace?: string;
  features: CapabilityKey[];
  resourceNames?: Partial<Record<CapabilityKey, string>>; // optional per-object
};

export type CapabilityReply = {
  caps: Record<CapabilityKey, boolean>;
  reasons?: Partial<Record<CapabilityKey, string>>;
};

// Helper function to generate query key for React Query
export function getCapabilityQueryKey(query: CapabilityQuery): (string | undefined)[] {
  return [
    "caps",
    query.cluster,
    query.namespace ?? "-",
    query.features.sort().join(","),
    query.resourceNames ? JSON.stringify(query.resourceNames) : ""
  ];
}

// Helper function to create a minimal capability query
export function createCapabilityQuery(
  cluster: string,
  features: CapabilityKey[],
  namespace?: string,
  resourceNames?: Partial<Record<CapabilityKey, string>>
): CapabilityQuery {
  return {
    cluster,
    namespace,
    features,
    resourceNames
  };
}
