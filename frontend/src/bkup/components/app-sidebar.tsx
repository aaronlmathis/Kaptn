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
        { title: "Services", url: "/services" },
        { title: "Endpoints", url: "/endpoints" },
        { title: "Endpoint Slices", url: "/endpoint-slices" },
        { title: "Ingresses", url: "/ingresses" },
        { title: "Ingress Classes", url: "/ingress-classes" },
        { title: "Network Policies", url: "/network-policies" },
        { title: "Load Balancers", url: "/load-balancers" },
      ],
    };

    // Add Istio items if installed and resource present (per-item gating)
    if (istioInstalled) {
      const vsCount = istio?.counts?.virtualservices ?? 0;
      const gwCount = istio?.counts?.gateways ?? 0;
      if (vsCount > 0) {
        servicesNav.items.push({ title: "Virtual Services", url: "/virtual-services" });
      }
      if (gwCount > 0) {
        servicesNav.items.push({ title: "Gateways", url: "/gateways" });
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
          { title: "Nodes", url: "/nodes" },
          { title: "Namespaces", url: "/namespaces" },
          { title: "Resource Quotas", url: "/resource-quotas" },
          { title: "API Resources", url: "/api-resources" },
          { title: "CRDs", url: "/crds" },
          { title: "Roles & RoleBindings", url: "/roles" },
          { title: "ClusterRoles & Bindings", url: "/cluster-roles" },
          { title: "Component Status", url: "/component-status" },
          { title: "Certificates", url: "/certificates" },
          { title: "Version & Upgrades", url: "/version-upgrades" },
        ],
      },
      {
        title: "Workloads",
        url: "#",
        icon: IconCloudComputing,
        items: [
          { title: "Pods", url: "/pods" },
          { title: "Deployments", url: "/deployments" },
          { title: "ReplicaSets", url: "/replicasets" },
          { title: "StatefulSets", url: "/statefulsets" },
          { title: "DaemonSets", url: "/daemonsets" },
          { title: "HPAs", url: "/hpas" },
          { title: "Jobs", url: "/jobs" },
          { title: "CronJobs", url: "/cronjobs" },
        ],
      },
      servicesNav,
      {
        title: "Config & Storage",
        url: "#",
        icon: IconDatabase,
        items: [
          { title: "ConfigMaps", url: "/config-maps" },
          { title: "Secrets", url: "/secrets" },
          { title: "Persistent Volumes", url: "/persistent-volumes" },
          { title: "Persistent Volume Claims", url: "/persistent-volume-claims" },
          { title: "Storage Classes", url: "/storage-classes" },
          { title: "Volume Snapshots", url: "/volume-snapshots" },
          { title: "Volume Snapshot Classes", url: "/volume-snapshot-classes" },
          { title: "CSI Drivers", url: "/csi-drivers" },
        ],
      },

      {
        title: "Access Control",
        url: "#",
        icon: IconShield,
        items: [
          { title: "RBAC", url: "/rbac" },
          { title: "Service Accounts", url: "/service-accounts" },
          { title: "Pod Security", url: "/pod-security" },
        ],
      },
      // {
      //   title: "Monitoring",
      //   url: "#",
      //   icon: IconChartBar,
      //   items: [
      //     { title: "Explore Metrics", url: "/metric-explorer" },
      //     { title: "OpsView", url: "/opsview" },
      //     { title: "Logs", url: "/logs" },
      //     { title: "Events", url: "/events" },
      //   ],
      // },
      // {
      //   title: "Settings",
      //   url: "#",
      //   icon: IconSettings,
      //   items: [
      //     { title: "Cluster Settings", url: "/settings/cluster" },
      //     { title: "User Management", url: "/settings/users" },
      //     { title: "API Settings", url: "/settings/api" },
      //   ],
      // },
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
