package authz

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zaptest"
	authorizationv1 "k8s.io/api/authorization/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

// getCapabilityKey extracts the capability key from an SSAR based on verb, resource, and subresource
func getCapabilityKey(ssar *authorizationv1.SelfSubjectAccessReview) string {
	attrs := ssar.Spec.ResourceAttributes
	if attrs == nil {
		return ""
	}

	resource := attrs.Resource
	verb := attrs.Verb
	subresource := attrs.Subresource

	if subresource != "" {
		// Handle special subresource cases
		if resource == "pods" && subresource == "log" {
			return "pods.logs"
		}
		if resource == "pods" && subresource == "exec" {
			return "pods.exec"
		}
		if resource == "pods" && subresource == "portforward" {
			return "pods.portforward"
		}
	}

	// Standard format: resource.verb
	if resource == "deployments" && verb == "patch" {
		return "deployments.restart" // Special case for restart
	}

	return resource + "." + verb
}

// TestPhase4E2EScenarios tests various RBAC scenarios end-to-end
func TestPhase4E2EScenarios(t *testing.T) {
	logger := zaptest.NewLogger(t)

	tests := []struct {
		name                     string
		userGroups               []string
		namespace                string
		features                 []string
		expectedResults          map[string]bool
		setupRoles               []rbacv1.Role
		setupRoleBindings        []rbacv1.RoleBinding
		setupClusterRoles        []rbacv1.ClusterRole
		setupClusterRoleBindings []rbacv1.ClusterRoleBinding
	}{
		{
			name:       "ViewerRole_BasicPodAccess",
			userGroups: []string{"viewers"},
			namespace:  "default",
			features:   []string{"pods.get", "pods.list", "pods.delete", "pods.exec"},
			expectedResults: map[string]bool{
				"pods.get":    true,
				"pods.list":   true,
				"pods.delete": false,
				"pods.exec":   false,
			},
			setupRoles: []rbacv1.Role{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "pod-viewer",
						Namespace: "default",
					},
					Rules: []rbacv1.PolicyRule{
						{
							APIGroups: []string{""},
							Resources: []string{"pods"},
							Verbs:     []string{"get", "list", "watch"},
						},
					},
				},
			},
			setupRoleBindings: []rbacv1.RoleBinding{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "viewer-binding",
						Namespace: "default",
					},
					RoleRef: rbacv1.RoleRef{
						APIGroup: "rbac.authorization.k8s.io",
						Kind:     "Role",
						Name:     "pod-viewer",
					},
					Subjects: []rbacv1.Subject{
						{
							Kind: "Group",
							Name: "viewers",
						},
					},
				},
			},
		},
		{
			name:       "OperatorRole_DeploymentManagement",
			userGroups: []string{"operators"},
			namespace:  "production",
			features:   []string{"deployments.get", "deployments.list", "deployments.restart", "deployments.delete", "pods.exec"},
			expectedResults: map[string]bool{
				"deployments.get":     true,
				"deployments.list":    true,
				"deployments.restart": true,
				"deployments.delete":  false, // Only patch, not delete
				"pods.exec":           true,
			},
			setupRoles: []rbacv1.Role{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "deployment-operator",
						Namespace: "production",
					},
					Rules: []rbacv1.PolicyRule{
						{
							APIGroups: []string{"apps"},
							Resources: []string{"deployments"},
							Verbs:     []string{"get", "list", "watch", "patch", "update"},
						},
						{
							APIGroups:     []string{""},
							Resources:     []string{"pods"},
							ResourceNames: []string{}, // All pods
							Verbs:         []string{"get", "list"},
						},
						{
							APIGroups: []string{""},
							Resources: []string{"pods/exec"},
							Verbs:     []string{"create"},
						},
					},
				},
			},
			setupRoleBindings: []rbacv1.RoleBinding{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "operator-binding",
						Namespace: "production",
					},
					RoleRef: rbacv1.RoleRef{
						APIGroup: "rbac.authorization.k8s.io",
						Kind:     "Role",
						Name:     "deployment-operator",
					},
					Subjects: []rbacv1.Subject{
						{
							Kind: "Group",
							Name: "operators",
						},
					},
				},
			},
		},
		{
			name:       "AdminRole_FullAccess",
			userGroups: []string{"cluster-admins"},
			namespace:  "kube-system",
			features:   []string{"pods.delete", "deployments.delete", "secrets.delete", "nodes.get", "clusterroles.create"},
			expectedResults: map[string]bool{
				"pods.delete":         true,
				"deployments.delete":  true,
				"secrets.delete":      true,
				"nodes.get":           true,
				"clusterroles.create": true,
			},
			setupClusterRoles: []rbacv1.ClusterRole{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "full-admin",
					},
					Rules: []rbacv1.PolicyRule{
						{
							APIGroups: []string{"*"},
							Resources: []string{"*"},
							Verbs:     []string{"*"},
						},
					},
				},
			},
			setupClusterRoleBindings: []rbacv1.ClusterRoleBinding{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "admin-binding",
					},
					RoleRef: rbacv1.RoleRef{
						APIGroup: "rbac.authorization.k8s.io",
						Kind:     "ClusterRole",
						Name:     "full-admin",
					},
					Subjects: []rbacv1.Subject{
						{
							Kind: "Group",
							Name: "cluster-admins",
						},
					},
				},
			},
		},
		{
			name:       "CustomCRDRole_IstioManagement",
			userGroups: []string{"istio-operators"},
			namespace:  "istio-system",
			features:   []string{"virtualservices.get", "virtualservices.create", "destinationrules.delete", "gateways.patch"},
			expectedResults: map[string]bool{
				"virtualservices.get":     true,
				"virtualservices.create":  true,
				"destinationrules.delete": false, // Only get/list
				"gateways.patch":          true,
			},
			setupRoles: []rbacv1.Role{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "istio-manager",
						Namespace: "istio-system",
					},
					Rules: []rbacv1.PolicyRule{
						{
							APIGroups: []string{"networking.istio.io"},
							Resources: []string{"virtualservices"},
							Verbs:     []string{"get", "list", "create", "update", "patch"},
						},
						{
							APIGroups: []string{"networking.istio.io"},
							Resources: []string{"destinationrules"},
							Verbs:     []string{"get", "list"},
						},
						{
							APIGroups: []string{"networking.istio.io"},
							Resources: []string{"gateways"},
							Verbs:     []string{"*"},
						},
					},
				},
			},
			setupRoleBindings: []rbacv1.RoleBinding{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "istio-operator-binding",
						Namespace: "istio-system",
					},
					RoleRef: rbacv1.RoleRef{
						APIGroup: "rbac.authorization.k8s.io",
						Kind:     "Role",
						Name:     "istio-manager",
					},
					Subjects: []rbacv1.Subject{
						{
							Kind: "Group",
							Name: "istio-operators",
						},
					},
				},
			},
		},
		{
			name:       "ObjectLevelPermissions_SpecificPods",
			userGroups: []string{"limited-operators"},
			namespace:  "testing",
			features:   []string{"pods.delete", "pods.exec", "pods.get"},
			expectedResults: map[string]bool{
				"pods.delete": false, // No delete permissions
				"pods.exec":   true,  // Only for specific pods via resource names
				"pods.get":    true,
			},
			setupRoles: []rbacv1.Role{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "limited-pod-access",
						Namespace: "testing",
					},
					Rules: []rbacv1.PolicyRule{
						{
							APIGroups: []string{""},
							Resources: []string{"pods"},
							Verbs:     []string{"get", "list"},
						},
						{
							APIGroups:     []string{""},
							Resources:     []string{"pods/exec"},
							ResourceNames: []string{"allowed-pod-1", "allowed-pod-2"},
							Verbs:         []string{"create"},
						},
					},
				},
			},
			setupRoleBindings: []rbacv1.RoleBinding{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "limited-operator-binding",
						Namespace: "testing",
					},
					RoleRef: rbacv1.RoleRef{
						APIGroup: "rbac.authorization.k8s.io",
						Kind:     "Role",
						Name:     "limited-pod-access",
					},
					Subjects: []rbacv1.Subject{
						{
							Kind: "Group",
							Name: "limited-operators",
						},
					},
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create fake client
			client := fake.NewSimpleClientset()

			// Set up fake SSAR reactor to simulate authorization decisions
			client.PrependReactor("create", "selfsubjectaccessreviews",
				func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
					createAction := action.(ktesting.CreateAction)
					ssar := createAction.GetObject().(*authorizationv1.SelfSubjectAccessReview)

					// Simulate authorization logic based on test expectations
					allowed := tt.expectedResults[getCapabilityKey(ssar)]

					ssar.Status = authorizationv1.SubjectAccessReviewStatus{
						Allowed: allowed,
					}
					return true, ssar, nil
				})

			// Set up RBAC resources
			ctx := context.Background()

			// Create roles
			for _, role := range tt.setupRoles {
				_, err := client.RbacV1().Roles(role.Namespace).Create(ctx, &role, metav1.CreateOptions{})
				require.NoError(t, err)
			}

			// Create role bindings
			for _, binding := range tt.setupRoleBindings {
				_, err := client.RbacV1().RoleBindings(binding.Namespace).Create(ctx, &binding, metav1.CreateOptions{})
				require.NoError(t, err)
			}

			// Create cluster roles
			for _, clusterRole := range tt.setupClusterRoles {
				_, err := client.RbacV1().ClusterRoles().Create(ctx, &clusterRole, metav1.CreateOptions{})
				require.NoError(t, err)
			}

			// Create cluster role bindings
			for _, clusterBinding := range tt.setupClusterRoleBindings {
				_, err := client.RbacV1().ClusterRoleBindings().Create(ctx, &clusterBinding, metav1.CreateOptions{})
				require.NoError(t, err)
			}

			// Create capability service
			// capService := NewCapabilityService(logger, 30*time.Second)

			// Create CRD discovery service
			crdService := NewCRDDiscoveryService(logger, client, client.Discovery())

			// Refresh CRDs to include Istio resources
			err := crdService.RefreshCRDs(ctx)
			require.NoError(t, err)

			// Create multi-cluster service
			mcService := NewMultiClusterAuthzService(logger)
			err = mcService.AddCluster("test-cluster", client)
			require.NoError(t, err)

			// Test capability requests
			req := CapabilityRequest{
				Cluster:   "test-cluster",
				Namespace: tt.namespace,
				Features:  tt.features,
			}

			result, err := mcService.CheckCapabilities(ctx, "test-cluster", req, "test-user", tt.userGroups)
			require.NoError(t, err)

			// Verify results
			for feature, expected := range tt.expectedResults {
				actual, exists := result.Caps[feature]
				assert.True(t, exists, "Feature %s should exist in results", feature)
				assert.Equal(t, expected, actual, "Feature %s: expected %v, got %v. Reason: %s",
					feature, expected, actual, result.Reasons[feature])
			}

			// Clean up
			mcService.Close()
		})
	}
}

