// API utility for making authenticated requests
import Cookies from 'js-cookie';

const TOKEN_COOKIE_NAME = 'kad_token';

// Get authentication token
const getAuthToken = (): string | null => {
	return Cookies.get(TOKEN_COOKIE_NAME) || window.localStorage.getItem('auth_token');
};

// Create authenticated fetch wrapper
export const authenticatedFetch = (url: string, options: RequestInit = {}): Promise<Response> => {
	const token = getAuthToken();

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(options.headers as Record<string, string> || {}),
	};

	// Add authorization header if token exists
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	return fetch(url, {
		...options,
		headers,
	});
};

// Create authenticated WebSocket connection
export const createAuthenticatedWebSocket = (url: string): WebSocket => {
	const token = getAuthToken();

	// For WebSocket, we'll pass the token as a query parameter
	// since we can't set headers on WebSocket connections
	const wsUrl = new URL(url, window.location.origin);
	if (token) {
		wsUrl.searchParams.set('token', token);
	}

	return new WebSocket(wsUrl.toString().replace('http://', 'ws://').replace('https://', 'wss://'));
};

// API client with common methods
export const apiClient = {
	get: (url: string, options?: RequestInit) =>
		authenticatedFetch(url, { ...options, method: 'GET' }),

	post: (url: string, data?: any, options?: RequestInit) =>
		authenticatedFetch(url, {
			...options,
			method: 'POST',
			body: data ? JSON.stringify(data) : undefined,
		}),

	put: (url: string, data?: any, options?: RequestInit) =>
		authenticatedFetch(url, {
			...options,
			method: 'PUT',
			body: data ? JSON.stringify(data) : undefined,
		}),

	delete: (url: string, options?: RequestInit) =>
		authenticatedFetch(url, { ...options, method: 'DELETE' }),
};

// API endpoints
export const endpoints = {
	// Nodes
	nodes: '/api/v1/nodes',
	nodeCordon: (nodeName: string) => `/api/v1/nodes/${nodeName}/cordon`,
	nodeUncordon: (nodeName: string) => `/api/v1/nodes/${nodeName}/uncordon`,
	nodeDrain: (nodeName: string) => `/api/v1/nodes/${nodeName}/drain`,

	// Jobs
	job: (jobId: string) => `/api/v1/jobs/${jobId}`,

	// Pods
	pods: '/api/v1/pods',

	// Apply
	apply: (namespace: string) => `/api/v1/namespaces/${namespace}/apply`,

	// WebSocket streams
	streamNodes: '/api/v1/stream/nodes',
	streamPods: '/api/v1/stream/pods',

	// Auth
	login: '/api/v1/auth/login',
	logout: '/api/v1/auth/logout',
	authCallback: '/api/v1/auth/callback',
	me: '/api/v1/auth/me',
};
