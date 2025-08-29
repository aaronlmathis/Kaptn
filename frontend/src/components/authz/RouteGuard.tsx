import * as React from "react";
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple";
import { useAuth } from "@/contexts/auth-context";
import { useCapabilities } from "@/hooks/use-capabilities";
import type { CapabilityKey } from "@/lib/authz";
import { LoadingBar } from "@/components/ui/loading-bar";
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
  const { isAuthenticated, authMode, isLoading: authLoading } = useAuth();
  const { isLoading: capabilitiesLoading, error, isAllowed } = useAuthzCapabilitiesInContext(requiredCapabilities);
  const { fetchAdditional } = useCapabilities();

  // Dev-only logging helpers
  const IS_DEV = (import.meta as any)?.env?.DEV === true;
  const devLog = (...args: unknown[]) => { if (IS_DEV) console.log(...args); };
  const devWarn = (...args: unknown[]) => { if (IS_DEV) console.warn(...args); };

  // Dev-only debug logging
  devLog('[route-guard] state', { isAuthenticated, authMode, authLoading, capabilitiesLoading, hasPodsList: isAllowed('pods.list') });

  // Ensure required capabilities are requested explicitly on mount (fast-path fetch is minimal)
  React.useEffect(() => {
    if (requiredCapabilities && requiredCapabilities.length > 0) {
      // Fire and forget; backend ignores unknown capability keys safely
      fetchAdditional(requiredCapabilities as unknown as string[]).catch(() => { /* noop */ });
    }
    // Only run on first mount for this set of requirements
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show loading state while auth is initializing OR capabilities are loading
  if (authLoading || capabilitiesLoading) {
    return loading ? (
      <>{loading}</>
    ) : (
      <div className="flex h-64 items-center justify-center">
        <LoadingBar
          variant="thin"
          label="Loading..."
          className="w-full max-w-md"
        />
      </div>
    );
  }

  // Check authentication first (only after auth has finished loading)
  if (!isAuthenticated) {
    devLog('[route-guard] redirecting to login (unauthenticated)');
    // Redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  // On error, show error state
  if (error) {
    devWarn('[route-guard] authorization check failed');
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

  devLog('[route-guard] access check', { requiredCapabilities, requireAll, hasAccess });

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
