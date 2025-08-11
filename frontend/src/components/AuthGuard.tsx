import * as React from 'react'
import { useAuth } from '@/hooks/useAuth'

interface AuthGuardProps {
	children: React.ReactNode
	fallback?: React.ReactNode
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
	const { isAuthenticated, isLoading, error, authMode } = useAuth()

	// Show loading state
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

	// Show error state
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
		return <>{children}</>
	}

	// Redirect to login if not authenticated (for header/oidc auth modes)
	if (!isAuthenticated) {
		if (typeof window !== 'undefined') {
			window.location.href = '/login'
		}
		return fallback || (
			<div className="flex h-screen items-center justify-center">
				<p className="text-sm text-gray-600">Redirecting to login...</p>
			</div>
		)
	}

	// Render children if authenticated
	return <>{children}</>
}
