import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getIngresses, transformIngressesToUI, type DashboardIngress } from '@/lib/k8s-workloads';

/**
 * Enhanced ingresses hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useIngressesWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();
	
	// API fetch function
	const fetchIngresses = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const ingresses = await getIngresses(namespace);
		return transformIngressesToUI(ingresses);
	}, [selectedNamespace]);
	
	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardIngress => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();
		const ingressClass = typeof wsData.ingressClass === 'string' ? wsData.ingressClass : '';
		const hosts = Array.isArray(wsData.hosts) ? wsData.hosts.filter(h => typeof h === 'string') as string[] : [];
		const paths = Array.isArray(wsData.paths) ? wsData.paths.filter(p => typeof p === 'string') as string[] : [];
		const externalIPs = Array.isArray(wsData.externalIPs) ? wsData.externalIPs.filter(ip => typeof ip === 'string') as string[] : [];
		
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
		
		// Create display strings for hosts and external IPs
		const hostsDisplay = hosts.length > 0
			? hosts.length === 1
				? hosts[0]
				: `${hosts[0]} (+${hosts.length - 1} more)`
			: '';

		const externalIPsDisplay = externalIPs.length > 0
			? externalIPs.length === 1
				? externalIPs[0]
				: `${externalIPs[0]} (+${externalIPs.length - 1} more)`
			: '';
		
		return {
			id: `${namespace}-${name}`.hashCode(),
			name: name,
			namespace: namespace,
			age: age,
			ingressClass: ingressClass,
			hosts: hosts,
			hostsDisplay: hostsDisplay,
			paths: paths,
			externalIPs: externalIPs,
			externalIPsDisplay: externalIPsDisplay
		};
	}, []);
	
	// Key function for identifying unique ingresses
	const getItemKey = useCallback((ingress: DashboardIngress) => {
		return `${ingress.namespace}/${ingress.name}`;
	}, []);
	
	const result = useResourceWithOverview<DashboardIngress>('ingresses', {
		fetchData: fetchIngresses,
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

String.prototype.hashCode = function() {
	let hash = 0;
	if (this.length === 0) return hash;
	for (let i = 0; i < this.length; i++) {
		const char = this.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash);
};
