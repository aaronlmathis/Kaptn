"use client"

import { useCluster } from "@/hooks/useCluster";
import { useNamespace } from "@/contexts/namespace-context";
import { useAuthzCapabilityBatch } from "@/hooks/useAuthzCapabilities";
import type { CapabilityKey } from "@/lib/authz";

/**
 * Convenience hook that combines cluster and namespace context
 * with authorization capability checking
 */
export function useAuthzContext() {
  const { clusterId } = useCluster();
  const { selectedNamespace } = useNamespace();

  return {
    clusterId,
    namespace: selectedNamespace === 'all' ? undefined : selectedNamespace,
  };
}

/**
 * Hook for checking multiple capabilities within the current context
 */
export function useAuthzCapabilitiesInContext(
  features: CapabilityKey[],
  resourceNames?: Partial<Record<CapabilityKey, string>>
) {
  const { clusterId, namespace } = useAuthzContext();

  return useAuthzCapabilityBatch(features, clusterId, namespace, resourceNames);
}
