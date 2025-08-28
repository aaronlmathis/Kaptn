"use client"

import { useContext } from "react";
import { ClusterContext, type ClusterContextType } from "@/contexts/cluster-context";

export function useCluster(): ClusterContextType {
  const context = useContext(ClusterContext);
  if (context === undefined) {
    // During static build/SSR, provide a safe no-op fallback so pages can pre-render
    if (typeof window === 'undefined') {
      return {
        clusterId: 'default',
        setClusterId: () => {}
      } as ClusterContextType;
    }
    throw new Error("useCluster must be used within a ClusterProvider");
  }
  return context;
}
