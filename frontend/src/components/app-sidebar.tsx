import * as React from "react"
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

import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "kubernetes-admin",
    email: "admin@k8s.local",
    avatar: "/avatars/k8s-admin.jpg",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
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
      url: "#",
      icon: IconDatabase,
      items: [
        {
          title: "Services",
          url: "/services",
        },
        {
          title: "Ingresses",
          url: "/ingresses",
        },
        {
          title: "NetworkPolicies",
          url: "/networkpolicies",
        },
        {
          title: "Endpoints",
          url: "/endpoints",
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
          title: "Storage Classes",
          url: "/storage-classes",
        },
      ],
    },
    {
      title: "Cluster",
      url: "#",
      icon: IconDeviceDesktop,
      items: [
        {
          title: "Nodes",
          url: "/nodes",
        },
        {
          title: "Namespaces",
          url: "/namespaces",
        },
        {
          title: "Events",
          url: "/events",
        },
        {
          title: "Resource Quotas",
          url: "/resource-quotas",
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
  documents: [
    {
      name: "kubectl Cheat Sheet",
      url: "/docs/kubectl",
      icon: IconFileText,
    },
    {
      name: "Kubernetes API Reference",
      url: "/docs/api",
      icon: IconFileText,
    },
    {
      name: "Troubleshooting Guide",
      url: "/docs/troubleshooting",
      icon: IconFileText,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="#">
                <IconCloud className="!size-5" />
                <span className="text-base font-semibold">Kubernetes Admin</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
