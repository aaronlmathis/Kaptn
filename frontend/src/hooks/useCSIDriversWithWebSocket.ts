import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getCSIDrivers, transformCSIDriversToUI, type DashboardCSIDriver } from '@/lib/k8s-storage';

/**
 * Enhanced CSI drivers hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useCSIDriversWithWebSocket(enableWebSocket: boolean = true) {
	// API fetch function - CSI drivers are cluster-scoped
	const fetchCSIDrivers = useCallback(async () => {
		const csiDrivers = await getCSIDrivers();
		return transformCSIDriversToUI(csiDrivers);
	}, []);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardCSIDriver => {
		// The WebSocket data comes from the informer which has the structure defined in CSI driver API
		// Transform it to match the DashboardCSIDriver interface

		// Calculate age from creation timestamp
		const creationTimestamp = wsData.creationTimestamp as string;
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
			id: wsData.name as string,
			name: wsData.name as string,
			attachRequired: Boolean(wsData.attachRequired),
			podInfoOnMount: Boolean(wsData.podInfoOnMount),
			requiresRepublish: Boolean(wsData.requiresRepublish),
			storageCapacity: Boolean(wsData.storageCapacity),
			fsGroupPolicy: (wsData.fsGroupPolicy as string) || '',
			volumeLifecycleModes: Number(wsData.volumeLifecycleModes) || 0,
			tokenRequests: Number(wsData.tokenRequests) || 0,
			age: age,
			labelsCount: Number(wsData.labelsCount) || 0,
			annotationsCount: Number(wsData.annotationsCount) || 0
		};
	}, []);

	// Key function for identifying unique CSI drivers
	const getItemKey = useCallback((csiDriver: DashboardCSIDriver) => {
		return csiDriver.name; // CSI drivers are cluster-scoped, so name is unique
	}, []);

	const result = useResourceWithOverview<DashboardCSIDriver>('csidrivers', {
		fetchData: fetchCSIDrivers,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [], // No dependencies since CSI drivers are cluster-scoped
		debug: false
	});

	return result;
}
