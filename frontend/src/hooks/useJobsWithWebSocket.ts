import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getJobs, transformJobsToUI, type DashboardJob } from '@/lib/k8s-workloads';

/**
 * Enhanced jobs hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useJobsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchJobs = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const jobs = await getJobs(namespace);
		return transformJobsToUI(jobs);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardJob => {
		// The WebSocket data comes from the informer which has the structure defined in jobs.go
		// Transform it to match the DashboardJob interface

		// Type guard and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const status = typeof wsData.status === 'string' ? wsData.status : 'Unknown';
		const completions = typeof wsData.completions === 'string' ? wsData.completions : '0/1';
		const duration = typeof wsData.duration === 'string' ? wsData.duration : '0s';
		const image = typeof wsData.image === 'string' ? wsData.image : '';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();

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
			id: `${namespace}-${name}`.hashCode(), // Simple hash for ID
			name: name,
			namespace: namespace,
			status: status,
			completions: completions,
			duration: duration,
			age: age,
			image: image
		};
	}, []);

	// Key function for identifying unique jobs
	const getItemKey = useCallback((job: DashboardJob) => {
		return `${job.namespace}/${job.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardJob>('jobs', {
		fetchData: fetchJobs,
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
