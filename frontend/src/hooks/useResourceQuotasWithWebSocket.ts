import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getResourceQuotas, transformResourceQuotasToUI, type DashboardResourceQuota } from '@/lib/k8s-cluster';
import { useNamespace } from '@/contexts/namespace-context';

/**
 * Enhanced resource quotas hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useResourceQuotasWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchResourceQuotas = useCallback(async () => {
		const resourceQuotas = await getResourceQuotas(selectedNamespace === 'all' ? undefined : selectedNamespace);
		return transformResourceQuotasToUI(resourceQuotas);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardResourceQuota => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();
		const labelsCount = typeof wsData.labelsCount === 'number' ? wsData.labelsCount : 0;
		const annotationsCount = typeof wsData.annotationsCount === 'number' ? wsData.annotationsCount : 0;

		// Calculate age from creation timestamp
		const ageMs = Date.now() - new Date(creationTimestamp).getTime();
		const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
		const ageHours = Math.floor((ageMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));

		let age: string;
		if (ageDays > 0) {
			age = `${ageDays}d`;
		} else if (ageHours > 0) {
			age = `${ageHours}h`;
		} else {
			age = `${ageMinutes}m`;
		}

		// Extract hard limits from WebSocket data
		const hardLimits = Array.isArray(wsData.hardLimits) ? wsData.hardLimits : [];

		// Extract used resources from WebSocket data
		const usedResources = Array.isArray(wsData.usedResources) ? wsData.usedResources : [];

		return {
			id: `${namespace}-${name}`.hashCode().toString(),
			name: name,
			namespace: namespace,
			age: age,
			labelsCount: labelsCount,
			annotationsCount: annotationsCount,
			hardLimits: hardLimits,
			usedResources: usedResources,
			hardResourcesCount: hardLimits.length,
			usedResourcesCount: usedResources.length,
		};
	}, []);

	// Key function for identifying unique resource quotas
	const getItemKey = useCallback((resourceQuota: DashboardResourceQuota) => {
		// For resource quotas, use namespace/name combination since they're namespaced
		return `${resourceQuota.namespace}/${resourceQuota.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardResourceQuota>('resource_quotas', {
		fetchData: fetchResourceQuotas,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace], // Refetch when namespace changes
		debug: true // Enable debug logging
	});

	return result;
}

// Extension to String prototype for simple hash code (if needed)
declare global {
	interface String {
		hashCode(): number;
	}
}

if (!String.prototype.hashCode) {
	String.prototype.hashCode = function () {
		let hash = 0;
		if (this.length === 0) return hash;
		for (let i = 0; i < this.length; i++) {
			const char = this.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash);
	};
}
