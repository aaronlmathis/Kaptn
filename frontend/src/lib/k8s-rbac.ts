/**
 * Kubernetes RBAC API
 * 
 * This module handles all RBAC-related Kubernetes resources including:
 * - Roles
 * - RoleBindings
 */

import { apiClient } from './api-client';

// Role interfaces based on the actual backend API response
export interface Role {
	name: string;
	namespace: string;
	age: string;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
	rules: number;
	rulesDisplay: string; // Backend now returns a formatted string, not an array
}

// RoleBinding interfaces based on the actual backend API response
export interface RoleBinding {
	name: string;
	namespace: string;
	age: string;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
	roleKind: string;
	roleName: string;
	roleRef: string;
	subjects: number;
	subjectsDisplay: string; // Backend now returns a formatted string, not an array
}

// Dashboard interfaces for transformed data that matches the current UI schema
export interface DashboardRole {
	id: number;
	name: string;
	namespace: string;
	age: string;
	rules: number;
	rulesDisplay: string;
}

export interface DashboardRoleBinding {
	id: number;
	name: string;
	namespace: string;
	age: string;
	roleRef: string;
	subjects: number;
	subjectsDisplay: string;
}

/**
 * Role operations
 */

export async function getRoles(namespace?: string): Promise<Role[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: Role[] }; status: string }>(`/roles${query}`);
	return response.data?.items || [];
}

export async function getRole(namespace: string, name: string): Promise<{ summary: Role; rules: Array<Record<string, unknown>>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: Role; rules: Array<Record<string, unknown>>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/roles/${namespace}/${name}`);
	return response.data;
}

/**
 * RoleBinding operations
 */

export async function getRoleBindings(namespace?: string): Promise<RoleBinding[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: RoleBinding[] }; status: string }>(`/role-bindings${query}`);
	return response.data?.items || [];
}

export async function getRoleBinding(namespace: string, name: string): Promise<{ summary: RoleBinding; subjects: Array<Record<string, unknown>>; roleRef: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: RoleBinding; subjects: Array<Record<string, unknown>>; roleRef: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/role-bindings/${namespace}/${name}`);
	return response.data;
}

/**
 * Transform functions to convert backend data to UI-compatible format
 */

export function transformRolesToUI(roles: Role[]): DashboardRole[] {
	if (!roles || !Array.isArray(roles)) {
		return [];
	}
	return roles.map((role, index) => ({
		id: index + 1,
		name: role.name,
		namespace: role.namespace,
		age: role.age,
		rules: role.rules,
		rulesDisplay: role.rulesDisplay || '<none>' // Use the backend's formatted string directly
	}));
}

export function transformRoleBindingsToUI(roleBindings: RoleBinding[]): DashboardRoleBinding[] {
	if (!roleBindings || !Array.isArray(roleBindings)) {
		return [];
	}
	return roleBindings.map((roleBinding, index) => ({
		id: index + 1,
		name: roleBinding.name,
		namespace: roleBinding.namespace,
		age: roleBinding.age,
		roleRef: roleBinding.roleRef,
		subjects: roleBinding.subjects,
		subjectsDisplay: roleBinding.subjectsDisplay || '<none>' // Use the backend's formatted string directly
	}));
}

/**
 * Utility functions
 */

// No utility functions needed anymore - backend handles formatting
