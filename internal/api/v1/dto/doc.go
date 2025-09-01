// Package dto provides Data Transfer Objects for API v1.
//
// This package centralizes request/response structures to avoid duplication
// across handler files and provide consistent API interfaces. All DTOs are
// organized by domain:
//
//   - common.go:     Shared structures like pagination, responses, metadata
//   - actions.go:    Bulk actions, apply configurations, validation
//   - auth.go:       Authentication, authorization, user profiles
//   - workloads.go:  Pods, deployments, jobs, cronjobs, etc.
//   - networking.go: Services, ingresses, network policies, Istio resources
//   - storage.go:    PVs, PVCs, storage classes, CSI drivers, snapshots
//   - secrets.go:    Secrets and ConfigMaps
//   - rbac.go:       Roles, role bindings, cluster roles, RBAC builder
//   - cluster.go:    Nodes, namespaces, CRDs, API resources, overview
//   - monitoring.go: Metrics, time series, health checks, analytics
//   - events.go:     Kubernetes events
//
// Usage:
//
//	import "github.com/aaronlmathis/kaptn/internal/api/v1/dto"
//
//	// Use DTOs in handlers
//	var req dto.SecretCreateRequest
//	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
//		// handle error
//	}
//
//	// Return standardized responses
//	response := dto.APIResponse{
//		Status: "success",
//		Data:   items,
//	}
package dto
