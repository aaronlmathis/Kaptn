package api

import (
	"context"
	"fmt"
	"strings"
	"time"

	authzv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// NamespacePermissions represents what a user can do in which namespaces
type NamespacePermissions struct {
	UserEmail          string                         `json:"user_email"`
	Permissions        map[string]ResourcePermissions `json:"permissions"`         // namespace -> permissions
	ClusterPermissions ClusterPermissions             `json:"cluster_permissions"` // cluster-scoped permissions
	Summary            PermissionsSummary             `json:"summary"`             // overall summary
}

type ResourcePermissions struct {
	Pods        []string `json:"pods"`        // ["get", "list", "watch"]
	Deployments []string `json:"deployments"` // ["get", "list"]
	Services    []string `json:"services"`    // ["get", "list", "create"]
	Secrets     []string `json:"secrets"`     // ["get", "list", "create", "delete"]
}

type ClusterPermissions struct {
	Nodes               []string `json:"nodes"`                 // ["get", "list"]
	Namespaces          []string `json:"namespaces"`            // ["get", "list", "create", "delete"]
	ClusterRoles        []string `json:"cluster_roles"`         // ["get", "list"]
	ClusterRoleBindings []string `json:"cluster_role_bindings"` // ["get", "list"]
	PersistentVolumes   []string `json:"persistent_volumes"`    // ["get", "list"]
	StorageClasses      []string `json:"storage_classes"`       // ["get", "list"]
	CustomResourceDefs  []string `json:"custom_resource_defs"`  // ["get", "list"]
}

type PermissionsSummary struct {
	IsClusterAdmin        bool `json:"is_cluster_admin"`
	HasClusterPermissions bool `json:"has_cluster_permissions"`
	NamespaceCount        int  `json:"namespace_count"`
	TotalPermissions      int  `json:"total_permissions"`
}

// GetUserNamespacePermissions checks what the user can access in each namespace
func GetUserNamespacePermissions(ctx context.Context, clientset *kubernetes.Clientset, userEmail string) (*NamespacePermissions, error) {
	// Set a reasonable timeout to prevent hanging
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	permissions := &NamespacePermissions{
		UserEmail:   userEmail,
		Permissions: make(map[string]ResourcePermissions),
	}

	// First check cluster-scoped permissions
	permissions.ClusterPermissions = checkClusterPermissions(ctx, clientset, userEmail)

	// Get all namespaces first
	namespaces, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list namespaces: %v", err)
	}

	// Limit to important namespaces to reduce API calls
	importantNamespaces := []string{"default", "kube-system", "kaptn", "monitoring", "istio-system"}
	namespacesToCheck := make(map[string]bool)

	// Add important namespaces if they exist
	for _, ns := range namespaces.Items {
		nsName := ns.Name
		for _, important := range importantNamespaces {
			if nsName == important {
				namespacesToCheck[nsName] = true
				break
			}
		}
		// Also check a few user namespaces but limit total
		if len(namespacesToCheck) < 10 && !strings.HasPrefix(nsName, "kube-") {
			namespacesToCheck[nsName] = true
		}
	}

	// Check permissions for selected namespaces only
	for nsName := range namespacesToCheck {
		// Check if context was cancelled or timed out
		select {
		case <-ctx.Done():
			return permissions, fmt.Errorf("permission check timed out after checking %d namespaces", len(permissions.Permissions))
		default:
		}

		resourcePerms := ResourcePermissions{}

		// Check only essential verbs to reduce API calls
		resourcePerms.Pods = checkResourcePermissions(ctx, clientset, userEmail, nsName, "", "pods", []string{"get", "list"})
		resourcePerms.Deployments = checkResourcePermissions(ctx, clientset, userEmail, nsName, "apps", "deployments", []string{"get", "list"})
		resourcePerms.Services = checkResourcePermissions(ctx, clientset, userEmail, nsName, "", "services", []string{"get", "list"})
		resourcePerms.Secrets = checkResourcePermissions(ctx, clientset, userEmail, nsName, "", "secrets", []string{"get", "list"})

		// Only include namespace if user has any permissions
		if len(resourcePerms.Pods) > 0 || len(resourcePerms.Deployments) > 0 ||
			len(resourcePerms.Services) > 0 || len(resourcePerms.Secrets) > 0 {
			permissions.Permissions[nsName] = resourcePerms
		}
	}

	// Generate summary
	permissions.Summary = generatePermissionsSummary(permissions)

	return permissions, nil
}

