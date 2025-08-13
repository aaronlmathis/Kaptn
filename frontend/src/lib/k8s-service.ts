/**
 * Main K8s Service - Unified API for all Kubernetes resource operations
 * 
 * This file provides the main K8sService class that composes functionality from
 * all resource-specific modules into a single, unified interface. This allows
 * components to import a single service instance while maintaining the modular
 * structure of the underlying implementation.
 */

// Import all resource-specific operations
import {
	getPods,
	getPod,
	deletePod,
	getDeployments,
	getStatefulSets,
	getDaemonSets,
	getReplicaSets,
	getJobs,
	getJob,
	getCronJobs,
	getCronJob,
	type Pod,
	type Deployment,
	type StatefulSet,
	type DaemonSet,
	type ReplicaSet,
	type Job,
	type CronJob
} from './k8s-workloads';

import {
	getServices,
	getEndpoints,
	getEndpoint,
	getEndpointSlices,
	getEndpointSlice,
	getIngresses,
	getIngress,
	getNetworkPolicies,
	getNetworkPolicy,
	type Service,
	type Endpoints,
	type EndpointSlice,
	type Ingress,
	type NetworkPolicy
} from './k8s-services';

import {
	getRoles,
	getRole,
	getRoleBindings,
	getRoleBinding,
	type Role,
	type RoleBinding
} from './k8s-rbac';

import {
	getConfigMaps,
	getConfigMap,
	getPersistentVolumes,
	getPersistentVolume,
	getPersistentVolumeClaims,
	getPersistentVolumeClaim,
	getStorageClasses,
	getStorageClass,
	getVolumeSnapshots,
	getVolumeSnapshot,
	getVolumeSnapshotClasses,
	getVolumeSnapshotClass,
	getCSIDrivers,
	getCSIDriver,
	type ConfigMap,
	type PersistentVolume,
	type PersistentVolumeClaim,
	type StorageClass,
	type VolumeSnapshot,
	type VolumeSnapshotClass,
	type CSIDriver
} from './k8s-storage';

import {
	getNodes,
	getNode,
	cordonNode,
	uncordonNode,
	drainNode,
	getNamespaces,
	getNamespace,
	deleteNamespace,
	getResourceQuotas,
	getResourceQuota,
	deleteResourceQuota,
	getAPIResources,
	getAPIResource,
	getOverview,
	type Node,
	type Namespace,
	type ResourceQuota,
	type APIResource,
	type OverviewData
} from './k8s-cluster';

import {
	applyYaml,
	scaleResource,
	exportResource
} from './k8s-common';

/**
 * Main K8s Service class that provides a unified interface to all Kubernetes operations.
 * 
 * This class composes functionality from all resource-specific modules while maintaining
 * the same API surface as the original monolithic service. Components can use this service
 * without needing to know about the underlying modular structure.
 */
export class K8sService {
	// Pod operations
	async getPods(namespace?: string): Promise<Pod[]> {
		return getPods(namespace);
	}

	async getPod(namespace: string, name: string): Promise<Pod> {
		return getPod(namespace, name);
	}

	async deletePod(namespace: string, name: string): Promise<{ success: boolean; message: string }> {
		return deletePod(namespace, name);
	}

	// Node operations
	async getNodes(): Promise<Node[]> {
		return getNodes();
	}

	async getNode(name: string): Promise<Node> {
		return getNode(name);
	}

	async cordonNode(nodeName: string): Promise<{ success: boolean; message: string }> {
		return cordonNode(nodeName);
	}

	async uncordonNode(nodeName: string): Promise<{ success: boolean; message: string }> {
		return uncordonNode(nodeName);
	}

	async drainNode(
		nodeName: string,
		options: { timeoutSeconds?: number; force?: boolean; deleteLocalData?: boolean; ignoreDaemonSets?: boolean } = {}
	): Promise<{ jobId: string; message: string; status: string }> {
		return drainNode(nodeName, options);
	}

	// Service operations
	async getServices(namespace?: string): Promise<Service[]> {
		return getServices(namespace);
	}

	// Deployment operations
	async getDeployments(namespace?: string): Promise<Deployment[]> {
		return getDeployments(namespace);
	}

	// StatefulSet operations
	async getStatefulSets(namespace?: string): Promise<StatefulSet[]> {
		return getStatefulSets(namespace);
	}

	// DaemonSet operations
	async getDaemonSets(namespace?: string): Promise<DaemonSet[]> {
		return getDaemonSets(namespace);
	}

	// ReplicaSet operations
	async getReplicaSets(namespace?: string): Promise<ReplicaSet[]> {
		return getReplicaSets(namespace);
	}

	// Job operations
	async getJobs(namespace?: string): Promise<Job[]> {
		return getJobs(namespace);
	}

	async getJob(namespace: string, name: string): Promise<Job> {
		return getJob(namespace, name);
	}

	// CronJob operations
	async getCronJobs(namespace?: string): Promise<CronJob[]> {
		return getCronJobs(namespace);
	}

	async getCronJob(namespace: string, name: string): Promise<CronJob> {
		return getCronJob(namespace, name);
	}

	// Endpoints operations
	async getEndpoints(namespace?: string): Promise<Endpoints[]> {
		return getEndpoints(namespace);
	}

	async getEndpoint(namespace: string, name: string): Promise<Endpoints> {
		return getEndpoint(namespace, name);
	}

	// EndpointSlices operations
	async getEndpointSlices(namespace?: string): Promise<EndpointSlice[]> {
		return getEndpointSlices(namespace);
	}

