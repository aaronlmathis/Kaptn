import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getClusterRoleBindings, transformClusterRoleBindingsToDashboard, type DashboardClusterRoleBinding } from '@/lib/k8s-cluster-rbac';

interface WebSocketClusterRoleBindingData {
	name: string;
	creationTimestamp: string;
	roleName?: string;
	roleKind?: string;
	subjectCount?: number;
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
}

/**
 * Enhanced cluster role bindings hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useClusterRoleBindingsWithWebSocket(enableWebSocket = true) {
	const fetchData = useCallback(async () => {
		try {
			console.log('Fetching cluster role bindings...');
			const response = await getClusterRoleBindings(1, 1000); // Get all for display
			console.log('Cluster role bindings response:', response);
			if (!response || !response.items) {
				console.warn('Cluster role bindings API returned invalid response:', response);
				return [];
			}
			const transformed = transformClusterRoleBindingsToDashboard(response.items);
			console.log('Transformed cluster role bindings:', transformed);
			return transformed;
		} catch (error) {
			console.error('Error fetching cluster role bindings:', error);
			return [];
		}
	}, []);

	const transformWebSocketData = useCallback((wsData: WebSocketClusterRoleBindingData): DashboardClusterRoleBinding => {
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

		const subjects = wsData.subjectCount || 0;
		const subjectsDisplay = subjects === 1 ? "1 subject" : `${subjects} subjects`;

		return {
			id: 0, // Temporary ID, will be set properly when merged with API data
			name: wsData.name,
			age: age,
			roleRef: wsData.roleName || "",
			subjects: subjects,
			subjectsDisplay: subjectsDisplay
		};
	}, []);

	const getItemKey = useCallback((item: DashboardClusterRoleBinding) => item.name, []);

	const result = useResourceWithOverview<DashboardClusterRoleBinding>('clusterrolebindings', {
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
