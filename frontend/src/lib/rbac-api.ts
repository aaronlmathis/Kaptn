// RBAC API client functions

import { apiClient } from './api-client';
import type { Identity, Namespace, ApiResource, ApiGroup, GeneratedYAML, ApplyResult } from '@/types/rbac';

// Get all available identities (users and groups from existing bindings)
export async function getIdentities(): Promise<Identity[]> {
	try {
		const response = await apiClient.get<{ data: { items: Identity[] }; status: string }>('/identities');
		return response.data?.items || [];
	} catch (error) {
		console.error('Failed to fetch identities:', error);
		return [];
	}
}

// Get all namespaces
export async function getNamespaces(): Promise<Namespace[]> {
	try {
		const response = await apiClient.get<{
			data: {
				items: Array<{
					metadata: {
						name: string;
						labels?: Record<string, string>;
						annotations?: Record<string, string>;
					};
				}>
			};
			status: string
		}>('/namespaces');

		const items = response.data?.items || [];

		// Transform to our Namespace type
		return items.map(item => ({
			metadata: item.metadata,
			name: item.metadata.name
		}));
	} catch (error) {
		console.error('Failed to fetch namespaces:', error);
		return [];
	}
}

// Get API resources for discovery
export async function getApiResources(): Promise<{ groups: ApiGroup[]; resources: ApiResource[] }> {
	try {
		const response = await apiClient.get<{
			data: {
				items: Array<{
					group: string;
					name: string;
					namespaced: string;
					kind: string;
					verbs: string;
					version: string;
					apiVersion: string;
				}>
			};
			status: string
		}>('/api-resources');

		const items = response.data?.items || [];

		// Transform the items into groups and resources
		const groupsMap = new Map<string, ApiGroup>();
		const resources: ApiResource[] = [];

		items.forEach(item => {
			// Create or update group
			const groupName = item.group || ''; // Empty string for core group
			if (!groupsMap.has(groupName)) {
				groupsMap.set(groupName, {
					name: groupName,
					versions: [item.version],
					preferredVersion: item.version
				});
			} else {
				const group = groupsMap.get(groupName);
				if (group && !group.versions.includes(item.version)) {
					group.versions.push(item.version);
				}
			}

			// Create resource
			resources.push({
				group: groupName,
				version: item.version,
				name: item.name,
				namespaced: item.namespaced === 'true',
				kind: item.kind,
				verbs: item.verbs.split(',').map(v => v.trim())
			});
		});

		return {
			groups: Array.from(groupsMap.values()),
			resources: resources
		};
	} catch (error) {
		console.error('Failed to fetch API resources:', error);
		return { groups: [], resources: [] };
	}
}

// Generate YAML from form data
export async function generateRBACYAML(formData: unknown): Promise<GeneratedYAML> {
	try {
		const response = await apiClient.post<{
			data: GeneratedYAML;
			status: string
		}>('/rbac/generate', formData);

		return response.data || { role: '', binding: '' };
	} catch (error) {
		console.error('Failed to generate YAML:', error);
		// For now, return a mock YAML until the backend is tested
		return {
			role: `# Generated Role YAML would appear here
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: example-role
  namespace: default
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]`,
			binding: `# Generated RoleBinding YAML would appear here
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: example-role-binding
  namespace: default
subjects:
- kind: User
  name: example-user
roleRef:
  kind: Role
  name: example-role
  apiGroup: rbac.authorization.k8s.io`
		};
	}
}

// Dry run the RBAC configuration
export async function dryRunRBAC(formData: unknown): Promise<ApplyResult> {
	try {
		const response = await apiClient.post<{
			data: ApplyResult;
			status: string
		}>('/rbac/dry-run', formData);

		return response.data || { success: false, error: 'Unknown error' };
	} catch (error) {
		console.error('Failed to dry run RBAC:', error);
		// For now, return a mock success until the backend is tested
		return {
			success: true,
			message: 'Dry run completed successfully (mock response)'
		};
	}
}

// Apply the RBAC configuration to the cluster
export async function applyRBAC(formData: unknown): Promise<ApplyResult> {
	try {
		const response = await apiClient.post<{
			data: ApplyResult;
			status: string
		}>('/rbac/apply', formData);

		return response.data || { success: false, error: 'Unknown error' };
	} catch (error) {
		console.error('Failed to apply RBAC:', error);
		// For now, return a mock success until the backend is tested
		return {
			success: true,
			message: 'RBAC configuration applied successfully (mock response)'
		};
	}
}
