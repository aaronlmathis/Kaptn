// Authorization capability types organized by Kubernetes resource categories
// This file mirrors the Go capabilities registry in internal/authz/capabilities.go

import type { CapabilityKey } from "./authz";

// Core workload capabilities
export type PodCapability =
	| "pods.get"
	| "pods.list"
	| "pods.watch"
	| "pods.create"
	| "pods.update"
	| "pods.patch"
	| "pods.delete"
	| "pods.deletecollection"
	| "pods.logs"
	| "pods.exec"
	| "pods.attach"
	| "pods.portforward"
	| "pods.eviction"
	| "pods.ephemeralcontainers"
	| "pods.proxy.get"
	| "pods.proxy.create";

export type DeploymentCapability =
	| "deployments.get"
	| "deployments.list"
	| "deployments.watch"
	| "deployments.create"
	| "deployments.update"
	| "deployments.patch"
	| "deployments.delete"
	| "deployments.restart"
	| "deployments.scale.get"
	| "deployments.scale.update"
	| "deployments.scale.patch";

export type StatefulSetCapability =
	| "statefulsets.get"
	| "statefulsets.list"
	| "statefulsets.watch"
	| "statefulsets.create"
	| "statefulsets.update"
	| "statefulsets.patch"
	| "statefulsets.delete"
	| "statefulsets.scale.get"
	| "statefulsets.scale.update"
	| "statefulsets.scale.patch";

export type DaemonSetCapability =
	| "daemonsets.get"
	| "daemonsets.list"
	| "daemonsets.watch"
	| "daemonsets.create"
	| "daemonsets.update"
	| "daemonsets.patch"
	| "daemonsets.delete";

export type ReplicaSetCapability =
	| "replicasets.get"
	| "replicasets.list"
	| "replicasets.watch"
	| "replicasets.create"
	| "replicasets.update"
	| "replicasets.patch"
	| "replicasets.delete"
	| "replicasets.scale.get"
	| "replicasets.scale.update"
	| "replicasets.scale.patch";

export type JobCapability =
	| "jobs.get"
	| "jobs.list"
	| "jobs.watch"
	| "jobs.create"
	| "jobs.update"
	| "jobs.patch"
	| "jobs.delete";

export type CronJobCapability =
	| "cronjobs.get"
	| "cronjobs.list"
	| "cronjobs.watch"
	| "cronjobs.create"
	| "cronjobs.update"
	| "cronjobs.patch"
	| "cronjobs.delete";

// Configuration and secrets capabilities
export type ConfigMapCapability =
	| "configmaps.get"
	| "configmaps.list"
	| "configmaps.watch"
	| "configmaps.create"
	| "configmaps.update"
	| "configmaps.patch"
	| "configmaps.delete"
	| "configmaps.edit";

export type SecretCapability =
	| "secrets.read"
	| "secrets.list"
	| "secrets.watch"
	| "secrets.create"
	| "secrets.update"
	| "secrets.patch"
	| "secrets.delete";

// Service and networking capabilities
export type ServiceCapability =
	| "services.get"
	| "services.list"
	| "services.watch"
	| "services.create"
	| "services.update"
	| "services.patch"
	| "services.delete"
	| "services.proxy.get"
	| "services.proxy.create";

export type IngressCapability =
	| "ingresses.get"
	| "ingresses.list"
	| "ingresses.watch"
	| "ingresses.create"
	| "ingresses.update"
	| "ingresses.patch"
	| "ingresses.delete";

export type NetworkPolicyCapability =
	| "networkpolicies.get"
	| "networkpolicies.list"
	| "networkpolicies.watch"
	| "networkpolicies.create"
	| "networkpolicies.update"
	| "networkpolicies.patch"
	| "networkpolicies.delete";

// Storage capabilities
export type PersistentVolumeCapability =
	| "persistentvolumes.get"
	| "persistentvolumes.list"
	| "persistentvolumes.watch"
	| "persistentvolumes.create"
	| "persistentvolumes.update"
	| "persistentvolumes.patch"
	| "persistentvolumes.delete";

export type PersistentVolumeClaimCapability =
	| "persistentvolumeclaims.get"
	| "persistentvolumeclaims.list"
	| "persistentvolumeclaims.watch"
	| "persistentvolumeclaims.create"
	| "persistentvolumeclaims.update"
	| "persistentvolumeclaims.patch"
	| "persistentvolumeclaims.delete";

export type StorageClassCapability =
	| "storageclasses.get"
	| "storageclasses.list"
	| "storageclasses.watch"
	| "storageclasses.create"
	| "storageclasses.update"
	| "storageclasses.patch"
	| "storageclasses.delete";

// RBAC capabilities
export type RoleCapability =
	| "roles.get"
	| "roles.list"
	| "roles.create"
	| "roles.update"
	| "roles.delete"
	| "rbac.roles.bind"
	| "rbac.roles.escalate";

export type RoleBindingCapability =
	| "rolebindings.get"
	| "rolebindings.list"
	| "rolebindings.create"
	| "rolebindings.update"
	| "rolebindings.delete";