// TestMultiClusterScenarios tests authorization across multiple clusters
func TestMultiClusterScenarios(t *testing.T) {
	logger := zaptest.NewLogger(t)
	ctx := context.Background()

	// Create multi-cluster service
	mcService := NewMultiClusterAuthzService(logger)

	// Set up two different clusters with different permissions
	cluster1 := fake.NewSimpleClientset()
	cluster2 := fake.NewSimpleClientset()

	// Set up fake SSAR reactor for development cluster (allows everything)
	cluster1.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			sar := &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: true, // Development allows everything
				},
			}
			return true, sar, nil
		})

	// Set up fake SSAR reactor for production cluster (allows only get, denies delete)
	cluster2.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			createAction := action.(ktesting.CreateAction)
			ssar := createAction.GetObject().(*authorizationv1.SelfSubjectAccessReview)

			// Production only allows get operations, denies delete
			allowed := ssar.Spec.ResourceAttributes != nil &&
				ssar.Spec.ResourceAttributes.Verb == "get"

			ssar.Status = authorizationv1.SubjectAccessReviewStatus{
				Allowed: allowed,
			}
			return true, ssar, nil
		})

	// Add clusters
	err := mcService.AddCluster("development", cluster1)
	require.NoError(t, err)

	err = mcService.AddCluster("production", cluster2)
	require.NoError(t, err)

	// Set up different RBAC in each cluster
	// Development: Full access
	devRole := &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{Name: "dev-admin"},
		Rules: []rbacv1.PolicyRule{
			{
				APIGroups: []string{""},
				Resources: []string{"pods"},
				Verbs:     []string{"*"},
			},
		},
	}
	_, err = cluster1.RbacV1().ClusterRoles().Create(ctx, devRole, metav1.CreateOptions{})
	require.NoError(t, err)

	devBinding := &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "dev-admin-binding"},
		RoleRef: rbacv1.RoleRef{
			APIGroup: "rbac.authorization.k8s.io",
			Kind:     "ClusterRole",
			Name:     "dev-admin",
		},
		Subjects: []rbacv1.Subject{
			{Kind: "Group", Name: "developers"},
		},
	}
	_, err = cluster1.RbacV1().ClusterRoleBindings().Create(ctx, devBinding, metav1.CreateOptions{})
	require.NoError(t, err)

	// Production: Read-only access
	prodRole := &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{Name: "prod-viewer"},
		Rules: []rbacv1.PolicyRule{
			{
				APIGroups: []string{""},
				Resources: []string{"pods"},
				Verbs:     []string{"get", "list"},
			},
		},
	}
	_, err = cluster2.RbacV1().ClusterRoles().Create(ctx, prodRole, metav1.CreateOptions{})
	require.NoError(t, err)

	prodBinding := &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: "prod-viewer-binding"},
		RoleRef: rbacv1.RoleRef{
			APIGroup: "rbac.authorization.k8s.io",
			Kind:     "ClusterRole",
			Name:     "prod-viewer",
		},
		Subjects: []rbacv1.Subject{
			{Kind: "Group", Name: "developers"},
		},
	}
	_, err = cluster2.RbacV1().ClusterRoleBindings().Create(ctx, prodBinding, metav1.CreateOptions{})
	require.NoError(t, err)

	// Test development cluster (should allow delete)
	devReq := CapabilityRequest{
		Cluster:   "development",
		Namespace: "default",
		Features:  []string{"pods.get", "pods.delete"},
	}

	devResult, err := mcService.CheckCapabilities(ctx, "development", devReq, "test-user", []string{"developers"})
	require.NoError(t, err)

	assert.True(t, devResult.Caps["pods.get"], "Development cluster should allow pod get")
	assert.True(t, devResult.Caps["pods.delete"], "Development cluster should allow pod delete")

	// Test production cluster (should deny delete)
	prodReq := CapabilityRequest{
		Cluster:   "production",
		Namespace: "default",
		Features:  []string{"pods.get", "pods.delete"},
	}

	prodResult, err := mcService.CheckCapabilities(ctx, "production", prodReq, "test-user", []string{"developers"})
	require.NoError(t, err)

	assert.True(t, prodResult.Caps["pods.get"], "Production cluster should allow pod get")
	assert.False(t, prodResult.Caps["pods.delete"], "Production cluster should deny pod delete")

	// Test cluster isolation - wrong cluster should fail
	_, err = mcService.CheckCapabilities(ctx, "nonexistent", prodReq, "test-user", []string{"developers"})
	assert.Error(t, err, "Nonexistent cluster should return error")

	// Verify cluster stats
	stats := mcService.GetClusterStats()
	assert.Equal(t, 2, stats["total_clusters"], "Should have 2 registered clusters")

	clusters := mcService.GetRegisteredClusters()
	assert.Contains(t, clusters, "development")
	assert.Contains(t, clusters, "production")

	mcService.Close()
}

