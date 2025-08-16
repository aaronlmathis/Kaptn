"use client";

import * as React from "react";
import {
  IconDashboard,
  IconDatabase,
  IconSettings,
  IconShield,
  IconHexagons,
  IconChartBar,
  IconCloudComputing,
  IconTopologyStar,
} from "@tabler/icons-react";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { NamespaceSwitcher } from "@/components/namespace-switcher";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar";
import { Separator } from "./ui/separator";
import { AppLogo } from "@/components/AppLogo";
import { useNavigation } from "@/contexts/navigation-context";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useAuth } from "@/hooks/useAuth";

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { isMenuExpanded } = useNavigation();
  const { capabilities } = useCapabilities();
  const { user } = useAuth();

  // Debug: Log user data in sidebar
  React.useEffect(() => {
    if (user) {
      console.log('🔍 User data in sidebar:', user);
      console.log('🔍 Picture URL:', user.picture);
    }
  }, [user]);

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

    // Add Istio items if installed and in use
    if (capabilities?.istio?.installed && capabilities?.istio?.used) {
      servicesNav.items.push(
        { title: "Virtual Services", url: "/virtual-services" },
        { title: "Gateways", url: "/gateways" }
      );
    }

    // Unified navigation items combining main and secondary navigation
    const allNavItems = [
      { title: "Dashboard", url: "/", icon: IconDashboard },
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
        title: "Access Control",
        url: "#",
        icon: IconShield,
        items: [
          { title: "RBAC", url: "/rbac" },
          { title: "Service Accounts", url: "/service-accounts" },
          { title: "Pod Security", url: "/pod-security" },
        ],
      },
      {
        title: "Monitoring",
        url: "#",
        icon: IconChartBar,
        items: [
          { title: "Metrics", url: "/metrics" },
          { title: "Logs", url: "/logs" },
          { title: "Events", url: "/events" },
        ],
      },
      {
        title: "Settings",
        url: "#",
        icon: IconSettings,
        items: [
          { title: "Cluster Settings", url: "/settings/cluster" },
          { title: "User Management", url: "/settings/users" },
          { title: "API Settings", url: "/settings/api" },
        ],
      },
    ];

    return {
      user: {
        name: user?.name || "Unknown User",
        email: user?.email || "no-email@localhost",
        avatar: user?.picture || "/avatars/default-user.jpg"
      },
      navItems: allNavItems,
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