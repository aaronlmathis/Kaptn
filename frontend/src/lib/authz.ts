// Authorization types and utilities for frontend capability checking

export type CapabilityKey =
  | "pods.delete"
  | "pods.logs"
  | "pods.exec"
  | "pods.portforward"
  | "pods.get"
  | "pods.list"
  | "pods.create"
  | "pods.update"
  | "pods.patch"
  | "deployments.restart"
  | "deployments.delete"
  | "deployments.get"
  | "deployments.list"
  | "deployments.create"
  | "deployments.update"
  | "deployments.patch"
  | "services.delete"
  | "services.get"
  | "services.list"
  | "services.create"
  | "services.update"
  | "services.patch"
  | "configmaps.edit"
  | "configmaps.delete"
  | "configmaps.get"
  | "configmaps.list"
  | "configmaps.create"
  | "configmaps.update"
  | "secrets.read"
  | "secrets.delete"
  | "secrets.get"
  | "secrets.list"
  | "secrets.create"
  | "secrets.update"
  | "namespaces.get"
  | "namespaces.list"
  | "namespaces.create"
  | "namespaces.delete"
  | "nodes.get"
  | "nodes.list"
  | "events.get"
  | "events.list"
  | "replicasets.get"
  | "replicasets.list"
  | "replicasets.delete"
  | "statefulsets.get"
  | "statefulsets.list"
  | "statefulsets.delete"
  | "statefulsets.restart"
  | "daemonsets.get"
  | "daemonsets.list"
  | "daemonsets.delete"
  | "jobs.get"
  | "jobs.list"
  | "jobs.delete"
  | "cronjobs.get"
  | "cronjobs.list"
  | "cronjobs.delete"
  | "persistentvolumes.get"
  | "persistentvolumes.list"
  | "persistentvolumes.delete"
  | "persistentvolumeclaims.get"
  | "persistentvolumeclaims.list"
  | "persistentvolumeclaims.delete"
  | "storageclass.get"
  | "storageclass.list"
  | "roles.get"
  | "roles.list"
  | "roles.create"
  | "roles.delete"
  | "rolebindings.get"
  | "rolebindings.list"
  | "rolebindings.create"
  | "rolebindings.delete"
  | "clusterroles.get"
  | "clusterroles.list"
  | "clusterroles.create"
  | "clusterroles.delete"
  | "clusterrolebindings.get"
  | "clusterrolebindings.list"
  | "clusterrolebindings.create"
  | "clusterrolebindings.delete";

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
