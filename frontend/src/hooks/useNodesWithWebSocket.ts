import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { getNodes, transformNodesToUI, type NodeTableRow } from '@/lib/k8s-cluster';

/**
 * Enhanced nodes hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useNodesWithWebSocket(enableWebSocket: boolean = true) {
	// API fetch function
	const fetchNodes = useCallback(async () => {
		const nodes = await getNodes();
		return transformNodesToUI(nodes);
	}, []);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): NodeTableRow => {
		// The WebSocket data comes from the informer which has the structure defined in nodes.go
		// Transform it to match the NodeTableRow interface

		// Type guard and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();
		const ready = typeof wsData.ready === 'boolean' ? wsData.ready : false;
		const unschedulable = typeof wsData.unschedulable === 'boolean' ? wsData.unschedulable : false;
		const roles = Array.isArray(wsData.roles) ? wsData.roles as string[] : [];
		const kubeletVersion = typeof wsData.kubeletVersion === 'string' ? wsData.kubeletVersion : 'Unknown';

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

		// Format roles
		const formatRoles = (roles: string[]): string => {
			if (!roles || roles.length === 0) {
				return 'worker';
			}
			return roles.join(', ');
		};

		// Determine status
		const getStatus = (ready: boolean, unschedulable: boolean): string => {
			if (unschedulable) {
				return 'SchedulingDisabled';
			}
			return ready ? 'Ready' : 'NotReady';
		};

		return {
			id: name.hashCode(), // Simple hash for ID
			name: name,
			status: getStatus(ready, unschedulable),
			roles: formatRoles(roles),
			age: age,
			version: kubeletVersion
		};
	}, []);

	// Key function for identifying unique nodes
	const getItemKey = useCallback((node: NodeTableRow) => {
		return node.name; // Nodes are cluster-scoped, so just use the name
	}, []);

	const result = useResourceWithOverview<NodeTableRow>('nodes', {
		fetchData: fetchNodes,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [], // Nodes are cluster-scoped, no namespace dependency
		debug: false // Debug disabled
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
