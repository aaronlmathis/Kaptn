import { useState, useEffect, useCallback, useRef } from 'react';

export interface OverviewWebSocketEvent<T = any> {
	action: 'added' | 'updated' | 'deleted';
	resource: string;
	data: T;
}

// Raw message format from the server
interface RawOverviewMessage<T = any> {
	type: string; // e.g., "deployment_updated", "service_added", etc.
	data: T;
	room: string; // "overview"
}

export interface UseOverviewWebSocketOptions {
	debug?: boolean;
}

export interface UseOverviewWebSocketResult {
	isConnected: boolean;
	subscribe: (resource: string, handler: (event: OverviewWebSocketEvent) => void) => () => void;
}

/**
 * Hook for connecting to the overview WebSocket stream that handles all resource types
 * This connects to /stream/overview and provides a way to subscribe to specific resource events
 */
export function useOverviewWebSocket(options: UseOverviewWebSocketOptions = {}): UseOverviewWebSocketResult {
	const { debug = false } = options;
	const [isConnected, setIsConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const handlersRef = useRef<Map<string, Set<(event: OverviewWebSocketEvent) => void>>>(new Map());
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectAttemptsRef = useRef(0);
	const maxReconnectAttempts = 5;
	const baseReconnectDelay = 1000;

	const log = useCallback((message: string, ...args: any[]) => {
		if (debug) {
			console.log(`[OverviewWebSocket] ${message}`, ...args);
		}
	}, [debug]);

	// Transform raw server message to our expected format
	const transformMessage = useCallback((rawMessage: RawOverviewMessage): OverviewWebSocketEvent | null => {
		// Parse the type field to extract resource and action
		// Expected format: "resource_action" (e.g., "deployment_updated", "service_added")
		const parts = rawMessage.type.split('_');
		if (parts.length < 2) {
			log('Invalid message type format:', rawMessage.type);
			return null;
		}
		
		const action = parts.pop(); // Last part is the action
		const resource = parts.join('_'); // Everything else is the resource (handles multi-word resources)
		
		// Map action to our expected format
		let mappedAction: 'added' | 'updated' | 'deleted';
		switch (action) {
			case 'added':
			case 'created':
				mappedAction = 'added';
				break;
			case 'updated':
			case 'modified':
				mappedAction = 'updated';
				break;
			case 'deleted':
			case 'removed':
				mappedAction = 'deleted';
				break;
			default:
				log('Unknown action:', action);
				return null;
		}
		
		// Pluralize resource name to match our expected format
		let pluralResource = resource;
		if (!pluralResource.endsWith('s')) {
			// Simple pluralization - add 's'
			pluralResource += 's';
		}
		
		return {
			action: mappedAction,
			resource: pluralResource,
			data: rawMessage.data
		};
	}, [log]);

	const connect = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			return;
		}

		try {
			log('Connecting to overview WebSocket...');
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const host = window.location.host;
			const wsUrl = `${protocol}//${host}/api/v1/stream/overview`;
			
			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				log('Overview WebSocket connected');
				setIsConnected(true);
				reconnectAttemptsRef.current = 0;
			};

			ws.onmessage = (event) => {
				try {
					log('Raw WebSocket message received');
					
					// Handle multiple JSON objects separated by newlines
					const messages = event.data.trim().split('\n').filter(line => line.trim());
					
					for (const message of messages) {
						try {
							const rawMessage = JSON.parse(message) as RawOverviewMessage;
							log('Processing message type:', rawMessage.type);
							
							// Transform to our expected format
							const eventData = transformMessage(rawMessage);
							if (!eventData) {
								log('Message transformation failed, skipping');
								continue;
							}
							
							log('Dispatching event for resource:', eventData.resource, 'action:', eventData.action);
							
							// Dispatch to all handlers for this resource
							const resourceHandlers = handlersRef.current.get(eventData.resource);
							if (resourceHandlers) {
								resourceHandlers.forEach(handler => {
									try {
										handler(eventData);
									} catch (error) {
										console.error('Error in overview WebSocket handler:', error);
									}
								});
							}
						} catch (parseError) {
							console.error('Error parsing individual overview WebSocket message:', parseError, 'Message:', message);
						}
					}
				} catch (error) {
					console.error('Error processing overview WebSocket message:', error, 'Raw data:', event.data);
				}
			};

			ws.onclose = (event) => {
				log('Overview WebSocket closed:', event.code, event.reason);
				setIsConnected(false);
				wsRef.current = null;

				// Attempt to reconnect if not a clean close and under max attempts
				if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
					const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
					log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
					
					reconnectTimeoutRef.current = setTimeout(() => {
						reconnectAttemptsRef.current++;
						connect();
					}, delay);
				}
			};

			ws.onerror = (error) => {
				log('Overview WebSocket error:', error);
			};

		} catch (error) {
			log('Error creating overview WebSocket connection:', error);
		}
	}, [log, transformMessage]);

	const disconnect = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
		}
		
		if (wsRef.current) {
			log('Disconnecting overview WebSocket');
			wsRef.current.close(1000, 'Component unmounting');
			wsRef.current = null;
		}
		
		setIsConnected(false);
	}, [log]);

	const subscribe = useCallback((resource: string, handler: (event: OverviewWebSocketEvent) => void) => {
		log(`Subscribing to ${resource} events`);
		
		if (!handlersRef.current.has(resource)) {
			handlersRef.current.set(resource, new Set());
		}
		
		handlersRef.current.get(resource)!.add(handler);

		// Return unsubscribe function
		return () => {
			log(`Unsubscribing from ${resource} events`);
			const resourceHandlers = handlersRef.current.get(resource);
			if (resourceHandlers) {
				resourceHandlers.delete(handler);
				if (resourceHandlers.size === 0) {
					handlersRef.current.delete(resource);
				}
			}
		};
	}, [log]);

	// Connect on mount, disconnect on unmount
	useEffect(() => {
		connect();
		return disconnect;
	}, [connect, disconnect]);

	return {
		isConnected,
		subscribe
	};
}
