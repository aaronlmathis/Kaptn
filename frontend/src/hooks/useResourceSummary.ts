import { useState, useEffect, useCallback } from 'react';
import { useResourceWebSocket, type ResourceWebSocketEvent } from './useResourceWebSocket';

// Type definitions for the summary cards
export interface SummaryCard {
	title: string;
	value: string;
	subtitle?: string;
	footer?: string;
}

// API interface for summary endpoint response
interface SummaryResponse {
	resource: string;
	namespace?: string;
	lastUpdated: string;
	cards?: SummaryCard[];
	data?: Record<string, unknown>; // Raw summary data when cards are not available
}

interface UseResourceSummaryOptions {
	/**
	 * Whether to enable real-time WebSocket updates for the summary
	 * @default true
	 */
	enableWebSocket?: boolean;
	
	/**
	 * Whether to enable debug logging
	 * @default false
	 */
	debug?: boolean;
}

// Hook to fetch resource summary data with WebSocket support
export function useResourceSummary(
	resource: string, 
	namespace?: string, 
	options: UseResourceSummaryOptions = {}
) {
	const { enableWebSocket = true, debug = false } = options;
	
	const [data, setData] = useState<SummaryCard[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<string | null>(null);
	
	const { isConnected, on, off } = useResourceWebSocket(resource, { 
		autoConnect: enableWebSocket,
		debug 
	});
	
	const log = useCallback((message: string, ...args: any[]) => {
		if (debug) {
			console.log(`[ResourceSummary:${resource}] ${message}`, ...args);
		}
	}, [debug, resource]);

	const fetchSummary = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			log('Fetching summary via API...');
			
			// Construct API URL based on whether namespace is provided
			const apiUrl = namespace
				? `/api/v1/summaries/namespaced/${namespace}/${resource}`
				: `/api/v1/summaries/${resource}`;

			const response = await fetch(apiUrl);

			if (!response.ok) {
				throw new Error(`Failed to fetch summary: ${response.status} ${response.statusText}`);
			}

			const summaryData: SummaryResponse = await response.json();

			// Use cards from API if available, otherwise create cards from raw data
			const summaryCards = summaryData.cards || createCardsFromSummary(summaryData.data, resource);

			log('Summary data fetched:', summaryCards.length, 'cards');
			setData(summaryCards);
			setLastUpdated(summaryData.lastUpdated);
		} catch (err) {
			console.warn(`Failed to fetch summary for ${resource}, falling back to mock data:`, err);
			setError(err instanceof Error ? err.message : 'Unknown error');

			// Fall back to mock data
			log('Using fallback mock data');
			setData(generateMockSummaryData(resource));
			setLastUpdated(new Date().toISOString());
		} finally {
			setIsLoading(false);
		}
	}, [resource, namespace, log]);
	
	// Handle WebSocket summary updates
	const handleSummaryUpdate = useCallback((event: ResourceWebSocketEvent<any>) => {
		log('Summary update received:', event);
		
		if (event.data && event.data.cards) {
			log('Updating summary cards from WebSocket');
			setData(event.data.cards);
			setLastUpdated(event.data.lastUpdated || new Date().toISOString());
		} else if (event.data && event.data.summary) {
			// Handle case where summary data is nested
			const summaryCards = event.data.summary.cards || createCardsFromSummary(event.data.summary.data, resource);
			log('Updating summary cards from nested WebSocket data');
			setData(summaryCards);
			setLastUpdated(event.data.summary.lastUpdated || new Date().toISOString());
		}
	}, [resource, log]);
	
	// Set up WebSocket handlers for summary updates
	useEffect(() => {
		if (enableWebSocket) {
			log('Setting up WebSocket summary handlers');
			on('summaryUpdate', handleSummaryUpdate);
			
			return () => {
				log('Cleaning up WebSocket summary handlers');
				off('summaryUpdate', handleSummaryUpdate);
			};
		}
	}, [enableWebSocket, on, off, handleSummaryUpdate, log]);

	useEffect(() => {
		fetchSummary();
	}, [fetchSummary]);

	return { 
		data, 
		isLoading, 
		error, 
		lastUpdated, 
		refetch: fetchSummary,
		isConnected: enableWebSocket ? isConnected : false
	};
}

// Create cards from summary data when cards array is not available
function createCardsFromSummary(summaryData: Record<string, unknown> | undefined, resource: string): SummaryCard[] {
	const cards: SummaryCard[] = [];

	if (!summaryData) {
		return cards;
	}

	// Total count card
	if (typeof summaryData.total === 'number') {
		cards.push({
			title: `Total ${getResourceDisplayName(resource)}`,
			value: summaryData.total.toString(),
			subtitle: `All ${resource} in cluster`,
		});
	}

	// Status cards
	if (summaryData.status && typeof summaryData.status === 'object') {
		for (const [statusType, count] of Object.entries(summaryData.status)) {
			if (typeof count === 'number') {
				cards.push({
					title: formatStatusTitle(statusType),
					value: count.toString(),
					subtitle: `${resource} with ${statusType} status`,
				});
			}
		}
	}

	// If no cards were created, provide a default card
	if (cards.length === 0) {
		cards.push({
			title: getResourceDisplayName(resource),
			value: 'N/A',
			subtitle: 'Data not available',
		});
	}

	return cards;
}

// Helper function to get display name for resource
function getResourceDisplayName(resource: string): string {
	const displayNames: Record<string, string> = {
		pods: 'Pods',
		nodes: 'Nodes',
		deployments: 'Deployments',
		services: 'Services',
		replicasets: 'ReplicaSets',
		statefulsets: 'StatefulSets',
		daemonsets: 'DaemonSets',
		configmaps: 'ConfigMaps',
		secrets: 'Secrets',
		endpoints: 'Endpoints',
	};

	return displayNames[resource] || resource;
}

// Helper function to format status titles
function formatStatusTitle(statusType: string): string {
	const titleMap: Record<string, string> = {
		ready: 'Ready',
		notready: 'Not Ready',
		running: 'Running',
		pending: 'Pending',
		failed: 'Failed',
		available: 'Available',
		unavailable: 'Unavailable',
	};

	return titleMap[statusType] || statusType.charAt(0).toUpperCase() + statusType.slice(1);
}

// Simple fallback data - should only be used when backend API fails
function generateMockSummaryData(resource: string): SummaryCard[] {
	const resourceDisplayName = getResourceDisplayName(resource);

	return [
		{
			title: `Total ${resourceDisplayName}`,
			value: "⚠️",
			subtitle: "Backend API unavailable",
			footer: "🔄 FALLBACK MODE - Check server connection"
		},
		{
			title: "Status",
			value: "N/A",
			subtitle: "Cannot fetch real data",
			footer: "⚡ Switch to real cluster data when backend is ready"
		},
		{
			title: "Health",
			value: "Unknown",
			subtitle: "Cluster state unavailable",
			footer: "📡 Attempting to connect to Kubernetes API"
		},
		{
			title: "Last Updated",
			value: "Never",
			subtitle: "No successful API calls",
			footer: "🛠️ Fix backend connection to see live data"
		}
	];
}
