import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getClusterRoles, transformClusterRolesToDashboard, type DashboardClusterRole } from '@/lib/k8s-cluster-rbac';

interface WebSocketClusterRoleData {
	name: string;
	creationTimestamp: string;
	ruleCount?: number;
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
}

/**
 * Enhanced cluster roles hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useClusterRolesWithWebSocket(enableWebSocket = true) {
	const fetchData = useCallback(async () => {
		const response = await getClusterRoles(1, 1000); // Get all for display
		return transformClusterRolesToDashboard(response.items);
	}, []);

	const transformWebSocketData = useCallback((wsData: WebSocketClusterRoleData): DashboardClusterRole => {
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

		const rules = wsData.ruleCount || 0;
		const rulesDisplay = rules === 1 ? "1 rule" : `${rules} rules`;

		return {
			id: wsData.name.hashCode(),
			name: wsData.name,
			age: age,
			rules: rules,
			rulesDisplay: rulesDisplay
		};
	}, []);

	const getItemKey = useCallback((item: DashboardClusterRole) => item.name, []);

	const result = useResourceWithOverview<DashboardClusterRole>('clusterrole', {
		fetchData,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [], // No namespace dependency for cluster resources
	});

	return {
		data: result.data,
		loading: result.loading,
		error: result.error,
		isConnected: result.isConnected,
		refetch: result.refetch,
	};
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
