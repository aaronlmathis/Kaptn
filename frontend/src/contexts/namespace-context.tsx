"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { k8sService } from '@/lib/k8s-service'
import { type Namespace } from '@/lib/k8s-cluster'
import { useHydratedLocalStorageString, useHydratedLocalStorage } from '@/hooks/useHydratedStorage'

// Cache configuration
const NAMESPACE_CACHE_KEY = 'cachedNamespaces'
const NAMESPACE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds

export interface NamespaceContextValue {
	selectedNamespace: string
	namespaces: Namespace[]
	loading: boolean
	error: string | null
	setSelectedNamespace: (namespace: string) => void
	refetchNamespaces: () => Promise<void>
	isHydrated: boolean
}

const NamespaceContext = createContext<NamespaceContextValue | undefined>(undefined)

interface NamespaceProviderProps {
	children: import('react').ReactNode
}

export function NamespaceProvider({ children }: NamespaceProviderProps) {
	// Use hydration-safe localStorage hooks
	const [selectedNamespace, setSelectedNamespaceState, isNamespaceHydrated] = useHydratedLocalStorageString('selectedNamespace', 'all')
	const [cachedData, _setCachedData, isCacheHydrated] = useHydratedLocalStorage<{namespaces: Namespace[], timestamp: number} | null>(
		NAMESPACE_CACHE_KEY, 
		null,
		JSON.parse,
		JSON.stringify
	)
	
	const [namespaces, setNamespaces] = useState<Namespace[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const isHydrated = isNamespaceHydrated && isCacheHydrated

	const fetchNamespaces = useCallback(async () => {
		try {
			setLoading(true)
			setError(null)
			const data = await k8sService.getNamespaces()
			setNamespaces(data)

			// Cache the namespaces with timestamp using hydrated storage
			if (isHydrated) {
				const cacheData = {
					namespaces: data,
					timestamp: Date.now()
				}
				// Update through the hydrated storage hook (we'll need to expose this)
				try {
					localStorage.setItem(NAMESPACE_CACHE_KEY, JSON.stringify(cacheData))
				} catch (error) {
					console.warn('Failed to cache namespaces:', error)
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch namespaces')
			console.error('Error fetching namespaces:', err)
		} finally {
			setLoading(false)
		}
	}, [isHydrated])

	// Load cached namespaces after hydration
	useEffect(() => {
		if (isHydrated && cachedData) {
			const now = Date.now()
			// If cache is still valid, use it immediately
			if (now - cachedData.timestamp < NAMESPACE_CACHE_TTL) {
				setNamespaces(cachedData.namespaces)
				return // Exit early - no need to fetch
			}
		}
		
		// Cache is expired, doesn't exist, or not hydrated yet - fetch
		if (isHydrated) {
			fetchNamespaces()
		}
	}, [isHydrated, cachedData, fetchNamespaces])

	// Wrapper to persist selected namespace
	const setSelectedNamespace = (namespace: string) => {
		setSelectedNamespaceState(namespace)
	}

	const contextValue: NamespaceContextValue = {
		selectedNamespace,
		namespaces,
		loading,
		error,
		setSelectedNamespace,
		refetchNamespaces: fetchNamespaces,
		isHydrated,
	}

	return (
		<NamespaceContext.Provider value={contextValue}>
			{children}
		</NamespaceContext.Provider>
	)
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNamespace() {
	const context = useContext(NamespaceContext)
	// During static build, context might be undefined - provide a fallback
	if (context === undefined) {
		// Check if we're in a build environment (no window object)
		if (typeof window === 'undefined') {
			// Return a safe fallback for build time
			return {
				selectedNamespace: 'all',
				namespaces: [],
				loading: false,
				error: null,
				setSelectedNamespace: () => { },
				refetchNamespaces: async () => { },
				isHydrated: false,
			} as NamespaceContextValue
		}

		// If we're in the browser and context is undefined, that's a real error
		throw new Error('useNamespace must be used within a NamespaceProvider')
	}
	return context
}
