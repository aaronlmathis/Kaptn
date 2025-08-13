/**
 * Kubernetes Events API
 * 
 * This module handles all event-related Kubernetes resources including:
 * - Events
 */

import { apiClient } from './api-client';

// Event interfaces based on the actual backend API response
export interface Event {
	name: string;
	namespace: string;
	type: string;
	reason: string;
	message: string;
	source: string;
	involvedObject: string;
	involvedObjectKind: string;
	involvedObjectName: string;
	count: number;
	firstTimestamp: string;
	lastTimestamp: string;
	level: string;
	age: string;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
}

// Event detail interfaces for the detail view
export interface EventDetail {
	name: string;
	namespace: string;
	type: string;
	reason: string;
	message: string;
	source: Record<string, unknown>;
	involvedObject: Record<string, unknown>;
	count: number;
	firstTimestamp: string;
	lastTimestamp: string;
	action: string;
	reportingController: string;
	reportingInstance: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
	creationTimestamp: string;
}

// Dashboard interfaces for transformed data that matches the current UI schema
export interface EventTableRow {
	id: number;
	name: string;
	namespace: string;
	type: string;
	reason: string;
	message: string;
	involvedObject: string;
	source: string;
	count: number;
	age: string;
	level: string;
}

export interface DashboardEvent {
	id: number;
	name: string;
	namespace: string;
	type: string;
	reason: string;
	message: string;
	involvedObject: string;
	source: string;
	count: number;
	age: string;
	level: string;
}

/**
 * Event operations
 */

// Event operations
export async function getEvents(namespace?: string): Promise<Event[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: Event[] }; status: string }>(`/events${query}`);
	return response.data?.items || [];
}

export async function getEvent(namespace: string, name: string): Promise<{ summary: Event; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: Event; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/events/${namespace}/${name}`);
	return response.data;
}

/**
 * Transform functions to convert backend data to UI-compatible format
 */

export function transformEventsToUI(events: Event[]): EventTableRow[] {
	if (!events || !Array.isArray(events)) {
		return [];
	}
	return events.map((event, index) => ({
		id: index,
		name: event.name,
		namespace: event.namespace,
		type: event.type,
		reason: event.reason,
		message: truncateMessage(event.message),
		involvedObject: event.involvedObject,
		source: event.source,
		count: event.count,
		age: event.age,
		level: event.level || getEventLevel(event.type)
	}));
}

/**
 * Utility functions
 */

function truncateMessage(message: string, maxLength: number = 100): string {
	if (!message) return '';
	if (message.length <= maxLength) return message;
	return message.substring(0, maxLength) + '...';
}

function getEventLevel(type: string): string {
	switch (type) {
		case 'Warning':
			return 'Warning';
		case 'Error':
			return 'Error';
		default:
			return 'Info';
	}
}
