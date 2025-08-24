import * as React from "react";
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzContext";
import type { CapabilityKey } from "@/lib/authz";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldX } from "lucide-react";

export interface RouteGuardProps {
  requiredCapabilities: CapabilityKey[];
  children: React.ReactNode;
  loading?: React.ReactNode;
  fallback?: React.ReactNode;
  requireAll?: boolean; // If true, user must have ALL capabilities. If false, user needs ANY capability.
}

/**
 * Route-level authorization guard that prevents access to entire pages/routes
 * based on required capabilities
 */
export function RouteGuard({
  requiredCapabilities,
  children,
  loading,
  fallback,
  requireAll = true,
}: RouteGuardProps) {
  const { isLoading, error, isAllowed } = useAuthzCapabilitiesInContext(requiredCapabilities);

  // Show loading state while checking capabilities
  if (isLoading) {
    return loading ? (
      <>{loading}</>
    ) : (
      <div className="flex h-32 items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  // On error, show error state
  if (error) {
    console.warn(`Route authorization check failed:`, error);
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <ShieldX className="h-4 w-4" />
          <AlertTitle>Authorization Error</AlertTitle>
          <AlertDescription>
            Unable to verify permissions. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Check if user has required capabilities
  const hasAccess = requireAll
    ? requiredCapabilities.every(capability => isAllowed(capability))
    : requiredCapabilities.some(capability => isAllowed(capability));

  if (!hasAccess) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <ShieldX className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You don't have the necessary permissions to view this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <>{children}</>;
}
