import { apiClient } from "@/lib/api-client"

// API Response Types
export interface ClusterRoleResponse {
	name: string
	creationTimestamp: string
	rules: number
	labels?: Record<string, string>
	annotations?: Record<string, string>
	resourceVersion: string
	uid: string
}

export interface ClusterRoleBindingResponse {
	name: string
	creationTimestamp: string
	roleRef: string
	subjects: number
	labels?: Record<string, string>
	annotations?: Record<string, string>
	resourceVersion: string
	uid: string
}

export interface ClusterRolesListResponse {
	items: ClusterRoleResponse[]
	totalCount: number
	page: number
	limit: number
}

export interface ClusterRoleBindingsListResponse {
	items: ClusterRoleBindingResponse[]
	totalCount: number
	page: number
	limit: number
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
	labels: Record<string, string>
	annotations: Record<string, string>
	resourceVersion: string
	uid: string
	age: string
	labelBadges: BadgeData[]
	annotationBadges: BadgeData[]
}

export interface ClusterRoleBindingUI {
	name: string
	creationTimestamp: Date
	roleRef: string
	subjects: number
	labels: Record<string, string>
	annotations: Record<string, string>
	resourceVersion: string
	uid: string
	age: string
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
export async function getClusterRoles(
	page = 1,
	limit = 50,
	sortBy = "name",
	sortOrder = "asc",
	search?: string
): Promise<ClusterRolesListResponse> {
	const params = new URLSearchParams({
		page: page.toString(),
		limit: limit.toString(),
		sortBy,
		sortOrder,
	})

	if (search) {
		params.append("search", search)
	}

	const response = await apiClient.get(`cluster-roles?${params}`) as { data: ClusterRolesListResponse }
	return response.data
}

export async function getClusterRole(name: string): Promise<ClusterRoleResponse> {
	const response = await apiClient.get(`cluster-roles/${encodeURIComponent(name)}`) as { data: ClusterRoleResponse }
	return response.data
}

export async function getClusterRoleBindings(
	page = 1,
	limit = 50,
	sortBy = "name",
	sortOrder = "asc",
	search?: string
): Promise<ClusterRoleBindingsListResponse> {
	const params = new URLSearchParams({
		page: page.toString(),
		limit: limit.toString(),
		sortBy,
		sortOrder,
	})

	if (search) {
		params.append("search", search)
	}

	const response = await apiClient.get(`cluster-role-bindings?${params}`) as { data: ClusterRoleBindingsListResponse }
	return response.data
}

export async function getClusterRoleBinding(name: string): Promise<ClusterRoleBindingResponse> {
	const response = await apiClient.get(`cluster-role-bindings/${encodeURIComponent(name)}`) as { data: ClusterRoleBindingResponse }
	return response.data
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
		age: formatAge(clusterRole.creationTimestamp),
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
		age: formatAge(clusterRoleBinding.creationTimestamp),
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
		id: index + 1,
		name: clusterRole.name,
		age: formatAge(clusterRole.creationTimestamp),
		rules: clusterRole.rules,
		rulesDisplay: clusterRole.rules === 1 ? "1 rule" : `${clusterRole.rules} rules`
	}))
}

export function transformClusterRoleBindingsToDashboard(clusterRoleBindings: ClusterRoleBindingResponse[]): DashboardClusterRoleBinding[] {
	if (!clusterRoleBindings || !Array.isArray(clusterRoleBindings)) {
		return []
	}
	return clusterRoleBindings.map((clusterRoleBinding, index) => ({
		id: index + 1,
		name: clusterRoleBinding.name,
		age: formatAge(clusterRoleBinding.creationTimestamp),
		roleRef: clusterRoleBinding.roleRef,
		subjects: clusterRoleBinding.subjects,
		subjectsDisplay: clusterRoleBinding.subjects === 1 ? "1 subject" : `${clusterRoleBinding.subjects} subjects`
	}))
}
