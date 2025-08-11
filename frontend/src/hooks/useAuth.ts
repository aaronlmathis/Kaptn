import { useState, useEffect } from 'react'

interface User {
	id: string
	email: string
	name?: string
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
	isAuthenticated: boolean
	authMode: 'none' | 'header' | 'oidc'
}

// Helper function to get injected session data
function getInjectedSession(): InjectedSession | null {
	if (typeof window === 'undefined') return null

	// Check for injected session data (should be available immediately)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const injected = (window as any).__KAPTN_SESSION__ || null

	if (injected) {
		console.log('✅ Found injected session data:', injected)
		return injected
	}

	console.log('⚠️ No injected session found')
	return null
}

// Enhanced fetch with automatic retry on 401
async function fetchWithAuth(url: string, options: FetchOptions = {}): Promise<Response> {
	const defaultOptions: FetchOptions = {
		credentials: 'include',
		...options,
	}

	// First attempt
	let response = await fetch(url, defaultOptions)

	// If 401, try to refresh and retry once
	if (response.status === 401 && !url.includes('/auth/refresh')) {
		console.log('Received 401, attempting token refresh...')

		// Check if auth mode is none - skip refresh attempts
		const injectedSession = getInjectedSession()
		if (injectedSession?.authMode === 'none') {
			console.log('🔓 Auth mode is none - skipping token refresh for 401')
			// For auth mode none, just throw an error instead of trying to refresh
			throw new Error('Unauthorized - auth disabled')
		}

		try {
			const refreshResponse = await fetch('/api/v1/auth/refresh', {
				method: 'POST',
				credentials: 'include',
			})

			if (refreshResponse.ok) {
				console.log('Token refresh successful, retrying original request...')
				// Retry original request with new tokens
				response = await fetch(url, defaultOptions)
			} else {
				console.log('Token refresh failed, redirecting to login')
				// Check if auth mode is none before redirecting
				const injectedSession = getInjectedSession()
				if (injectedSession?.authMode === 'none') {
					console.log('🔓 Auth mode is none - skipping redirect on refresh failure')
					throw new Error('Refresh failed but auth disabled')
				}
				// Refresh failed - redirect to login
				window.location.href = '/login'
				throw new Error('Authentication session expired')
			}
		} catch (refreshError) {
			console.error('Refresh attempt failed:', refreshError)
			// Check if auth mode is none before redirecting
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

export function useAuth() {
	const [authState, setAuthState] = useState<AuthState>({
		isAuthenticated: false,
		isLoading: true,
		user: null,
		error: null,
		authMode: null,
	})

	useEffect(() => {
		initializeAuth()
	}, []) // eslint-disable-line react-hooks/exhaustive-deps

	const initializeAuth = async () => {
		try {
			console.log('🔄 Initializing auth...')

			// First, try to get session data from server-injected global (synchronous)
			const injectedSession = getInjectedSession()
			console.log('📦 Injected session data:', injectedSession)

			if (injectedSession) {
				console.log('✅ Using injected session data, authMode:', injectedSession.authMode)
				// Use injected session data immediately
				setAuthState({
					isAuthenticated: injectedSession.isAuthenticated,
					isLoading: false,
					user: injectedSession.isAuthenticated ? {
						id: injectedSession.id || '',
						email: injectedSession.email || '',
						name: injectedSession.name
					} : null,
					error: null,
					authMode: injectedSession.authMode,
				})
				return
			}

			console.log('⚠️ No injected session data found, falling back to API calls')
			// Fallback: fetch auth config and status (for cases where injection fails)
			await checkAuthStatus()
		} catch (error) {
			console.error('❌ Auth initialization error:', error)
			setAuthState({
				isAuthenticated: false,
				isLoading: false,
				user: null,
				error: error instanceof Error ? error.message : 'Unknown error',
				authMode: null,
			})
		}
	}

	const checkAuthStatus = async () => {
		try {
			// First, get the auth configuration
			const configResponse = await fetchWithAuth('/api/v1/config')

			if (!configResponse.ok) {
				throw new Error(`Config fetch failed: ${configResponse.statusText}`)
			}

			const config: AuthConfig = await configResponse.json()
			const authMode = config.auth.mode

			// If auth is disabled, consider user as authenticated
			if (authMode === 'none') {
				console.log('🔓 Auth mode is none, setting dev user')
				setAuthState({
					isAuthenticated: true,
					isLoading: false,
					user: {
						id: 'dev-user',
						email: 'dev@localhost',
						name: 'Development User'
					},
					error: null,
					authMode,
				})
				return
			}

			// For other auth modes, check authentication status
			const response = await fetchWithAuth('/api/v1/auth/me')

			if (response.ok) {
				const data = await response.json()
				// The API returns { authenticated: true, user: {...} }
				const user = data.user || data

				// Create minimal user object without sensitive claims
				const safeUser: User = {
					id: user.id || user.sub,
					email: user.email,
					name: user.name,
					// Only include basic role/permission info, not full JWT claims
					groups: user.groups || [],
					roles: user.roles || user.groups || [],
					perms: user.perms || [],
				}

				setAuthState({
					isAuthenticated: true,
					isLoading: false,
					user: safeUser,
					error: null,
					authMode,
				})
			} else if (response.status === 401) {
				setAuthState({
					isAuthenticated: false,
					isLoading: false,
					user: null,
					error: null,
					authMode,
				})
			} else {
				throw new Error(`Auth check failed: ${response.statusText}`)
			}
		} catch (error) {
			console.error('Auth check error:', error)
			setAuthState({
				isAuthenticated: false,
				isLoading: false,
				user: null,
				error: error instanceof Error ? error.message : 'Unknown error',
				authMode: null,
			})
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
			// Redirect to login regardless of logout success
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
				// Refresh successful - update auth state
				await checkAuthStatus()
				return true
			} else {
				// Refresh failed
				setAuthState(prev => ({
					...prev,
					isAuthenticated: false,
					user: null,
				}))
				return false
			}
		} catch (error) {
			console.error('Manual refresh failed:', error)
			setAuthState(prev => ({
				...prev,
				isAuthenticated: false,
				user: null,
			}))
			return false
		}
	}

	return {
		...authState,
		login,
		logout,
		refresh: refreshAuth,
		refetch: checkAuthStatus,
		// Export the enhanced fetch for use in other components
		fetchWithAuth,
	}
}
