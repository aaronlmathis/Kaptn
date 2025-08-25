"use client"

import * as React from "react"
import { CapabilitiesContext } from "@/contexts/capabilities-context"

const DEFAULT_CAPABILITIES = {
	'pods.list': true,
	'pods.get': true,
	'pods.create': true,
	'pods.update': true,
	'pods.delete': true,
	'deployments.list': true,
	'deployments.get': true,
	'deployments.create': true,
	'deployments.update': true,
	'deployments.delete': true,
	'services.list': true,
	'services.get': true,
	'services.create': true,
	'services.update': true,
	'services.delete': true,
	'namespaces.list': true,
	'namespaces.get': true,
	'events.list': true,
	'events.get': true,
	'pods.logs': true,
	'pods.exec': true,
}

export function useCapabilities() {
	const context = React.useContext(CapabilitiesContext)
	if (context === undefined) {
		// Fallback for SSR - assume all capabilities are allowed during build
		if (typeof window === 'undefined') {
			return {
				capabilities: DEFAULT_CAPABILITIES,
				isLoading: false,
				error: null,
				lastFetched: Date.now(),
				refetch: async () => { },
				isAllowed: () => true,
				hasAnyCapability: () => true,
				hasAllCapabilities: () => true,
			}
		}
		throw new Error('useCapabilities must be used within a CapabilitiesProvider')
	}
	return context
}
