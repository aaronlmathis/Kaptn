import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getServices, transformServicesToUI } from '@/lib/k8s-services';
import type { LoadBalancer } from '@/lib/schemas/loadbalancer';

/**
 * Enhanced load balancers hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 * Note: LoadBalancers are Services with type=LoadBalancer
 */
export function useLoadBalancersWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchLoadBalancers = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const services = await getServices(namespace);
		// Filter to only LoadBalancer type services
		const loadBalancerServices = services.filter(service => service.type === 'LoadBalancer');
		const transformedServices = transformServicesToUI(loadBalancerServices);
		// Transform to LoadBalancer format (they have the same structure for now)
		const loadBalancers: LoadBalancer[] = transformedServices.map(service => ({
			...service,
			loadBalancerIP: service.externalIP !== '<none>' ? service.externalIP : undefined,
			ingressPoints: service.externalIP !== '<none>' ? [service.externalIP] : undefined,
		}));
		return loadBalancers;
	}, [selectedNamespace]);

	// WebSocket data transformer for LoadBalancer services
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): LoadBalancer => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const serviceType = typeof wsData.type === 'string' ? wsData.type : 'ClusterIP';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();
		const clusterIP = typeof wsData.clusterIP === 'string' ? wsData.clusterIP : '';
		const externalIPs = Array.isArray(wsData.externalIPs) ? wsData.externalIPs.filter(ip => typeof ip === 'string') as string[] : [];
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

		// Format external IP
		const externalIP = externalIPs.length > 0 ? externalIPs[0] : (typeof wsData.externalIP === 'string' ? wsData.externalIP : '<none>');

		// Format ports
		const portsString = ports.length > 0
			? ports.map((port: Record<string, unknown>) => `${port.port}/${port.protocol || 'TCP'}`).join(', ')
			: '';

		return {
			id: `${namespace}-${name}`.hashCode(),
			name: name,
			namespace: namespace,
			type: serviceType,
			clusterIP: clusterIP,
			externalIP: externalIP,
			ports: portsString,
			age: age,
			loadBalancerIP: externalIP !== '<none>' ? externalIP : undefined,
			ingressPoints: externalIP !== '<none>' ? [externalIP] : undefined,
		};
	}, []);

	// Key function for identifying unique load balancers
	const getItemKey = useCallback((loadBalancer: LoadBalancer) => {
		return `${loadBalancer.namespace}/${loadBalancer.name}`;
	}, []);

	const result = useResourceWithOverview<LoadBalancer>('loadbalancers', {
		fetchData: fetchLoadBalancers,
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