	async getEndpointSlice(namespace: string, name: string): Promise<{ summary: EndpointSlice; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getEndpointSlice(namespace, name);
	}

	// ConfigMap operations
	async getConfigMaps(namespace?: string): Promise<ConfigMap[]> {
		return getConfigMaps(namespace);
	}

	async getConfigMap(namespace: string, name: string): Promise<{ summary: ConfigMap; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getConfigMap(namespace, name);
	}

	// PersistentVolume operations
	async getPersistentVolumes(): Promise<PersistentVolume[]> {
		return getPersistentVolumes();
	}

	async getPersistentVolume(name: string): Promise<{ summary: PersistentVolume; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getPersistentVolume(name);
	}

	// PersistentVolumeClaim operations
	async getPersistentVolumeClaims(namespace?: string): Promise<PersistentVolumeClaim[]> {
		return getPersistentVolumeClaims(namespace);
	}

	async getPersistentVolumeClaim(namespace: string, name: string): Promise<{ summary: PersistentVolumeClaim; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getPersistentVolumeClaim(namespace, name);
	}

	// StorageClass operations
	async getStorageClasses(): Promise<StorageClass[]> {
		return getStorageClasses();
	}

	async getStorageClass(name: string): Promise<{ summary: StorageClass; parameters: Record<string, string>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getStorageClass(name);
	}

	// CSIDriver operations
	async getCSIDrivers(): Promise<CSIDriver[]> {
		return getCSIDrivers();
	}

	async getCSIDriver(name: string): Promise<{ summary: CSIDriver; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getCSIDriver(name);
	}

	// VolumeSnapshotClass operations
	async getVolumeSnapshotClasses(): Promise<VolumeSnapshotClass[]> {
		return getVolumeSnapshotClasses();
	}

	async getVolumeSnapshotClass(name: string): Promise<{ summary: VolumeSnapshotClass; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getVolumeSnapshotClass(name);
	}

	// VolumeSnapshot operations
	async getVolumeSnapshots(namespace?: string): Promise<VolumeSnapshot[]> {
		return getVolumeSnapshots(namespace);
	}

	async getVolumeSnapshot(namespace: string, name: string): Promise<{ summary: VolumeSnapshot; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getVolumeSnapshot(namespace, name);
	}

	// Ingress operations
	async getIngresses(namespace?: string): Promise<Ingress[]> {
		return getIngresses(namespace);
	}

	async getIngress(namespace: string, name: string): Promise<{ summary: Ingress; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getIngress(namespace, name);
	}

	// Network Policy operations
	async getNetworkPolicies(namespace?: string): Promise<NetworkPolicy[]> {
		return getNetworkPolicies(namespace);
	}

	async getNetworkPolicy(namespace: string, name: string): Promise<{ summary: NetworkPolicy; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getNetworkPolicy(namespace, name);
	}

	// Role operations
	async getRoles(namespace?: string): Promise<Role[]> {
		return getRoles(namespace);
	}

	async getRole(namespace: string, name: string): Promise<{ summary: Role; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getRole(namespace, name);
	}

	// RoleBinding operations
	async getRoleBindings(namespace?: string): Promise<RoleBinding[]> {
		return getRoleBindings(namespace);
	}

	async getRoleBinding(namespace: string, name: string): Promise<{ summary: RoleBinding; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getRoleBinding(namespace, name);
	}

	// Namespace operations
	async getNamespaces(): Promise<Namespace[]> {
		return getNamespaces();
	}

	async getNamespace(name: string): Promise<{ summary: Namespace; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getNamespace(name);
	}

	async deleteNamespace(name: string): Promise<{ success: boolean; message: string }> {
		return deleteNamespace(name);
	}

	// ResourceQuota operations
	async getResourceQuotas(namespace?: string): Promise<ResourceQuota[]> {
		return getResourceQuotas(namespace);
	}

	async getResourceQuota(namespace: string, name: string): Promise<{ summary: ResourceQuota; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		return getResourceQuota(namespace, name);
	}

	async deleteResourceQuota(namespace: string, name: string): Promise<{ success: boolean; message: string }> {
		return deleteResourceQuota(namespace, name);
	}

	// YAML operations
	async applyYaml(
		namespace: string,
		yaml: string,
		options: { dryRun?: boolean; force?: boolean } = {}
	): Promise<{ success: boolean; resources: Array<{ name: string; action: string }>; errors?: string[] }> {
		return applyYaml(namespace, yaml, options);
	}

	// Scale operations
	async scaleResource(
		namespace: string,
		kind: string,
		name: string,
		replicas: number
	): Promise<{ success: boolean; message: string }> {
		return scaleResource(namespace, kind, name, replicas);
	}

	// Export operations
	async exportResource(namespace: string, kind: string, name: string): Promise<Record<string, unknown>> {
		return exportResource(namespace, kind, name);
	}

	// Overview operations
	async getOverview(): Promise<OverviewData> {
		return getOverview();
	}

	// API Resource operations
	async getAPIResources(): Promise<APIResource[]> {
		return getAPIResources();
	}

	async getAPIResource(name: string): Promise<APIResource> {
		return getAPIResource(name);
	}
}

// Global K8s service instance - this maintains the same export pattern as the original
export const k8sService = new K8sService();

// Re-export all types from the individual modules for convenience
export type * from './k8s-workloads';
export type * from './k8s-services';
export type * from './k8s-storage';
export type * from './k8s-cluster';
export type * from './k8s-rbac';
