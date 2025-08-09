import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getPersistentVolumeClaims, transformPersistentVolumeClaimsToUI, type DashboardPersistentVolumeClaim } from '@/lib/k8s-storage';

/**
 * Enhanced persistent volume claims hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function usePersistentVolumeClaimsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchPersistentVolumeClaims = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const pvcs = await getPersistentVolumeClaims(namespace);
		return transformPersistentVolumeClaimsToUI(pvcs);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardPersistentVolumeClaim => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();
		const status = typeof wsData.status === 'string' ? wsData.status : 'Unknown';
		const storageClass = typeof wsData.storageClass === 'string' ? wsData.storageClass : '';
		const storage = typeof wsData.storage === 'string' ? wsData.storage : '';
		const volumeName = typeof wsData.volumeName === 'string' ? wsData.volumeName : '';
		const age = typeof wsData.age === 'string' ? wsData.age : '';

		// Handle access modes
		let accessModes: string[] = [];
		let accessModesDisplay = '';
		if (Array.isArray(wsData.accessModes)) {
			accessModes = wsData.accessModes.filter((mode): mode is string => typeof mode === 'string');
		}
		if (typeof wsData.accessModesDisplay === 'string') {
			accessModesDisplay = wsData.accessModesDisplay;
		} else {
			accessModesDisplay = `[${accessModes.join(',')}]`;
		}

		// Calculate age from creation timestamp if not provided
		let calculatedAge = age;
		if (!age && creationTimestamp) {
			const ageMs = Date.now() - new Date(creationTimestamp).getTime();
			const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
			const ageHours = Math.floor((ageMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));

			if (ageDays > 0) {
				calculatedAge = `${ageDays}d`;
			} else if (ageHours > 0) {
				calculatedAge = `${ageHours}h`;
			} else {
				calculatedAge = `${ageMinutes}m`;
			}
		}

		// Handle label and annotation counts
		const labelsCount = typeof wsData.labelsCount === 'number' ? wsData.labelsCount : 0;
		const annotationsCount = typeof wsData.annotationsCount === 'number' ? wsData.annotationsCount : 0;

		return {
			id: `${namespace}-${name}`,
			name: name,
			namespace: namespace,
			status: status,
			volume: volumeName,
			capacity: storage,
			accessModes: accessModes,
			accessModesDisplay: accessModesDisplay,
			storageClass: storageClass,
			age: calculatedAge,
			labelsCount: labelsCount,
			annotationsCount: annotationsCount,
		};
	}, []);

	// Key function for identifying unique persistent volume claims
	const getItemKey = useCallback((pvc: DashboardPersistentVolumeClaim) => {
		return `${pvc.namespace}/${pvc.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardPersistentVolumeClaim>('persistentvolumeclaims', {
		fetchData: fetchPersistentVolumeClaims,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false
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
