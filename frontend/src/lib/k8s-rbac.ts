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
	rulesDisplay: string[];
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
	subjectsDisplay: string[];
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

export async function getRole(namespace: string, name: string): Promise<{ summary: Role; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: Role; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/roles/${namespace}/${name}`);
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

export async function getRoleBinding(namespace: string, name: string): Promise<{ summary: RoleBinding; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: RoleBinding; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/role-bindings/${namespace}/${name}`);
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
		rulesDisplay: formatRulesDisplay(role.rulesDisplay)
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
		subjectsDisplay: formatSubjectsDisplay(roleBinding.subjectsDisplay)
	}));
}

/**
 * Utility functions
 */

function formatRulesDisplay(rules?: string[]): string {
	if (!rules || rules.length === 0) return '<none>';
	if (rules.length === 1) return rules[0];
	return `${rules[0]} +${rules.length - 1} more`;
}

function formatSubjectsDisplay(subjects?: string[]): string {
	if (!subjects || subjects.length === 0) return '<none>';
	if (subjects.length === 1) return subjects[0];
	return `${subjects[0]} +${subjects.length - 1} more`;
}
