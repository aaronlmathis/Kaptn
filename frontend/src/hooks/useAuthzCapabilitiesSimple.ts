"use client"

import { useCapabilities } from "@/hooks/useCapabilities"
import type { CapabilityKey } from "@/lib/authz"

/**
 * Simple hook for checking capabilities using the context
 * This replaces the complex API-based authorization hooks
 */
export function useAuthzCapabilitiesInContext(requiredCapabilities: CapabilityKey[]) {
	const { capabilities, isLoading, error, isAllowed, hasAnyCapability, hasAllCapabilities } = useCapabilities()

	return {
		isLoading,
		error,
		capabilities,
		isAllowed,
		hasAnyCapability: () => hasAnyCapability(requiredCapabilities),
		hasAllCapabilities: () => hasAllCapabilities(requiredCapabilities),
	}
}

/**
 * Single capability check hook
 */
export function useAuthzCapability(
	feature: CapabilityKey,
	_cluster: string,
	_namespace?: string,
	_resourceName?: string
) {
	const { isLoading, error, isAllowed } = useCapabilities()

	return {
		isLoading,
		error,
		allowed: isAllowed(feature),
		reason: error || (isAllowed(feature) ? undefined : 'Access denied'),
	}
}
