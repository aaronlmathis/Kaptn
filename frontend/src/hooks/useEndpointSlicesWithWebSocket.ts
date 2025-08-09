import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import {
	getEndpointSlices,
	transformEndpointSlicesToUI,
	type DashboardEndpointSlice
} from '@/lib/k8s-services';

/**
 * Enhanced endpointslices hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useEndpointSlicesWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchEndpointSlices = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const endpointSlices = await getEndpointSlices(namespace);
		return transformEndpointSlicesToUI(endpointSlices);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardEndpointSlice => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();
		const addressType = typeof wsData.addressType === 'string' ? wsData.addressType : 'IPv4';
		const totalEndpoints = typeof wsData.totalEndpoints === 'number' ? wsData.totalEndpoints : 0;
		const readyEndpoints = typeof wsData.readyEndpoints === 'number' ? wsData.readyEndpoints : 0;
		const notReadyEndpoints = typeof wsData.notReadyEndpoints === 'number' ? wsData.notReadyEndpoints : 0;
		const ports = Array.isArray(wsData.ports) ? wsData.ports : [];

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

		// Format ready status
		const ready = `${readyEndpoints}/${totalEndpoints}`;

		// Extract port information
		const portStrings = ports.map((port: Record<string, unknown>) => {
			if (port.name && port.port) {
				return `${port.name}:${port.port}/${port.protocol || 'TCP'}`;
			} else if (port.port) {
				return `${port.port}/${port.protocol || 'TCP'}`;
			}
			return String(port.protocol) || 'TCP';
		});

		return {
			id: `${namespace}-${name}`.hashCode(),
			name: name,
			namespace: namespace,
			age: age,
			addressType: addressType,
			endpoints: totalEndpoints,
			ready: ready,
			readyCount: readyEndpoints,
			notReadyCount: notReadyEndpoints,
			ports: ports.length,
			addresses: [], // Will be populated from actual endpoint addresses
			portStrings: portStrings,
			addressesDisplay: '', // Empty for now
			portsDisplay: portStrings.join(', '),
		};
	}, []);

	// Key function for identifying unique endpointslices
	const getItemKey = useCallback((endpointSlice: DashboardEndpointSlice) => {
		return `${endpointSlice.namespace}/${endpointSlice.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardEndpointSlice>('endpointslices', {
		fetchData: fetchEndpointSlices,
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
