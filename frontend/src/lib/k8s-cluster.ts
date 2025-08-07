/**
 * k8s-cluster.ts
 * 
 * This file handles all cluster-level Kubernetes resources including Nodes,
 * Namespaces, ResourceQuotas, APIResources, and overview data.
 * 
 * Contains:
 * - Interface definitions for cluster-level resources
 * - Dashboard UI transformation interfaces
 * - Service methods for API operations
 * - Transform functions to convert backend data to UI format
 * - Utility functions for cluster operations
 */

import { apiClient } from './api-client';
import { calculateAge } from './k8s-common';

// ===== CLUSTER RESOURCE INTERFACES =====

// Node interfaces based on the actual backend API response
export interface Node {
	name: string;
	roles: string[];
	age: string;
	creationTimestamp: string;
	status: {
		ready: boolean;
		unschedulable: boolean;
		conditions: Array<{
			type: string;
			status: string;
			lastTransitionTime: string;
			message: string;
			reason: string;
		}>;
	};
	capacity: {
		cpu: string;
		memory: string;
		[key: string]: string;
	};
	allocatable: {
		cpu: string;
		memory: string;
		[key: string]: string;
	};
	nodeInfo: {
		kubeletVersion: string;
		osImage: string;
		containerRuntime: string;
		architecture: string;
		kernel: string;
	};
	labels: Record<string, string>;
	taints?: Array<{
		key: string;
		value?: string;
		effect: string;
	}> | null;
}

export interface NodeTableRow {
	id: number;
	name: string;
	status: string;
	roles: string;
	age: string;
	version: string;
}

// Namespace interface based on the actual backend API response
export interface Namespace {
	metadata: {
		name: string;
		creationTimestamp: string;
		labels?: Record<string, string>;
		annotations?: Record<string, string>;
	};
	status: {
		phase: string;
	};
	spec?: {
		finalizers?: string[];
	};
}

export interface DashboardNamespace {
	id: string;
	name: string;
	status: string;
	age: string;
	labelsCount: number;
	annotationsCount: number;
}

// ResourceQuota interfaces based on the actual backend API response
export interface ResourceQuota {
	name: string;
	namespace: string;
	age: string;
	hardLimits: Array<{
		name: string;
		limit: string;
		used: string;
	}>;
	usedResources: Array<{
		name: string;
		quantity: string;
	}>;
	hardResourcesCount: number;
	usedResourcesCount: number;
	labelsCount: number;
	annotationsCount: number;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
}

export interface DashboardResourceQuota {
	id: string;
	name: string;
	namespace: string;
	age: string;
	hardLimits: Array<{
		name: string;
		limit: string;
		used: string;
	}>;
	usedResources: Array<{
		name: string;
		quantity: string;
	}>;
	hardResourcesCount: number;
	usedResourcesCount: number;
	labelsCount: number;
	annotationsCount: number;
}

// API Resource interfaces based on the backend API response
export interface APIResource {
	id: string;
	name: string;
	singularName: string;
	shortNames: string;     // Backend returns comma-separated string, not array
	kind: string;
	group: string;
	version: string;
	apiVersion: string;
	namespaced: string;     // Backend returns "true" or "false" as string, not boolean
	categories: string;     // Backend returns comma-separated string, not array
	verbs: string;          // Backend returns comma-separated string, not array
}

export interface DashboardAPIResource {
	id: number;
	name: string;
	singularName: string;
	shortNames: string;
	kind: string;
	group: string;
	version: string;
	apiVersion: string;
	namespaced: string;
	categories: string;
	verbs: string;
}

// Overview data interface
export interface OverviewData {
	pods: {
		running: number;
		total: number;
		pending: number;
	};
	nodes: {
		ready: number;
		total: number;
	};
	cpu: {
		usagePercent: number;
	};
	memory: {
		usagePercent: number;
	};
	advisories: string[];
	asOf: string;
}

// ===== SERVICE METHODS =====

// Node operations
export async function getNodes(): Promise<Node[]> {
	const response = await apiClient.get<{ data: { items: Node[] }; status: string }>('/nodes');
	return response.data?.items || [];
}

export async function getNode(name: string): Promise<Node> {
	const response = await apiClient.get<{ data: Node; status: string }>(`/nodes/${name}`);
	return response.data;
}

export async function cordonNode(nodeName: string): Promise<{ success: boolean; message: string }> {
	return apiClient.post(`/nodes/${nodeName}/cordon`);
}

export async function uncordonNode(nodeName: string): Promise<{ success: boolean; message: string }> {
	return apiClient.post(`/nodes/${nodeName}/uncordon`);
}

