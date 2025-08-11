package k8s

import (
	"context"
	"fmt"

	"go.uber.org/zap"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// SSARHelper provides SelfSubjectAccessReview functionality
type SSARHelper struct {
	logger *zap.Logger
}

// NewSSARHelper creates a new SSAR helper
func NewSSARHelper(logger *zap.Logger) *SSARHelper {
	return &SSARHelper{
		logger: logger,
	}
}

// CanPerformAction checks if the user (via impersonated client) can perform the specified action
func (s *SSARHelper) CanPerformAction(ctx context.Context, client kubernetes.Interface, verb, group, resource, namespace, name string) (bool, error) {
	// Create SelfSubjectAccessReview request
	sar := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Verb:      verb,
				Group:     group,
				Resource:  resource,
				Namespace: namespace,
				Name:      name,
			},
		},
	}

	// Execute the review
	result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, sar, metav1.CreateOptions{})
	if err != nil {
		s.logger.Error("Failed to perform SelfSubjectAccessReview",
			zap.Error(err),
			zap.String("verb", verb),
			zap.String("resource", resource),
			zap.String("namespace", namespace))
		return false, fmt.Errorf("failed to perform access review: %w", err)
	}

	s.logger.Debug("SelfSubjectAccessReview completed",
		zap.String("verb", verb),
		zap.String("resource", resource),
		zap.String("namespace", namespace),
		zap.Bool("allowed", result.Status.Allowed),
		zap.String("reason", result.Status.Reason))

	return result.Status.Allowed, nil
}

// CanCreateResource checks if the user can create a specific resource type
func (s *SSARHelper) CanCreateResource(ctx context.Context, client kubernetes.Interface, resource, namespace string) (bool, error) {
	return s.CanPerformAction(ctx, client, "create", "", resource, namespace, "")
}

// CanUpdateResource checks if the user can update a specific resource
func (s *SSARHelper) CanUpdateResource(ctx context.Context, client kubernetes.Interface, resource, namespace, name string) (bool, error) {
	return s.CanPerformAction(ctx, client, "update", "", resource, namespace, name)
}

// CanDeleteResource checks if the user can delete a specific resource
func (s *SSARHelper) CanDeleteResource(ctx context.Context, client kubernetes.Interface, resource, namespace, name string) (bool, error) {
	return s.CanPerformAction(ctx, client, "delete", "", resource, namespace, name)
}

// CanListResources checks if the user can list resources in a namespace
func (s *SSARHelper) CanListResources(ctx context.Context, client kubernetes.Interface, resource, namespace string) (bool, error) {
	return s.CanPerformAction(ctx, client, "list", "", resource, namespace, "")
}

// CanWatchResources checks if the user can watch resources in a namespace
func (s *SSARHelper) CanWatchResources(ctx context.Context, client kubernetes.Interface, resource, namespace string) (bool, error) {
	return s.CanPerformAction(ctx, client, "watch", "", resource, namespace, "")
}

// CanGetResource checks if the user can get a specific resource
func (s *SSARHelper) CanGetResource(ctx context.Context, client kubernetes.Interface, resource, namespace, name string) (bool, error) {
	return s.CanPerformAction(ctx, client, "get", "", resource, namespace, name)
}

// CheckMultiplePermissions checks multiple permissions at once and returns a map of results
type PermissionCheck struct {
	Verb      string
	Resource  string
	Namespace string
	Name      string
}

// CheckMultiplePermissions performs multiple permission checks efficiently
func (s *SSARHelper) CheckMultiplePermissions(ctx context.Context, client kubernetes.Interface, checks []PermissionCheck) (map[string]bool, error) {
	results := make(map[string]bool, len(checks))

	for _, check := range checks {
		key := fmt.Sprintf("%s:%s:%s:%s", check.Verb, check.Resource, check.Namespace, check.Name)
		allowed, err := s.CanPerformAction(ctx, client, check.Verb, "", check.Resource, check.Namespace, check.Name)
		if err != nil {
			s.logger.Error("Permission check failed",
				zap.Error(err),
				zap.String("key", key))
			results[key] = false
		} else {
			results[key] = allowed
		}
	}

	return results, nil
}
