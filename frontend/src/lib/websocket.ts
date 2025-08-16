interface WebSocketMessage {
	type: string;
	action?: string;
	data?: any;
}

type MessageHandler = (message: WebSocketMessage) => void;

export class WebSocketService {
	private ws: WebSocket | null = null;
	private handlers: Map<string, MessageHandler[]> = new Map();
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private reconnectDelay = 1000; // Start with 1 second
	private isConnecting = false;

	connect(endpoint: string, token?: string) {
		if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) {
			console.log('WebSocket already connecting, skipping...');
			return; // Already connecting
		}

		this.isConnecting = true;
		console.log(`Attempting to connect to WebSocket: ${endpoint}`);


		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const url = `${protocol}//${window.location.host}/api/v1${endpoint}`;


		console.log(`WebSocket URL: ${url}`);

		this.ws = new WebSocket(url);

		this.ws.onopen = () => {
			this.isConnecting = false;
			this.reconnectAttempts = 0;
			console.log(`WebSocket connected to ${endpoint}`);

			if (token) {
				this.ws?.send(JSON.stringify({
					type: 'auth',
					token
				}));
			}
		};

		this.ws.onmessage = (event) => {
			try {
				// Handle multiple JSON messages separated by newlines
				const messages = event.data.trim().split('\n').filter((line: string) => line.trim());
				
				for (const messageStr of messages) {
					try {
						const message: WebSocketMessage = JSON.parse(messageStr);
						this.handleMessage(message);
					} catch (parseError) {
						console.error('Failed to parse individual WebSocket message:', parseError, 'Message:', messageStr);
					}
				}
			} catch (error) {
				console.error('Failed to process WebSocket message:', error, 'Raw data:', event.data);
			}
		};

		this.ws.onerror = (error) => {
			this.isConnecting = false;
			console.error('WebSocket error:', error);
		};

		this.ws.onclose = (event) => {
			this.isConnecting = false;
			console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);

			// Attempt to reconnect if not intentionally closed
			if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
				this.attemptReconnect(endpoint, token);
			}
		};
	}

	private attemptReconnect(endpoint: string, token?: string) {
		this.reconnectAttempts++;
		const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

		console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

		setTimeout(() => {
			this.connect(endpoint, token);
		}, delay);
	}

	private handleMessage(message: WebSocketMessage) {
		console.log('WebSocket message received:', message);
		const handlers = this.handlers.get(message.type) || [];
		console.log(`Found ${handlers.length} handlers for message type: ${message.type}`);
		handlers.forEach(handler => handler(message));
	}

	on(type: string, handler: MessageHandler) {
		if (!this.handlers.has(type)) {
			this.handlers.set(type, []);
		}
		this.handlers.get(type)!.push(handler);
	}

	off(type: string, handler: MessageHandler) {
		const handlers = this.handlers.get(type);
		if (handlers) {
			const index = handlers.indexOf(handler);
			if (index > -1) {
				handlers.splice(index, 1);
			}
		}
	}

	disconnect() {
		if (this.ws) {
			this.ws.close(1000, 'Client disconnect'); // Normal closure
			this.ws = null;
		}
		this.handlers.clear();
		this.reconnectAttempts = 0;
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}
}

// Global WebSocket service instance
export const wsService = new WebSocketService();
