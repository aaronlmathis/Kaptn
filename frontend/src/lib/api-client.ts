// API client for Kubernetes Admin Dashboard backend

import type { KaptnSession } from '../types/session';

export interface ApiResponse<T> {
	data?: T;
	status?: string;
	error?: string;
	code?: string;
}

export class ApiClient {
	private baseURL = '/api/v1'; // Use proxy to backend server
	private token: string | null = null;

	constructor(baseURL?: string) {
		if (baseURL) {
			this.baseURL = baseURL;
		}
	}

	setToken(token: string) {
		this.token = token;
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit = {}
	): Promise<T> {
		const url = `${this.baseURL}${endpoint}`;
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...(options.headers as Record<string, string>),
		};

		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}

		// Add CSRF token for state-changing operations
		if (options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
			const session = typeof window !== 'undefined' ? window.__KAPTN_SESSION__ : null;
			if (session?.csrfToken) {
				headers['X-CSRF-Token'] = session.csrfToken;
			}
		}

		// Always include credentials for cookie-based auth
		const defaultOptions = {
			credentials: 'include' as const,
			...options,
			headers,
		};

		// First attempt
		let response = await fetch(url, defaultOptions);

		// Enhanced 401 handling with single retry
		if (response.status === 401 && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
			console.log('API request received 401, attempting token refresh...');

			// Check if auth mode is none - skip refresh attempts
			const session = typeof window !== 'undefined' ? window.__KAPTN_SESSION__ : null;
			if (session?.authMode === 'none') {
				console.log('🔓 Auth mode is none - skipping token refresh for 401');
				// For auth mode none, treat 401 as a normal error instead of trying to refresh
				throw new Error('Unauthorized - auth disabled');
			}

			try {
				const refreshResponse = await fetch('/api/v1/auth/refresh', {
					method: 'POST',
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json',
					},
				});

				if (refreshResponse.ok) {
					console.log('Token refresh successful, retrying original request...');

					// Retry original request with refreshed cookies/tokens
					response = await fetch(url, defaultOptions);

					// If still 401 after refresh, redirect to login
					if (response.status === 401) {
						console.log('Still unauthorized after refresh, redirecting to login');
						this.redirectToLogin();
						throw new Error('Authentication session expired');
					}
				} else {
					console.log('Token refresh failed, redirecting to login');
					this.redirectToLogin();
					throw new Error('Authentication session expired');
				}
			} catch (refreshError) {
				console.error('Refresh attempt failed:', refreshError);
				this.redirectToLogin();
				throw new Error('Authentication session expired');
			}
		}

		if (!response.ok) {
			let errorMessage = `HTTP ${response.status}`;
			try {
				const error = await response.json();
				// Sanitize error messages - only show safe, user-friendly messages
				errorMessage = this.sanitizeErrorMessage(error.error || error.message || errorMessage);
			} catch {
				// If we can't parse the error response, use a generic message
				errorMessage = this.getGenericErrorMessage(response.status);
			}
			throw new Error(errorMessage);
		}

		// Handle different response types
		const contentType = response.headers.get('content-type');
		if (contentType?.includes('application/json')) {
			return response.json();
		} else if (contentType?.includes('text/')) {
			return response.text() as Promise<T>;
		} else {
			return response.arrayBuffer() as Promise<T>;
		}
	}

	private redirectToLogin(): void {
		console.log('🚨 ApiClient redirectToLogin called - DEBUG INFO:');
		console.log('🚨 window.__KAPTN_SESSION__:', typeof window !== 'undefined' ? window.__KAPTN_SESSION__ : 'no window');

		// Check if auth mode is none by looking at injected session data
		const session = typeof window !== 'undefined' ? window.__KAPTN_SESSION__ : null;
		console.log('🚨 Session auth mode:', session?.authMode);

		if (session?.authMode === 'none') {
			console.log('🔓 Auth mode is none - BLOCKING redirect to login');
			return;
		}

		// Clear any stored tokens
		this.token = null;

		// Redirect to login page
		console.log('🔄 Proceeding with redirect to login...');
		window.location.href = '/login';
	}

	private sanitizeErrorMessage(message: string): string {
		// Remove any sensitive information from error messages
		const sensitivePatterns = [
			/token/gi,
			/jwt/gi,
			/bearer/gi,
			/authorization/gi,
			/secret/gi,
			/key/gi,
			/credential/gi,
			/password/gi,
			/session/gi,
		];

		let sanitized = message;
		sensitivePatterns.forEach(pattern => {
			sanitized = sanitized.replace(pattern, '[REDACTED]');
		});

		// Limit message length
		if (sanitized.length > 200) {
			sanitized = sanitized.substring(0, 200) + '...';
		}

		return sanitized;
	}

	private getGenericErrorMessage(status: number): string {
		switch (status) {
			case 400:
				return 'Invalid request. Please check your input and try again.';
			case 401:
				return 'Authentication required. Please log in.';
			case 403:
				return 'You do not have permission to perform this action.';
			case 404:
				return 'The requested resource was not found.';
			case 409:
				return 'The request conflicts with the current state. Please refresh and try again.';
			case 429:
				return 'Too many requests. Please wait a moment and try again.';
			case 500:
				return 'An internal server error occurred. Please try again later.';
			case 502:
			case 503:
			case 504:
				return 'The service is temporarily unavailable. Please try again later.';
			default:
				return 'An unexpected error occurred. Please try again.';
		}
	}

	async get<T>(endpoint: string): Promise<T> {
		return this.request<T>(endpoint);
	}

	async post<T>(endpoint: string, data?: unknown): Promise<T> {
		return this.request<T>(endpoint, {
			method: 'POST',
			body: data ? JSON.stringify(data) : undefined,
		});
	}

	async put<T>(endpoint: string, data?: unknown): Promise<T> {
		return this.request<T>(endpoint, {
			method: 'PUT',
			body: data ? JSON.stringify(data) : undefined,
		});
	}

	async delete<T>(endpoint: string): Promise<T> {
		return this.request<T>(endpoint, { method: 'DELETE' });
	}

	async postYaml<T>(endpoint: string, yaml: string): Promise<T> {
		return this.request<T>(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/yaml',
			},
			body: yaml,
		});
	}
}

// Global API client instance
export const apiClient = new ApiClient();
