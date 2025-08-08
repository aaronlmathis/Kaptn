import { useCallback } from 'react';
import { useResourceDataWithWebSocket } from './useResourceDataWithWebSocket';
import { useNamespace } from '@/contexts/namespace-context';
import { getDeployments, transformDeploymentsToUI, type DashboardDeployment } from '@/lib/k8s-workloads';

/**
 * Enhanced deployments hook with WebSocket support
 * Maintains backwards compatibility while adding real-time updates
 */
export function useDeploymentsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();
	
	// API fetch function
	const fetchDeployments = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const deployments = await getDeployments(namespace);
		return transformDeploymentsToUI(deployments);
	}, [selectedNamespace]);
	
	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: any): DashboardDeployment => {
		// The WebSocket data comes from the informer which has the structure defined in deployments.go
		// Transform it to match the DashboardDeployment interface
		
		const ready = wsData.replicas?.ready || 0;
		const desired = wsData.replicas?.desired || 0;
		const available = wsData.replicas?.available || 0;
		const updated = wsData.replicas?.updated || 0;
		
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
		
		// Get the first image or empty string
		const image = wsData.images && wsData.images.length > 0 ? wsData.images[0] : '';
		
		return {
			id: `${wsData.namespace}-${wsData.name}`.hashCode(), // Simple hash for ID
			name: wsData.name,
			namespace: wsData.namespace,
			ready: `${ready}/${desired}`,
			upToDate: updated,
			available: available,
			age: age,
			image: image
		};
	}, []);
	
	// Key function for identifying unique deployments
	const getItemKey = useCallback((deployment: DashboardDeployment) => {
		return `${deployment.namespace}/${deployment.name}`;
	}, []);
	
	const result = useResourceDataWithWebSocket<DashboardDeployment>('deployments', {
		fetchData: fetchDeployments,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false // Set to true for debugging
	});
	
	return result;
}

// Extension to String prototype for simple hash code (for generating IDs)
declare global {
	interface String {
		hashCode(): number;
	}
}

String.prototype.hashCode = function() {
	let hash = 0;
	if (this.length === 0) return hash;
	for (let i = 0; i < this.length; i++) {
		const char = this.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash);
};
