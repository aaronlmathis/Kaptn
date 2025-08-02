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

import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "kubernetes-admin",
    email: "admin@k8s.local",
    avatar: "/avatars/k8s-admin.jpg",
  },
  teams: [
    {
      name: "Acme Inc",
      logo: GalleryVerticalEnd,
      plan: "Enterprise",
    },
    {
      name: "Acme Corp.",
      logo: AudioWaveform,
      plan: "Startup",
    },
    {
      name: "Evil Corp.",
      logo: Command,
      plan: "Free",
    },
  ],
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
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />

      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
