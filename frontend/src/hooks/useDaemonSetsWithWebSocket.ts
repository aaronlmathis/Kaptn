import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getDaemonSets, transformDaemonSetsToUI, type DashboardDaemonSet } from '@/lib/k8s-workloads';

/**
 * Enhanced daemonsets hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useDaemonSetsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchDaemonSets = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const daemonSets = await getDaemonSets(namespace);
		return transformDaemonSetsToUI(daemonSets);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardDaemonSet => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();

		// DaemonSets-specific field transformations
		const desiredNodes = typeof wsData.desiredNodes === 'number' ? wsData.desiredNodes : 0;
		const currentNodes = typeof wsData.currentNodes === 'number' ? wsData.currentNodes : 0;
		const readyNodes = typeof wsData.readyNodes === 'number' ? wsData.readyNodes : 0;
		const availableNodes = typeof wsData.availableNodes === 'number' ? wsData.availableNodes : 0;
		const updateStrategy = typeof wsData.updateStrategy === 'string' ? wsData.updateStrategy : 'RollingUpdate';

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
			id: Date.now() + Math.random(), // Simple unique ID
			name: name,
			namespace: namespace,
			age: age,
			desired: desiredNodes,
			current: currentNodes,
			ready: readyNodes,
			available: availableNodes,
			unavailable: desiredNodes - readyNodes,
			updateStrategy: updateStrategy,
		};
	}, []);

	// Key function for identifying unique daemonsets
	const getItemKey = useCallback((daemonSet: DashboardDaemonSet) => {
		return `${daemonSet.namespace}/${daemonSet.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardDaemonSet>('daemonsets', {
		fetchData: fetchDaemonSets,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false
	});

	return result;
}
