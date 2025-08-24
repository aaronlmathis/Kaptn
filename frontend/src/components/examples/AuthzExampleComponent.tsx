import * as React from "react";
import { IfAllowed, RouteGuard } from "@/components/authz";
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { POD_MANAGE_CAPABILITIES, DEPLOYMENT_MANAGE_CAPABILITIES } from "@/lib/authz-helpers";

/**
 * Example component demonstrating authorization patterns
 */
export function AuthzExampleComponent() {
  const { capabilities, isLoading, error } = useAuthzCapabilitiesInContext([
    "pods.delete",
    "pods.exec",
    "deployments.restart",
    "configmaps.edit",
  ]);

  if (isLoading) {
    return <div>Loading permissions...</div>;
  }

  if (error) {
    return <div>Error loading permissions: {error.message}</div>;
  }

  return (
    <RouteGuard
      requiredCapabilities={["pods.get"]}
      requireAll={false}
    >
      <Card>
        <CardHeader>
          <CardTitle>Authorization Examples</CardTitle>
          <CardDescription>
            Examples of capability-based UI gating
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Button-level authorization */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Button Authorization</h3>
            <div className="flex gap-2">
              <IfAllowed feature="pods.delete" cluster="default" namespace="default">
                <Button variant="destructive">Delete Pod</Button>
              </IfAllowed>

              <IfAllowed
                feature="pods.exec"
                cluster="default"
                namespace="default"
                fallback={<Button disabled>Exec Shell (No Permission)</Button>}
              >
                <Button>Exec Shell</Button>
              </IfAllowed>

              <IfAllowed
                feature="deployments.restart"
                cluster="default"
                namespace="default"
                showReason={true}
              >
                <Button variant="outline">Restart Deployment</Button>
              </IfAllowed>
            </div>
          </div>

          {/* Permission status display */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Permission Status</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(capabilities).map(([capability, allowed]) => (
                <Badge
                  key={capability}
                  variant={allowed ? "default" : "secondary"}
                >
                  {capability}: {allowed ? "✓" : "✗"}
                </Badge>
              ))}
            </div>
          </div>

          {/* Conditional content based on multiple capabilities */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Advanced Patterns</h3>

            <RouteGuard
              requiredCapabilities={POD_MANAGE_CAPABILITIES}
              requireAll={true}
              fallback={
                <div className="p-4 border rounded-md text-muted-foreground">
                  You need full pod management permissions to see this section.
                </div>
              }
            >
              <div className="p-4 border rounded-md bg-green-50">
                <h4 className="font-medium">Pod Management Dashboard</h4>
                <p className="text-sm text-muted-foreground">
                  You have full pod management capabilities!
                </p>
              </div>
            </RouteGuard>

            <RouteGuard
              requiredCapabilities={DEPLOYMENT_MANAGE_CAPABILITIES}
              requireAll={false}
              fallback={
                <div className="p-4 border rounded-md text-muted-foreground">
                  You need at least one deployment management permission.
                </div>
              }
            >
              <div className="p-4 border rounded-md bg-blue-50">
                <h4 className="font-medium">Deployment Tools</h4>
                <p className="text-sm text-muted-foreground">
                  You have some deployment management capabilities.
                </p>
              </div>
            </RouteGuard>
          </div>
        </CardContent>
      </Card>
    </RouteGuard>
  );
}
