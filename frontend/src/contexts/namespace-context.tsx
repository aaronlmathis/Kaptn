"use client"

import { createContext, useContext, useState, useEffect } from 'react'
import { k8sService } from '@/lib/k8s-service'
import { type Namespace } from '@/lib/k8s-cluster'

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

			// Listen for view transition events to trigger updates when namespace changes
			const handleViewTransition = () => {
				// Small delay to ensure the new page is ready
				setTimeout(() => {
					// Dispatch a custom event to notify all components that namespace may have changed
					window.dispatchEvent(new CustomEvent('namespace-context-update'))
				}, 50)
			}

			// Listen for view transitions
			document.addEventListener('astro:page-load', handleViewTransition)
			
			return () => {
				document.removeEventListener('astro:page-load', handleViewTransition)
			}
		}
	}, [])

	// Wrapper to persist selected namespace to localStorage
	const setSelectedNamespace = (namespace: string) => {
		setSelectedNamespaceState(namespace)
		if (typeof window !== 'undefined') {
			localStorage.setItem('selectedNamespace', namespace)
			// Dispatch custom event to notify all components of namespace change
			window.dispatchEvent(new CustomEvent('namespace-changed', { 
				detail: { namespace } 
			}))
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

// Hook for components to subscribe to namespace changes across view transitions
// eslint-disable-next-line react-refresh/only-export-components
export function useNamespaceUpdates() {
	const { selectedNamespace } = useNamespace()
	const [updateTrigger, setUpdateTrigger] = useState(0)

	useEffect(() => {
		if (typeof window === 'undefined') return

		const handleNamespaceChange = () => {
			setUpdateTrigger(prev => prev + 1)
		}

		const handleViewTransition = () => {
			// Check if namespace changed during transition
			const currentNamespace = localStorage.getItem('selectedNamespace') || 'all'
			if (currentNamespace !== selectedNamespace) {
				setUpdateTrigger(prev => prev + 1)
			}
		}

		window.addEventListener('namespace-changed', handleNamespaceChange)
		document.addEventListener('astro:page-load', handleViewTransition)

		return () => {
			window.removeEventListener('namespace-changed', handleNamespaceChange)
			document.removeEventListener('astro:page-load', handleViewTransition)
		}
	}, [selectedNamespace])

	return { selectedNamespace, updateTrigger }
}
