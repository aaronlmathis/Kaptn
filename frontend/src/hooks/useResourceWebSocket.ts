import { useEffect, useCallback, useRef } from 'react';
import { WebSocketService } from '@/lib/websocket';

export interface ResourceWebSocketEvent<T = any> {
	type: string;
	action?: 'added' | 'updated' | 'deleted';
	data: T;
	timestamp?: string;
}

export interface UseResourceWebSocketOptions {
	/**
	 * Whether to connect to WebSocket automatically
	 * @default true
	 */
	autoConnect?: boolean;
	
	/**
	 * Whether to enable debug logging
	 * @default false
	 */
	debug?: boolean;
}

export interface UseResourceWebSocketResult<T> {
	/**
	 * Connect to the WebSocket stream
	 */
	connect: () => void;
	
	/**
	 * Disconnect from the WebSocket stream
	 */
	disconnect: () => void;
	
	/**
	 * Whether the WebSocket is currently connected
	 */
	isConnected: boolean;
	
	/**
	 * Register a handler for specific event types
	 */
	on: (eventType: string, handler: (event: ResourceWebSocketEvent<T>) => void) => void;
	
	/**
	 * Unregister a handler for specific event types
	 */
	off: (eventType: string, handler: (event: ResourceWebSocketEvent<T>) => void) => void;
}

/**
 * Hook for connecting to resource-specific WebSocket streams
 * Provides a clean interface for real-time resource updates
 */
export function useResourceWebSocket<T = any>(
	resource: string,
	options: UseResourceWebSocketOptions = {}
): UseResourceWebSocketResult<T> {
	const { autoConnect = true, debug = false } = options;
	
	const wsService = useRef<WebSocketService>(new WebSocketService());
	const handlersRef = useRef<Map<string, Set<(event: ResourceWebSocketEvent<T>) => void>>>(new Map());
	const isConnectedRef = useRef(false);
	
	const log = useCallback((message: string, ...args: any[]) => {
		if (debug) {
			console.log(`[ResourceWebSocket:${resource}] ${message}`, ...args);
		}
	}, [debug, resource]);
	
	const connect = useCallback(() => {
		if (isConnectedRef.current) {
			log('Already connected, skipping...');
			return;
		}
		
		log('Connecting to WebSocket stream...');
		const endpoint = `/stream/${resource}`;
		wsService.current.connect(endpoint);
		isConnectedRef.current = true;
		
		// Set up message routing
		const handleMessage = (message: any) => {
			log('Received message:', message);
			
			// Convert WebSocketMessage to ResourceWebSocketEvent
			const resourceEvent: ResourceWebSocketEvent<T> = {
				type: message.type,
				action: message.action as 'added' | 'updated' | 'deleted' | undefined,
				data: message.data,
				timestamp: message.timestamp
			};
			
			const eventType = resourceEvent.type;
			const handlers = handlersRef.current.get(eventType);
			
			if (handlers && handlers.size > 0) {
				handlers.forEach(handler => {
					try {
						handler(resourceEvent);
					} catch (error) {
						console.error(`Error in ${resource} WebSocket handler for ${eventType}:`, error);
					}
				});
			} else {
				log(`No handlers registered for event type: ${eventType}`);
			}
		};
		
		// Register for all possible event types for this resource
		const eventTypes = [
			`${resource.slice(0, -1)}_added`,    // deployment_added, service_added, etc.
			`${resource.slice(0, -1)}_updated`,  // deployment_updated, service_updated, etc.
			`${resource.slice(0, -1)}_deleted`,  // deployment_deleted, service_deleted, etc.
			'summaryUpdate'                       // For summary card updates
		];
		
		eventTypes.forEach(eventType => {
			wsService.current.on(eventType, handleMessage);
		});
		
		log('WebSocket connection established');
	}, [resource, log]);
	
	const disconnect = useCallback(() => {
		if (!isConnectedRef.current) {
			log('Already disconnected, skipping...');
			return;
		}
		
		log('Disconnecting from WebSocket stream...');
		wsService.current.disconnect();
		isConnectedRef.current = false;
		log('WebSocket disconnected');
	}, [log]);
	
	const on = useCallback((eventType: string, handler: (event: ResourceWebSocketEvent<T>) => void) => {
		log(`Registering handler for event type: ${eventType}`);
		
		if (!handlersRef.current.has(eventType)) {
			handlersRef.current.set(eventType, new Set());
		}
		
		handlersRef.current.get(eventType)!.add(handler);
	}, [log]);
	
	const off = useCallback((eventType: string, handler: (event: ResourceWebSocketEvent<T>) => void) => {
		log(`Unregistering handler for event type: ${eventType}`);
		
		const handlers = handlersRef.current.get(eventType);
		if (handlers) {
			handlers.delete(handler);
			if (handlers.size === 0) {
				handlersRef.current.delete(eventType);
			}
		}
	}, [log]);
	
	// Auto-connect on mount if enabled
	useEffect(() => {
		if (autoConnect) {
			connect();
		}
		
		// Cleanup on unmount
		return () => {
			if (isConnectedRef.current) {
				disconnect();
			}
		};
	}, [autoConnect, connect, disconnect]);
	
	return {
		connect,
		disconnect,
		isConnected: isConnectedRef.current,
		on,
		off
	};
}
