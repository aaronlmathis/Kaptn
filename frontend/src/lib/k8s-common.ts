/**
 * k8s-common.ts
 * 
 * This file handles common operations that work across multiple Kubernetes resource types
 * and shared utility functions used throughout the application.
 * 
 * Contains:
 * - Common service methods that work with multiple resource types
 * - Utility functions for formatting and calculations
 * - Shared transformation helpers
 */

import { apiClient } from './api-client';

// ===== COMMON SERVICE METHODS =====

/**
 * Apply YAML content to a namespace
 * @param namespace The namespace to apply the YAML to
 * @param yaml The YAML content to apply
 * @param options Optional parameters for the apply operation
 * @returns Success status and list of affected resources
 */
export async function applyYaml(
	namespace: string,
	yaml: string,
	options: { dryRun?: boolean; force?: boolean } = {}
): Promise<{ success: boolean; resources: Array<{ name: string; action: string }>; errors?: string[] }> {
	const query = new URLSearchParams();
	if (options.dryRun) query.append('dryRun', 'true');
	if (options.force) query.append('force', 'true');

	const endpoint = `/namespaces/${namespace}/apply${query.toString() ? `?${query}` : ''}`;
	return apiClient.postYaml(endpoint, yaml);
}

/**
 * Scale a Kubernetes resource
 * @param namespace The namespace of the resource
 * @param kind The kind of resource (e.g., 'Deployment', 'ReplicaSet')
 * @param name The name of the resource
 * @param replicas The desired number of replicas
 * @returns Success status and message
 */
export async function scaleResource(
	namespace: string,
	kind: string,
	name: string,
	replicas: number
): Promise<{ success: boolean; message: string }> {
	return apiClient.post('/scale', {
		namespace,
		kind,
		name,
		replicas
	});
}

/**
 * Export a Kubernetes resource as YAML
 * @param namespace The namespace of the resource
 * @param kind The kind of resource (e.g., 'Pod', 'Service')
 * @param name The name of the resource
 * @returns The resource definition as a JavaScript object
 */
export async function exportResource(namespace: string, kind: string, name: string): Promise<Record<string, unknown>> {
	const response = await apiClient.get<Record<string, unknown>>(`/export/${namespace}/${kind}/${name}`);
	return response;
}

// ===== UTILITY FUNCTIONS =====

/**
 * Calculate the age of a resource from its creation timestamp
 * @param creationTimestamp The ISO string timestamp when the resource was created
 * @returns A human-readable age string (e.g., "5d", "2h", "30m")
 */
export function calculateAge(creationTimestamp: string): string {
	const now = new Date();
	const created = new Date(creationTimestamp);
	const diffMs = now.getTime() - created.getTime();

	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffMinutes = Math.floor(diffMs / (1000 * 60));

	if (diffDays > 0) {
		return `${diffDays}d`;
	} else if (diffHours > 0) {
		return `${diffHours}h`;
	} else if (diffMinutes > 0) {
		return `${diffMinutes}m`;
	} else {
		return '0m';
	}
}

/**
 * Format memory bytes into a human-readable string
 * @param bytes The memory amount in bytes
 * @returns A formatted string with appropriate units (Ki, Mi, Gi)
 */
export function formatMemory(bytes: number): string {
	if (bytes === 0) return '0Mi';
	const mi = bytes / (1024 * 1024);
	if (mi < 1) return `${Math.round(bytes / 1024)}Ki`;
	if (mi < 1024) return `${Math.round(mi)}Mi`;
	return `${Math.round(mi / 1024)}Gi`;
}

/**
 * Extract an image name from Kubernetes labels using common label patterns
 * @param labels The labels object from a Kubernetes resource
 * @returns The inferred image name or 'Unknown' if no match found
 */
export function getImageFromLabels(labels: Record<string, string> | null | undefined): string {
	// Handle null or undefined labels
	if (!labels) return 'Unknown';

	// Try to infer image from common labels
	if (labels.app) return labels.app;
	if (labels['k8s-app']) return labels['k8s-app'];
	if (labels.component) return labels.component;
	return 'Unknown';
}
