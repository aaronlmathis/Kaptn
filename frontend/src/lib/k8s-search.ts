import { apiClient } from './api-client';

// Search result interfaces
export interface SearchResult {
	id: string;
	name: string;
	namespace?: string;
	resourceType: string;
	kind: string;
	url: string;
	labels?: Record<string, string>;
	creationTimestamp?: string;
	age?: string;
}

export interface SearchResponse {
	results: SearchResult[];
	total: number;
	query: string;
}

export interface GroupedSearchResults {
	[resourceType: string]: SearchResult[];
}

/**
 * Search across all Kubernetes resources
 * @param query - Search query string
 * @param resourceTypes - Optional array of resource types to filter by
 * @param namespace - Optional namespace to search within
 * @returns Grouped search results
 */
export async function searchResources(
	query: string,
	resourceTypes?: string[],
	namespace?: string
): Promise<GroupedSearchResults> {
	if (!query.trim()) {
		return {};
	}

	try {
		const params = new URLSearchParams({
			q: query.trim(),
		});

		if (resourceTypes && resourceTypes.length > 0) {
			params.append('types', resourceTypes.join(','));
		}

		if (namespace) {
			params.append('namespace', namespace);
		}

		const response = await apiClient.get<{ data: SearchResponse; status: string }>(
			`/search?${params.toString()}`
		);

		const results = response.data?.results || [];

		// Group results by resource type
		const grouped = results.reduce((acc, result) => {
			if (!acc[result.resourceType]) {
				acc[result.resourceType] = [];
			}
			acc[result.resourceType].push(result);
			return acc;
		}, {} as GroupedSearchResults);

		return grouped;
	} catch (error) {
		console.error('Search error:', error);
		throw error;
	}
}

/**
 * Generate URL for a resource based on its type and identifiers
 */
export function generateResourceUrl(result: SearchResult): string {
	const { resourceType, name, namespace } = result;

	// Map resource types to their URL patterns
	const urlMappings: Record<string, string> = {
		pods: namespace ? `/pods/${namespace}/${name}` : `/pods/${name}`,
		deployments: namespace ? `/deployments/${namespace}/${name}` : `/deployments/${name}`,
		services: namespace ? `/services/${namespace}/${name}` : `/services/${name}`,
		configmaps: namespace ? `/config-maps/${namespace}/${name}` : `/config-maps/${name}`,
		secrets: namespace ? `/secrets/${namespace}/${name}` : `/secrets/${name}`,
		nodes: `/nodes/${name}`,
		namespaces: `/namespaces/${name}`,
		'persistent-volumes': `/persistent-volumes/${name}`,
		'persistent-volume-claims': namespace ? `/persistent-volume-claims/${namespace}/${name}` : `/persistent-volume-claims/${name}`,
		'storage-classes': `/storage-classes/${name}`,
		ingresses: namespace ? `/ingresses/${namespace}/${name}` : `/ingresses/${name}`,
		'network-policies': namespace ? `/network-policies/${namespace}/${name}` : `/network-policies/${name}`,
		endpoints: namespace ? `/endpoints/${namespace}/${name}` : `/endpoints/${name}`,
		'endpoint-slices': namespace ? `/endpoint-slices/${namespace}/${name}` : `/endpoint-slices/${name}`,
		statefulsets: namespace ? `/statefulsets/${namespace}/${name}` : `/statefulsets/${name}`,
		daemonsets: namespace ? `/daemonsets/${namespace}/${name}` : `/daemonsets/${name}`,
		replicasets: namespace ? `/replicasets/${namespace}/${name}` : `/replicasets/${name}`,
		jobs: namespace ? `/jobs/${namespace}/${name}` : `/jobs/${name}`,
		cronjobs: namespace ? `/cronjobs/${namespace}/${name}` : `/cronjobs/${name}`,
		'service-accounts': namespace ? `/service-accounts/${namespace}/${name}` : `/service-accounts/${name}`,
		roles: namespace ? `/roles/${namespace}/${name}` : `/roles/${name}`,
		rolebindings: namespace ? `/roles/${namespace}/${name}` : `/roles/${name}`,
		clusterroles: `/cluster-roles/${name}`,
		clusterrolebindings: `/cluster-roles/${name}`,
		'resource-quotas': namespace ? `/resource-quotas/${namespace}/${name}` : `/resource-quotas/${name}`,
		'volume-snapshots': namespace ? `/volume-snapshots/${namespace}/${name}` : `/volume-snapshots/${name}`,
		'volume-snapshot-classes': `/volume-snapshot-classes/${name}`,
		'csi-drivers': `/csi-drivers/${name}`,
	};

	return urlMappings[resourceType] || result.url || `/${resourceType}/${name}`;
}

