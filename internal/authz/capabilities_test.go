package authz

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCapabilityRegistry(t *testing.T) {
	tests := []struct {
		name         string
		capability   string
		expectExists bool
		expectedDef  CapabilityCheck
	}{
		{
			name:         "pods.delete exists",
			capability:   "pods.delete",
			expectExists: true,
			expectedDef: CapabilityCheck{
				Group:      "",
				Resource:   "pods",
				Verb:       "delete",
				Namespaced: true,
			},
		},
		{
			name:         "pods.logs with subresource",
			capability:   "pods.logs",
			expectExists: true,
			expectedDef: CapabilityCheck{
				Group:       "",
				Resource:    "pods",
				Subresource: "log",
				Verb:        "get",
				Namespaced:  true,
			},
		},
		{
			name:         "pods.exec with subresource",
			capability:   "pods.exec",
			expectExists: true,
			expectedDef: CapabilityCheck{
				Group:       "",
				Resource:    "pods",
				Subresource: "exec",
				Verb:        "create",
				Namespaced:  true,
			},
		},
		{
			name:         "deployments.restart",
			capability:   "deployments.restart",
			expectExists: true,
			expectedDef: CapabilityCheck{
				Group:      "apps",
				Resource:   "deployments",
				Verb:       "patch",
				Namespaced: true,
			},
		},
		{
			name:         "configmaps.edit",
			capability:   "configmaps.edit",
			expectExists: true,
			expectedDef: CapabilityCheck{
				Group:      "",
				Resource:   "configmaps",
				Verb:       "update",
				Namespaced: true,
			},
		},
		{
			name:         "secrets.read",
			capability:   "secrets.read",
			expectExists: true,
			expectedDef: CapabilityCheck{
				Group:      "",
				Resource:   "secrets",
				Verb:       "get",
				Namespaced: true,
			},
		},
		{
			name:         "cluster-scoped resource",
			capability:   "nodes.get",
			expectExists: true,
			expectedDef: CapabilityCheck{
				Group:      "",
				Resource:   "nodes",
				Verb:       "get",
				Namespaced: false,
			},
		},
		{
			name:         "RBAC resource",
			capability:   "clusterroles.get",
			expectExists: true,
			expectedDef: CapabilityCheck{
				Group:      "rbac.authorization.k8s.io",
				Resource:   "clusterroles",
				Verb:       "get",
				Namespaced: false,
			},
		},
		{
			name:         "non-existent capability",
			capability:   "nonexistent.action",
			expectExists: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			def, exists := GetCapabilityCheck(tt.capability)

			assert.Equal(t, tt.expectExists, exists, "Existence check failed")

			if tt.expectExists {
				assert.Equal(t, tt.expectedDef.Group, def.Group, "Group mismatch")
				assert.Equal(t, tt.expectedDef.Resource, def.Resource, "Resource mismatch")
				assert.Equal(t, tt.expectedDef.Subresource, def.Subresource, "Subresource mismatch")
				assert.Equal(t, tt.expectedDef.Verb, def.Verb, "Verb mismatch")
				assert.Equal(t, tt.expectedDef.Namespaced, def.Namespaced, "Namespaced mismatch")
			}
		})
	}
}

func TestGetAllCapabilities(t *testing.T) {
	capabilities := GetAllCapabilities()

	// Should return non-empty list
	assert.NotEmpty(t, capabilities, "Should return capabilities")

	// Should contain expected core capabilities from Phase 1
	expectedCapabilities := []string{
		"pods.delete",
		"pods.logs",
		"pods.exec",
		"deployments.restart",
		"configmaps.edit",
		"secrets.read",
	}

	for _, expected := range expectedCapabilities {
		assert.Contains(t, capabilities, expected, "Should contain %s", expected)
	}
}

