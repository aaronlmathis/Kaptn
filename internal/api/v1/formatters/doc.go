// Package formatters provides domain-specific response formatting functions
// for converting Kubernetes resources to API response formats.
//
// This package is organized into domain-specific formatters that handle
// the conversion of Kubernetes objects to standardized JSON response formats
// used by the Kaptn API.
//
// Domain formatters:
//   - workloads.go: Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs
//   - networking.go: Services, Ingresses, NetworkPolicies, Endpoints
//   - storage.go: PersistentVolumes, PersistentVolumeClaims, StorageClasses
//   - config.go: ConfigMaps, Secrets, ResourceQuotas, LimitRanges
//   - rbac.go: Roles, RoleBindings, ClusterRoles, ClusterRoleBindings
//   - cluster.go: Nodes, Namespaces, CustomResourceDefinitions
//   - common.go: Shared formatting utilities
//
// Each formatter provides consistent response structures with standardized
// fields like age calculation, status formatting, and metadata handling.
package formatters
