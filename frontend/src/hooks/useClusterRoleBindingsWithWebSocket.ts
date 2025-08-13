import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getClusterRoleBindings, transformClusterRoleBindingsToDashboard, type DashboardClusterRoleBinding } from '@/lib/k8s-cluster-rbac';

/**
 * Enhanced cluster role bindings hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useClusterRoleBindingsWithWebSocket(enableWebSocket = true) {
	// API fetch function - follows the same pattern as useRolesWithWebSocket
	const fetchData = useCallback(async () => {
		console.log('🟡 CLUSTER ROLE BINDINGS: Starting API fetch...');
		try {
			const clusterRoleBindings = await getClusterRoleBindings();
			console.log('🟡 CLUSTER ROLE BINDINGS: Raw API response:', clusterRoleBindings);
			console.log('🟡 CLUSTER ROLE BINDINGS: Response length:', clusterRoleBindings.length);
			const transformed = transformClusterRoleBindingsToDashboard(clusterRoleBindings);
			console.log('🟡 CLUSTER ROLE BINDINGS: Transformed data:', transformed);
			console.log('🟡 CLUSTER ROLE BINDINGS: Transformed length:', transformed.length);
			return transformed;
		} catch (error) {
			console.error('🔴 CLUSTER ROLE BINDINGS: API fetch failed:', error);
			throw error;
		}
	}, []);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const transformWebSocketData = useCallback((wsData: Record<string, any>): DashboardClusterRoleBinding => {
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
		const subjects = wsData.subjects || wsData.subjectCount || 0;
		const subjectsDisplay = wsData.subjectsDisplay || (subjects === 1 ? "1 subject" : `${subjects} subjects`);
		const roleRef = wsData.roleRef || wsData.roleName || "";

		return {
			id: wsData.name.hashCode(), // Generate ID like the roles do
			name: wsData.name,
			age: age,
			roleRef: roleRef,
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
