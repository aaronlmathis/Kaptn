import * as React from "react";
import { SharedProviders } from "@/components/shared-providers";
import { DashboardLayout } from "@/components/dashboard-layout";

type PageComponent = React.ComponentType<unknown>;

// Dynamically resolve the page container based on the current path.
// Keeps a single React tree so context providers work for all children.
async function resolvePageComponent(pathname: string): Promise<PageComponent | null> {
  const path = pathname.replace(/\/+$/, "") || "/";

  try {
    switch (path) {
      case "/":
        return (await import("@/components/dashboard-container")).DashboardContainer;

      case "/api-resources":
      case "/cluster/api-resources":
        return (await import("@/components/containers/ApiResourcesPageContainer")).ApiResourcesPageContainer;
      case "/apply":
        return (await import("@/components/containers/ApplyConfigContainer")).ApplyConfigContainer;
      case "/cluster-roles":
      case "/cluster/cluster-roles":
        return (await import("@/components/containers/ClusterRolesPageContainer")).ClusterRolesPageContainer;
      case "/config-maps":
      case "/storage/config-maps":
        return (await import("@/components/containers/ConfigMapsPageContainer")).ConfigMapsPageContainer;
      case "/crds":
      case "/cluster/crds":
        return (await import("@/components/containers/CRDsPageContainer")).CRDsPageContainer;
      case "/cronjobs":
      case "/workloads/cronjobs":
        return (await import("@/components/containers/CronJobsPageContainer")).CronJobsPageContainer;
      case "/csi-drivers":
      case "/storage/csi-drivers":
        return (await import("@/components/containers/CSIDriversPageContainer")).CSIDriversPageContainer;
      case "/daemonsets":
      case "/workloads/daemonsets":
        return (await import("@/components/containers/DaemonSetsPageContainer")).DaemonSetsPageContainer;
      case "/debug":
        return (await import("@/components/pages/DebugPage")).DebugPage;

      case "/deployments":
      case "/workloads/deployments":
        return (await import("@/components/containers/DeploymentsPageContainer")).DeploymentsPageContainer;
      case "/hpas":
      case "/workloads/hpas":
        return (await import("@/components/containers/HPAsPageContainer")).HPAsPageContainer;
      case "/endpoints":
      case "/services/endpoints":
        return (await import("@/components/containers/EndpointsPageContainer")).EndpointsPageContainer;
      case "/endpoint-slices":
      case "/services/endpoint-slices":
        return (await import("@/components/containers/EndpointSlicesPageContainer")).EndpointSlicesPageContainer;
      case "/events":
        return (await import("@/components/containers/EventsPageContainer")).EventsPageContainer;
      case "/gateways":
      case "/services/gateways":
        return (await import("@/components/containers/GatewaysPageContainer")).GatewaysPageContainer;
      case "/ingress-classes":
      case "/services/ingress-classes":
        return (await import("@/components/containers/IngressClassesPageContainer")).IngressClassesPageContainer;
      case "/ingresses":
      case "/services/ingresses":
        return (await import("@/components/containers/IngressesPageContainer")).IngressesPageContainer;
      case "/jobs":
      case "/workloads/jobs":
        return (await import("@/components/containers/JobsPageContainer")).JobsPageContainer;
      case "/load-balancers":
      case "/services/load-balancers":
        return (await import("@/components/containers/LoadBalancersPageContainer")).LoadBalancersPageContainer;
      case "/logs":
        return (await import("@/components/containers/LogsPageContainer")).LogsPageContainer;
      case "/metric-explorer":
        return (await import("@/components/charts/ClusterCPUChart")).ClusterCPUChart; // simple visual, page-level explorer may wrap chart(s)
      case "/namespaces":
      case "/cluster/namespaces":
        return (await import("@/components/containers/NamespacesPageContainer")).NamespacesPageContainer;
      case "/network-policies":
      case "/services/network-policies":
        return (await import("@/components/containers/NetworkPoliciesPageContainer")).NetworkPoliciesPageContainer;
      case "/nodes":
      case "/cluster/nodes":
        return (await import("@/components/containers/NodesPageContainer")).NodesPageContainer;
      case "/opsview":
        return (await import("@/components/opsview-container")).OpsViewContainer;
      case "/cluster":
        return (await import("@/components/containers/ClusterPageContainer")).ClusterPageContainer;
      case "/workloads":
        return (await import("@/components/pages/WorkloadsPageContainer")).WorkloadsPageContainer;
      case "/storage":
        return (await import("@/components/pages/StoragePageContainer")).StoragePageContainer;
      case "/access":
        return (await import("@/components/pages/AccessPageContainer")).AccessPageContainer;
      case "/persistent-volume-claims":
      case "/storage/persistent-volume-claims":
        return (await import("@/components/containers/PersistentVolumeClaimsPage")).PersistentVolumeClaimsPageContainer;
      case "/persistent-volumes":
      case "/storage/persistent-volumes":
        return (await import("@/components/containers/PersistentVolumesPageContainer")).PersistentVolumesPageContainer;
      case "/pods":
      case "/workloads/pods":
        return (await import("@/components/containers/PodsPageContainer")).PodsPageContainer;
      case "/rbac":
      case "/access/rbac":
        return (await import("@/components/containers/RbacPageContainer")).RBACPageContainer;
      case "/replicasets":
      case "/workloads/replicasets":
        return (await import("@/components/containers/ReplicaSetsPageContainer")).ReplicaSetsPageContainer;
      case "/resource-quotas":
      case "/cluster/resource-quotas":
        return (await import("@/components/containers/ResourceQuotasPageContainer")).ResourceQuotasPageContainer;
      case "/roles":
      case "/cluster/roles":
        return (await import("@/components/containers/RolesPageContainer")).RolesPageContainer;
      case "/secrets":
      case "/storage/secrets":
        return (await import("@/components/containers/SecretsPageContainer")).SecretsPageContainer;
      case "/services":
        return (await import("@/components/containers/ServicesPageContainer")).ServicesPageContainer;
      case "/statefulsets":
      case "/workloads/statefulsets":
        return (await import("@/components/containers/StatefulSetsPageContainer")).StatefulSetsPageContainer;
      case "/storage-classes":
      case "/storage/storage-classes":
        return (await import("@/components/containers/StorageClassesPageContainer")).StorageClassesPageContainer;
      case "/virtual-services":
      case "/services/virtual-services":
        return (await import("@/components/containers/VirtualServicesPageContainer")).VirtualServicesPageContainer;
      case "/volume-snapshot-classes":
      case "/storage/volume-snapshot-classes":
        return (await import("@/components/containers/VolumeSnapshotClassesPageContainer")).VolumeSnapshotClassesPageContainer;
      case "/volume-snapshots":
      case "/storage/volume-snapshots":
        return (await import("@/components/containers/VolumeSnapshotsPageContainer")).VolumeSnapshotsPageContainer;

      default:
        return null;
    }
  } catch (e) {
    console.error("Failed to load page component for", pathname, e);
    return null;
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [Page, setPage] = React.useState<PageComponent | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    // Determine which page component to render and lazy-load it.
    resolvePageComponent(window.location.pathname).then((Comp) => {
      if (!cancelled) setPage(() => Comp);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SharedProviders>
      <DashboardLayout>
        {/* While the page component lazy-loads, render server HTML children to avoid hydration mismatch. */}
        {Page ? <Page /> : children}
      </DashboardLayout>
    </SharedProviders>
  );
}
