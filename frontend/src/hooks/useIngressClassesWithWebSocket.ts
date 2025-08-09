import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getIngressClasses, transformIngressClassesToUI, type DashboardIngressClass } from '@/lib/k8s-services';

/**
 * Enhanced ingress classes hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useIngressClassesWithWebSocket(enableWebSocket: boolean = true) {
	// API fetch function - ingress classes are cluster-scoped, no namespace needed
	const fetchIngressClasses = useCallback(async () => {
		console.log('🔍 Fetching ingress classes...');
		const ingressClasses = await getIngressClasses();
		console.log('📦 Raw ingress classes from API:', ingressClasses);
		const transformed = transformIngressClassesToUI(ingressClasses);
		console.log('🔄 Transformed ingress classes:', transformed);
		return transformed;
	}, []);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardIngressClass => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();
		const controller = typeof wsData.controller === 'string' ? wsData.controller : '';
		const isDefault = typeof wsData.isDefault === 'boolean' ? wsData.isDefault : false;
		const parametersKind = typeof wsData.parametersKind === 'string' ? wsData.parametersKind : undefined;
		const parametersName = typeof wsData.parametersName === 'string' ? wsData.parametersName : undefined;

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
			id: name.hashCode(),
			name: name,
			age: age,
			controller: controller,
			isDefault: isDefault,
			parametersKind: parametersKind,
			parametersName: parametersName
		};
	}, []);

	// Key function for identifying unique ingress classes
	const getItemKey = useCallback((ingressClass: DashboardIngressClass) => {
		return ingressClass.name; // IngressClasses are cluster-scoped, so name is unique
	}, []);

	const result = useResourceWithOverview<DashboardIngressClass>('ingressclasses', {
		fetchData: fetchIngressClasses,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [], // No dependencies for cluster-scoped resources
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
