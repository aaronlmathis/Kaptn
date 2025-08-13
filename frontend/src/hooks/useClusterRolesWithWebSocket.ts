import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getClusterRoles, transformClusterRolesToDashboard, type DashboardClusterRole } from '@/lib/k8s-cluster-rbac';

interface WebSocketClusterRoleData {
	name: string;
	creationTimestamp: string;
	ruleCount?: number;
	verbCount?: number;
	resourceCount?: number;
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
}

/**
 * Enhanced cluster roles hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useClusterRolesWithWebSocket(enableWebSocket = true) {
	const fetchData = useCallback(async () => {
		try {
			console.log('Fetching cluster roles...');
			const response = await getClusterRoles(1, 1000); // Get all for display
			console.log('Cluster roles response:', response);
			if (!response || !response.items) {
				console.warn('Cluster roles API returned invalid response:', response);
				return [];
			}
			const transformed = transformClusterRolesToDashboard(response.items);
			console.log('Transformed cluster roles:', transformed);
			return transformed;
		} catch (error) {
			console.error('Error fetching cluster roles:', error);
			return [];
		}
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

		// Use ruleCount from backend (it sends this field)
		const rules = wsData.ruleCount || 0;
		const rulesDisplay = rules === 1 ? "1 rule" : `${rules} rules`;

		return {
			id: wsData.name.length, // Generate ID like the API does - use name length
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
		debug: true // Enable debug to see what's happening
	});

	return {
		data: result.data,
		loading: result.loading,
		error: result.error,
		isConnected: result.isConnected,
		refetch: result.refetch,
	};
}
