package main

import (
	"context"
	"fmt"
	"strings"

	authzv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// NamespacePermissions represents what a user can do in which namespaces
type NamespacePermissions struct {
	UserEmail   string                         `json:"user_email"`
	Permissions map[string]ResourcePermissions `json:"permissions"` // namespace -> permissions
}

type ResourcePermissions struct {
	Pods        []string `json:"pods"`        // ["get", "list", "watch"]
	Deployments []string `json:"deployments"` // ["get", "list"]
	Services    []string `json:"services"`    // ["get", "list", "create"]
	Secrets     []string `json:"secrets"`     // ["get", "list", "create", "delete"]
}

// GetUserNamespacePermissions checks what the user can access in each namespace
func GetUserNamespacePermissions(ctx context.Context, clientset *kubernetes.Clientset, userEmail string) (*NamespacePermissions, error) {
	// Get all namespaces first
	namespaces, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list namespaces: %v", err)
	}

	permissions := &NamespacePermissions{
		UserEmail:   userEmail,
		Permissions: make(map[string]ResourcePermissions),
	}

	// Check permissions for each namespace
	for _, ns := range namespaces.Items {
		nsName := ns.Name

		// Skip system namespaces unless explicitly needed
		if strings.HasPrefix(nsName, "kube-") || nsName == "default" {
			continue
		}

		resourcePerms := ResourcePermissions{}

		// Check Pod permissions
		resourcePerms.Pods = checkResourcePermissions(ctx, clientset, userEmail, nsName, "", "pods", []string{"get", "list", "watch", "create", "delete"})

		// Check Deployment permissions
		resourcePerms.Deployments = checkResourcePermissions(ctx, clientset, userEmail, nsName, "apps", "deployments", []string{"get", "list", "watch", "create", "delete"})

		// Check Service permissions
		resourcePerms.Services = checkResourcePermissions(ctx, clientset, userEmail, nsName, "", "services", []string{"get", "list", "watch", "create", "delete"})

		// Check Secret permissions
		resourcePerms.Secrets = checkResourcePermissions(ctx, clientset, userEmail, nsName, "", "secrets", []string{"get", "list", "watch", "create", "delete"})

		// Only include namespace if user has any permissions
		if len(resourcePerms.Pods) > 0 || len(resourcePerms.Deployments) > 0 ||
			len(resourcePerms.Services) > 0 || len(resourcePerms.Secrets) > 0 {
			permissions.Permissions[nsName] = resourcePerms
		}
	}

	return permissions, nil
}

// checkResourcePermissions uses SubjectAccessReview to check what verbs a user can perform
func checkResourcePermissions(ctx context.Context, clientset *kubernetes.Clientset, userEmail, namespace, apiGroup, resource string, verbs []string) []string {
	var allowedVerbs []string

	for _, verb := range verbs {
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

		// Check if user can perform this action
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
