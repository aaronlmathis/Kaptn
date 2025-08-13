import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getCRDs, transformCRDsToUI } from '@/lib/k8s-crds';
import { type CRDTableRow } from '@/types/crd';

/**
 * Enhanced CRDs hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useCRDsWithWebSocket(enableWebSocket: boolean = true) {
	// API fetch function
	const fetchCRDs = useCallback(async () => {
		const crds = await getCRDs();
		return transformCRDsToUI(crds);
	}, []);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): CRDTableRow => {
		// The WebSocket data comes from the informer which has the structure defined in crds.go
		// Transform it to match the CRDTableRow interface

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

		const name = wsData.name as string;

		return {
			id: name.hashCode(), // Simple hash for ID
			name: name,
			group: (wsData.group as string) || '',
			kind: (wsData.kind as string) || '',
			plural: (wsData.plural as string) || '',
			singular: (wsData.singular as string) || '',
			scope: (wsData.scope as string) || 'Namespaced',
			versions: (wsData.versions as string[]) || [],
			storedVersions: (wsData.storedVersions as string[]) || [],
			status: (wsData.status as string) || 'Unknown',
			established: (wsData.established as boolean) || false,
			namesAccepted: (wsData.namesAccepted as boolean) || false,
			age: age,
			creationTimestamp: creationTimestamp,
			labels: (wsData.labels as Record<string, string>) || {},
			annotations: (wsData.annotations as Record<string, string>) || {}
		};
	}, []);

	// Key function for identifying unique CRDs
	const getItemKey = useCallback((crd: CRDTableRow) => {
		return crd.name;
	}, []);

	const result = useResourceWithOverview<CRDTableRow>('crds', {
		fetchData: fetchCRDs,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [],
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
