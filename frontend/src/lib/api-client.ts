// API client for Kubernetes Admin Dashboard backend

export interface ApiResponse<T> {
	data?: T;
	status?: string;
	error?: string;
	code?: string;
}

export class ApiClient {
	private baseURL = '/api/v1';
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

		// Always include credentials for cookie-based auth
		const defaultOptions = {
			credentials: 'include' as const,
			...options,
			headers,
		};

		// First attempt
		let response = await fetch(url, defaultOptions);

		// If 401, try to refresh and retry once
		if (response.status === 401 && !endpoint.includes('/auth/refresh')) {
			console.log('API request received 401, attempting token refresh...');

			try {
				const refreshResponse = await fetch('/api/v1/auth/refresh', {
					method: 'POST',
					credentials: 'include',
				});

				if (refreshResponse.ok) {
					console.log('Token refresh successful, retrying original request...');
					// Retry original request with new tokens
					response = await fetch(url, defaultOptions);
				} else {
					console.log('Token refresh failed, redirecting to login');
					// Refresh failed - redirect to login
					window.location.href = '/login';
					throw new Error('Authentication session expired');
				}
			} catch (refreshError) {
				console.error('Refresh attempt failed:', refreshError);
				window.location.href = '/login';
				throw new Error('Authentication session expired');
			}
		}

		if (!response.ok) {
			let errorMessage = `HTTP ${response.status}`;
			try {
				const error = await response.json();
				errorMessage = error.error || errorMessage;
			} catch {
				// If we can't parse the error response, use the status text
				errorMessage = response.statusText || errorMessage;
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
