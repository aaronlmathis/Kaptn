import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getPods, transformPodsToUI, type DashboardPod } from '@/lib/k8s-workloads';

/**
 * Enhanced pods hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function usePodsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchPods = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const pods = await getPods(namespace);
		return transformPodsToUI(pods);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: any): DashboardPod => {
		// The WebSocket data comes from the informer which has the structure defined in pods.go
		// Transform it to match the DashboardPod interface

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

		// Format memory
		const formatMemory = (bytes: number): string => {
			if (bytes < 1024 * 1024) {
				return `${Math.round(bytes / 1024)}Ki`;
			} else if (bytes < 1024 * 1024 * 1024) {
				return `${Math.round(bytes / (1024 * 1024))}Mi`;
			} else {
				return `${Math.round(bytes / (1024 * 1024 * 1024))}Gi`;
			}
		};

		// Get container image (first container's image)
		const getContainerImage = (containers: any[]): string => {
			if (containers && containers.length > 0) {
				return containers[0].image || '';
			}
			return '';
		};

		return {
			id: `${wsData.namespace}-${wsData.name}`.hashCode(), // Simple hash for ID
			name: wsData.name,
			namespace: wsData.namespace,
			node: wsData.node || '<none>',
			status: wsData.phase || 'Unknown',
			ready: wsData.ready || '0/0',
			restarts: wsData.restartCount || 0,
			age: age,
			cpu: wsData.cpu?.milli ? `${wsData.cpu.milli}m` : '0m',
			memory: wsData.memory?.bytes ? formatMemory(wsData.memory.bytes) : '0Mi',
			image: getContainerImage(wsData.containers || [])
		};
	}, []);

	// Key function for identifying unique pods
	const getItemKey = useCallback((pod: DashboardPod) => {
		return `${pod.namespace}/${pod.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardPod>('pods', {
		fetchData: fetchPods,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
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
