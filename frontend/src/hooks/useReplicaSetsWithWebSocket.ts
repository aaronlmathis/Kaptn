import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getReplicaSets, transformReplicaSetsToUI, type DashboardReplicaSet } from '@/lib/k8s-workloads';

/**
 * Enhanced replicasets hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useReplicaSetsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchReplicaSets = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const replicaSets = await getReplicaSets(namespace);
		return transformReplicaSetsToUI(replicaSets);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardReplicaSet => {
		// The WebSocket data comes from the informer which has the structure defined in replicasets.go
		// Transform it to match the DashboardReplicaSet interface

		// Type guard and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();

		// Extract replica counts
		const replicas = wsData.replicas as Record<string, unknown> || {};
		const desired = typeof replicas.desired === 'number' ? replicas.desired : 0;
		const ready = typeof replicas.ready === 'number' ? replicas.ready : 0;
		const available = typeof replicas.available === 'number' ? replicas.available : 0;

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
			ready: `${ready}/${desired}`,
			desired: desired,
			current: available, // Using available as current
			available: available,
			age: age
		};
	}, []);

	// Key function for identifying unique replicasets
	const getItemKey = useCallback((replicaSet: DashboardReplicaSet) => {
		return `${replicaSet.namespace}/${replicaSet.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardReplicaSet>('replicasets', {
		fetchData: fetchReplicaSets,
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
