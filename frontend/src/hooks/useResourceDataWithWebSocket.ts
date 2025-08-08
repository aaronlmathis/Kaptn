import { useState, useEffect, useCallback, useRef } from 'react';
import { useResourceWebSocket, type ResourceWebSocketEvent } from './useResourceWebSocket';

export interface UseResourceDataWithWebSocketOptions<T> {
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

export interface UseResourceDataWithWebSocketResult<T> {
	data: T[];
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
	isConnected: boolean;
}

/**
 * Hook that combines API data fetching with real-time WebSocket updates
 * Provides backwards compatibility with API-only approach while adding real-time capabilities
 */
export function useResourceDataWithWebSocket<T>(
	resource: string,
	options: UseResourceDataWithWebSocketOptions<T>
): UseResourceDataWithWebSocketResult<T> {
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
	
	const { isConnected, on, off } = useResourceWebSocket<T>(resource, { debug });
	
	const log = useCallback((message: string, ...args: any[]) => {
		if (debug) {
			console.log(`[ResourceDataWS:${resource}] ${message}`, ...args);
		}
	}, [debug, resource]);
	
	// Fetch initial data via API
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
	}, [fetchData, resource, log]);
	
	// Handle WebSocket events
	const handleResourceAdded = useCallback((event: ResourceWebSocketEvent<any>) => {
		log('Resource added event:', event);
		
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
			
			log('Adding new item to data');
			const updatedData = [...prevData, newItem];
			dataRef.current = updatedData;
			return updatedData;
		});
	}, [transformWebSocketData, getItemKey, log]);
	
	const handleResourceUpdated = useCallback((event: ResourceWebSocketEvent<any>) => {
		log('Resource updated event:', event);
		
		const updatedItem = transformWebSocketData(event.data);
		const itemKey = getItemKey(updatedItem);
		
		setData(prevData => {
			const existingIndex = prevData.findIndex(item => getItemKey(item) === itemKey);
			if (existingIndex === -1) {
				log('Item not found for update, adding instead');
				const updatedData = [...prevData, updatedItem];
				dataRef.current = updatedData;
				return updatedData;
			}
			
			log('Updating existing item');
			const updatedData = [...prevData];
			updatedData[existingIndex] = updatedItem;
			dataRef.current = updatedData;
			return updatedData;
		});
	}, [transformWebSocketData, getItemKey, log]);
	
	const handleResourceDeleted = useCallback((event: ResourceWebSocketEvent<any>) => {
		log('Resource deleted event:', event);
		
		// For delete events, the data might just contain identifying info
		const itemKey = event.data.name && event.data.namespace 
			? `${event.data.namespace}/${event.data.name}`
			: event.data.name || JSON.stringify(event.data);
		
		setData(prevData => {
			const filteredData = prevData.filter(item => getItemKey(item) !== itemKey);
			log('Removed item from data, remaining:', filteredData.length);
			dataRef.current = filteredData;
			return filteredData;
		});
	}, [getItemKey, log]);
	
	// Set up WebSocket event handlers
	useEffect(() => {
		const addedEventType = `${resource.slice(0, -1)}_added`;
		const updatedEventType = `${resource.slice(0, -1)}_updated`;
		const deletedEventType = `${resource.slice(0, -1)}_deleted`;
		
		log('Registering WebSocket handlers:', { addedEventType, updatedEventType, deletedEventType });
		
		on(addedEventType, handleResourceAdded);
		on(updatedEventType, handleResourceUpdated);
		on(deletedEventType, handleResourceDeleted);
		
		return () => {
			log('Unregistering WebSocket handlers');
			off(addedEventType, handleResourceAdded);
			off(updatedEventType, handleResourceUpdated);
			off(deletedEventType, handleResourceDeleted);
		};
	}, [resource, on, off, handleResourceAdded, handleResourceUpdated, handleResourceDeleted, log]);
	
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
