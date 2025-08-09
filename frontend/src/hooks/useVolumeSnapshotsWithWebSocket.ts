import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getVolumeSnapshots, transformVolumeSnapshotsToUI, type DashboardVolumeSnapshot } from '@/lib/k8s-storage';

/**
 * Enhanced volume snapshots hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useVolumeSnapshotsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchVolumeSnapshots = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const snapshots = await getVolumeSnapshots(namespace);
		return transformVolumeSnapshotsToUI(snapshots);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardVolumeSnapshot => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();
		const sourcePVC = typeof wsData.sourcePVC === 'string' ? wsData.sourcePVC : '';
		const volumeSnapshotClassName = typeof wsData.volumeSnapshotClassName === 'string' ? wsData.volumeSnapshotClassName : '';
		const readyToUse = typeof wsData.readyToUse === 'boolean' ? wsData.readyToUse : false;
		const restoreSize = typeof wsData.restoreSize === 'string' ? wsData.restoreSize : '';
		const creationTime = typeof wsData.creationTime === 'string' ? wsData.creationTime : '';
		const snapshotHandle = typeof wsData.snapshotHandle === 'string' ? wsData.snapshotHandle : '';
		const age = typeof wsData.age === 'string' ? wsData.age : '';

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
			sourcePVC: sourcePVC,
			volumeSnapshotClassName: volumeSnapshotClassName,
			readyToUse: readyToUse,
			restoreSize: restoreSize,
			creationTime: creationTime,
			snapshotHandle: snapshotHandle,
			age: calculatedAge,
			labelsCount: labelsCount,
			annotationsCount: annotationsCount,
		};
	}, []);

	// Key function for identifying unique volume snapshots
	const getItemKey = useCallback((snapshot: DashboardVolumeSnapshot) => {
		return `${snapshot.namespace}/${snapshot.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardVolumeSnapshot>('volumesnapshots', {
		fetchData: fetchVolumeSnapshots,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: true // Enable debug mode to see what messages are coming through
	});

	// Add debug logging for the result
	console.log('useVolumeSnapshotsWithWebSocket - isConnected:', result.isConnected, 'data length:', result.data.length);

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
