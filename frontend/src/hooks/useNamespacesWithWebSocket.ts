import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getNamespaces, transformNamespacesToUI, type DashboardNamespace } from '@/lib/k8s-cluster';

/**
 * Enhanced namespaces hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useNamespacesWithWebSocket(enableWebSocket: boolean = true) {
	// API fetch function
	const fetchNamespaces = useCallback(async () => {
		// Namespaces are cluster-scoped, so no namespace filtering needed
		const namespaces = await getNamespaces();
		return transformNamespacesToUI(namespaces);
	}, []);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardNamespace => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();
		const status = typeof wsData.status === 'string' ? wsData.status : 'Unknown';
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

		return {
			id: name,
			name: name,
			status: status,
			age: age,
			labelsCount: labelsCount,
			annotationsCount: annotationsCount,
		};
	}, []);

	// Key function for identifying unique namespaces
	const getItemKey = useCallback((namespace: DashboardNamespace) => {
		// For namespaces, the key is just the name since they're cluster-scoped
		return namespace.name;
	}, []);

	const result = useResourceWithOverview<DashboardNamespace>('namespaces', {
		fetchData: fetchNamespaces,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [], // No dependencies since namespaces are cluster-scoped
		debug: false
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
