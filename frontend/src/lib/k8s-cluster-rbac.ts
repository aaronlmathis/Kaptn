import { apiClient } from "@/lib/api-client"

// API Response Types
export interface ClusterRoleResponse {
	id: number             // Backend provides ID field
	name: string
	creationTimestamp: string
	rules: number
	rulesDisplay: string    // Backend provides detailed display string
	age: string            // Backend provides age calculation
	labels?: Record<string, string>
	annotations?: Record<string, string>
	resourceVersion?: string
	uid?: string
	verbCount?: number
	resourceCount?: number
}

export interface ClusterRoleBindingResponse {
	id: number             // Backend provides ID field
	name: string
	creationTimestamp: string
	roleName?: string
	roleKind?: string
	roleRef: string        // Backend provides formatted role reference
	subjectCount?: number
	subjects: number       // Backend provides this field name too
	subjectsDisplay: string // Backend provides detailed display string
	age: string           // Backend provides age calculation
	userCount?: number
	groupCount?: number
	serviceAccountCount?: number
	labels?: Record<string, string>
	annotations?: Record<string, string>
}

// Badge type for UI components
export interface BadgeData {
	key: string
	value: string
	type: 'label' | 'annotation'
}

// UI Types (transformed for frontend)
export interface ClusterRoleUI {
	name: string
	creationTimestamp: Date
	rules: number
	rulesDisplay: string   // Backend provides detailed display
	labels: Record<string, string>
	annotations: Record<string, string>
	resourceVersion?: string
	uid?: string
	age: string           // Backend provides age calculation
	labelBadges: BadgeData[]
	annotationBadges: BadgeData[]
}

export interface ClusterRoleBindingUI {
	name: string
	creationTimestamp: Date
	roleRef: string       // Backend provides formatted role reference
	subjects: number
	subjectsDisplay: string // Backend provides detailed display
	labels: Record<string, string>
	annotations: Record<string, string>
	age: string          // Backend provides age calculation
	labelBadges: BadgeData[]
	annotationBadges: BadgeData[]
}

// Dashboard types for data table compatibility
export interface DashboardClusterRole {
	id: number
	name: string
	age: string
	rules: number
	rulesDisplay: string
}

export interface DashboardClusterRoleBinding {
	id: number
	name: string
	age: string
	roleRef: string
	subjects: number
	subjectsDisplay: string
}

// API Functions
export async function getClusterRoles(): Promise<ClusterRoleResponse[]> {
	const response = await apiClient.get<{ data: { items: ClusterRoleResponse[] }; status: string }>(`/cluster-roles`);
	return response.data?.items || [];
}

export async function getClusterRole(name: string): Promise<ClusterRoleResponse> {
	const response = await apiClient.get<{ data: ClusterRoleResponse; status: string }>(`cluster-roles/${encodeURIComponent(name)}`);
	return response.data;
}

export async function getClusterRoleBindings(): Promise<ClusterRoleBindingResponse[]> {
	const response = await apiClient.get<{ data: { items: ClusterRoleBindingResponse[] }; status: string }>(`/cluster-role-bindings`);
	return response.data?.items || [];
}

export async function getClusterRoleBinding(name: string): Promise<ClusterRoleBindingResponse> {
	const response = await apiClient.get<{ data: ClusterRoleBindingResponse; status: string }>(`cluster-role-bindings/${encodeURIComponent(name)}`);
	return response.data;
}

// Transform functions
function formatAge(creationTimestamp: string): string {
	const now = new Date()
	const created = new Date(creationTimestamp)
	const diffMs = now.getTime() - created.getTime()
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
	const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
	const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

	if (diffDays > 0) {
		return `${diffDays}d${diffHours > 0 ? ` ${diffHours}h` : ""}`
	} else if (diffHours > 0) {
		return `${diffHours}h${diffMinutes > 0 ? ` ${diffMinutes}m` : ""}`
	} else {
		return `${diffMinutes}m`
	}
}

export function transformClusterRolesToUI(clusterRoles: ClusterRoleResponse[]): ClusterRoleUI[] {
	return clusterRoles.map((clusterRole) => ({
		...clusterRole,
		creationTimestamp: new Date(clusterRole.creationTimestamp),
		labels: clusterRole.labels || {},
		annotations: clusterRole.annotations || {},
		// Use backend-provided age instead of calculating frontend
		age: clusterRole.age || formatAge(clusterRole.creationTimestamp),
		labelBadges: Object.entries(clusterRole.labels || {}).map(([key, value]) => ({ key, value, type: 'label' as const })),
		annotationBadges: Object.entries(clusterRole.annotations || {}).map(([key, value]) => ({ key, value, type: 'annotation' as const })),
	}))
}

export function transformClusterRoleBindingsToUI(clusterRoleBindings: ClusterRoleBindingResponse[]): ClusterRoleBindingUI[] {
	return clusterRoleBindings.map((clusterRoleBinding) => ({
		...clusterRoleBinding,
		creationTimestamp: new Date(clusterRoleBinding.creationTimestamp),
		labels: clusterRoleBinding.labels || {},
		annotations: clusterRoleBinding.annotations || {},
		// Use backend-provided age instead of calculating frontend
		age: clusterRoleBinding.age || formatAge(clusterRoleBinding.creationTimestamp),
		labelBadges: Object.entries(clusterRoleBinding.labels || {}).map(([key, value]) => ({ key, value, type: 'label' as const })),
		annotationBadges: Object.entries(clusterRoleBinding.annotations || {}).map(([key, value]) => ({ key, value, type: 'annotation' as const })),
	}))
}

// Transform functions for dashboard data table compatibility
export function transformClusterRolesToDashboard(clusterRoles: ClusterRoleResponse[]): DashboardClusterRole[] {
	if (!clusterRoles || !Array.isArray(clusterRoles)) {
		return []
	}
	return clusterRoles.map((clusterRole, index) => ({
		id: index + 1, // Use index-based ID like roles do
		name: clusterRole.name,
		age: clusterRole.age || formatAge(clusterRole.creationTimestamp), // Use backend age if available
		rules: clusterRole.rules,
		rulesDisplay: clusterRole.rulesDisplay || (clusterRole.rules === 1 ? "1 rule" : `${clusterRole.rules} rules`) // Use backend display if available
	}))
}

export function transformClusterRoleBindingsToDashboard(clusterRoleBindings: ClusterRoleBindingResponse[]): DashboardClusterRoleBinding[] {
	if (!clusterRoleBindings || !Array.isArray(clusterRoleBindings)) {
		return []
	}
	return clusterRoleBindings.map((clusterRoleBinding, index) => ({
		id: index + 1, // Use index-based ID like roles do
		name: clusterRoleBinding.name,
		age: clusterRoleBinding.age || formatAge(clusterRoleBinding.creationTimestamp), // Use backend age if available
		roleRef: clusterRoleBinding.roleRef || clusterRoleBinding.roleName || "", // Use backend roleRef if available
		subjects: clusterRoleBinding.subjects || clusterRoleBinding.subjectCount || 0, // Use backend subjects field if available
		subjectsDisplay: clusterRoleBinding.subjectsDisplay || (clusterRoleBinding.subjectCount === 1 ? "1 subject" : `${clusterRoleBinding.subjectCount || 0} subjects`) // Use backend display if available
	}))
}


