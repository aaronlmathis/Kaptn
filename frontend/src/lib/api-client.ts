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

		const response = await fetch(url, {
			...options,
			headers,
		});

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

	async post<T>(endpoint: string, data?: any): Promise<T> {
		return this.request<T>(endpoint, {
			method: 'POST',
			body: data ? JSON.stringify(data) : undefined,
		});
	}

	async put<T>(endpoint: string, data?: any): Promise<T> {
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
