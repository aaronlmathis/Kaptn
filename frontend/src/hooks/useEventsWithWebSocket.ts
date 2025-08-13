import { useCallback } from 'react';
import { useResourceWithOverview } from './useResourceWithOverview';
import { useNamespace } from '@/contexts/namespace-context';
import { getEvents, transformEventsToUI, type EventTableRow } from '@/lib/k8s-events';

/**
 * Enhanced events hook with overview WebSocket support
 * Connects to the unified overview stream for real-time updates
 */
export function useEventsWithWebSocket(enableWebSocket: boolean = true) {
	const { selectedNamespace } = useNamespace();

	// API fetch function
	const fetchEvents = useCallback(async () => {
		const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
		const events = await getEvents(namespace);
		return transformEventsToUI(events);
	}, [selectedNamespace]);

	// WebSocket data transformer
	const transformWebSocketData = useCallback((wsData: Record<string, unknown>): EventTableRow => {
		// The WebSocket data comes from the informer which has the structure defined in events.go
		// Transform it to match the EventTableRow interface

		// Type guards for safe access
		const name = typeof wsData.name === 'string' ? wsData.name : '';
		const namespace = typeof wsData.namespace === 'string' ? wsData.namespace : '';
		const type = typeof wsData.type === 'string' ? wsData.type : 'Normal';
		const reason = typeof wsData.reason === 'string' ? wsData.reason : '';
		const message = typeof wsData.message === 'string' ? wsData.message : '';
		const involvedObject = typeof wsData.involvedObject === 'string' ? wsData.involvedObject : '';
		const source = typeof wsData.source === 'string' ? wsData.source : '';
		const count = typeof wsData.count === 'number' ? wsData.count : 1;
		const level = typeof wsData.level === 'string' ? wsData.level : 'Info';
		const lastTimestamp = typeof wsData.lastTimestamp === 'string' ? wsData.lastTimestamp : '';
		const creationTimestamp = typeof wsData.creationTimestamp === 'string' ? wsData.creationTimestamp : '';

		// Truncate message for display
		const truncateMessage = (message: string, maxLength: number = 100): string => {
			if (!message) return '';
			if (message.length <= maxLength) return message;
			return message.substring(0, maxLength) + '...';
		};

		// Calculate age from last timestamp or creation timestamp
		const timestamp = lastTimestamp ? new Date(lastTimestamp) : new Date(creationTimestamp);
		const ageMs = Date.now() - timestamp.getTime();
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
			id: 0, // Temporary ID, will be set properly when merged with API data
			name: name,
			namespace: namespace,
			type: type,
			reason: reason,
			message: truncateMessage(message),
			involvedObject: involvedObject,
			source: source,
			count: count,
			age: age,
			level: level
		};
	}, []);

	// Key function for identifying unique events
	const getItemKey = useCallback((event: EventTableRow) => {
		return `${event.namespace}/${event.name}`;
	}, []);

	const result = useResourceWithOverview<EventTableRow>('events', {
		fetchData: fetchEvents,
		transformWebSocketData: enableWebSocket ? transformWebSocketData : undefined,
		getItemKey,
		fetchDependencies: [selectedNamespace],
		debug: false // Debug disabled
	});

	return result;
}
