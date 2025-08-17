/**
 * LiveSeriesClient - Unified WebSocket client for timeseries data
 * 
 * Implements the new multiplexed WebSocket protocol for real-time metric streaming.
 * This is a singleton that manages all subscriptions across components.
 */

// Message types matching the server implementation
interface HelloMessage {
	type: 'hello';
	capabilities: Record<string, boolean>;
	limits: {
		maxClients: number;
		maxSeriesPerClient: number;
		maxRateHz: number;
	};
}

interface SubscribeMessage {
	type: 'subscribe';
	groupId: string;
	res: 'hi' | 'lo';
	since: string;
	series: string[];
}

interface UnsubscribeMessage {
	type: 'unsubscribe';
	groupId: string;
	series: string[];
}

interface AckMessage {
	type: 'ack';
	groupId: string;
	accepted: string[];
	rejected?: Array<{
		key: string;
		reason: string;
	}>;
}

interface InitMessage {
	type: 'init';
	groupId: string;
	data: {
		series: Record<string, Array<{ t: number; v: number; entity?: Record<string, string> }>>;
		capabilities: Record<string, boolean>;
	};
}

interface AppendMessage {
	type: 'append';
	key: string;
	point: { t: number; v: number; entity?: Record<string, string> };
}

interface ErrorMessage {
	type: 'error';
	error: string;
}

type WSMessage = HelloMessage | AckMessage | InitMessage | AppendMessage | ErrorMessage;

// Subscription configuration
export interface SubscriptionConfig {
	groupId: string;
	since: string;
	res: 'hi' | 'lo';
	series: string[];
}

// Event listener type
type EventListener = (data: unknown) => void;

// Connection state
export interface ConnectionState {
	connected: boolean;
	capabilities: Record<string, boolean> | null;
	limits: HelloMessage['limits'] | null;
	latency: number;
	lastError: string | null;
}

/**
 * LiveSeriesClient - Singleton WebSocket client for timeseries
 */
export class LiveSeriesClient {
	private static instance: LiveSeriesClient | null = null;

	private ws: WebSocket | null = null;
	private subscriptions = new Map<string, SubscriptionConfig>();
	private listeners = new Map<string, EventListener[]>();
	private connectionState: ConnectionState = {
		connected: false,
		capabilities: null,
		limits: null,
		latency: 0,
		lastError: null,
	};

	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000;
	private pingInterval: number | null = null;
	private shouldAutoReconnect = true;
	private latencyStartTime: number | null = null;

	private constructor() {
		// Private constructor for singleton
	}

	/**
	 * Get the singleton instance
	 */
	static getInstance(): LiveSeriesClient {
		if (!LiveSeriesClient.instance) {
			LiveSeriesClient.instance = new LiveSeriesClient();
		}
		return LiveSeriesClient.instance;
	}

