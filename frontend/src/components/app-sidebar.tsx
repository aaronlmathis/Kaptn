"use client";

import * as React from "react";
import {
  IconDashboard,
  IconDatabase,
  IconShield,
  IconHexagons,
  IconCloudComputing,
  IconTopologyStar,
  IconActivity,
  IconEye,
  IconFileText,
  IconBell,
  IconPlug,
  IconUsers,
} from "@tabler/icons-react";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { NavMain } from "@/components/nav-main";
import { NavObservability } from "@/components/nav-observability";
import { NavUser } from "@/components/nav-user";
import { NamespaceSwitcher } from "@/components/namespace-switcher";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";
import { Separator } from "./ui/separator";
import { AppLogo } from "@/components/AppLogo";
import { useNavigation } from "@/contexts/navigation-context";
import { useClusterFeatures } from "@/contexts/cluster-features-context";
import { useAuth } from "@/contexts/auth-context";
import { NavSettings } from "./nav-settings";


export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { isMenuExpanded } = useNavigation();
  const { istioInstalled, istioUsed, istio } = useClusterFeatures();
  const { user } = useAuth();


  // Build navigation data dynamically based on capabilities
  const getNavigationData = () => {
    // Base Services navigation
    const servicesNav = {
      title: "Services",
      url: "/services",
      icon: IconTopologyStar,
      items: [
        { title: "Endpoints", url: "/services/endpoints" },
        { title: "Endpoint Slices", url: "/services/endpoint-slices" },
        { title: "Ingresses", url: "/services/ingresses" },
        { title: "Ingress Classes", url: "/services/ingress-classes" },
        { title: "Network Policies", url: "/services/network-policies" },
        { title: "Load Balancers", url: "/services/load-balancers" },
      ],
    };

    // Add Istio items if installed and resource present (per-item gating)
    if (istioInstalled) {
      const vsCount = istio?.counts?.virtualservices ?? 0;
      const gwCount = istio?.counts?.gateways ?? 0;
      if (vsCount > 0) {
        servicesNav.items.push({ title: "Virtual Services", url: "/services/virtual-services" });
      }
      if (gwCount > 0) {
        servicesNav.items.push({ title: "Gateways", url: "/services/gateways" });
      }
    }

    // Unified navigation items combining main and secondary navigation
    const allNavItems = [
      { title: "Dashboard", url: "/", icon: IconDashboard },
      {
        title: "Cluster",
        url: "/cluster",
        icon: IconHexagons,
        items: [
          { title: "Nodes", url: "/cluster/nodes" },
          { title: "Namespaces", url: "/cluster/namespaces" },
          { title: "Resource Quotas", url: "/cluster/resource-quotas" },
          { title: "API Resources", url: "/cluster/api-resources" },
          { title: "CRDs", url: "/cluster/crds" },
          { title: "Roles & RoleBindings", url: "/cluster/roles" },
          { title: "ClusterRoles & Bindings", url: "/cluster/cluster-roles" },
          { title: "Component Status", url: "/cluster/component-status" },
          { title: "Certificates", url: "/cluster/certificates" },
          { title: "Version & Upgrades", url: "/cluster/version-upgrades" },
        ],
      },
      {
        title: "Workloads",
        url: "/workloads",
        icon: IconCloudComputing,
        items: [
          { title: "Pods", url: "/workloads/pods" },
          { title: "Deployments", url: "/workloads/deployments" },
          { title: "ReplicaSets", url: "/workloads/replicasets" },
          { title: "StatefulSets", url: "/workloads/statefulsets" },
          { title: "DaemonSets", url: "/workloads/daemonsets" },
          { title: "HPAs", url: "/workloads/hpas" },
          { title: "Jobs", url: "/workloads/jobs" },
          { title: "CronJobs", url: "/workloads/cronjobs" },
        ],
      },
      servicesNav,
      {
        title: "Config & Storage",
        url: "/storage",
        icon: IconDatabase,
        items: [
          { title: "ConfigMaps", url: "/storage/config-maps" },
          { title: "Secrets", url: "/storage/secrets" },
          { title: "Persistent Volumes", url: "/storage/persistent-volumes" },
          { title: "Persistent Volume Claims", url: "/storage/persistent-volume-claims" },
          { title: "Storage Classes", url: "/storage/storage-classes" },
          { title: "Volume Snapshots", url: "/storage/volume-snapshots" },
          { title: "Volume Snapshot Classes", url: "/storage/volume-snapshot-classes" },
          { title: "CSI Drivers", url: "/storage/csi-drivers" },
        ],
      },
      {
        title: "Access Control",
        url: "/access",
        icon: IconShield,
        items: [
          { title: "RBAC", url: "/access/rbac" },
          { title: "Service Accounts", url: "/access/service-accounts" },
          { title: "Pod Security", url: "/access/pod-security" },
        ],
      },
    ];
    // Observability section - flat menu items with individual icons
    const observabilityNavItems = [
      { title: "Metrics", url: "/metric-explorer", icon: IconActivity },
      { title: "OpsView", url: "/opsview", icon: IconEye },
      { title: "Logs", url: "/logs", icon: IconFileText },
      { title: "Events", url: "/events", icon: IconBell },
    ];

    const settingsNavItems = [
      { title: "Kaptn Config", url: "/settings/kaptn", icon: IconActivity },
      { title: "Integrations", url: "/settings/integrations", icon: IconPlug },
      { title: "User Management", url: "/settings/users", icon: IconUsers },
      { title: "API", url: "/settings/api", icon: IconFileText },

    ];
    return {
      user: {
        name: user?.name || "Unknown User",
        email: user?.email || "no-email@localhost",
        avatar: user?.picture || ""
      },
      navItems: allNavItems,
      observabilityItems: observabilityNavItems,
      settingsItems: settingsNavItems,
    };
  };

  const data = getNavigationData();
  return (
    <Sidebar className="group" collapsible="icon" data-expanded={isMenuExpanded("ROOT") ? "true" : "false"} {...props}>
      <SidebarHeader>
        <AppLogo />
        <Separator className="w-full" />
        <NamespaceSwitcher />
      </SidebarHeader>

      <SidebarContent className="p-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col h-full">
            <NavMain items={data.navItems} />
            <NavObservability items={data.observabilityItems} />
            <NavSettings items={data.settingsItems} />
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
