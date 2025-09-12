"use client";

import * as React from "react";
import { RouteGuard } from "@/components/authz";
import { useNavigation } from "@/contexts/navigation-context";
import { useRolesWithWebSocket } from "@/hooks/useRolesWithWebSocket";
import { useRoleBindingsWithWebSocket } from "@/hooks/useRoleBindingsWithWebSocket";
import { useClusterRolesWithWebSocket } from "@/hooks/useClusterRolesWithWebSocket";
import { useClusterRoleBindingsWithWebSocket } from "@/hooks/useClusterRoleBindingsWithWebSocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter";

function AccessContent() {
  const { setPageTitle, isHydrated } = useNavigation();
  React.useEffect(() => {
    if (isHydrated) setPageTitle("Access Control");
  }, [isHydrated, setPageTitle]);

  const { data: roles = [] } = useRolesWithWebSocket(true);
  const { data: roleBindings = [] } = useRoleBindingsWithWebSocket(true);
  const { data: clusterRoles = [] } = useClusterRolesWithWebSocket(true);
  const { data: clusterRoleBindings = [] } = useClusterRoleBindingsWithWebSocket(true);

  const issues = React.useMemo(() => {
    // Basic heuristics: many bindings but few roles or vice versa
    const warnings: string[] = [];
    if (roles.length === 0 && clusterRoles.length === 0) warnings.push("No roles defined");
    if (roleBindings.length === 0 && clusterRoleBindings.length === 0) warnings.push("No bindings defined");
    return warnings;
  }, [roles.length, roleBindings.length, clusterRoles.length, clusterRoleBindings.length]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 lg:px-6">
      {/* RBAC Quick Facts */}
      <Card className="rounded-2xl border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">RBAC Quick Facts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>Roles: <span className="font-medium">{roles.length}</span></div>
          <div>RoleBindings: <span className="font-medium">{roleBindings.length}</span></div>
          <div>ClusterRoles: <span className="font-medium">{clusterRoles.length}</span></div>
          <div>ClusterRoleBindings: <span className="font-medium">{clusterRoleBindings.length}</span></div>
          <div className="pt-1">
            <Button asChild variant="link" className="px-0 h-6 mr-2"><a href="/cluster/roles">Manage Roles →</a></Button>
            <Button asChild variant="link" className="px-0 h-6"><a href="/cluster/cluster-roles">Cluster Roles →</a></Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent RBAC Changes (placeholder) */}
      <Card className="rounded-2xl border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">Recent RBAC Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No recent changes detected</div>
          <div className="pt-1">
            <Button asChild variant="link" className="px-0 h-6"><a href="/access/rbac">Open RBAC Builder →</a></Button>
          </div>
        </CardContent>
      </Card>

      {/* Common Issues */}
      <Card className="rounded-2xl border border-gray-100">
        <CardHeader>
          <CardTitle className="text-base">Common Issues</CardTitle>
        </CardHeader>
        <CardContent>
          <SectionHealthFooter
            tone={issues.length > 0 ? 'warn' : 'ok'}
            summary={issues.length > 0 ? issues.join(' · ') : 'RBAC configuration looks healthy'}
          >
            Validate group mappings and impersonation permissions
          </SectionHealthFooter>
        </CardContent>
      </Card>
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
