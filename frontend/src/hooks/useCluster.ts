"use client"

import { useContext } from "react";
import { ClusterContext, type ClusterContextType } from "@/contexts/cluster-context";

export function useCluster(): ClusterContextType {
  const context = useContext(ClusterContext);
  if (context === undefined) {
    throw new Error("useCluster must be used within a ClusterProvider");
  }
  return context;
}