	/**
	 * Connect to the WebSocket endpoint
	 */
	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				resolve();
				return;
			}

			this.shouldAutoReconnect = true; // Re-enable auto-reconnect
			this.disconnect(); // Clean up any existing connection

			// Always connect directly to port 9999 for both development and production
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const host = window.location.hostname;
			const url = `${protocol}//${host}:9999/api/v1/timeseries/live`;

			console.log(`🔌 LiveSeriesClient: Attempting connection to ${url}`);
			console.log(`🔌 WebSocket constructor available:`, typeof WebSocket !== 'undefined');
			console.log(`🔌 Current location:`, {
				hostname: window.location.hostname,
				port: window.location.port,
				protocol: window.location.protocol
			});

			this.ws = new WebSocket(url);

			console.log(`🔌 WebSocket created with readyState:`, this.ws.readyState);

			this.ws.onopen = () => {
				console.log('✅ LiveSeriesClient: Connected');
				this.connectionState.connected = true;
				this.connectionState.lastError = null;
				this.reconnectAttempts = 0;
				this.startPingInterval();
				this.emit('connect', null);
				resolve();
			};

			this.ws.onmessage = (event) => {
				this.handleMessage(event.data);
			};

			this.ws.onerror = (error) => {
				console.error('❌ LiveSeriesClient: WebSocket error event', {
					error: error,
					type: error.type,
					target: error.target,
					readyState: this.ws?.readyState,
					url: url,
					timestamp: new Date().toISOString()
				});

				// Check WebSocket ready states
				console.error('❌ WebSocket Ready States:', {
					CONNECTING: WebSocket.CONNECTING, // 0
					OPEN: WebSocket.OPEN,             // 1
					CLOSING: WebSocket.CLOSING,       // 2
					CLOSED: WebSocket.CLOSED          // 3
				});

				this.connectionState.lastError = `WebSocket connection error (state: ${this.ws?.readyState})`;
				this.emit('error', error);
				reject(error);
			};

			this.ws.onclose = (event) => {
				console.log('🔌 LiveSeriesClient: WebSocket closed', {
					code: event.code,
					reason: event.reason,
					wasClean: event.wasClean,
					url: url
				});
				this.connectionState.connected = false;
				this.stopPingInterval();

				// Don't auto-reconnect if explicitly disconnected
				if (!this.shouldAutoReconnect) {
					this.emit('disconnect', null);
					return;
				}

				// Auto-reconnect with exponential backoff
				if (this.reconnectAttempts < this.maxReconnectAttempts) {
					const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
					console.log(`🔄 LiveSeriesClient: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
					setTimeout(() => {
						this.reconnectAttempts++;
						this.connect().catch(console.error);
					}, delay);
				} else {
					console.error('❌ LiveSeriesClient: Max reconnection attempts reached');
					this.connectionState.lastError = 'Max reconnection attempts reached';
					this.emit('disconnect', null);
				}
			};
		});
	}

	/**
	 * Disconnect from WebSocket
	 */
	disconnect(): void {
		this.shouldAutoReconnect = false; // Disable auto-reconnect for manual disconnect
		if (this.ws) {
			this.ws.close(1000, 'Client disconnect');
			this.ws = null;
		}
		this.connectionState.connected = false;
		this.stopPingInterval();
	}

	/**
	 * Subscribe to a group of series
	 */
	subscribe(config: SubscriptionConfig): void {
		console.log('📤 LiveSeriesClient: Subscribe called', {
			groupId: config.groupId,
			series: config.series,
			res: config.res,
			since: config.since,
			connected: this.isConnected(),
			wsReadyState: this.ws?.readyState
		});

		const existingConfig = this.subscriptions.get(config.groupId);

		// Check if we need to make changes
		const newSeries = config.series.filter(s => !existingConfig?.series.includes(s));
		const hasChanges = !existingConfig ||
			existingConfig.res !== config.res ||
			existingConfig.since !== config.since ||
			newSeries.length > 0;

		if (!hasChanges) {
			console.log(`📊 LiveSeriesClient: No changes needed for group ${config.groupId}`);
			return;
		}

		// Store subscription
		console.log('💾 LiveSeriesClient: Storing subscription for group:', config.groupId);
		this.subscriptions.set(config.groupId, config);

		// Send subscribe message if connected
		if (this.isConnected()) {
			console.log('📤 LiveSeriesClient: Sending subscribe message for group:', config.groupId);
			this.sendMessage({
				type: 'subscribe',
				groupId: config.groupId,
				res: config.res,
				since: config.since,
				series: config.series,
			});
		} else {
			console.log('⚠️ LiveSeriesClient: Not connected, subscription stored for later');
		}
	}

	/**
	 * Unsubscribe from specific series in a group
	 */
	unsubscribe(groupId: string, series?: string[]): void {
		const subscription = this.subscriptions.get(groupId);
		if (!subscription) {
			return;
		}

		if (!series) {
			// Unsubscribe from entire group
			this.subscriptions.delete(groupId);
			if (this.isConnected()) {
				this.sendMessage({
					type: 'unsubscribe',
					groupId,
					series: subscription.series,
				});
			}
		} else {
			// Unsubscribe from specific series
			const remainingSeries = subscription.series.filter(s => !series.includes(s));

			if (remainingSeries.length === 0) {
				this.subscriptions.delete(groupId);
			} else {
				this.subscriptions.set(groupId, { ...subscription, series: remainingSeries });
			}

			if (this.isConnected()) {
				this.sendMessage({
					type: 'unsubscribe',
					groupId,
					series,
				});
			}
		}
	}

	/**
	 * Add event listener
	 */
	on(event: string, listener: EventListener): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, []);
		}
		const listeners = this.listeners.get(event);
		if (listeners) {
			listeners.push(listener);
		}
	}

	/**
	 * Remove event listener
	 */
	off(event: string, listener: EventListener): void {
		const listeners = this.listeners.get(event);
		if (listeners) {
			const index = listeners.indexOf(listener);
			if (index > -1) {
				listeners.splice(index, 1);
			}
		}
	}

	/**
	 * Get current connection state
	 */
	getConnectionState(): ConnectionState {
		return { ...this.connectionState };
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN && this.connectionState.connected;
	}

	/**
	 * Force backoff (for testing/debugging)
	 */
	backoff(): void {
		this.disconnect();
		this.scheduleReconnect();
	}

	// Private methods

	private handleMessage(data: string): void {
		try {
			const message: WSMessage = JSON.parse(data);

			switch (message.type) {
				case 'hello':
					this.handleHello(message);
					break;
				case 'ack':
					this.handleAck(message);
					break;
				case 'init':
					this.handleInit(message);
					break;
				case 'append':
					this.handleAppend(message);
					break;
				case 'error':
					this.handleError(message);
					break;
				default:
					console.warn('⚠️ LiveSeriesClient: Unknown message type', (message as { type: string }).type);
			}
		} catch (error) {
			console.error('❌ LiveSeriesClient: Failed to parse message', error, data);
		}
	}

	private handleHello(message: HelloMessage): void {
		console.log('👋 LiveSeriesClient: Received hello', message);
		console.log('👋 LiveSeriesClient: Current subscriptions count:', this.subscriptions.size);
		this.connectionState.capabilities = message.capabilities;
		this.connectionState.limits = message.limits;

		// Re-subscribe to all existing subscriptions
		for (const subscription of this.subscriptions.values()) {
			console.log('📤 LiveSeriesClient: Re-subscribing to group:', subscription.groupId, subscription);
			this.sendMessage({
				type: 'subscribe',
				groupId: subscription.groupId,
				res: subscription.res,
				since: subscription.since,
				series: subscription.series,
			});
		}

		this.emit('hello', message);
	}

	private handleAck(message: AckMessage): void {
		console.log(`✅ LiveSeriesClient: Subscription ack for ${message.groupId}`, message);

		if (message.rejected && message.rejected.length > 0) {
			console.warn('⚠️ LiveSeriesClient: Some series were rejected', message.rejected);
		}

		this.emit('ack', message);
		this.emit(`ack:${message.groupId}`, message);
	}

	private handleInit(message: InitMessage): void {
		console.log(`📊 LiveSeriesClient: Initial data for ${message.groupId}`,
			Object.keys(message.data.series).length, 'series');

		this.emit('init', message);
		this.emit(`init:${message.groupId}`, message);
	}

	private handleAppend(message: AppendMessage): void {
		this.emit('append', message);
		this.emit(`append:${message.key}`, message.point);
	}

	private handleError(message: ErrorMessage): void {
		console.error('❌ LiveSeriesClient: Server error:', message.error);
		this.connectionState.lastError = message.error;
		this.emit('error', new Error(message.error));
	}

	private sendMessage(message: SubscribeMessage | UnsubscribeMessage): void {
		if (!this.isConnected()) {
			console.warn('⚠️ LiveSeriesClient: Cannot send message - not connected', {
				wsReadyState: this.ws?.readyState,
				connectionState: this.connectionState.connected
			});
			return;
		}

		try {
			if (this.ws) {
				const messageStr = JSON.stringify(message);
				console.log('📤 LiveSeriesClient: Sending message:', messageStr);
				this.ws.send(messageStr);
			}
		} catch (error) {
			console.error('❌ LiveSeriesClient: Failed to send message', error, message);
		}
	}

	private emit(event: string, data: unknown): void {
		const listeners = this.listeners.get(event);
		if (listeners) {
			listeners.forEach(listener => {
				try {
					listener(data);
				} catch (error) {
					console.error(`❌ LiveSeriesClient: Error in ${event} listener`, error);
				}
			});
		}
	}

	private scheduleReconnect(): void {
		this.reconnectAttempts++;
		const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

		console.log(`🔄 LiveSeriesClient: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

		setTimeout(() => {
			this.connect().catch(error => {
				console.error('❌ LiveSeriesClient: Reconnection failed', error);
			});
		}, delay);
	}

	private startPingInterval(): void {
		this.stopPingInterval();

		// Send ping every 30 seconds to measure latency
		this.pingInterval = window.setInterval(() => {
			if (this.isConnected()) {
				this.latencyStartTime = performance.now();
				// WebSocket ping will be handled by the browser automatically
			}
		}, 30000);
	}

	private stopPingInterval(): void {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}
	}
}

// Export singleton instance
export const liveSeriesClient = LiveSeriesClient.getInstance();

// Export types
export type {
	HelloMessage,
	AckMessage,
	InitMessage,
	AppendMessage,
	ErrorMessage,
};
