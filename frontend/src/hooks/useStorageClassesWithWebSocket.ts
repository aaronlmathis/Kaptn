import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getStorageClasses, transformStorageClassesToUI, type DashboardStorageClass } from '@/lib/k8s-storage';

/**
 * Enhanced storage classes hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useStorageClassesWithWebSocket(enableWebSocket: boolean = true) {

	// API fetch function
	const fetchStorageClasses = useCallback(async () => {
		const storageClasses = await getStorageClasses();
		return transformStorageClassesToUI(storageClasses);
	}, []);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardStorageClass => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const provisioner = typeof wsData.provisioner === 'string' ? wsData.provisioner : 'Unknown';
		const reclaimPolicy = typeof wsData.reclaimPolicy === 'string' ? wsData.reclaimPolicy : 'Delete';
		const volumeBindingMode = typeof wsData.volumeBindingMode === 'string' ? wsData.volumeBindingMode : 'Immediate';
		const allowVolumeExpansion = typeof wsData.allowVolumeExpansion === 'boolean' ? wsData.allowVolumeExpansion : false;
		const parametersCount = typeof wsData.parametersCount === 'number' ? wsData.parametersCount : 0;
		const age = typeof wsData.age === 'string' ? wsData.age : '0s';
		const labelsCount = typeof wsData.labelsCount === 'number' ? wsData.labelsCount : 0;
		const annotationsCount = typeof wsData.annotationsCount === 'number' ? wsData.annotationsCount : 0;
		const isDefault = typeof wsData.isDefault === 'boolean' ? wsData.isDefault : false;

		return {
			id: name, // Storage classes are cluster-scoped, use name as ID
			name: name,
			provisioner: provisioner,
			reclaimPolicy: reclaimPolicy,
			volumeBindingMode: volumeBindingMode,
			allowVolumeExpansion: allowVolumeExpansion,
			parametersCount: parametersCount,
			age: age,
			labelsCount: labelsCount,
			annotationsCount: annotationsCount,
			isDefault: isDefault
		};
	}, []);

	// Key function for identifying unique storage classes
	const getItemKey = useCallback((sc: DashboardStorageClass) => {
		return sc.name; // Storage classes are cluster-scoped, so name is unique
	}, []);

	const result = useResourceWithOverview<DashboardStorageClass>('storageclasses', {
		fetchData: fetchStorageClasses,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [], // No namespace dependency for cluster-scoped resources
		debug: false
	});

	return result;
}
