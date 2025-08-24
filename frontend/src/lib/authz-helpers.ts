import type { CapabilityKey } from "@/lib/authz";

/**
 * Helper functions for generating common capability sets
 */

// Resource CRUD operations
export function getResourceCrudCapabilities(resource: string): CapabilityKey[] {
  return [
    `${resource}.get` as CapabilityKey,
    `${resource}.list` as CapabilityKey,
    `${resource}.create` as CapabilityKey,
    `${resource}.update` as CapabilityKey,
    `${resource}.delete` as CapabilityKey,
  ];
}

// Pod-specific operations
export const POD_VIEW_CAPABILITIES: CapabilityKey[] = [
  "pods.get",
  "pods.list",
];

export const POD_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...POD_VIEW_CAPABILITIES,
  "pods.delete",
  "pods.create",
  "pods.update",
  "pods.patch",
];

export const POD_EXEC_CAPABILITIES: CapabilityKey[] = [
  "pods.get",
  "pods.exec",
];

export const POD_LOGS_CAPABILITIES: CapabilityKey[] = [
  "pods.get",
  "pods.logs",
];

export const POD_PORT_FORWARD_CAPABILITIES: CapabilityKey[] = [
  "pods.get",
  "pods.portforward",
];

// Deployment-specific operations
export const DEPLOYMENT_VIEW_CAPABILITIES: CapabilityKey[] = [
  "deployments.get",
  "deployments.list",
];

export const DEPLOYMENT_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...DEPLOYMENT_VIEW_CAPABILITIES,
  "deployments.delete",
  "deployments.create",
  "deployments.update",
  "deployments.patch",
  "deployments.restart",
];

// Config and secrets
export const CONFIG_VIEW_CAPABILITIES: CapabilityKey[] = [
  "configmaps.get",
  "configmaps.list",
  "secrets.get",
  "secrets.list",
];

export const CONFIG_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...CONFIG_VIEW_CAPABILITIES,
  "configmaps.create",
  "configmaps.update",
  "configmaps.delete",
  "configmaps.edit",
  "secrets.create",
  "secrets.update",
  "secrets.delete",
];

// RBAC operations
export const RBAC_VIEW_CAPABILITIES: CapabilityKey[] = [
  "roles.get",
  "roles.list",
  "rolebindings.get",
  "rolebindings.list",
  "clusterroles.get",
  "clusterroles.list",
  "clusterrolebindings.get",
  "clusterrolebindings.list",
];

export const RBAC_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...RBAC_VIEW_CAPABILITIES,
  "roles.create",
  "roles.delete",
  "rolebindings.create",
  "rolebindings.delete",
  "clusterroles.create",
  "clusterroles.delete",
  "clusterrolebindings.create",
  "clusterrolebindings.delete",
];

// Cluster admin capabilities
export const CLUSTER_ADMIN_CAPABILITIES: CapabilityKey[] = [
  "nodes.get",
  "nodes.list",
  "namespaces.create",
  "namespaces.delete",
  ...RBAC_MANAGE_CAPABILITIES,
];

// Apply/Configuration capabilities - for YAML editor and apply operations
export const APPLY_CAPABILITIES: CapabilityKey[] = [
  // Pod operations
  "pods.get",
  "pods.list",
  "pods.create",
  "pods.update",
  "pods.patch",

  // Deployment operations
  "deployments.get",
  "deployments.list",
  "deployments.create",
  "deployments.update",
  "deployments.patch",

  // Service operations
  "services.get",
  "services.list",
  "services.create",
  "services.update",
  "services.patch",

  // ConfigMap operations
  "configmaps.get",
  "configmaps.list",
  "configmaps.create",
  "configmaps.update",
  "configmaps.patch",

  // Secret operations
  "secrets.get",
  "secrets.list",
  "secrets.create",
  "secrets.update",
  "secrets.patch",

  // StatefulSet operations
  "statefulsets.get",
  "statefulsets.list",
  "statefulsets.create",
  "statefulsets.update",
  "statefulsets.patch",

  // DaemonSet operations
  "daemonsets.get",
  "daemonsets.list",
  "daemonsets.create",
  "daemonsets.update",
  "daemonsets.patch",
];

/**
 * Check if a capability is a destructive operation
 */
export function isDestructiveCapability(capability: CapabilityKey): boolean {
  return capability.includes(".delete") ||
    capability === "deployments.restart" ||
    capability === "statefulsets.restart";
}

/**
 * Check if a capability requires special privileges
 */
export function isPrivilegedCapability(capability: CapabilityKey): boolean {
  return capability.includes("clusterrole") ||
    capability.includes("clusterbinding") ||
    capability.includes("nodes.") ||
    capability === "namespaces.create" ||
    capability === "namespaces.delete" ||
    capability.includes("exec");
}
