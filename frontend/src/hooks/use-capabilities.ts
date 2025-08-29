"use client"

import * as React from "react"
import { CapabilitiesContext, type CapabilitiesContextValue } from "@/contexts/capabilities-context"

// No default allowlist. SSR and missing provider should be conservative.

export function useCapabilities(): CapabilitiesContextValue {
	const context = React.useContext(CapabilitiesContext)
	if (context === undefined) {
		// Fallback for SSR - assume all capabilities are allowed during build
		if (typeof window === 'undefined') {
			return {
				capabilities: {},
				isLoading: true,
				error: null,
				lastFetched: null,
				refetch: async () => { },
				fetchAdditional: async () => { },
				isAllowed: () => false,
				hasAnyCapability: () => false,
				hasAllCapabilities: () => false,
			}
		}
		throw new Error('useCapabilities must be used within a CapabilitiesProvider')
	}
	return context
}
