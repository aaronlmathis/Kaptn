import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getPersistentVolumes, transformPersistentVolumesToUI, type DashboardPersistentVolume } from '@/lib/k8s-storage';

/**
 * Enhanced persistent volumes hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function usePersistentVolumesWithWebSocket(enableWebSocket: boolean = true) {

	// API fetch function
	const fetchPersistentVolumes = useCallback(async () => {
		const persistentVolumes = await getPersistentVolumes();
		return transformPersistentVolumesToUI(persistentVolumes);
	}, []);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardPersistentVolume => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const capacity = typeof wsData.capacity === 'string' ? wsData.capacity : 'Unknown';
		const reclaimPolicy = typeof wsData.reclaimPolicy === 'string' ? wsData.reclaimPolicy : 'Unknown';
		const status = typeof wsData.status === 'string' ? wsData.status : 'Unknown';
		const claim = typeof wsData.claim === 'string' ? wsData.claim : '';
		const storageClass = typeof wsData.storageClass === 'string' ? wsData.storageClass : '<none>';
		const volumeSource = typeof wsData.volumeSource === 'string' ? wsData.volumeSource : 'Unknown';
		const age = typeof wsData.age === 'string' ? wsData.age : '0m';

		// Handle access modes - simplified
		const accessModes = Array.isArray(wsData.accessModes) ? wsData.accessModes.filter(mode =>
			typeof mode === 'string'
		) as string[] : [];
		const accessModesDisplay = typeof wsData.accessModesDisplay === 'string' ? wsData.accessModesDisplay : `[${accessModes.join(',')}]`;

		// Handle counts
		const labelsCount = typeof wsData.labelsCount === 'number' ? wsData.labelsCount : 0;
		const annotationsCount = typeof wsData.annotationsCount === 'number' ? wsData.annotationsCount : 0;

		return {
			id: name,
			name: name,
			capacity: capacity,
			accessModes: accessModes,
			accessModesDisplay: accessModesDisplay,
			reclaimPolicy: reclaimPolicy,
			status: status,
			claim: claim,
			storageClass: storageClass,
			volumeSource: volumeSource,
			age: age,
			labelsCount: labelsCount,
			annotationsCount: annotationsCount
		};
	}, []);

	// Key function for identifying unique persistent volumes
	const getItemKey = useCallback((pv: DashboardPersistentVolume) => {
		return pv.name;
	}, []);

	const result = useResourceWithOverview<DashboardPersistentVolume>('persistentvolumes', {
		fetchData: fetchPersistentVolumes,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [],
		debug: false
	});

	return result;
}
