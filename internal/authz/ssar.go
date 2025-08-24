package authz

import (
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// BuildSSAR creates a SelfSubjectAccessReview from a CapabilityCheck
func BuildSSAR(def CapabilityCheck, namespace, resourceName string) authorizationv1.SelfSubjectAccessReview {
	spec := authorizationv1.SelfSubjectAccessReviewSpec{
		ResourceAttributes: &authorizationv1.ResourceAttributes{
			Verb:        def.Verb,
			Group:       def.Group,
			Resource:    def.Resource,
			Subresource: def.Subresource,
		},
	}

	// Set namespace only for namespaced resources and when namespace is provided
	if def.Namespaced && namespace != "" {
		spec.ResourceAttributes.Namespace = namespace
	}

	// Set resource name for object-level checks
	if resourceName != "" {
		spec.ResourceAttributes.Name = resourceName
	}

	return authorizationv1.SelfSubjectAccessReview{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "authorization.k8s.io/v1",
			Kind:       "SelfSubjectAccessReview",
		},
		Spec: spec,
	}
}

// BuildBatchSSAR creates multiple SelfSubjectAccessReview requests from capabilities
func BuildBatchSSAR(capabilities []string, namespace string, resourceNames map[string]string) ([]authorizationv1.SelfSubjectAccessReview, []string, error) {
	var ssars []authorizationv1.SelfSubjectAccessReview
	var capabilityIndex []string

	for _, capability := range capabilities {
		def, exists := GetCapabilityCheck(capability)
		if !exists {
			// Skip unknown capabilities
			continue
		}

		resourceName := ""
		if resourceNames != nil {
			resourceName = resourceNames[capability]
		}

		ssar := BuildSSAR(def, namespace, resourceName)
		ssars = append(ssars, ssar)
		capabilityIndex = append(capabilityIndex, capability)
	}

	// Ensure we return empty slices instead of nil
	if ssars == nil {
		ssars = []authorizationv1.SelfSubjectAccessReview{}
	}
	if capabilityIndex == nil {
		capabilityIndex = []string{}
	}

	return ssars, capabilityIndex, nil
}
