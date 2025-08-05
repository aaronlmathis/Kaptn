"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'
import { k8sService, type Namespace } from '@/lib/k8s-api'

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
	children: React.ReactNode
}

export function NamespaceProvider({ children }: NamespaceProviderProps) {
	const [selectedNamespace, setSelectedNamespaceState] = useState<string>('all')
	const [namespaces, setNamespaces] = useState<Namespace[]>([])
	const [loading, setLoading] = useState(false) // Start with false - only show loading when actually fetching
	const [error, setError] = useState<string | null>(null)
	const [isHydrated, setIsHydrated] = useState(false)

	// Load client-side state after hydration
	useEffect(() => {
		if (typeof window !== 'undefined') {
			// Load selected namespace
			const savedNamespace = localStorage.getItem('selectedNamespace')
			if (savedNamespace) {
				setSelectedNamespaceState(savedNamespace)
			}

			// Load cached namespaces
			try {
				const cachedData = localStorage.getItem(NAMESPACE_CACHE_KEY)
				if (cachedData) {
					const { namespaces: cachedNamespaces, timestamp } = JSON.parse(cachedData)
					const now = Date.now()

					// If cache is still valid, use it immediately
					if (now - timestamp < NAMESPACE_CACHE_TTL) {
						setNamespaces(cachedNamespaces)
						setIsHydrated(true)
						return // Exit early - no need to fetch
					}
				}
			} catch (error) {
				console.warn('Failed to parse cached namespaces:', error)
			}

			setIsHydrated(true)
			// If we reach here, cache is expired or doesn't exist, so fetch
			fetchNamespaces()
		}
	}, [])

	// Wrapper to persist selected namespace to localStorage
	const setSelectedNamespace = (namespace: string) => {
		setSelectedNamespaceState(namespace)
		if (typeof window !== 'undefined') {
			localStorage.setItem('selectedNamespace', namespace)
		}
	}

	const fetchNamespaces = async () => {
		try {
			setLoading(true)
			setError(null)
			const data = await k8sService.getNamespaces()
			setNamespaces(data)

			// Cache the namespaces with timestamp
			if (typeof window !== 'undefined') {
				const cacheData = {
					namespaces: data,
					timestamp: Date.now()
				}
				localStorage.setItem(NAMESPACE_CACHE_KEY, JSON.stringify(cacheData))
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch namespaces')
			console.error('Error fetching namespaces:', err)
		} finally {
			setLoading(false)
		}
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
	if (context === undefined) {
		throw new Error('useNamespace must be used within a NamespaceProvider')
	}
	return context
}
