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
    `${resource}.patch` as CapabilityKey,
    `${resource}.delete` as CapabilityKey,
  ];
}

// Resource watch operations
export function getResourceWatchCapabilities(resource: string): CapabilityKey[] {
  return [
    `${resource}.get` as CapabilityKey,
    `${resource}.list` as CapabilityKey,
    `${resource}.watch` as CapabilityKey,
  ];
}

// Resource scale operations
export function getResourceScaleCapabilities(resource: string): CapabilityKey[] {
  return [
    `${resource}.scale.get` as CapabilityKey,
    `${resource}.scale.update` as CapabilityKey,
    `${resource}.scale.patch` as CapabilityKey,
  ];
}

// Pod-specific operations
export const POD_VIEW_CAPABILITIES: CapabilityKey[] = [
  "pods.get",
  "pods.list",
  "pods.watch",
];

export const POD_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...POD_VIEW_CAPABILITIES,
  "pods.delete",
  "pods.create",
  "pods.update",
  "pods.patch",
  "pods.deletecollection",
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

export const POD_ADVANCED_CAPABILITIES: CapabilityKey[] = [
  "pods.attach",
  "pods.eviction",
  "pods.ephemeralcontainers",
  "pods.proxy.get",
  "pods.proxy.create",
];

// Deployment-specific operations
export const DEPLOYMENT_VIEW_CAPABILITIES: CapabilityKey[] = [
  "deployments.get",
  "deployments.list",
  "deployments.watch",
];

export const DEPLOYMENT_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...DEPLOYMENT_VIEW_CAPABILITIES,
  "deployments.delete",
  "deployments.create",
  "deployments.update",
  "deployments.patch",
  "deployments.restart",
];

export const DEPLOYMENT_SCALE_CAPABILITIES: CapabilityKey[] = [
  "deployments.scale.get",
  "deployments.scale.update",
  "deployments.scale.patch",
];

// StatefulSet-specific operations
export const STATEFULSET_VIEW_CAPABILITIES: CapabilityKey[] = [
  "statefulsets.get",
  "statefulsets.list",
  "statefulsets.watch",
];

export const STATEFULSET_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...STATEFULSET_VIEW_CAPABILITIES,
  "statefulsets.delete",
  "statefulsets.create",
  "statefulsets.update",
  "statefulsets.patch",
];

export const STATEFULSET_SCALE_CAPABILITIES: CapabilityKey[] = [
  "statefulsets.scale.get",
  "statefulsets.scale.update",
  "statefulsets.scale.patch",
];

// DaemonSet-specific operations
export const DAEMONSET_VIEW_CAPABILITIES: CapabilityKey[] = [
  "daemonsets.get",
  "daemonsets.list",
  "daemonsets.watch",
];

export const DAEMONSET_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...DAEMONSET_VIEW_CAPABILITIES,
  "daemonsets.delete",
  "daemonsets.create",
  "daemonsets.update",
  "daemonsets.patch",
];

// Service-specific operations
export const SERVICE_VIEW_CAPABILITIES: CapabilityKey[] = [
  "services.get",
  "services.list",
  "services.watch",
];

export const SERVICE_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...SERVICE_VIEW_CAPABILITIES,
  "services.delete",
  "services.create",
  "services.update",
  "services.patch",
  "services.proxy.get",
  "services.proxy.create",
];

// Config and secrets
export const CONFIG_VIEW_CAPABILITIES: CapabilityKey[] = [
  "configmaps.get",
  "configmaps.list",
  "configmaps.watch",
  "secrets.read",
  "secrets.list",
  "secrets.watch",
];

export const CONFIG_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...CONFIG_VIEW_CAPABILITIES,
  "configmaps.create",
  "configmaps.update",
  "configmaps.patch",
  "configmaps.delete",
  "configmaps.edit",
  "secrets.create",
  "secrets.update",
  "secrets.patch",
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
  "roles.update",
  "roles.delete",
  "rolebindings.create",
  "rolebindings.update",
  "rolebindings.delete",
  "clusterroles.create",
  "clusterroles.update",
  "clusterroles.delete",
  "clusterrolebindings.create",
  "clusterrolebindings.update",
  "clusterrolebindings.delete",
];