func TestBuildSSAR(t *testing.T) {
	tests := []struct {
		name         string
		capability   CapabilityCheck
		namespace    string
		resourceName string
		expectNS     string
		expectName   string
	}{
		{
			name: "namespaced resource with namespace",
			capability: CapabilityCheck{
				Group:      "",
				Resource:   "pods",
				Verb:       "delete",
				Namespaced: true,
			},
			namespace:  "default",
			expectNS:   "default",
			expectName: "",
		},
		{
			name: "namespaced resource without namespace",
			capability: CapabilityCheck{
				Group:      "",
				Resource:   "pods",
				Verb:       "list",
				Namespaced: true,
			},
			namespace:  "",
			expectNS:   "",
			expectName: "",
		},
		{
			name: "cluster-scoped resource",
			capability: CapabilityCheck{
				Group:      "",
				Resource:   "nodes",
				Verb:       "get",
				Namespaced: false,
			},
			namespace:  "default", // Should be ignored
			expectNS:   "",
			expectName: "",
		},
		{
			name: "resource with subresource",
			capability: CapabilityCheck{
				Group:       "",
				Resource:    "pods",
				Subresource: "log",
				Verb:        "get",
				Namespaced:  true,
			},
			namespace:  "kube-system",
			expectNS:   "kube-system",
			expectName: "",
		},
		{
			name: "with resource name",
			capability: CapabilityCheck{
				Group:      "",
				Resource:   "pods",
				Verb:       "delete",
				Namespaced: true,
			},
			namespace:    "default",
			resourceName: "test-pod",
			expectNS:     "default",
			expectName:   "test-pod",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ssar := BuildSSAR(tt.capability, tt.namespace, tt.resourceName)

			// Check basic structure
			assert.Equal(t, "authorization.k8s.io/v1", ssar.APIVersion)
			assert.Equal(t, "SelfSubjectAccessReview", ssar.Kind)

			// Check resource attributes
			attrs := ssar.Spec.ResourceAttributes
			require.NotNil(t, attrs, "ResourceAttributes should not be nil")

			assert.Equal(t, tt.capability.Verb, attrs.Verb, "Verb mismatch")
			assert.Equal(t, tt.capability.Group, attrs.Group, "Group mismatch")
			assert.Equal(t, tt.capability.Resource, attrs.Resource, "Resource mismatch")
			assert.Equal(t, tt.capability.Subresource, attrs.Subresource, "Subresource mismatch")
			assert.Equal(t, tt.expectNS, attrs.Namespace, "Namespace mismatch")
			assert.Equal(t, tt.expectName, attrs.Name, "Name mismatch")
		})
	}
}

func TestBuildBatchSSAR(t *testing.T) {
	tests := []struct {
		name            string
		capabilities    []string
		namespace       string
		resourceNames   map[string]string
		expectedCount   int
		expectedIndices []string
	}{
		{
			name:            "valid capabilities",
			capabilities:    []string{"pods.delete", "pods.logs", "deployments.restart"},
			namespace:       "default",
			expectedCount:   3,
			expectedIndices: []string{"pods.delete", "pods.logs", "deployments.restart"},
		},
		{
			name:            "mixed valid and invalid capabilities",
			capabilities:    []string{"pods.delete", "invalid.capability", "secrets.read"},
			namespace:       "default",
			expectedCount:   2,
			expectedIndices: []string{"pods.delete", "secrets.read"},
		},
		{
			name:            "with resource names",
			capabilities:    []string{"pods.delete", "configmaps.edit"},
			namespace:       "default",
			resourceNames:   map[string]string{"pods.delete": "test-pod"},
			expectedCount:   2,
			expectedIndices: []string{"pods.delete", "configmaps.edit"},
		},
		{
			name:            "empty capabilities",
			capabilities:    []string{},
			namespace:       "default",
			expectedCount:   0,
			expectedIndices: []string{},
		},
		{
			name:            "all invalid capabilities",
			capabilities:    []string{"invalid.one", "invalid.two"},
			namespace:       "default",
			expectedCount:   0,
			expectedIndices: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ssars, indices, err := BuildBatchSSAR(tt.capabilities, tt.namespace, tt.resourceNames)

			require.NoError(t, err, "BuildBatchSSAR should not return error")
			assert.Len(t, ssars, tt.expectedCount, "SSAR count mismatch")
			assert.Len(t, indices, tt.expectedCount, "Index count mismatch")
			assert.Equal(t, tt.expectedIndices, indices, "Index mismatch")

			// Verify each SSAR is properly constructed
			for i, ssar := range ssars {
				capability := indices[i]
				def, exists := GetCapabilityCheck(capability)
				require.True(t, exists, "Capability should exist in registry")

				attrs := ssar.Spec.ResourceAttributes
				assert.Equal(t, def.Verb, attrs.Verb, "Verb mismatch for %s", capability)
				assert.Equal(t, def.Group, attrs.Group, "Group mismatch for %s", capability)
				assert.Equal(t, def.Resource, attrs.Resource, "Resource mismatch for %s", capability)
				assert.Equal(t, def.Subresource, attrs.Subresource, "Subresource mismatch for %s", capability)

				// Check namespace handling
				if def.Namespaced && tt.namespace != "" {
					assert.Equal(t, tt.namespace, attrs.Namespace, "Namespace mismatch for %s", capability)
				} else {
					assert.Empty(t, attrs.Namespace, "Namespace should be empty for %s", capability)
				}

				// Check resource name handling
				if tt.resourceNames != nil && tt.resourceNames[capability] != "" {
					assert.Equal(t, tt.resourceNames[capability], attrs.Name, "Resource name mismatch for %s", capability)
				}
			}
		})
	}
}
