import * as React from "react";
import { useAuthzCapability } from "@/hooks/useAuthzCapabilitiesSimple";
import type { CapabilityKey } from "@/lib/authz";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface IfAllowedProps {
  feature: CapabilityKey;
  cluster: string;
  namespace?: string;
  resourceName?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
  showReason?: boolean; // Whether to show reason in tooltip when denied
}

/**
 * Conditionally renders children based on user authorization capabilities
 * Shows children if user has the required capability, otherwise shows fallback
 */
export function IfAllowed({
  feature,
  cluster,
  namespace,
  resourceName,
  children,
  fallback,
  loading,
  showReason = true,
}: IfAllowedProps) {
  const { allowed, reason, isLoading, error } = useAuthzCapability(
    feature,
    cluster,
    namespace,
    resourceName
  );

  // Show loading state while checking capabilities
  if (isLoading) {
    return loading ? <>{loading}</> : <Skeleton className="h-8 w-16" />;
  }

  // On error, be conservative and don't show the component
  // This ensures security by default
  if (error) {
    console.warn(`Authorization check failed for ${feature}:`, error);
    return fallback ? <>{fallback}</> : null;
  }

  // If allowed, render children
  if (allowed) {
    return <>{children}</>;
  }

  // If not allowed, render fallback with optional reason tooltip
  if (fallback && showReason && reason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{fallback}</div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Access denied: {reason}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return fallback ? <>{fallback}</> : null;
}
