import { useState, useEffect, useCallback, useRef } from 'react';
import { useOverviewWebSocket, type OverviewWebSocketEvent } from './useOverviewWebSocket';

export interface UseResourceWithOverviewOptions<T> {
	/**
	 * Function to fetch initial data via API
	 */
	fetchData: () => Promise<T[]>;

	/**
	 * Function to transform WebSocket data to match the expected type
	 */
	transformWebSocketData?: (wsData: any) => T;

	/**
	 * Function to determine if two items are the same (for updates)
	 */
	getItemKey: (item: T) => string;

	/**
	 * Dependencies for the fetchData function
	 */
	fetchDependencies?: any[];

	/**
	 * Whether to enable debug logging
	 */
	debug?: boolean;
}

export interface UseResourceWithOverviewResult<T> {
	data: T[];
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
	isConnected: boolean;
}

/**
 * Hook that combines API data fetching with real-time overview WebSocket updates
 * Uses the unified overview stream instead of resource-specific streams
 */
export function useResourceWithOverview<T>(
	resource: string,
	options: UseResourceWithOverviewOptions<T>
): UseResourceWithOverviewResult<T> {
	const {
		fetchData,
		transformWebSocketData = (data) => data as T,
		getItemKey,
		fetchDependencies = [],
		debug = false
	} = options;

	const [data, setData] = useState<T[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const dataRef = useRef<T[]>([]);

	const { isConnected, subscribe } = useOverviewWebSocket({ debug });

	const log = useCallback((message: string, ...args: any[]) => {
		if (debug) {
			console.log(`[${resource}WithOverview] ${message}`, ...args);
		}
	}, [debug, resource]);

	// API fetch function
	const refetch = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			log('Fetching initial data via API...');

			const result = await fetchData();
			log('API data fetched:', result.length, 'items');

			setData(result);
			dataRef.current = result;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : `Failed to fetch ${resource}`;
			setError(errorMessage);
			console.error(`Error fetching ${resource}:`, err);
		} finally {
			setLoading(false);
		}
	}, [fetchData, resource, log]);	// Handle overview WebSocket events
	const handleOverviewEvent = useCallback((event: OverviewWebSocketEvent) => {
		log('Overview event received:', event);

		// Only handle events for our resource type
		if (event.resource !== resource) {
			return;
		}

		if (event.action === 'added') {
			log('Adding new item:', event.data.name);
			const newItem = transformWebSocketData(event.data);
			const itemKey = getItemKey(newItem);

			setData(prevData => {
				// Check if item already exists (prevent duplicates)
				const existingIndex = prevData.findIndex(item => getItemKey(item) === itemKey);
				if (existingIndex !== -1) {
					log('Item already exists, updating instead of adding');
					const updatedData = [...prevData];
					updatedData[existingIndex] = newItem;
					dataRef.current = updatedData;
					return updatedData;
				}

				const updatedData = [...prevData, newItem];
				dataRef.current = updatedData;
				return updatedData;
			});
		} else if (event.action === 'updated') {
			log('Updating existing item:', event.data.name);
			const updatedItem = transformWebSocketData(event.data);
			const itemKey = getItemKey(updatedItem);

			setData(prevData => {
				const existingIndex = prevData.findIndex(item => getItemKey(item) === itemKey);
				if (existingIndex !== -1) {
					const updatedData = [...prevData];
					updatedData[existingIndex] = updatedItem;
					dataRef.current = updatedData;
					return updatedData;
				}

				log('Item not found for update, adding instead');
				const updatedData = [...prevData, updatedItem];
				dataRef.current = updatedData;
				return updatedData;
			});
		} else if (event.action === 'deleted') {
			log('Removing deleted item:', event.data.name);
			const deletedItem = transformWebSocketData(event.data);
			const itemKey = getItemKey(deletedItem);
			log('Delete item key:', itemKey);

			setData(prevData => {
				// If the delete key contains undefined namespace, try to find by name only
				if (itemKey.includes('undefined/')) {
					const itemName = event.data.name;
					log('Delete key has undefined namespace, trying to match by name:', itemName);

					const updatedData = prevData.filter(item => {
						const currentKey = getItemKey(item);
						// Extract name from the key (assuming format is "namespace/name")
						const keyName = currentKey.split('/').pop();
						const shouldKeep = keyName !== itemName;
						return shouldKeep;
					});
					dataRef.current = updatedData;
					return updatedData;
				}

				// Normal deletion by full key
				const updatedData = prevData.filter(item => {
					const currentKey = getItemKey(item);
					const shouldKeep = currentKey !== itemKey;
					return shouldKeep;
				});
				dataRef.current = updatedData;
				return updatedData;
			});
		}
	}, [resource, transformWebSocketData, getItemKey, log]);

	// Set up overview WebSocket subscription
	useEffect(() => {
		log('Setting up overview WebSocket subscription');
		const unsubscribe = subscribe(resource, handleOverviewEvent);

		return () => {
			log('Cleaning up overview WebSocket subscription');
			unsubscribe();
		};
	}, [subscribe, resource, handleOverviewEvent, log]);

	// Fetch initial data when dependencies change
	useEffect(() => {
		refetch();
	}, [refetch, ...fetchDependencies]); // eslint-disable-line react-hooks/exhaustive-deps

	return {
		data,
		loading,
		error,
		refetch,
		isConnected
	};
}
