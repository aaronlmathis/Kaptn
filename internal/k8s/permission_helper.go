package k8s

import (
	"context"

	"k8s.io/client-go/kubernetes"
)

// PermissionHelper provides a simplified interface for checking user permissions
type PermissionHelper struct {
	ssarHelper *SSARHelper
}

// NewPermissionHelper creates a new permission helper
func NewPermissionHelper(ssarHelper *SSARHelper) *PermissionHelper {
	return &PermissionHelper{
		ssarHelper: ssarHelper,
	}
}

// Can checks if the user can perform the specified action
// This is the main helper function for UI gating as required by Phase 6
func (p *PermissionHelper) Can(ctx context.Context, client kubernetes.Interface, verb, resource, namespace, name string) (bool, error) {
	return p.ssarHelper.CanPerformAction(ctx, client, verb, "", resource, namespace, name)
}

// CanCreateResource checks if the user can create a specific resource type
func (p *PermissionHelper) CanCreateResource(ctx context.Context, client kubernetes.Interface, resource, namespace string) (bool, error) {
	return p.ssarHelper.CanCreateResource(ctx, client, resource, namespace)
}

// CanUpdateResource checks if the user can update a specific resource
func (p *PermissionHelper) CanUpdateResource(ctx context.Context, client kubernetes.Interface, resource, namespace, name string) (bool, error) {
	return p.ssarHelper.CanUpdateResource(ctx, client, resource, namespace, name)
}

// CanDeleteResource checks if the user can delete a specific resource
func (p *PermissionHelper) CanDeleteResource(ctx context.Context, client kubernetes.Interface, resource, namespace, name string) (bool, error) {
	return p.ssarHelper.CanDeleteResource(ctx, client, resource, namespace, name)
}

// CanListResources checks if the user can list resources in a namespace
func (p *PermissionHelper) CanListResources(ctx context.Context, client kubernetes.Interface, resource, namespace string) (bool, error) {
	return p.ssarHelper.CanListResources(ctx, client, resource, namespace)
}

// CanGetResource checks if the user can get a specific resource
func (p *PermissionHelper) CanGetResource(ctx context.Context, client kubernetes.Interface, resource, namespace, name string) (bool, error) {
	return p.ssarHelper.CanGetResource(ctx, client, resource, namespace, name)
}

// CheckPageAccess checks if user has read access to the primary resource for a page
// This implements the "page-level gate" requirement from Phase 6
func (p *PermissionHelper) CheckPageAccess(ctx context.Context, client kubernetes.Interface, primaryResource, namespace string) (bool, error) {
	// Check if user can list the primary resource for the page
	return p.CanListResources(ctx, client, primaryResource, namespace)
}

// CheckMultipleActions checks multiple permissions efficiently
func (p *PermissionHelper) CheckMultipleActions(ctx context.Context, client kubernetes.Interface, actions []PermissionCheck) (map[string]bool, error) {
	return p.ssarHelper.CheckMultiplePermissions(ctx, client, actions)
}

// Common action helpers for UI components
func (p *PermissionHelper) CanDeploy(ctx context.Context, client kubernetes.Interface, namespace string) (bool, error) {
	return p.Can(ctx, client, "create", "deployments", namespace, "")
}

func (p *PermissionHelper) CanScale(ctx context.Context, client kubernetes.Interface, namespace string) (bool, error) {
	return p.Can(ctx, client, "patch", "deployments", namespace, "")
}

func (p *PermissionHelper) CanDelete(ctx context.Context, client kubernetes.Interface, resource, namespace, name string) (bool, error) {
	return p.CanDeleteResource(ctx, client, resource, namespace, name)
}

func (p *PermissionHelper) CanEditSecrets(ctx context.Context, client kubernetes.Interface, namespace string) (bool, error) {
	return p.Can(ctx, client, "update", "secrets", namespace, "")
}

func (p *PermissionHelper) CanCreateNamespace(ctx context.Context, client kubernetes.Interface) (bool, error) {
	return p.Can(ctx, client, "create", "namespaces", "", "")
}

// ActionPermissions holds permission results for common UI actions
type ActionPermissions struct {
	CanDeploy          bool `json:"can_deploy"`
	CanScale           bool `json:"can_scale"`
	CanDelete          bool `json:"can_delete"`
	CanEditSecrets     bool `json:"can_edit_secrets"`
	CanCreateNamespace bool `json:"can_create_namespace"`
	CanViewLogs        bool `json:"can_view_logs"`
	CanExec            bool `json:"can_exec"`
}

// GetActionPermissions returns permissions for common UI actions in a namespace
func (p *PermissionHelper) GetActionPermissions(ctx context.Context, client kubernetes.Interface, namespace string) (*ActionPermissions, error) {
	permissions := &ActionPermissions{}

	// Check deployment permissions
	if canDeploy, err := p.CanDeploy(ctx, client, namespace); err == nil {
		permissions.CanDeploy = canDeploy
	}

	// Check scaling permissions
	if canScale, err := p.CanScale(ctx, client, namespace); err == nil {
		permissions.CanScale = canScale
	}

	// Check delete permissions (use pods as example)
	if canDelete, err := p.CanDelete(ctx, client, "pods", namespace, ""); err == nil {
		permissions.CanDelete = canDelete
	}

	// Check secret editing permissions
	if canEditSecrets, err := p.CanEditSecrets(ctx, client, namespace); err == nil {
		permissions.CanEditSecrets = canEditSecrets
	}

	// Check namespace creation (cluster-scoped)
	if canCreateNamespace, err := p.CanCreateNamespace(ctx, client); err == nil {
		permissions.CanCreateNamespace = canCreateNamespace
	}

	// Check log viewing (pod/log subresource)
	if canViewLogs, err := p.Can(ctx, client, "get", "pods/log", namespace, ""); err == nil {
		permissions.CanViewLogs = canViewLogs
	}

	// Check exec permissions (pod/exec subresource)
	if canExec, err := p.Can(ctx, client, "create", "pods/exec", namespace, ""); err == nil {
		permissions.CanExec = canExec
	}

	return permissions, nil
}
