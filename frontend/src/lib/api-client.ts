// API client for Kubernetes Admin Dashboard backend


export interface ApiResponse<T> {
	data?: T;
	status?: string;
	error?: string;
	code?: string;
}

import { notifyActionResults } from './action-notifier'

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
			const csrfToken = this.getCSRFTokenFromCookie();
			if (csrfToken) {
				headers['X-CSRF-Token'] = csrfToken;
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

        // Redirect to login page and preserve intended path
        console.log('🔄 Proceeding with redirect to login...');
        const path = window.location?.pathname + window.location?.search;
        const next = encodeURIComponent(path || '/');
        window.location.href = `/login?next=${next}`;
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
        // Intercept action execution responses to display toasts centrally
        const result = await this.request<any>(endpoint, {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
        });
        try {
            if (endpoint === '/actions') {
                notifyActionResults(result)
            }
        } catch {
            // no-op: never block API flow on toast errors
        }
        return result as T
    }

    // Special-case helper: return JSON body even when the server responds with a non-2xx status
    // Useful for endpoints that intentionally return structured error payloads (e.g., /apply)
    async postJSONAllowError<T>(endpoint: string, data?: unknown): Promise<T> {
        const url = `${this.baseURL}${endpoint}`
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }
        if (this.token) headers.Authorization = `Bearer ${this.token}`
        // CSRF for state-changing ops
        const csrf = this.getCSRFTokenFromCookie()
        if (csrf) headers['X-CSRF-Token'] = csrf

        const defaultOptions: RequestInit = {
            method: 'POST',
            credentials: 'include',
            headers,
            body: data ? JSON.stringify(data) : undefined,
        }

        // First attempt
        let response = await fetch(url, defaultOptions)

        // 401 refresh logic consistent with request()
        if (response.status === 401 && !endpoint.includes('/auth/refresh') && !endpoint.includes('/auth/login')) {
            const session = typeof window !== 'undefined' ? (window as any).__KAPTN_SESSION__ : null
            if (session?.authMode !== 'none') {
                try {
                    const refreshResponse = await fetch('/api/v1/auth/refresh', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                    })
                    if (refreshResponse.ok) {
                        response = await fetch(url, defaultOptions)
                    } else {
                        this.redirectToLogin()
                        throw new Error('Authentication session expired')
                    }
                } catch (e) {
                    this.redirectToLogin()
                    throw new Error('Authentication session expired')
                }
            }
        }

        const contentType = response.headers.get('content-type') || ''
        const isJSON = contentType.includes('application/json')
        if (isJSON) {
            const json = await response.json()
            // For /apply, we want the structured payload regardless of status
            return json as T
        }
        if (!response.ok) {
            throw new Error(this.getGenericErrorMessage(response.status))
        }
        // Fallbacks for non-JSON success responses
        if (contentType.includes('text/')) {
            return (await response.text()) as unknown as T
        }
        return (await response.arrayBuffer()) as unknown as T
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

	// Get CSRF token from cookie (double-submit pattern)
	private getCSRFTokenFromCookie(): string | null {
		if (typeof document === 'undefined') return null;

		const name = 'kaptn_csrf=';
		const decodedCookie = decodeURIComponent(document.cookie);
		const cookies = decodedCookie.split(';');

		for (let cookie of cookies) {
			cookie = cookie.trim();
			if (cookie.indexOf(name) === 0) {
				return cookie.substring(name.length);
			}
		}
		return null;
	}
}

// Global API client instance
export const apiClient = new ApiClient();
