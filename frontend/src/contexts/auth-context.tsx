"use client"

import * as React from 'react'
import { useState, useEffect, useContext, createContext } from 'react'

// Global singleton state to prevent multiple initializations
let authInitialized = false;
let globalAuthState: AuthState | null = null;
let globalSetters: Set<React.Dispatch<React.SetStateAction<AuthState>>> = new Set();

interface User {
	id: string
	email: string
	name?: string
	picture?: string
	groups?: string[]
	roles?: string[]
	perms?: string[]
}

interface AuthConfig {
	auth: {
		mode: 'none' | 'header' | 'oidc'
	}
}

interface AuthState {
	isAuthenticated: boolean
	isLoading: boolean
	user: User | null
	error: string | null
	authMode: 'none' | 'header' | 'oidc' | null
}

interface FetchOptions {
	method?: string
	headers?: Record<string, string>
	body?: string
	credentials?: 'include' | 'omit' | 'same-origin'
}

interface InjectedSession {
	id?: string
	email?: string
	name?: string
	picture?: string
	isAuthenticated: boolean
	authMode: 'none' | 'header' | 'oidc'
}

interface AuthContextValue extends AuthState {
	login: () => void
	logout: () => Promise<void>
	refresh: () => Promise<boolean>
	refetch: () => Promise<void>
	fetchWithAuth: (url: string, options?: FetchOptions) => Promise<Response>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// Helper function to get injected session data
function getInjectedSession(): InjectedSession | null {
	if (typeof window === 'undefined') return null

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const injected = (window as any).__KAPTN_SESSION__ || null

	if (injected) {
		console.log('✅ Found injected session data:', injected)
		return injected
	}

	console.log('⚠️ No injected session found')
	return null
}

// Global function to update all auth state instances
function updateGlobalAuthState(newState: AuthState | ((prev: AuthState) => AuthState)) {
	const currentState = globalAuthState || {
		isAuthenticated: false,
		isLoading: true,
		user: null,
		error: null,
		authMode: null,
	};
	const updatedState = typeof newState === 'function' ? newState(currentState) : newState;
	globalAuthState = updatedState;

	// Update all provider instances
	globalSetters.forEach(setter => {
		setter(updatedState);
	});
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [authState, setAuthState] = useState<AuthState>(() => {
		// If we already have global state, use it
		if (globalAuthState) {
			return globalAuthState;
		}
		return {
			isAuthenticated: false,
			isLoading: true,
			user: null,
			error: null,
			authMode: null,
		};
	});

	// Register this setter with the global collection
	React.useEffect(() => {
		globalSetters.add(setAuthState);
		return () => {
			globalSetters.delete(setAuthState);
		};
	}, []);

	// Enhanced fetch with automatic retry on 401
	const fetchWithAuth = async (url: string, options: FetchOptions = {}): Promise<Response> => {
		const defaultOptions: FetchOptions = {
			credentials: 'include',
			...options,
		}

		let response = await fetch(url, defaultOptions)

		if (response.status === 401 && !url.includes('/auth/refresh')) {
			console.log('Received 401, attempting token refresh...')

			const injectedSession = getInjectedSession()
			if (injectedSession?.authMode === 'none') {
				console.log('🔓 Auth mode is none - skipping token refresh for 401')
				throw new Error('Unauthorized - auth disabled')
			}

			try {
				const refreshResponse = await fetch('/api/v1/auth/refresh', {
					method: 'POST',
					credentials: 'include',
				})

				if (refreshResponse.ok) {
					console.log('Token refresh successful, retrying original request...')
					response = await fetch(url, defaultOptions)
				} else {
					console.log('Token refresh failed, redirecting to login')
					const injectedSession = getInjectedSession()
					if (injectedSession?.authMode === 'none') {
						console.log('🔓 Auth mode is none - skipping redirect on refresh failure')
						throw new Error('Refresh failed but auth disabled')
					}
					window.location.href = '/login'
					throw new Error('Authentication session expired')
				}
			} catch (refreshError) {
				console.error('Refresh attempt failed:', refreshError)
				const injectedSession = getInjectedSession()
				if (injectedSession?.authMode === 'none') {
					console.log('🔓 Auth mode is none - skipping redirect on error')
					throw new Error('Auth error but auth disabled')
				}
				window.location.href = '/login'
				throw new Error('Authentication session expired')
			}
		}

		return response
	}

	const initializeAuth = async () => {
		// Prevent multiple initializations
		if (authInitialized) {
			console.log('🔄 Auth already initialized, skipping...')
			return;
		}

		authInitialized = true;

		try {
			console.log('🔄 Initializing auth...')

			const injectedSession = getInjectedSession()
			console.log('📦 Injected session data:', injectedSession)

			if (injectedSession) {
				console.log('✅ Using injected session data, authMode:', injectedSession.authMode)
				const newState = {
					isAuthenticated: injectedSession.isAuthenticated,
					isLoading: false,
					user: injectedSession.isAuthenticated ? {
						id: injectedSession.id || '',
						email: injectedSession.email || '',
						name: injectedSession.name,
						picture: injectedSession.picture
					} : null,
					error: null,
					authMode: injectedSession.authMode,
				};
				updateGlobalAuthState(newState);
				return
			}

			console.log('⚠️ No injected session data found, falling back to API calls')
			await checkAuthStatus()
		} catch (error) {
			console.error('❌ Auth initialization error:', error)
			updateGlobalAuthState({
				isAuthenticated: false,
				isLoading: false,
				user: null,
				error: error instanceof Error ? error.message : 'Unknown error',
				authMode: null,
			});
		}
	}

	const checkAuthStatus = async () => {
		try {
			const configResponse = await fetchWithAuth('/api/v1/config')

			if (!configResponse.ok) {
				throw new Error(`Config fetch failed: ${configResponse.statusText}`)
			}

			const config: AuthConfig = await configResponse.json()
			const authMode = config.auth.mode

			if (authMode === 'none') {
				console.log('🔓 Auth mode is none, setting dev user')
				updateGlobalAuthState({
					isAuthenticated: true,
					isLoading: false,
					user: {
						id: 'dev-user',
						email: 'dev@localhost',
						name: 'Development User'
					},
					error: null,
					authMode,
				});
				return
			}

			const response = await fetchWithAuth('/api/v1/auth/me')

			if (response.ok) {
				const data = await response.json()
				const user = data.user || data

				console.log('🔍 Raw user data from backend:', user)

				const safeUser: User = {
					id: user.id || user.sub,
					email: user.email,
					name: user.name,
					picture: user.picture,
					groups: user.groups || [],
					roles: user.roles || user.groups || [],
					perms: user.perms || [],
				}

				console.log('🔍 Safe user object created:', safeUser)

				updateGlobalAuthState({
					isAuthenticated: true,
					isLoading: false,
					user: safeUser,
					error: null,
					authMode,
				});
			} else if (response.status === 401) {
				updateGlobalAuthState({
					isAuthenticated: false,
					isLoading: false,
					user: null,
					error: null,
					authMode,
				});
			} else {
				throw new Error(`Auth check failed: ${response.statusText}`)
			}
		} catch (error) {
			console.error('Auth check error:', error)
			updateGlobalAuthState({
				isAuthenticated: false,
				isLoading: false,
				user: null,
				error: error instanceof Error ? error.message : 'Unknown error',
				authMode: null,
			});
		}
	}

	const login = () => {
		window.location.href = '/login'
	}

	const logout = async () => {
		try {
			await fetch('/api/v1/auth/logout', {
				method: 'POST',
				credentials: 'include',
			})
		} catch (error) {
			console.error('Logout error:', error)
		} finally {
			window.location.href = '/login'
		}
	}

	const refreshAuth = async (): Promise<boolean> => {
		try {
			const refreshResponse = await fetch('/api/v1/auth/refresh', {
				method: 'POST',
				credentials: 'include',
			})

			if (refreshResponse.ok) {
				await checkAuthStatus()
				return true
			} else {
				updateGlobalAuthState(prev => ({
					...prev,
					isAuthenticated: false,
					user: null,
				}));
				return false
			}
		} catch (error) {
			console.error('Manual refresh failed:', error)
			updateGlobalAuthState(prev => ({
				...prev,
				isAuthenticated: false,
				user: null,
			}));
			return false
		}
	}

	// Initialize auth ONCE when first provider mounts
	useEffect(() => {
		initializeAuth()
	}, []) // eslint-disable-line react-hooks/exhaustive-deps

	const contextValue: AuthContextValue = {
		...authState,
		login,
		logout,
		refresh: refreshAuth,
		refetch: checkAuthStatus,
		fetchWithAuth,
	}

	return (
		<AuthContext.Provider value={contextValue}>
			{children}
		</AuthContext.Provider>
	)
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
	const context = useContext(AuthContext)

	if (context === undefined) {
		if (typeof window === 'undefined') {
			// Build-time fallback
			return {
				isAuthenticated: false,
				isLoading: true,
				user: null,
				error: null,
				authMode: null,
				login: () => { },
				logout: async () => { },
				refresh: async () => false,
				refetch: async () => { },
				fetchWithAuth: async () => new Response(),
			} as AuthContextValue
		}
		throw new Error('useAuth must be used within an AuthProvider')
	}

	return context
}
