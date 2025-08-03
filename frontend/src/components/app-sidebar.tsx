"use client"

import * as React from "react"
import {
  AudioWaveform,
  BookOpen,
  Bot,
  Command,
  Frame,
  GalleryVerticalEnd,
  Map,
  PieChart,
  Settings2,
  SquareTerminal,
} from "lucide-react"

import {
  IconDashboard,
  IconDatabase,
  IconFileText,
  IconSettings,
  IconShield,
  IconDeviceDesktop,
  IconTerminal,
  IconUsers,
  IconCloudComputing,
  IconCloud,
} from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavSecondary } from "@/components/nav-secondary"
import { SiKubernetes } from "react-icons/si";
import { NavUser } from "@/components/nav-user"
import { NamespaceSwitcher } from "@/components/namespace-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "./ui/separator"
import { AppLogo } from "@/components/AppLogo"

const data = {
  user: {
    name: "kubernetes-admin",
    email: "admin@k8s.local",
    avatar: "/avatars/k8s-admin.jpg",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: IconDashboard,
    },
    {
      title: "Workloads",
      url: "#",
      icon: IconCloudComputing,
      items: [
        {
          title: "Pods",
          url: "/pods",
        },
        {
          title: "Deployments",
          url: "/deployments",
        },
        {
          title: "ReplicaSets",
          url: "/replicasets",
        },
        {
          title: "StatefulSets",
          url: "/statefulsets",
        },
        {
          title: "DaemonSets",
          url: "/daemonsets",
        },
        {
          title: "Jobs",
          url: "/jobs",
        },
        {
          title: "CronJobs",
          url: "/cronjobs",
        },
      ],
    },
    {
      title: "Services",
      url: "/services",
      icon: IconDatabase,
      items: [
        {
          title: "Services",
          url: "/services",
        },
        {
          title: "Endpoints",
          url: "/endpoints",
        },
        {
          title: "Endpoint Slices",
          url: "/endpoint-slices",
        },
        {
          title: "Ingresses",
          url: "/ingresses",
        },
        {
          title: "Ingress Classes",
          url: "/ingress-classes",
        },
        {
          title: "NetworkPolicies",
          url: "/networkpolicies",
        },
        {
          title: "Load Balancers",
          url: "/load-balancers",
        },
      ],
    },
    {
      title: "Config & Storage",
      url: "#",
      icon: IconDatabase,
      items: [
        {
          title: "ConfigMaps",
          url: "/configmaps",
        },
        {
          title: "Secrets",
          url: "/secrets",
        },
        {
          title: "Persistent Volumes",
          url: "/persistent-volumes",
        },
        {
          title: "Persistent Volume Claims",
          url: "/persistent-volume-claims",
        },
        {
          title: "Storage Classes",
          url: "/storage-classes",
        },
        {
          title: "Volume Snapshots",
          url: "/volume-snapshots",
        },
        {
          title: "Volume Snapshot Classes",
          url: "/volume-snapshot-classes",
        },
        {
          title: "CSI Drivers",
          url: "/csi-drivers",
        },
      ],
    },
    {
      title: "Cluster",
      url: "/cluster",
      icon: IconDeviceDesktop,
      items: [
        {
          title: "Cluster Overview",
          url: "/cluster/overview",
        },
        {
          title: "Nodes",
          url: "/cluster/nodes",
        },
        {
          title: "Namespaces",
          url: "/cluster/namespaces",
        },
        {
          title: "Resource Quotas",
          url: "/cluster/resource-quotas",
        },
        {
          title: "API Resources",
          url: "/cluster/api-resources",
        },
        {
          title: "CRDs",
          url: "/cluster/crds",
        },
        {
          title: "Roles & RoleBindings",
          url: "/cluster/roles",
        },
        {
          title: "ClusterRoles & Bindings",
          url: "/cluster/cluster-roles",
        },
        {
          title: "Events",
          url: "/cluster/events",
        },
        {
          title: "Component Status",
          url: "/cluster/component-status",
        },
        {
          title: "Certificates",
          url: "/cluster/certificates",
        },
        {
          title: "Version & Upgrades",
          url: "/cluster/version-upgrades",
        },
        {
          title: "Cluster Metrics",
          url: "/cluster/metrics",
        },
      ],
    },
  ],
  navSecondary: [
    {
      title: "Access Control",
      url: "#",
      icon: IconShield,
      items: [
        {
          title: "RBAC",
          url: "/rbac",
        },
        {
          title: "Service Accounts",
          url: "/service-accounts",
        },
        {
          title: "Pod Security",
          url: "/pod-security",
        },
      ],
    },
    {
      title: "Monitoring",
      url: "#",
      icon: IconTerminal,
      items: [
        {
          title: "Metrics",
          url: "/metrics",
        },
        {
          title: "Logs",
          url: "/logs",
        },
        {
          title: "Events",
          url: "/events",
        },
      ],
    },
    {
      title: "Settings",
      url: "#",
      icon: IconSettings,
      items: [
        {
          title: "Cluster Settings",
          url: "/cluster-settings",
        },
        {
          title: "User Management",
          url: "/user-management",
        },
        {
          title: "API Settings",
          url: "/api-settings",
        },
      ],
    },
  ],

}


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar className="group" collapsible="icon" {...props}>
      <SidebarHeader>
        <AppLogo />
        <Separator className="w-full" />
        <NamespaceSwitcher />
      </SidebarHeader>
      <SidebarContent className="p-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col h-full ">
            <NavMain items={data.navMain} />
            <NavSecondary items={data.navSecondary} className="mt-auto" />
          </div>
          <ScrollBar orientation="vertical" />
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