export const RBAC_SPECIAL_CAPABILITIES: CapabilityKey[] = [
  "rbac.roles.bind",
  "rbac.clusterroles.bind",
  "rbac.roles.escalate",
  "rbac.clusterroles.escalate",
];

// Cluster admin capabilities
export const CLUSTER_ADMIN_CAPABILITIES: CapabilityKey[] = [
  "nodes.get",
  "nodes.list",
  "nodes.update",
  "nodes.patch",
  "nodes.shell",
  "nodes.proxy.get",
  "namespaces.create",
  "namespaces.delete",
  "namespaces.update",
  "namespaces.patch",
  ...RBAC_MANAGE_CAPABILITIES,
  ...RBAC_SPECIAL_CAPABILITIES,
];

// Storage capabilities
export const STORAGE_VIEW_CAPABILITIES: CapabilityKey[] = [
  "persistentvolumes.get",
  "persistentvolumes.list",
  "persistentvolumes.watch",
  "persistentvolumeclaims.get",
  "persistentvolumeclaims.list",
  "persistentvolumeclaims.watch",
  "storageclasses.get",
  "storageclasses.list",
  "storageclasses.watch",
];

export const STORAGE_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...STORAGE_VIEW_CAPABILITIES,
  "persistentvolumes.create",
  "persistentvolumes.update",
  "persistentvolumes.patch",
  "persistentvolumes.delete",
  "persistentvolumeclaims.create",
  "persistentvolumeclaims.update",
  "persistentvolumeclaims.patch",
  "persistentvolumeclaims.delete",
  "storageclasses.create",
  "storageclasses.update",
  "storageclasses.patch",
  "storageclasses.delete",
];

// Networking capabilities
export const NETWORKING_VIEW_CAPABILITIES: CapabilityKey[] = [
  "ingresses.get",
  "ingresses.list",
  "ingresses.watch",
  "networkpolicies.get",
  "networkpolicies.list",
  "networkpolicies.watch",
  "ingressclasses.get",
  "ingressclasses.list",
  "ingressclasses.watch",
];

export const NETWORKING_MANAGE_CAPABILITIES: CapabilityKey[] = [
  ...NETWORKING_VIEW_CAPABILITIES,
  "ingresses.create",
  "ingresses.update",
  "ingresses.patch",
  "ingresses.delete",
  "networkpolicies.create",
  "networkpolicies.update",
  "networkpolicies.patch",
  "networkpolicies.delete",
  "ingressclasses.create",
  "ingressclasses.update",
  "ingressclasses.patch",
  "ingressclasses.delete",
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
  "secrets.read",
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

  // Job operations
  "jobs.get",
  "jobs.list",
  "jobs.create",
  "jobs.update",
  "jobs.patch",

  // CronJob operations
  "cronjobs.get",
  "cronjobs.list",
  "cronjobs.create",
  "cronjobs.update",
  "cronjobs.patch",
];

// Authentication/Authorization capabilities
export const AUTHZ_CAPABILITIES: CapabilityKey[] = [
  "selfsubjectreviews.create",
  "tokenreviews.create",
  "subjectaccessreviews.create",
  "selfsubjectaccessreviews.create",
  "selfsubjectrulesreviews.create",
  "localsubjectaccessreviews.create",
];

// Impersonation capabilities
export const IMPERSONATION_CAPABILITIES: CapabilityKey[] = [
  "rbac.impersonate.users",
  "rbac.impersonate.groups",
  "rbac.impersonate.serviceaccounts",
  "rbac.impersonate.userextras.scopes",
];

