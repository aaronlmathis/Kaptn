import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getClusterRoles, transformClusterRolesToDashboard, type DashboardClusterRole } from '@/lib/k8s-cluster-rbac';

/**
 * Enhanced cluster roles hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useClusterRolesWithWebSocket(enableWebSocket = true) {
	// API fetch function - follows the same pattern as useRolesWithWebSocket
	const fetchData = useCallback(async () => {
		console.log('🔵 CLUSTER ROLES: Starting API fetch...');
		try {
			const clusterRoles = await getClusterRoles();
			console.log('🔵 CLUSTER ROLES: Raw API response:', clusterRoles);
			console.log('🔵 CLUSTER ROLES: Response length:', clusterRoles.length);
			const transformed = transformClusterRolesToDashboard(clusterRoles);
			console.log('🔵 CLUSTER ROLES: Transformed data:', transformed);
			console.log('🔵 CLUSTER ROLES: Transformed length:', transformed.length);
			return transformed;
		} catch (error) {
			console.error('🔴 CLUSTER ROLES: API fetch failed:', error);
			throw error;
		}
	}, []);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const transformWebSocketData = useCallback((wsData: Record<string, any>): DashboardClusterRole => {
		// Use backend-provided age if available, otherwise calculate
		let age: string;
		if (wsData.age) {
			age = wsData.age;
		} else {
			const ageMs = Date.now() - new Date(wsData.creationTimestamp).getTime();
			const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
			const ageHours = Math.floor((ageMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			const ageMinutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));

			if (ageDays > 0) {
				age = `${ageDays}d`;
			} else if (ageHours > 0) {
				age = `${ageHours}h`;
			} else {
				age = `${ageMinutes}m`;
			}
		}

		// Use backend data with fallback to old fields
		const rules = wsData.rules || wsData.ruleCount || 0;
		const rulesDisplay = wsData.rulesDisplay || (rules === 1 ? "1 rule" : `${rules} rules`);

		return {
			id: wsData.name.hashCode(), // Generate ID like the roles do
			name: wsData.name,
			age: age,
			rules: rules,
			rulesDisplay: rulesDisplay
		};
	}, []);

	const getItemKey = useCallback((item: DashboardClusterRole) => item.name, []);

	const result = useResourceWithOverview<DashboardClusterRole>('clusterroles', {
		fetchData,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [], // No namespace dependency for cluster resources
		debug: false
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
