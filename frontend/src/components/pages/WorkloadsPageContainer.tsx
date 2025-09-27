"use client";

import * as React from "react";
import { RouteGuard } from "@/components/authz";
import { useNavigation } from "@/contexts/navigation-context";
import { WorkloadsDashboard } from "@/components/dashboards/WorkloadsDashboard";

function WorkloadsContent() {
  const { setPageTitle, isHydrated } = useNavigation();

  React.useEffect(() => {
    if (isHydrated) {
      setPageTitle("Workloads Overview");
    }
  }, [isHydrated, setPageTitle]);

  return (
    <div className="space-y-6">
      <WorkloadsDashboard />
    </div>
  );
}

export function WorkloadsPageContainer() {
  return (
    <RouteGuard requiredCapabilities={["pods.list"]} requireAll={false}>
      <WorkloadsContent />
    </RouteGuard>
  );
}

