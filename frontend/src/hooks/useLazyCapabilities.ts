"use client"

import * as React from "react"
import { useCapabilities } from "@/hooks/use-capabilities"
import type { CapabilityKey } from "@/lib/authz"

/**
 * Hook for lazy-loading specific capabilities when they're needed
 * This allows pages to load additional permissions without slowing down initial load
 */
export function useLazyCapabilities(features: CapabilityKey[], autoLoad = true) {
	const { capabilities, isLoading, fetchAdditional, isAllowed } = useCapabilities()
	const [hasLoaded, setHasLoaded] = React.useState(false)

	// Check if we already have all the requested capabilities
	const hasAllRequested = React.useMemo(() => {
		return features.every(feature => (capabilities as Record<string, boolean>)[feature] !== undefined)
	}, [capabilities, features])

	// Auto-load missing capabilities
	React.useEffect(() => {
		if (autoLoad && !isLoading && !hasAllRequested && !hasLoaded) {
			const missingFeatures = features.filter(feature => (capabilities as Record<string, boolean>)[feature] === undefined)
			if (missingFeatures.length > 0) {
				setHasLoaded(true)
				fetchAdditional(missingFeatures)
			}
		}
	}, [autoLoad, isLoading, hasAllRequested, hasLoaded, features, capabilities, fetchAdditional])

	return {
		isLoading: isLoading || (!hasAllRequested && !hasLoaded),
		capabilities,
		isAllowed,
		hasAllRequested,
		loadCapabilities: () => {
			const missingFeatures = features.filter(feature => (capabilities as Record<string, boolean>)[feature] === undefined)
			if (missingFeatures.length > 0) {
				return fetchAdditional(missingFeatures)
			}
			return Promise.resolve()
		}
	}
}
