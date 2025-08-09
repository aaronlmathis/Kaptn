import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getCronJobs, transformCronJobsToUI, type DashboardCronJob } from '@/lib/k8s-workloads';

/**
 * Enhanced cronjobs hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useCronJobsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchCronJobs = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const cronJobs = await getCronJobs(namespace);
		return transformCronJobsToUI(cronJobs);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): DashboardCronJob => {
		// Type guards and default values
		const name = typeof wsData.name === 'string' ? wsData.name : 'Unknown';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : 'default';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : new Date().toISOString();

		// CronJobs-specific field transformations
		const schedule = typeof wsData.schedule === 'string' ? wsData.schedule : '0 0 * * *';
		const suspended = typeof wsData.suspended === 'boolean' ? wsData.suspended : false;
		const activeJobs = typeof wsData.activeJobs === 'number' ? wsData.activeJobs : 0;

		// Optional timestamp fields
		const lastScheduleTime = typeof wsData.lastScheduleTime === 'string' ? wsData.lastScheduleTime : undefined;

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

		// Calculate last run time display
		let lastRun = 'Never';
		if (lastScheduleTime) {
			const lastRunMs = Date.now() - new Date(lastScheduleTime).getTime();
			const lastRunDays = Math.floor(lastRunMs / (1000 * 60 * 60 * 24));
			const lastRunHours = Math.floor((lastRunMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			const lastRunMinutes = Math.floor((lastRunMs % (1000 * 60 * 60)) / (1000 * 60));

			if (lastRunDays > 0) {
				lastRun = `${lastRunDays}d ago`;
			} else if (lastRunHours > 0) {
				lastRun = `${lastRunHours}h ago`;
			} else {
				lastRun = `${lastRunMinutes}m ago`;
			}
		}

		return {
			id: Date.now() + Math.random(), // Simple unique ID
			name: name,
			namespace: namespace,
			age: age,
			schedule: schedule,
			suspend: suspended,
			active: activeJobs,
			lastSchedule: lastRun,
			image: 'N/A', // Default image placeholder
		};
	}, []);

	// Key function for identifying unique cronjobs
	const getItemKey = useCallback((cronJob: DashboardCronJob) => {
		return `${cronJob.namespace}/${cronJob.name}`;
	}, []);

	const result = useResourceWithOverview<DashboardCronJob>('cronjobs', {
		fetchData: fetchCronJobs,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false
	});

	return result;
}
