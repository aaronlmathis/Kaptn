// RBAC types for the builder

export interface Identity {
	name: string;
	kind: 'User' | 'Group' | 'ServiceAccount';
	namespace: string;
	fullName: string;
	id: string;
}

export interface Namespace {
	metadata: {
		name: string;
		labels?: Record<string, string>;
		annotations?: Record<string, string>;
	};
	name: string; // Computed field for convenience
}

export interface ApiResource {
	group: string;
	version: string;
	name: string;
	namespaced: boolean;
	kind: string;
	verbs: string[];
}

export interface ApiGroup {
	name: string;
	versions: string[];
	preferredVersion: string;
}

export interface RBACPermissionRule {
	apiGroups: string[];
	resources: string[];
	resourceNames?: string[];
	verbs: string[];
}

export interface RBACFormData {
	identityType: 'User' | 'Group';
	identityName: string;
	scope: 'Cluster' | 'Namespace';
	namespace?: string;
	roleName: string;
	permissions: RBACPermissionRule[];
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
}

export interface GeneratedYAML {
	role: string;
	binding: string;
}

export interface ApplyResult {
	success: boolean;
	error?: string;
	message?: string;
}

// Common Kubernetes verbs
export const KUBERNETES_VERBS = [
	'get',
	'list',
	'watch',
	'create',
	'update',
	'patch',
	'delete',
	'deletecollection'
] as const;

export type KubernetesVerb = typeof KUBERNETES_VERBS[number];