export type ClusterRoleCapability =
	| "clusterroles.get"
	| "clusterroles.list"
	| "clusterroles.create"
	| "clusterroles.update"
	| "clusterroles.delete"
	| "rbac.clusterroles.bind"
	| "rbac.clusterroles.escalate";

export type ClusterRoleBindingCapability =
	| "clusterrolebindings.get"
	| "clusterrolebindings.list"
	| "clusterrolebindings.create"
	| "clusterrolebindings.update"
	| "clusterrolebindings.delete";

// Cluster-scoped capabilities
export type NamespaceCapability =
	| "namespaces.get"
	| "namespaces.list"
	| "namespaces.watch"
	| "namespaces.create"
	| "namespaces.update"
	| "namespaces.patch"
	| "namespaces.delete"
	| "namespaces.finalize.update";

export type NodeCapability =
	| "nodes.get"
	| "nodes.list"
	| "nodes.update"
	| "nodes.patch"
	| "nodes.shell"
	| "nodes.proxy.get";

// Events capabilities
export type EventCapability =
	| "events.get"
	| "events.list"
	| "events.watch"
	| "events.create"
	| "events.v1.get"
	| "events.v1.list"
	| "events.v1.watch"
	| "events.v1.create";

// Authentication and authorization capabilities
export type AuthCapability =
	| "selfsubjectreviews.create"
	| "tokenreviews.create"
	| "subjectaccessreviews.create"
	| "selfsubjectaccessreviews.create"
	| "selfsubjectrulesreviews.create"
	| "localsubjectaccessreviews.create";

export type ImpersonationCapability =
	| "rbac.impersonate.users"
	| "rbac.impersonate.groups"
	| "rbac.impersonate.serviceaccounts"
	| "rbac.impersonate.userextras.scopes";

// Advanced capabilities
export type CertificateCapability =
	| "certificatesigningrequests.get"
	| "certificatesigningrequests.list"
	| "certificatesigningrequests.watch"
	| "certificatesigningrequests.create"
	| "certificatesigningrequests.update"
	| "certificatesigningrequests.delete"
	| "certificatesigningrequests.patch"
	| "certificatesigningrequests.approval"
	| "certificatesigningrequests.status";

export type CRDCapability =
	| "customresourcedefinitions.get"
	| "customresourcedefinitions.list"
	| "customresourcedefinitions.watch"
	| "customresourcedefinitions.create"
	| "customresourcedefinitions.update"
	| "customresourcedefinitions.delete"
	| "customresourcedefinitions.patch";

export type AdmissionControlCapability =
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
	| "validatingwebhookconfigurations.patch";

// Wildcard capabilities for complex resources
export type WildcardCapability =
	| "validatingadmissionpolicies.*"
	| "validatingadmissionpolicybindings.*"
	| "resourceclaims.*"
	| "resourceclaimtemplates.*"
	| "resourceclasses.*"
	| "prioritylevelconfigurations.*"
	| "flowschemas.*"
	| "csidrivers.*"
	| "csinodes.*"
	| "csistoragecapacities.*"
	| "volumeattachments.*";

// Type guards for capability categories
export function isPodCapability(capability: CapabilityKey): capability is PodCapability {
	return capability.startsWith("pods.");
}

export function isDeploymentCapability(capability: CapabilityKey): capability is DeploymentCapability {
	return capability.startsWith("deployments.");
}

export function isServiceCapability(capability: CapabilityKey): capability is ServiceCapability {
	return capability.startsWith("services.");
}

export function isConfigMapCapability(capability: CapabilityKey): capability is ConfigMapCapability {
	return capability.startsWith("configmaps.");
}

export function isSecretCapability(capability: CapabilityKey): capability is SecretCapability {
	return capability.startsWith("secrets.");
}

export function isStorageCapability(capability: CapabilityKey): capability is PersistentVolumeCapability | PersistentVolumeClaimCapability | StorageClassCapability {
	return capability.startsWith("persistentvolumes.") ||
		capability.startsWith("persistentvolumeclaims.") ||
		capability.startsWith("storageclasses.");
}

export function isRBACCapability(capability: CapabilityKey): capability is RoleCapability | RoleBindingCapability | ClusterRoleCapability | ClusterRoleBindingCapability {
	return capability.startsWith("roles.") ||
		capability.startsWith("rolebindings.") ||
		capability.startsWith("clusterroles.") ||
		capability.startsWith("clusterrolebindings.") ||
		capability.startsWith("rbac.");
}

export function isClusterScopedCapability(capability: CapabilityKey): boolean {
	return capability.startsWith("clusterroles.") ||
		capability.startsWith("clusterrolebindings.") ||
		capability.startsWith("nodes.") ||
		capability.startsWith("persistentvolumes.") ||
		capability.startsWith("storageclasses.") ||
		capability.startsWith("namespaces.") ||
		capability.startsWith("customresourcedefinitions.") ||
		capability.startsWith("certificatesigningrequests.") ||
		capability.includes("webhook") ||
		capability.includes("admission") ||
		capability.includes("prioritylevel") ||
		capability.includes("flowschema") ||
		capability.includes("csi") ||
		capability.includes("volumeattachment") ||
		capability.includes("resourceclass");
}
