import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Cookies from 'js-cookie';

export interface User {
	id: string;
	email: string;
	name: string;
	groups: string[];
	claims?: Record<string, any>;
}

export interface AuthContextType {
	user: User | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	login: (redirectPath?: string) => Promise<void>;
	logout: () => void;
	checkAuth: () => Promise<void>;
	hasRole: (role: string) => boolean;
	canWrite: () => boolean;
	canRead: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
	children: ReactNode;
}

const TOKEN_COOKIE_NAME = 'kad_token';
const USER_COOKIE_NAME = 'kad_user';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const isAuthenticated = user !== null;

	// Check if user has a specific role
	const hasRole = (role: string): boolean => {
		if (!user) return false;
		return user.groups.includes(role);
	};

	// Check if user can perform write operations
	const canWrite = (): boolean => {
		if (!user) return false;
		return hasRole('admin') || hasRole('cluster-admin') || hasRole('kad-admin') ||
			hasRole('editor') || hasRole('kad-editor');
	};

	// Check if user can perform read operations
	const canRead = (): boolean => {
		if (!user) return false;
		return canWrite() || hasRole('viewer') || hasRole('kad-viewer');
	};

	// Set authentication token in requests
	const setAuthHeaders = (token: string) => {
		// This will be used by our API calls
		window.localStorage.setItem('auth_token', token);
	};

	// Remove authentication token
	const clearAuthHeaders = () => {
		window.localStorage.removeItem('auth_token');
	};

	// Get stored token
	const getStoredToken = (): string | null => {
		return Cookies.get(TOKEN_COOKIE_NAME) || window.localStorage.getItem('auth_token');
	};

	// Check authentication status
	const checkAuth = async (): Promise<void> => {
		try {
			// First check if we have a development user stored
			const devUser = window.localStorage.getItem('dev_user');
			if (devUser) {
				try {
					const parsedUser = JSON.parse(devUser);
					setUser(parsedUser);
					setIsLoading(false);
					return;
				} catch (e) {
					// Remove invalid dev user data
					window.localStorage.removeItem('dev_user');
				}
			}

			const token = getStoredToken();
			if (!token) {
				setUser(null);
				setIsLoading(false);
				return;
			}

			// Check if token is still valid by calling /api/v1/auth/me
			const response = await fetch('/api/v1/auth/me', {
				headers: {
					'Authorization': `Bearer ${token}`,
				},
			});

			if (response.ok) {
				const data = await response.json();
				if (data.authenticated && data.user) {
					setUser(data.user);
					setAuthHeaders(token);
				} else {
					// Token is invalid
					clearAuth();
				}
			} else {
				// Authentication failed
				clearAuth();
			}
		} catch (error) {
			console.error('Auth check failed:', error);
			clearAuth();
		} finally {
			setIsLoading(false);
		}
	};

	// Clear authentication state
	const clearAuth = () => {
		setUser(null);
		Cookies.remove(TOKEN_COOKIE_NAME);
		Cookies.remove(USER_COOKIE_NAME);
		window.localStorage.removeItem('dev_user');
		clearAuthHeaders();
	};

	// Login function
	const login = async (redirectPath?: string): Promise<void> => {
		try {
			// For OIDC login, we need to redirect to the authorization server
			const response = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
			});

			if (response.ok) {
				const data = await response.json();

				// Check if this is development mode
				if (data.authMode === 'none' && data.devMode) {
					// In development mode, create a mock user
					const devUser: User = {
						id: 'dev-user',
						email: 'dev@localhost',
						name: 'Development User',
						groups: ['admin'],
						claims: {
							sub: 'dev-user',
							email: 'dev@localhost',
							name: 'Development User',
							groups: ['admin'],
						},
					};

					setUser(devUser);
					// Store in localStorage for development
					window.localStorage.setItem('dev_user', JSON.stringify(devUser));
					return;
				}

				if (data.authUrl) {
					// Store redirect path for after authentication
					if (redirectPath) {
						window.sessionStorage.setItem('auth_redirect', redirectPath);
					}
					// Redirect to OIDC provider
					window.location.href = data.authUrl;
				}
			} else {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || 'Failed to initiate login');
			}
		} catch (error) {
			console.error('Login failed:', error);
			throw error;
		}
	};

	// Logout function
	const logout = () => {
		// Call logout endpoint (optional for stateless tokens)
		fetch('/api/v1/auth/logout', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${getStoredToken()}`,
			},
		}).catch(err => console.error('Logout request failed:', err));

		clearAuth();
	};

	// Handle OIDC callback
	const handleAuthCallback = async (code: string, state: string) => {
		try {
			const response = await fetch('/api/v1/auth/callback', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ code, state }),
			});

			if (response.ok) {
				const data = await response.json();
				if (data.success && data.user && data.id_token) {
					// Store tokens
					Cookies.set(TOKEN_COOKIE_NAME, data.id_token, {
						expires: new Date(data.expires_at),
						secure: window.location.protocol === 'https:',
						sameSite: 'strict'
					});

					setUser(data.user);
					setAuthHeaders(data.id_token);

					// Redirect to original path or dashboard
					const redirectPath = window.sessionStorage.getItem('auth_redirect') || '/';
					window.sessionStorage.removeItem('auth_redirect');
					window.location.href = redirectPath;
				} else {
					throw new Error('Invalid callback response');
				}
			} else {
				throw new Error('Authentication callback failed');
			}
		} catch (error) {
			console.error('Auth callback failed:', error);
			throw error;
		}
	};

	// Check for authentication callback on mount
	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const code = urlParams.get('code');
		const state = urlParams.get('state');

		if (code && state && state.startsWith('kad_')) {
			// This is an OIDC callback
			handleAuthCallback(code, state).catch(error => {
				console.error('Auth callback error:', error);
				// Redirect to login page or show error
				window.location.href = '/login';
			});
		} else {
			// Normal page load, check existing authentication
			checkAuth();
		}
	}, []);

	const value: AuthContextType = {
		user,
		isAuthenticated,
		isLoading,
		login,
		logout,
		checkAuth,
		hasRole,
		canWrite,
		canRead,
	};

	return (
		<AuthContext.Provider value={value}>
			{children}
		</AuthContext.Provider>
	);
};

export const useAuth = (): AuthContextType => {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
};