/**
 * Get display name for resource types
 */
export function getResourceTypeDisplayName(resourceType: string): string {
	const displayNames: Record<string, string> = {
		pods: 'Pods',
		deployments: 'Deployments',
		services: 'Services',
		configmaps: 'ConfigMaps',
		secrets: 'Secrets',
		nodes: 'Nodes',
		namespaces: 'Namespaces',
		'persistent-volumes': 'Persistent Volumes',
		'persistent-volume-claims': 'Persistent Volume Claims',
		'storage-classes': 'Storage Classes',
		ingresses: 'Ingresses',
		'network-policies': 'Network Policies',
		endpoints: 'Endpoints',
		'endpoint-slices': 'Endpoint Slices',
		statefulsets: 'StatefulSets',
		daemonsets: 'DaemonSets',
		replicasets: 'ReplicaSets',
		jobs: 'Jobs',
		cronjobs: 'CronJobs',
		'service-accounts': 'Service Accounts',
		roles: 'Roles',
		rolebindings: 'Role Bindings',
		clusterroles: 'Cluster Roles',
		clusterrolebindings: 'Cluster Role Bindings',
		'resource-quotas': 'Resource Quotas',
		'volume-snapshots': 'Volume Snapshots',
		'volume-snapshot-classes': 'Volume Snapshot Classes',
		'csi-drivers': 'CSI Drivers',
	};

	return displayNames[resourceType] || resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
}

/**
 * Mock search function for development/fallback
 */
export function mockSearchResources(query: string): GroupedSearchResults {
	if (!query.trim()) return {};

	// Mock data that simulates backend response
	const mockResults: SearchResult[] = [
		{
			id: `${query}-pod-1`,
			name: `${query}-pod-1`,
			namespace: 'default',
			resourceType: 'pods',
			kind: 'Pod',
			url: `/pods/default/${query}-pod-1`,
			age: '2d',
		},
		{
			id: `${query}-pod-2`,
			name: `${query}-pod-2`,
			namespace: 'kube-system',
			resourceType: 'pods',
			kind: 'Pod',
			url: `/pods/kube-system/${query}-pod-2`,
			age: '5d',
		},
		{
			id: `${query}-deployment`,
			name: `${query}-deployment`,
			namespace: 'default',
			resourceType: 'deployments',
			kind: 'Deployment',
			url: `/deployments/default/${query}-deployment`,
			age: '1w',
		},
		{
			id: `${query}-service`,
			name: `${query}-service`,
			namespace: 'default',
			resourceType: 'services',
			kind: 'Service',
			url: `/services/default/${query}-service`,
			age: '3d',
		},
		{
			id: `${query}-configmap`,
			name: `${query}-configmap`,
			namespace: 'default',
			resourceType: 'configmaps',
			kind: 'ConfigMap',
			url: `/config-maps/default/${query}-configmap`,
			age: '1d',
		},
		{
			id: `${query}-node`,
			name: `${query}-node`,
			resourceType: 'nodes',
			kind: 'Node',
			url: `/nodes/${query}-node`,
			age: '30d',
		},
	];

	// Filter by query
	const filteredResults = mockResults.filter(result =>
		result.name.toLowerCase().includes(query.toLowerCase())
	);

	// Group by resource type
	return filteredResults.reduce((acc, result) => {
		if (!acc[result.resourceType]) {
			acc[result.resourceType] = [];
		}
		acc[result.resourceType].push(result);
		return acc;
	}, {} as GroupedSearchResults);
}