export async function drainNode(
	nodeName: string,
	options: { timeoutSeconds?: number; force?: boolean; deleteLocalData?: boolean; ignoreDaemonSets?: boolean } = {}
): Promise<{ jobId: string; message: string; status: string }> {
	return apiClient.post(`/nodes/${nodeName}/drain`, options);
}

// Namespace operations
export async function getNamespaces(): Promise<Namespace[]> {
	const response = await apiClient.get<{ data: { items: Namespace[] }; status: string }>('/namespaces');
	return response.data?.items || [];
}

export async function getNamespace(name: string): Promise<{ summary: Namespace; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: Namespace; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/namespaces/${name}`);
	return response.data;
}

export async function deleteNamespace(name: string): Promise<{ success: boolean; message: string }> {
	return apiClient.delete(`/namespaces/${name}`);
}

// ResourceQuota operations
export async function getResourceQuotas(namespace?: string): Promise<ResourceQuota[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: ResourceQuota[] }; status: string }>(`/resource-quotas${query}`);
	return response.data?.items || [];
}

export async function getResourceQuota(namespace: string, name: string): Promise<{ summary: ResourceQuota; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: ResourceQuota; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/resource-quotas/${namespace}/${name}`);
	return response.data;
}

export async function deleteResourceQuota(namespace: string, name: string): Promise<{ success: boolean; message: string }> {
	return apiClient.delete(`/resource-quotas/${namespace}/${name}`);
}

// API Resource operations
export async function getAPIResources(): Promise<APIResource[]> {
	const response = await apiClient.get<{ data: { items: APIResource[] }; status: string }>('/api-resources');
	return response.data?.items || [];
}

export async function getAPIResource(name: string): Promise<APIResource> {
	const response = await apiClient.get<{ data: APIResource; status: string }>(`/api-resources/${name}`);
	return response.data;
}

// Overview operations
export async function getOverview(): Promise<OverviewData> {
	const response = await apiClient.get<{ data: OverviewData; status: string }>('/overview');
	return response.data;
}

// ===== UTILITY FUNCTIONS =====

export function getNodeStatus(status: Node['status']): string {
	return status.ready ? 'Ready' : 'NotReady';
}

export function formatNodeRoles(roles: string[]): string {
	return roles.join(', ') || '<none>';
}

// ===== TRANSFORM FUNCTIONS =====

export function transformNodesToUI(nodes: Node[]): NodeTableRow[] {
	if (!nodes || !Array.isArray(nodes)) {
		return [];
	}
	return nodes.map((node, index) => ({
		id: index,
		name: node.name,
		status: getNodeStatus(node.status),
		roles: formatNodeRoles(node.roles),
		age: node.age,
		version: node.nodeInfo.kubeletVersion
	}));
}

export function transformNamespacesToUI(namespaces: Namespace[]): DashboardNamespace[] {
	if (!namespaces || !Array.isArray(namespaces)) {
		return [];
	}
	return namespaces.map((namespace) => ({
		id: namespace.metadata.name,
		name: namespace.metadata.name,
		status: namespace.status.phase,
		age: calculateAge(namespace.metadata.creationTimestamp),
		labelsCount: namespace.metadata.labels ? Object.keys(namespace.metadata.labels).length : 0,
		annotationsCount: namespace.metadata.annotations ? Object.keys(namespace.metadata.annotations).length : 0,
	}));
}

export function transformResourceQuotasToUI(resourceQuotas: ResourceQuota[]): DashboardResourceQuota[] {
	if (!resourceQuotas || !Array.isArray(resourceQuotas)) {
		return [];
	}
	return resourceQuotas.map((rq) => ({
		id: `${rq.namespace}-${rq.name}`,
		name: rq.name,
		namespace: rq.namespace,
		age: rq.age,
		hardLimits: rq.hardLimits,
		usedResources: rq.usedResources,
		hardResourcesCount: rq.hardResourcesCount,
		usedResourcesCount: rq.usedResourcesCount,
		labelsCount: rq.labelsCount,
		annotationsCount: rq.annotationsCount,
	}));
}

export function transformAPIResourcesToUI(apiResources: APIResource[]): DashboardAPIResource[] {
	if (!apiResources || !Array.isArray(apiResources)) {
		return [];
	}
	return apiResources.map((resource, index) => ({
		id: index + 1,
		name: resource.name,
		singularName: resource.singularName,
		shortNames: resource.shortNames || '',  // Already a string from backend
		kind: resource.kind,
		group: resource.group || 'core',
		version: resource.version,
		apiVersion: resource.apiVersion,
		namespaced: resource.namespaced === 'true' ? 'Yes' : 'No',  // Convert string to Yes/No
		categories: resource.categories || '',  // Already a string from backend
		verbs: resource.verbs || '',  // Already a string from backend
	}));
}
