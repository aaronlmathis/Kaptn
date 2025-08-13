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
		const response = await getClusterRoleBindings(1, 1000); // Get all for display
		return transformClusterRoleBindingsToDashboard(response.items);
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
			id: wsData.name.hashCode(),
			name: wsData.name,
			age: age,
			roleRef: wsData.roleName || "",
			subjects: subjects,
			subjectsDisplay: subjectsDisplay
		};
	}, []);

	const getItemKey = useCallback((item: DashboardClusterRoleBinding) => item.name, []);

	const result = useResourceWithOverview<DashboardClusterRoleBinding>('clusterrolebinding', {
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
