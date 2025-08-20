import * as React from 'react'
import { useAuth } from '@/hooks/useAuth'

interface AuthGuardProps {
	children: React.ReactNode
	fallback?: React.ReactNode
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
	const { isAuthenticated, isLoading, error, authMode } = useAuth()

	// Show loading state while checking authentication
	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="flex flex-col items-center space-y-4">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
					<p className="text-sm text-gray-600">Checking authentication...</p>
				</div>
			</div>
		)
	}

	// Show error state if there was an authentication error
	if (error) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="flex flex-col items-center space-y-4">
					<div className="text-red-600">
						<svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
					</div>
					<p className="text-lg font-semibold text-gray-900">Authentication Error</p>
					<p className="text-sm text-gray-600">{error}</p>
					<button
						onClick={() => window.location.href = '/login'}
						className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
					>
						Go to Login
					</button>
				</div>
			</div>
		)
	}

	// If auth is disabled (none), always allow access
	if (authMode === 'none') {
		//console.log('🔓 AuthGuard: Auth mode is none, allowing access')
		return <>{children}</>
	}

	// Temporary: If we can't determine auth mode, check window session directly
	if (typeof window !== 'undefined') {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const session = (window as any).__KAPTN_SESSION__
		//console.log('🔍 AuthGuard: Checking window session:', session)
		if (session?.authMode === 'none') {
			//console.log('🔓 AuthGuard: Found auth mode none in window session, allowing access')
			return <>{children}</>
		}
	}

	// This is now primarily cosmetic - the real authentication is handled by Astro middleware
	// The middleware should have already redirected unauthenticated users
	// This component mainly handles loading states and provides fallback UI

	if (!isAuthenticated) {
		// If we reach here and user is not authenticated, show fallback or redirect
		// This should rarely happen with proper Astro middleware in place
		//console.warn('AuthGuard: User not authenticated - middleware may not be working correctly')

		if (typeof window !== 'undefined') {
			// Client-side redirect as fallback
			setTimeout(() => {
				window.location.href = '/login'
			}, 1000)
		}

		return fallback || (
			<div className="flex h-screen items-center justify-center">
				<div className="flex flex-col items-center space-y-4">
					<p className="text-sm text-gray-600">Redirecting to login...</p>
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
				</div>
			</div>
		)
	}

	// User is authenticated - render children
	return <>{children}</>
}
