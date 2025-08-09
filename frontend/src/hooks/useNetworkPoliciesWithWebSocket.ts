import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getNetworkPolicies, transformNetworkPoliciesToUI, type DashboardNetworkPolicy } from '@/lib/k8s-services';

/**
 * Enhanced network policies hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useNetworkPoliciesWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();
	
	// API fetch function
	const fetchNetworkPolicies = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const networkPolicies = await getNetworkPolicies(namespace);
		return transformNetworkPoliciesToUI(networkPolicies);
	}, [selectedNamespace]);
	
	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardNetworkPolicy => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();
		const podSelector = typeof wsData.podSelector === 'string' ? wsData.podSelector : 'All Pods';
		const ingressRules = typeof wsData.ingressRules === 'number' ? wsData.ingressRules : 0;
		const egressRules = typeof wsData.egressRules === 'number' ? wsData.egressRules : 0;
		const policyTypes = typeof wsData.policyTypes === 'string' ? wsData.policyTypes : 'Ingress';
		const affectedPods = typeof wsData.affectedPods === 'number' ? wsData.affectedPods : 0;
		
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
		
		return {
			id: `${namespace}-${name}`.hashCode(),
			name: name,
			namespace: namespace,
			age: age,
			podSelector: podSelector,
			ingressRules: ingressRules,
			egressRules: egressRules,
			policyTypes: policyTypes,
			affectedPods: affectedPods
		};
	}, []);
	
	// Key function for identifying unique network policies
	const getItemKey = useCallback((networkPolicy: DashboardNetworkPolicy) => {
		return `${networkPolicy.namespace}/${networkPolicy.name}`;
	}, []);
	
	const result = useResourceWithOverview<DashboardNetworkPolicy>('networkpolicies', {
		fetchData: fetchNetworkPolicies,
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
