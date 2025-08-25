"use client"

import * as React from 'react'
import { useState, useEffect, useContext, createContext } from 'react'

interface User {
	id: string
	email: string
	name?: string
	picture?: string
	groups?: string[]
	roles?: string[]
	perms?: string[]
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
	roles?: string[]
	perms?: string[]
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

// Helper function to get injected session data (client-side only)
function getInjectedSession(): InjectedSession | null {
	if (typeof window === 'undefined') return null

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const injected = (window as any).__KAPTN_SESSION__ || null

	if (injected) {
		console.log('[SUCCESS]Found injected session data:', injected)
		return injected
	}

	console.log('[WARNING] No injected session found')
	return null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [authState, setAuthState] = useState<AuthState>(() => ({
		isAuthenticated: false,
		isLoading: true,
		user: null,
		error: null,
		authMode: null,
	}));

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
		try {
			console.log('Initializing auth...')

			const injectedSession = getInjectedSession()
			console.log('Injected session data:', injectedSession)

			if (injectedSession) {
				console.log('Using injected session data, authMode:', injectedSession.authMode)
				setAuthState({
					isAuthenticated: injectedSession.isAuthenticated,
					isLoading: false,
					user: injectedSession.isAuthenticated ? {
						id: injectedSession.id || '',
						email: injectedSession.email || '',
						name: injectedSession.name,
						picture: injectedSession.picture,
						roles: injectedSession.roles || [],
						perms: injectedSession.perms || [],
					} : null,
					error: null,
					authMode: injectedSession.authMode,
				});
				return
			}

			console.log('[WARNING] No injected session data found - this should not happen in production')
			setAuthState({
				isAuthenticated: false,
				isLoading: false,
				user: null,
				error: 'No session data available',
				authMode: null,
			});
		} catch (error) {
			console.error('[ERROR] Auth initialization error:', error)
			setAuthState({
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
				// Reload page to get new injected session data
				window.location.reload()
				return true
			} else {
				setAuthState(prev => ({
					...prev,
					isAuthenticated: false,
					user: null,
				}));
				return false
			}
		} catch (error) {
			console.error('Manual refresh failed:', error)
			setAuthState(prev => ({
				...prev,
				isAuthenticated: false,
				user: null,
			}));
			return false
		}
	}

	const refetchAuth = async () => {
		// For injected session mode, we need to reload the page
		// to get fresh session data from the middleware
		window.location.reload()
	}

	// Initialize auth only on the client side
	useEffect(() => {
		if (typeof window !== 'undefined') {
			initializeAuth()
		}
	}, [])

	const contextValue: AuthContextValue = {
		...authState,
		login,
		logout,
		refresh: refreshAuth,
		refetch: refetchAuth,
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
			// Build-time fallback for SSR
			return {
				isAuthenticated: true, // Assume authenticated during build
				isLoading: false,
				user: {
					id: 'dev-user',
					email: 'dev@localhost',
					name: 'Development User',
					roles: ['admin'],
					perms: ['read', 'write', 'delete', 'admin'],
				},
				error: null,
				authMode: 'none',
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
