import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getRoles, transformRolesToUI, type DashboardRole } from '@/lib/k8s-rbac';

/**
 * Enhanced roles hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useRolesWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchRoles = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const roles = await getRoles(namespace);
		return transformRolesToUI(roles);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: any): DashboardRole => {
		// The WebSocket data comes from the informer which has the structure defined in roles.go
		// Transform it to match the DashboardRole interface

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
			rules: wsData.rules || 0,
			rulesDisplay: wsData.rulesDisplay || '<none>' // Use the backend's formatted string directly
		};
	}, []);

	// Key function for identifying unique roles
	const getItemKey = useCallback((role: DashboardRole) => {
		return `${role.namespace}/${role.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardRole>('roles', {
		fetchData: fetchRoles,
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
