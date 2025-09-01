// Package formatters provides domain-specific response formatting functions
// for converting Kubernetes RBAC resources to API response formats.
package formatters

// RBACFormatter provides formatting functions for RBAC resources
type RBACFormatter struct{}

// NewRBACFormatter creates a new RBAC formatter
func NewRBACFormatter() *RBACFormatter {
	return &RBACFormatter{}
}

// TODO: Add RBAC-specific formatting functions when RBAC handlers are migrated
// This includes:
// - RoleToResponse
// - RoleBindingToResponse
// - ClusterRoleToResponse
// - ClusterRoleBindingToResponse
// - ServiceAccountToResponse
