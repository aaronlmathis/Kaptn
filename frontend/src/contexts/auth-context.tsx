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

// Dev-only logging helpers to avoid PII/noise in production
const IS_DEV = (import.meta as any)?.env?.DEV === true
const devLog = (...args: unknown[]) => { if (IS_DEV) console.log(...args) }
const devWarn = (...args: unknown[]) => { if (IS_DEV) console.warn(...args) }
const devError = (...args: unknown[]) => { if (IS_DEV) console.error(...args) }

// Helper function to get injected session data (client-side only)
function getInjectedSession(): InjectedSession | null {
	if (typeof window === 'undefined') return null

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const injected = (window as any).__KAPTN_SESSION__ || null

	if (injected) {
		// Avoid logging the session payload; only note presence in dev
		devLog('[auth] Injected session present')
		return injected
	}

	devLog('[auth] No injected session found')
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
			devLog('[auth] 401 received; attempting token refresh')

			const injectedSession = getInjectedSession()
			if (injectedSession?.authMode === 'none') {
				devLog('[auth] Auth mode is none; skip token refresh on 401')
				throw new Error('Unauthorized - auth disabled')
			}

			try {
				const refreshResponse = await fetch('/api/v1/auth/refresh', {
					method: 'POST',
					credentials: 'include',
				})

				if (refreshResponse.ok) {
					devLog('[auth] Token refresh successful; retrying request')
					response = await fetch(url, defaultOptions)

					// If still 401 after refresh, redirect to login
					if (response.status === 401) {
						devLog('[auth] Still unauthorized after refresh; redirecting to login')
						setAuthState(prev => ({
							...prev,
							isAuthenticated: false,
							user: null,
						}));
						window.location.href = '/login'
						throw new Error('Authentication session expired')
					}
				} else {
					devLog('[auth] Token refresh failed; redirecting to login')
					const injectedSession = getInjectedSession()
					if (injectedSession?.authMode === 'none') {
						devLog('[auth] Auth mode is none; skipping redirect on refresh failure')
						throw new Error('Refresh failed but auth disabled')
					}
					setAuthState(prev => ({
						...prev,
						isAuthenticated: false,
						user: null,
					}));
					window.location.href = '/login'
					throw new Error('Authentication session expired')
				}
			} catch (refreshError) {
				devError('[auth] Refresh attempt failed')
				const injectedSession = getInjectedSession()
				if (injectedSession?.authMode === 'none') {
					devLog('[auth] Auth mode is none; skipping redirect on error')
					throw new Error('Auth error but auth disabled')
				}
				setAuthState(prev => ({
					...prev,
					isAuthenticated: false,
					user: null,
				}));
				window.location.href = '/login'
				throw new Error('Authentication session expired')
			}
		}

		// Handle other auth-related errors that should force re-authentication
		if (response.status === 403 && url.includes('/api/')) {
			const responseText = await response.text()
			if (responseText.includes('session expired') || responseText.includes('invalid')) {
				devLog('[auth] Session expired detected in 403 response; redirecting to login')
				setAuthState(prev => ({
					...prev,
					isAuthenticated: false,
					user: null,
				}));
				window.location.href = '/login'
				throw new Error('Authentication session expired')
			}
		}

		return response
	}

	const initializeAuth = async () => {
		try {
			devLog('[auth] Initializing auth')

			const injectedSession = getInjectedSession()
			devLog('[auth] Using injected session:', Boolean(injectedSession))

			if (injectedSession) {
				devLog('[auth] authMode:', injectedSession.authMode)
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

			devWarn('[auth] No injected session data found')
			setAuthState({
				isAuthenticated: false,
				isLoading: false,
				user: null,
				error: 'No session data available',
				authMode: null,
			});
		} catch (error) {
			devError('[auth] Initialization error')
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
        const path = typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '/'
        const next = encodeURIComponent(path || '/')
        window.location.href = `/login?next=${next}`
    }

	const logout = async () => {
		try {
			await fetch('/api/v1/auth/logout', {
				method: 'POST',
				credentials: 'include',
			})
		} catch (error) {
			devError('[auth] Logout error')
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
			devError('[auth] Manual refresh failed')
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
			// Conservative SSR fallback: unauthenticated and loading to avoid rendering privileged UI
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