// Certificate management capabilities
export const CERTIFICATE_CAPABILITIES: CapabilityKey[] = [
  "certificatesigningrequests.get",
  "certificatesigningrequests.list",
  "certificatesigningrequests.watch",
  "certificatesigningrequests.create",
  "certificatesigningrequests.update",
  "certificatesigningrequests.delete",
  "certificatesigningrequests.patch",
  "certificatesigningrequests.approval",
  "certificatesigningrequests.status",
];

// CRD management capabilities
export const CRD_CAPABILITIES: CapabilityKey[] = [
  "customresourcedefinitions.get",
  "customresourcedefinitions.list",
  "customresourcedefinitions.watch",
  "customresourcedefinitions.create",
  "customresourcedefinitions.update",
  "customresourcedefinitions.delete",
  "customresourcedefinitions.patch",
];

// Admission control capabilities
export const ADMISSION_CONTROL_CAPABILITIES: CapabilityKey[] = [
  "mutatingwebhookconfigurations.get",
  "mutatingwebhookconfigurations.list",
  "mutatingwebhookconfigurations.watch",
  "mutatingwebhookconfigurations.create",
  "mutatingwebhookconfigurations.update",
  "mutatingwebhookconfigurations.delete",
  "mutatingwebhookconfigurations.patch",
  "validatingwebhookconfigurations.get",
  "validatingwebhookconfigurations.list",
  "validatingwebhookconfigurations.watch",
  "validatingwebhookconfigurations.create",
  "validatingwebhookconfigurations.update",
  "validatingwebhookconfigurations.delete",
  "validatingwebhookconfigurations.patch",
  "validatingadmissionpolicies.*",
  "validatingadmissionpolicybindings.*",
];

/**
 * Check if a capability is a destructive operation
 */
export function isDestructiveCapability(capability: CapabilityKey): boolean {
  return capability.includes(".delete") ||
    capability.includes("deletecollection") ||
    capability === "deployments.restart" ||
    capability.includes("eviction");
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
    capability.includes("exec") ||
    capability.includes("impersonate") ||
    capability.includes("escalate") ||
    capability.includes("bind") ||
    capability.includes("approval") ||
    capability.includes("finalize");
}

/**
 * Check if a capability is for cluster-scoped resources
 */
export function isClusterScopedCapability(capability: CapabilityKey): boolean {
  return capability.includes("clusterrole") ||
    capability.includes("nodes.") ||
    capability.includes("persistentvolumes.") ||
    capability.includes("storageclasses.") ||
    capability.includes("ingressclasses.") ||
    capability.includes("priorityclasses.") ||
    capability.includes("runtimeclasses.") ||
    capability.includes("customresourcedefinitions.") ||
    capability.includes("apiservices.") ||
    capability.includes("certificatesigningrequests.") ||
    capability.includes("mutatingwebhookconfigurations.") ||
    capability.includes("validatingwebhookconfigurations.") ||
    capability.includes("validatingadmissionpolicies") ||
    capability.includes("validatingadmissionpolicybindings") ||
    capability.includes("prioritylevelconfigurations") ||
    capability.includes("flowschemas") ||
    capability.includes("csidrivers") ||
    capability.includes("csinodes") ||
    capability.includes("volumeattachments") ||
    capability.includes("resourceclasses") ||
    capability === "namespaces.create" ||
    capability === "namespaces.delete" ||
    capability === "namespaces.list" ||
    capability === "namespaces.get";
}

/**
 * Check if a capability involves subresources
 */
export function isSubresourceCapability(capability: CapabilityKey): boolean {
  return capability.includes(".scale.") ||
    capability.includes(".proxy.") ||
    capability.includes(".finalize.") ||
    capability.includes(".approval") ||
    capability.includes(".status") ||
    capability.includes(".token") ||
    capability === "pods.logs" ||
    capability === "pods.exec" ||
    capability === "pods.portforward" ||
    capability === "pods.attach" ||
    capability === "pods.eviction" ||
    capability === "pods.ephemeralcontainers";
}
