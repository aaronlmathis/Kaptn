"use client"

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'

interface ClientOnlyProps {
	children: ReactNode
	fallback?: ReactNode
}

/**
 * Client-only component that prevents hydration mismatches by only
 * rendering children on the client after the first effect runs.
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
	const [hasMounted, setHasMounted] = useState(false)

	useEffect(() => {
		setHasMounted(true)
	}, [])

	if (!hasMounted) {
		return <>{fallback}</>
	}

	return <>{children}</>
}