// checkResourcePermissions uses SubjectAccessReview to check what verbs a user can perform
func checkResourcePermissions(ctx context.Context, clientset *kubernetes.Clientset, userEmail, namespace, apiGroup, resource string, verbs []string) []string {
	var allowedVerbs []string

	for _, verb := range verbs {
		// Check if context was cancelled or timed out
		select {
		case <-ctx.Done():
			return allowedVerbs // Return what we have so far
		default:
		}

		// Create SubjectAccessReview
		sar := &authzv1.SubjectAccessReview{
			Spec: authzv1.SubjectAccessReviewSpec{
				User: userEmail,
				ResourceAttributes: &authzv1.ResourceAttributes{
					Namespace: namespace,
					Verb:      verb,
					Group:     apiGroup,
					Resource:  resource,
				},
			},
		}

		// Check if user can perform this action with a short timeout
		result, err := clientset.AuthorizationV1().SubjectAccessReviews().Create(ctx, sar, metav1.CreateOptions{})
		if err != nil {
			// Log error but continue checking other verbs
			continue
		}

		if result.Status.Allowed {
			allowedVerbs = append(allowedVerbs, verb)
		}
	}

	return allowedVerbs
}

// checkClusterPermissions checks cluster-scoped permissions
func checkClusterPermissions(ctx context.Context, clientset *kubernetes.Clientset, userEmail string) ClusterPermissions {
	clusterPerms := ClusterPermissions{}

	// Define cluster resources and verbs to check
	clusterChecks := map[string]struct {
		apiGroup string
		verbs    []string
	}{
		"nodes":                     {"", []string{"get", "list"}},
		"namespaces":                {"", []string{"get", "list", "create", "delete"}},
		"clusterroles":              {"rbac.authorization.k8s.io", []string{"get", "list"}},
		"clusterrolebindings":       {"rbac.authorization.k8s.io", []string{"get", "list"}},
		"persistentvolumes":         {"", []string{"get", "list"}},
		"storageclasses":            {"storage.k8s.io", []string{"get", "list"}},
		"customresourcedefinitions": {"apiextensions.k8s.io", []string{"get", "list"}},
	}

	// Check each cluster resource
	for resource, config := range clusterChecks {
		allowedVerbs := checkResourcePermissions(ctx, clientset, userEmail, "", config.apiGroup, resource, config.verbs)

		switch resource {
		case "nodes":
			clusterPerms.Nodes = allowedVerbs
		case "namespaces":
			clusterPerms.Namespaces = allowedVerbs
		case "clusterroles":
			clusterPerms.ClusterRoles = allowedVerbs
		case "clusterrolebindings":
			clusterPerms.ClusterRoleBindings = allowedVerbs
		case "persistentvolumes":
			clusterPerms.PersistentVolumes = allowedVerbs
		case "storageclasses":
			clusterPerms.StorageClasses = allowedVerbs
		case "customresourcedefinitions":
			clusterPerms.CustomResourceDefs = allowedVerbs
		}
	}

	return clusterPerms
}

// generatePermissionsSummary creates a summary of user permissions
func generatePermissionsSummary(permissions *NamespacePermissions) PermissionsSummary {
	summary := PermissionsSummary{
		NamespaceCount: len(permissions.Permissions),
	}

	// Count total permissions from namespaces
	totalPerms := 0
	for _, nsPerms := range permissions.Permissions {
		totalPerms += len(nsPerms.Pods) + len(nsPerms.Deployments) + len(nsPerms.Services) + len(nsPerms.Secrets)
	}

	// Count cluster permissions
	clusterPerms := len(permissions.ClusterPermissions.Nodes) +
		len(permissions.ClusterPermissions.Namespaces) +
		len(permissions.ClusterPermissions.ClusterRoles) +
		len(permissions.ClusterPermissions.ClusterRoleBindings) +
		len(permissions.ClusterPermissions.PersistentVolumes) +
		len(permissions.ClusterPermissions.StorageClasses) +
		len(permissions.ClusterPermissions.CustomResourceDefs)

	summary.TotalPermissions = totalPerms + clusterPerms
	summary.HasClusterPermissions = clusterPerms > 0

	// Check if user appears to be a cluster admin based on permissions
	// If they can create/delete namespaces or manage cluster roles, they're likely a cluster admin
	summary.IsClusterAdmin = containsString(permissions.ClusterPermissions.Namespaces, "create") ||
		containsString(permissions.ClusterPermissions.Namespaces, "delete") ||
		containsString(permissions.ClusterPermissions.ClusterRoles, "create") ||
		containsString(permissions.ClusterPermissions.ClusterRoleBindings, "create")

	return summary
}

// FilterResourcesByPermissions filters API responses based on user permissions
func FilterResourcesByPermissions(userPerms *NamespacePermissions, resources interface{}, requestedNamespace string) interface{} {
	// If user has no permissions for this namespace, return empty
	_, hasAccess := userPerms.Permissions[requestedNamespace]
	if !hasAccess {
		return nil
	}

	// TODO: Implement filtering logic based on resource type
	// For now, return resources if user has any permission in the namespace
	return resources
}
