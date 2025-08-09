import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getEndpoints, transformEndpointsToUI, type DashboardEndpoints } from '@/lib/k8s-services';

/**
 * Enhanced endpoints hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useEndpointsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchEndpoints = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const endpoints = await getEndpoints(namespace);
		return transformEndpointsToUI(endpoints);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardEndpoints => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();

		// Endpoints-specific field transformations
		const totalAddresses = typeof wsData.totalAddresses === 'number' ? wsData.totalAddresses : 0;
		const readyAddresses = typeof wsData.readyAddresses === 'number' ? wsData.readyAddresses : 0;
		const totalPorts = typeof wsData.totalPorts === 'number' ? wsData.totalPorts : 0;
		const ports = Array.isArray(wsData.ports) ? wsData.ports as Array<{ name: string, port: number, protocol: string }> : [];

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

		// Format port strings
		const portStrings = ports.map(p => `${p.port}/${p.protocol}`);
		const portsDisplay = portStrings.length > 0 ? portStrings.join(', ') : 'None';

		// Format addresses display
		const addressesDisplay = totalAddresses > 0 ? `${readyAddresses}/${totalAddresses} ready` : 'No addresses';

		return {
			id: Date.now() + Math.random(), // Simple unique ID
			name: name,
			namespace: namespace,
			age: age,
			subsets: ports.length > 0 ? 1 : 0, // Approximate subsets based on ports
			totalAddresses: totalAddresses,
			totalPorts: totalPorts,
			addresses: [], // Will be populated by full API response
			ports: portStrings,
			addressesDisplay: addressesDisplay,
			portsDisplay: portsDisplay,
		};
	}, []);

	// Key function for identifying unique endpoints
	const getItemKey = useCallback((endpoint: DashboardEndpoints) => {
		return `${endpoint.namespace}/${endpoint.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardEndpoints>('endpoints', {
		fetchData: fetchEndpoints,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false
	});

	return result;
}
