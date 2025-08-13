import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getRoleBindings, transformRoleBindingsToUI, type DashboardRoleBinding } from '@/lib/k8s-rbac';

/**
 * Enhanced role bindings hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useRoleBindingsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchRoleBindings = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const roleBindings = await getRoleBindings(namespace);
		return transformRoleBindingsToUI(roleBindings);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: any): DashboardRoleBinding => {
		// The WebSocket data comes from the informer which has the structure defined in roles.go
		// Transform it to match the DashboardRoleBinding interface

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
			id: `${wsData.namespace}-${wsData.name}`.hashCode(),
			name: wsData.name,
			namespace: wsData.namespace,
			age: age,
			roleRef: wsData.roleRef || '<none>',
			subjects: wsData.subjects || 0,
			subjectsDisplay: wsData.subjectsDisplay || '<none>' // Use the backend's formatted string directly
		};
	}, []);

	// Key function for identifying unique role bindings
	const getItemKey = useCallback((roleBinding: DashboardRoleBinding) => {
		return `${roleBinding.namespace}/${roleBinding.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardRoleBinding>('rolebindings', {
		fetchData: fetchRoleBindings,
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

if (!String.prototype.hashCode) {
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
}
