"use client"

import * as React from "react";

export interface ClusterContextType {
  clusterId: string;
  setClusterId: (clusterId: string) => void;
}

const ClusterContext = React.createContext<ClusterContextType | undefined>(undefined);

export { ClusterContext };

export function ClusterProvider({ children }: { children: React.ReactNode }) {
  // For now, we'll use a default cluster ID. This can be enhanced later
  // to support multiple clusters or dynamic cluster selection
  const [clusterId, setClusterId] = React.useState<string>("default");

  const value: ClusterContextType = {
    clusterId,
    setClusterId,
  };

  return (
    <ClusterContext.Provider value={value}>
      {children}
    </ClusterContext.Provider>
  );
}
