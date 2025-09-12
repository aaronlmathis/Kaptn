// frontend/src/routeMeta.ts
// Centralized route → section/page mapping used for breadcrumbs and highlighting.

export type RouteMeta = {
  section: string;
  sectionHref: string;
  page?: string;
};

// Friendly titles for specific routes that don't title-case cleanly
const TITLE_OVERRIDES: Record<string, string> = {
  "/api-resources": "API Resources",
  "/cluster-roles": "Cluster Roles",
  "/cluster/api-resources": "API Resources",
  "/cluster/cluster-roles": "Cluster Roles",
  "/cluster/crds": "CRDs",
  "/component-status": "Component Status",
  "/config-maps": "ConfigMaps",
  "/storage/config-maps": "ConfigMaps",
  "/endpoint-slices": "Endpoint Slices",
  "/services/endpoint-slices": "Endpoint Slices",
  "/hpas": "HPAs",
  "/workloads/hpas": "HPAs",
  "/workloads/replicasets": "ReplicaSets",
  "/workloads/daemonsets": "DaemonSets",
  "/workloads/cronjobs": "CronJobs",
  "/pod-security": "Pod Security",
  "/access/pod-security": "Pod Security",
  "/access/rbac": "RBAC",
  "/resource-quotas": "Resource Quotas",
  "/cluster/resource-quotas": "Resource Quotas",
  "/statefulsets": "StatefulSets",
  "/workloads/statefulsets": "StatefulSets",
  "/volume-snapshot-classes": "Volume Snapshot Classes",
  "/volume-snapshots": "Volume Snapshots",
  "/storage/volume-snapshot-classes": "Volume Snapshot Classes",
  "/storage/volume-snapshots": "Volume Snapshots",
  "/storage/csi-drivers": "CSI Drivers",
  "/cluster/roles": "Roles & Role Bindings",
};

// Section route roots
const SECTION_ROOTS = {
  cluster: "/cluster",
  workloads: "/workloads",
  storage: "/storage",
  access: "/access",
  services: "/services",
} as const;

// Child routes per section
const CLUSTER_CHILDREN: string[] = [
  "/cluster/nodes",
  "/cluster/namespaces",
  "/cluster/resource-quotas",
  "/cluster/api-resources",
  "/cluster/crds",
  "/cluster/component-status",
  "/cluster/certificates",
  "/cluster/version-upgrades",
];

const WORKLOADS_CHILDREN: string[] = [
  "/workloads/pods",
  "/workloads/deployments",
  "/workloads/replicasets",
  "/workloads/statefulsets",
  "/workloads/daemonsets",
  "/workloads/hpas",
  "/workloads/jobs",
  "/workloads/cronjobs",
];

const STORAGE_CHILDREN: string[] = [
  "/storage/config-maps",
  "/storage/secrets",
  "/storage/persistent-volumes",
  "/storage/persistent-volume-claims",
  "/storage/storage-classes",
  "/storage/volume-snapshots",
  "/storage/volume-snapshot-classes",
  "/storage/csi-drivers",
];

const ACCESS_CHILDREN: string[] = [
  "/access/rbac",
  "/access/service-accounts",
  "/access/pod-security",
];

const SERVICES_CHILDREN: string[] = [
  "/services/endpoints",
  "/services/endpoint-slices",
  "/services/ingresses",
  "/services/ingress-classes",
  "/services/network-policies",
  "/services/load-balancers",
  "/services/virtual-services",
  "/services/gateways",
];

function toTitle(slug: string): string {
  if (TITLE_OVERRIDES[slug]) return TITLE_OVERRIDES[slug];
  const trimmed = slug.startsWith("/") ? slug.slice(1) : slug;
  const lastSegment = trimmed.split("/").filter(Boolean).pop() || trimmed;
  return lastSegment
    .split("-")
    .map((s) => (s.length ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ");
}

export function getRouteMeta(pathname: string): RouteMeta | null {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";

  // Exact section pages
  if (path === SECTION_ROOTS.cluster) return { section: "Cluster", sectionHref: SECTION_ROOTS.cluster };
  if (path === SECTION_ROOTS.workloads) return { section: "Workloads", sectionHref: SECTION_ROOTS.workloads };
  if (path === SECTION_ROOTS.storage) return { section: "Storage", sectionHref: SECTION_ROOTS.storage };
  if (path === SECTION_ROOTS.access) return { section: "Access Control", sectionHref: SECTION_ROOTS.access };
  if (path === SECTION_ROOTS.services) return { section: "Services", sectionHref: SECTION_ROOTS.services };

  // Children mapping
  if (CLUSTER_CHILDREN.includes(path)) {
    return { section: "Cluster", sectionHref: SECTION_ROOTS.cluster, page: toTitle(path) };
  }
  if (WORKLOADS_CHILDREN.includes(path)) {
    return { section: "Workloads", sectionHref: SECTION_ROOTS.workloads, page: toTitle(path) };
  }
  if (STORAGE_CHILDREN.includes(path)) {
    return { section: "Storage", sectionHref: SECTION_ROOTS.storage, page: toTitle(path) };
  }
  if (ACCESS_CHILDREN.includes(path)) {
    return { section: "Access Control", sectionHref: SECTION_ROOTS.access, page: toTitle(path) };
  }
  if (SERVICES_CHILDREN.includes(path)) {
    return { section: "Services", sectionHref: SECTION_ROOTS.services, page: toTitle(path) };
  }

  return null;
}

export function sectionForPath(pathname: string): string | null {
  const meta = getRouteMeta(pathname);
  return meta?.section ?? null;
}
