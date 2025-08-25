"use client"

import * as React from "react"
import { useAuth } from "./auth-context"
import type { CapabilityKey } from "@/lib/authz"

interface CapabilitiesState {
	capabilities: Record<string, boolean>
	isLoading: boolean
	error: string | null
	lastFetched: number | null
}

interface CapabilitiesContextValue extends CapabilitiesState {
	refetch: () => Promise<void>
	isAllowed: (capability: CapabilityKey) => boolean
	hasAnyCapability: (capabilities: CapabilityKey[]) => boolean
	hasAllCapabilities: (capabilities: CapabilityKey[]) => boolean
}

export type { CapabilitiesContextValue }

const CapabilitiesContext = React.createContext<CapabilitiesContextValue | undefined>(undefined)

export { CapabilitiesContext }

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

const DEFAULT_CAPABILITIES = {
	'pods.list': true,
	'pods.get': true,
	'pods.create': true,
	'pods.update': true,
	'pods.patch': true,
	'pods.delete': true,
	'pods.logs': true,
	'pods.exec': true,
	'deployments.list': true,
	'deployments.get': true,
	'deployments.create': true,
	'deployments.update': true,
	'deployments.patch': true,
	'deployments.delete': true,
	'services.list': true,
	'services.get': true,
	'services.create': true,
	'services.update': true,
	'services.patch': true,
	'services.delete': true,
	'namespaces.list': true,
	'namespaces.get': true,
	'events.list': true,
	'events.get': true,
}

export function CapabilitiesProvider({ children }: { children: React.ReactNode }) {
	const { isAuthenticated, authMode, fetchWithAuth } = useAuth()

	const [state, setState] = React.useState<CapabilitiesState>({
		capabilities: typeof window === 'undefined' ? DEFAULT_CAPABILITIES : {},
		isLoading: typeof window === 'undefined' ? false : false,
		error: null,
		lastFetched: typeof window === 'undefined' ? Date.now() : null,
	})

	const fetchCapabilities = React.useCallback(async () => {
		// Skip API calls during SSR/build time
		if (typeof window === 'undefined') {
			return
		}

		// Skip if not authenticated or auth disabled
		if (!isAuthenticated) {
			setState({
				capabilities: {},
				isLoading: false,
				error: null,
				lastFetched: Date.now(),
			})
			return
		}

		// For auth mode 'none', grant all capabilities
		if (authMode === 'none') {
			setState({
				capabilities: DEFAULT_CAPABILITIES,
				isLoading: false,
				error: null,
				lastFetched: Date.now(),
			})
			return
		}

		setState(prev => ({ ...prev, isLoading: true, error: null }))

		try {
			// Create request body matching backend CapabilityRequest structure
			const requestBody = {
				cluster: "default", // For now, use default cluster
				features: [
					'pods.list',
					'pods.get',
					'pods.create',
					'pods.update',
					'pods.patch',
					'pods.delete',
					'pods.logs',
					'pods.exec',
					'deployments.list',
					'deployments.get',
					'deployments.create',
					'deployments.update',
					'deployments.patch',
					'deployments.delete',
					'services.list',
					'services.get',
					'services.create',
					'services.update',
					'services.patch',
					'services.delete',
					'namespaces.list',
					'namespaces.get',
					'events.list',
					'events.get',
				]
			}

			console.log('🔍 Fetching capabilities with request:', requestBody)

			const response = await fetchWithAuth('/api/v1/authz/capabilities', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
			})

			console.log('🔍 Capabilities response status:', response.status, response.statusText)

			if (!response.ok) {
				const errorText = await response.text()
				console.error('🔍 Capabilities error response:', errorText)
				throw new Error(`Failed to fetch capabilities: ${response.statusText} - ${errorText}`)
			}

			const data = await response.json()
			console.log('🔍 Capabilities response data:', data)

			setState({
				capabilities: data.caps || {},
				isLoading: false,
				error: null,
				lastFetched: Date.now(),
			})
		} catch (error) {
			console.error('🔍 Failed to fetch capabilities:', error)
			setState(prev => ({
				...prev,
				isLoading: false,
				error: error instanceof Error ? error.message : 'Failed to fetch capabilities',
			}))
		}
	}, [isAuthenticated, authMode, fetchWithAuth])

	// Fetch capabilities on mount and when auth state changes
	React.useEffect(() => {
		fetchCapabilities()
	}, [fetchCapabilities])

	// Auto-refresh capabilities periodically
	React.useEffect(() => {
		if (!isAuthenticated || authMode === 'none') return

		const interval = setInterval(() => {
			const now = Date.now()
			if (state.lastFetched && (now - state.lastFetched) > CACHE_DURATION) {
				fetchCapabilities()
			}
		}, 60_000) // Check every minute

		return () => clearInterval(interval)
	}, [isAuthenticated, authMode, state.lastFetched, fetchCapabilities])

	const isAllowed = React.useCallback((capability: CapabilityKey): boolean => {
		return state.capabilities[capability] === true
	}, [state.capabilities])

	const hasAnyCapability = React.useCallback((capabilities: CapabilityKey[]): boolean => {
		return capabilities.some(capability => isAllowed(capability))
	}, [isAllowed])

	const hasAllCapabilities = React.useCallback((capabilities: CapabilityKey[]): boolean => {
		return capabilities.every(capability => isAllowed(capability))
	}, [isAllowed])

	const contextValue: CapabilitiesContextValue = {
		...state,
		refetch: fetchCapabilities,
		isAllowed,
		hasAnyCapability,
		hasAllCapabilities,
	}

	return (
		<CapabilitiesContext.Provider value={contextValue}>
			{children}
		</CapabilitiesContext.Provider>
	)
}
