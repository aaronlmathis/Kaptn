import { useState, useEffect } from 'react'

interface User {
	sub: string
	email: string
	name?: string
	groups?: string[]
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

export function useAuth() {
	const [authState, setAuthState] = useState<AuthState>({
		isAuthenticated: false,
		isLoading: true,
		user: null,
		error: null,
		authMode: null,
	})

	useEffect(() => {
		checkAuthStatus()
	}, [])

	const checkAuthStatus = async () => {
		try {
			// First, get the auth configuration
			const configResponse = await fetch('/api/v1/config', {
				credentials: 'include',
			})

			if (!configResponse.ok) {
				throw new Error(`Config fetch failed: ${configResponse.statusText}`)
			}

			const config: AuthConfig = await configResponse.json()
			const authMode = config.auth.mode

			// If auth is disabled, consider user as authenticated
			if (authMode === 'none') {
				setAuthState({
					isAuthenticated: true,
					isLoading: false,
					user: {
						sub: 'dev-user',
						email: 'dev@localhost',
						name: 'Development User'
					},
					error: null,
					authMode,
				})
				return
			}

			// For other auth modes, check authentication status
			const response = await fetch('/api/v1/auth/me', {
				credentials: 'include',
			})

			if (response.ok) {
				const data = await response.json()
				// The API returns { authenticated: true, user: {...} }
				const user = data.user || data
				setAuthState({
					isAuthenticated: true,
					isLoading: false,
					user,
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

	return {
		...authState,
		login,
		logout,
		refetch: checkAuthStatus,
	}
}
