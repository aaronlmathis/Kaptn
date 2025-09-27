"use client";

import * as React from "react";
import { RouteGuard } from "@/components/authz";
import { useNavigation } from "@/contexts/navigation-context";
import { StorageDashboard } from "@/components/dashboards/StorageDashboard";

function StorageContent() {
  const { setPageTitle, isHydrated } = useNavigation();

  React.useEffect(() => {
    if (isHydrated) {
      setPageTitle("Storage Overview");
    }
  }, [isHydrated, setPageTitle]);

  return (
    <div className="space-y-6">
      <StorageDashboard />
    </div>
  );
}

export function StoragePageContainer() {
  return (
    <RouteGuard requiredCapabilities={["persistentvolumeclaims.list", "persistentvolumes.list"]} requireAll={false}>
      <StorageContent />
    </RouteGuard>
  );
}
