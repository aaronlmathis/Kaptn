"use client";

import * as React from "react";
import { RouteGuard } from "@/components/authz";
import { useNavigation } from "@/contexts/navigation-context";
import { AccessDashboard } from "@/components/dashboards/AccessDashboard";

function AccessContent() {
  const { setPageTitle, isHydrated } = useNavigation();
  React.useEffect(() => {
    if (isHydrated) {
      setPageTitle("Access & RBAC");
    }
  }, [isHydrated, setPageTitle]);

  return (
    <div className="space-y-6">
      <AccessDashboard />
    </div>
  );
}

export function AccessPageContainer() {
  return (
    <RouteGuard requiredCapabilities={["roles.list", "clusterroles.list"]} requireAll={false}>
      <AccessContent />
    </RouteGuard>
  );
}
