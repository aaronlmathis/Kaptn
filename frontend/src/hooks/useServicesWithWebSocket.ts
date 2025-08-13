import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getServices, transformServicesToUI, type ServiceTableRow } from '@/lib/k8s-services';

/**
 * Enhanced services hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useServicesWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchServices = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const services = await getServices(namespace);
		return transformServicesToUI(services);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: any): ServiceTableRow => {
		// The WebSocket data comes from the informer which has the structure defined in services.go
		// Transform it to match the ServiceTableRow interface

		// Get external IP
		const getExternalIP = (service: any): string => {
			if (service.externalIPs && service.externalIPs.length > 0) {
				return service.externalIPs[0];
			}
			return '<none>';
		};

		// Format ports
		const formatPorts = (ports: any): string => {
			if (!ports || ports.length === 0) return '<none>';
			return ports.map((p: any) => {
				let portStr = `${p.port}/${p.protocol}`;
				if (p.nodePort) {
					portStr += `:${p.nodePort}`;
				}
				return portStr;
			}).join(', ');
		};

		// Calculate age from creation timestamp
		const ageMs = Date.now() - new Date(wsData.creationTimestamp).getTime();
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
			id: 0, // Temporary ID, will be set properly when merged with API data
			name: wsData.name,
			namespace: wsData.namespace,
			type: wsData.type || 'ClusterIP',
			clusterIP: wsData.clusterIP || '<none>',
			externalIP: getExternalIP(wsData),
			ports: formatPorts(wsData.ports),
			age: age
		};
	}, []);

	// Key function for identifying unique services
	const getItemKey = useCallback((service: ServiceTableRow) => {
		return `${service.namespace}/${service.name}`;
	}, []);

	const result = useResourceWithOverview<ServiceTableRow>('services', {
		fetchData: fetchServices,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false // Debug disabled
	});

	return result;
}
