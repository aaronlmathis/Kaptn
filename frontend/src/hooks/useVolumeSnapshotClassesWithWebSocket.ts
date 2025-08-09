import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getVolumeSnapshotClasses, transformVolumeSnapshotClassesToUI, type DashboardVolumeSnapshotClass } from '@/lib/k8s-storage';

/**
 * Enhanced volume snapshot classes hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useVolumeSnapshotClassesWithWebSocket(enableWebSocket: boolean = true) {
	// API fetch function
	const fetchVolumeSnapshotClasses = useCallback(async () => {
		const snapshotClasses = await getVolumeSnapshotClasses();
		return transformVolumeSnapshotClassesToUI(snapshotClasses);
	}, []);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardVolumeSnapshotClass => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const driver = typeof wsData.driver === 'string' ? wsData.driver : '';
		const deletionPolicy = typeof wsData.deletionPolicy === 'string' ? wsData.deletionPolicy : '';
		const age = typeof wsData.age === 'string' ? wsData.age : '';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();

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

		// Handle label, annotation, and parameter counts
		const labelsCount = typeof wsData.labelsCount === 'number' ? wsData.labelsCount : 0;
		const annotationsCount = typeof wsData.annotationsCount === 'number' ? wsData.annotationsCount : 0;
		const parametersCount = typeof wsData.parametersCount === 'number' ? wsData.parametersCount : 0;

		return {
			id: name, // Volume snapshot classes are cluster-scoped, so name is unique
			name: name,
			driver: driver,
			deletionPolicy: deletionPolicy,
			age: calculatedAge,
			labelsCount: labelsCount,
			annotationsCount: annotationsCount,
			parametersCount: parametersCount,
		};
	}, []);

	// Key function for identifying unique volume snapshot classes
	const getItemKey = useCallback((snapshotClass: DashboardVolumeSnapshotClass) => {
		return snapshotClass.name; // Volume snapshot classes are cluster-scoped
	}, []);

	const result = useResourceWithOverview<DashboardVolumeSnapshotClass>('volumesnapshotclasses', {
		fetchData: fetchVolumeSnapshotClasses,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [], // No namespace dependency since these are cluster-scoped
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