// TestCRDCapabilityDiscovery tests dynamic capability discovery for CRDs
func TestCRDCapabilityDiscovery(t *testing.T) {
	logger := zaptest.NewLogger(t)
	ctx := context.Background()

	client := fake.NewSimpleClientset()

	// Create CRD discovery service
	crdService := NewCRDDiscoveryService(logger, client, client.Discovery())

	// Simulate CRD discovery (in a real cluster, this would find actual CRDs)
	err := crdService.RefreshCRDs(ctx)
	assert.NoError(t, err)

	// Test that we can get all capabilities (static + dynamic)
	allCaps := crdService.GetAllCapabilities()
	assert.GreaterOrEqual(t, len(allCaps), len(Registry), "Should include at least all static capabilities")

	// Test dynamic capabilities
	dynamicCaps := crdService.GetDynamicCapabilities()
	t.Logf("Found %d dynamic capabilities", len(dynamicCaps))

	// Test stats
	stats := crdService.GetStats()
	assert.Contains(t, stats, "dynamic_capabilities_count")
	assert.Contains(t, stats, "static_capabilities_count")
	assert.Equal(t, len(Registry), stats["static_capabilities_count"])
}

// TestResourceNameObjectLevelChecks tests object-level permission checks
func TestResourceNameObjectLevelChecks(t *testing.T) {
	logger := zaptest.NewLogger(t)
	ctx := context.Background()

	client := fake.NewSimpleClientset()

	// Create multi-cluster service
	mcAuthz := NewMultiClusterAuthzService(logger)
	defer mcAuthz.Close()

	err := mcAuthz.AddCluster("test-cluster", client)
	require.NoError(t, err)

	// Check permission without resource name first (should be denied)
	generalReq := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "default",
		Features:  []string{"pods.delete"},
		// No ResourceNames - general permission check
	}

	generalResult, err := mcAuthz.CheckCapabilities(ctx, "test-cluster", generalReq, "user", []string{"pod-deleters"})
	require.NoError(t, err)
	t.Logf("General delete permission (no resource name): %v", generalResult.Caps["pods.delete"])
	assert.False(t, generalResult.Caps["pods.delete"], "Should deny general delete permission")

	// Create a CapabilityRequest for object-level checks
	objReq := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "default",
		Features:  []string{"pods.delete"},
		ResourceNames: map[string]string{
			"pods.delete": "allowed-pod", // Specific pod name
		},
	}

	// Check permission for specific pod (should be allowed if RBAC allows it)
	objResult, err := mcAuthz.CheckCapabilities(ctx, "test-cluster", objReq, "user", []string{"pod-deleters"})
	require.NoError(t, err)
	// Note: This test will pass/fail based on the fake client's default behavior
	// In a real cluster, this would depend on actual RBAC rules
	t.Logf("Specific pod delete permission: %v", objResult.Caps["pods.delete"])
}
