import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getStatefulSets, transformStatefulSetsToUI, type DashboardStatefulSet } from '@/lib/k8s-workloads';

/**
 * Enhanced statefulsets hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useStatefulSetsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchStatefulSets = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const statefulSets = await getStatefulSets(namespace);
		return transformStatefulSetsToUI(statefulSets);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardStatefulSet => {
		// The WebSocket data comes from the informer which has the structure defined in statefulsets.go
		// Transform it to match the DashboardStatefulSet interface

		// Type guard and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const ready = typeof wsData.ready === 'string' ? wsData.ready : '0/0';
		const serviceName = typeof wsData.serviceName === 'string' ? wsData.serviceName : '';
		const updateStrategy = typeof wsData.updateStrategy === 'string' ? wsData.updateStrategy : 'RollingUpdate';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();

		// Extract replica counts
		const currentReplicas = typeof wsData.currentReplicas === 'number' ? wsData.currentReplicas : 0;
		const updatedReplicas = typeof wsData.updatedReplicas === 'number' ? wsData.updatedReplicas : 0;

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

		return {
			id: `${namespace}-${name}`.hashCode(), // Simple hash for ID
			name: name,
			namespace: namespace,
			ready: ready,
			current: currentReplicas,
			updated: updatedReplicas,
			age: age,
			serviceName: serviceName,
			updateStrategy: updateStrategy
		};
	}, []);

	// Key function for identifying unique statefulsets
	const getItemKey = useCallback((statefulSet: DashboardStatefulSet) => {
		return `${statefulSet.namespace}/${statefulSet.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardStatefulSet>('statefulsets', {
		fetchData: fetchStatefulSets,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false // Debug disabled
	});

	return result;
}

// Extension to String prototype for simple hash code (for generating IDs)
declare global {
	interface String {
		hashCode(): number;
	}
}

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
