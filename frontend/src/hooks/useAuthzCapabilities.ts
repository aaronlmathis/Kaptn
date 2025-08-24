import { useQuery } from "@tanstack/react-query";
import type { CapabilityKey, CapabilityQuery, CapabilityReply } from "@/lib/authz";
import { getCapabilityQueryKey } from "@/lib/authz";
import { apiClient } from "@/lib/api-client";

/**
 * Hook for querying user authorization capabilities
 * Uses React Query for caching with short TTL as specified in the plan
 */
export function useAuthzCapabilities(query: CapabilityQuery) {
  return useQuery({
    queryKey: getCapabilityQueryKey(query),
    queryFn: async (): Promise<CapabilityReply> => {
      const response = await apiClient.post<CapabilityReply>("/authz/capabilities", query);
      return response;
    },
    staleTime: 20_000, // 20 seconds as specified in the plan
    gcTime: 60_000,   // 60 seconds garbage collection time
    enabled: !!query.cluster && query.features.length > 0, // Only run if we have a cluster and features
    retry: 2, // Retry failed requests twice
    retryDelay: 1000, // 1 second delay between retries
  });
}

/**
 * Hook for checking a single capability
 * Convenience wrapper around useAuthzCapabilities
 */
export function useAuthzCapability(
  feature: CapabilityKey,
  cluster: string,
  namespace?: string,
  resourceName?: string
) {
  const query: CapabilityQuery = {
    cluster,
    namespace,
    features: [feature],
    resourceNames: resourceName ? { [feature]: resourceName } : undefined,
  };

  const result = useAuthzCapabilities(query);

  return {
    ...result,
    allowed: result.data?.caps[feature] ?? false,
    reason: result.data?.reasons?.[feature],
  };
}

/**
 * Hook for checking multiple capabilities with a shared context
 */
export function useAuthzCapabilityBatch(
  features: CapabilityKey[],
  cluster: string,
  namespace?: string,
  resourceNames?: Partial<Record<CapabilityKey, string>>
) {
  const query: CapabilityQuery = {
    cluster,
    namespace,
    features,
    resourceNames,
  };

  const result = useAuthzCapabilities(query);

  return {
    ...result,
    capabilities: result.data?.caps ?? {},
    reasons: result.data?.reasons ?? {},
    isAllowed: (feature: CapabilityKey) => result.data?.caps[feature] ?? false,
    getReason: (feature: CapabilityKey) => result.data?.reasons?.[feature],
  };
}
