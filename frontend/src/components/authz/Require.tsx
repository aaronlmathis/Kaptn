import * as React from "react";

export interface RequireProps {
  allowed?: boolean;
  children: React.ReactNode;
}

/**
 * Simple conditional rendering component based on boolean permission
 * Use this when you already have the permission state from useAuthzCapabilities
 */
export function Require({ allowed, children }: RequireProps) {
  if (!allowed) {
    return null;
  }
  return <>{children}</>;
}
