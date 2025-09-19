"use client"

import * as React from "react"
import { useAuth } from "@/contexts/auth-context"

interface AuthGuardProps {
	children: React.ReactNode
	fallback?: React.ReactNode
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
	const { isAuthenticated, isLoading, authMode } = useAuth()

	// Handle redirect when not authenticated
	React.useEffect(() => {
		if (!isLoading && !isAuthenticated && authMode !== 'none') {
			const path = window.location.pathname + window.location.search
			const next = encodeURIComponent(path || '/')
			window.location.href = `/login?next=${next}`
		}
	}, [isLoading, isAuthenticated, authMode])

	// Show loading state while checking auth
	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
					<p className="text-sm text-muted-foreground">Checking authentication...</p>
				</div>
			</div>
		)
	}

	// If auth mode is 'none', allow access without authentication
	if (authMode === 'none') {
		return <>{children}</>
	}

	// If not authenticated and not loading, show redirect fallback
	if (!isAuthenticated) {
		return fallback || (
			<div className="flex h-screen items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
					<p className="text-sm text-muted-foreground">Redirecting to login...</p>
				</div>
			</div>
		)
	}

	// Authenticated, render children
	return <>{children}</>
}
