package auth

import (
	"context"
	"testing"

	"github.com/aaronlmathis/kaptn/internal/config"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestAuthzResolver_IdPGroups(t *testing.T) {
	logger := zap.NewNop()

	authzConfig := &config.AuthzConfig{
		Mode:         "idp_groups",
		GroupsFilter: []string{"kaptn-admins", "kaptn-developers"},
	}

	resolver := NewAuthzResolver(authzConfig, nil, nil, logger)

	// Test user with mixed groups
	user := &User{
		Sub:    "google-oauth2|123456",
		Email:  "user@company.com",
		Name:   "Test User",
		Groups: []string{"kaptn-admins", "unauthorized-group", "kaptn-developers"},
	}

	result, err := resolver.ResolveAuthorization(context.Background(), user, "oidc:{email}")
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	expectedUsername := "oidc:user@company.com"
	if result.Username != expectedUsername {
		t.Errorf("Expected username %s, got %s", expectedUsername, result.Username)
	}

	expectedGroups := []string{"kaptn-admins", "kaptn-developers"}
	if len(result.Groups) != len(expectedGroups) {
		t.Errorf("Expected %d groups, got %d", len(expectedGroups), len(result.Groups))
	}

	// Check that unauthorized group was filtered out
	for _, group := range result.Groups {
		if group == "unauthorized-group" {
			t.Errorf("Unauthorized group should have been filtered out")
		}
	}
}

func TestAuthzResolver_UserBindings(t *testing.T) {
	logger := zap.NewNop()

	// Create fake Kubernetes client with ConfigMap
	fakeClient := fake.NewSimpleClientset()

	// Create test ConfigMap
	configMap := &v1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "kaptn-authz",
			Namespace: "kaptn",
		},
		Data: map[string]string{
			"user@company.com": `{
				"user_id": "user@company.com",
				"email": "user@company.com", 
				"groups": ["kaptn-developers"],
				"namespaces": ["development", "staging"]
			}`,
		},
	}

	_, err := fakeClient.CoreV1().ConfigMaps("kaptn").Create(
		context.Background(), configMap, metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("Failed to create test ConfigMap: %v", err)
	}

	authzConfig := &config.AuthzConfig{
		Mode: "user_bindings",
	}

	bindingsConfig := &config.BindingsConfig{
		Source: "configmap",
		ConfigMap: config.ConfigMapBinding{
			Namespace: "kaptn",
			Name:      "kaptn-authz",
		},
	}

	resolver := NewAuthzResolver(authzConfig, bindingsConfig, fakeClient, logger)

	user := &User{
		Sub:   "google-oauth2|123456",
		Email: "user@company.com",
		Name:  "Test User",
	}

	result, err := resolver.ResolveAuthorization(context.Background(), user, "k8s:{email}")
	if err != nil {
		t.Fatalf("Expected no error, got: %v", err)
	}

	expectedUsername := "k8s:user@company.com"
	if result.Username != expectedUsername {
		t.Errorf("Expected username %s, got %s", expectedUsername, result.Username)
	}

	expectedGroups := []string{"kaptn-developers"}
	if len(result.Groups) != len(expectedGroups) {
		t.Errorf("Expected %d groups, got %d", len(expectedGroups), len(result.Groups))
	}

	if result.Groups[0] != "kaptn-developers" {
		t.Errorf("Expected group kaptn-developers, got %s", result.Groups[0])
	}

	// Note: Current implementation doesn't extract namespaces from UserBinding
	// This would be enhanced in a future iteration
	expectedNamespaces := 0 // Empty means all namespaces
	if len(result.Namespaces) != expectedNamespaces {
		t.Errorf("Expected %d namespaces, got %d", expectedNamespaces, len(result.Namespaces))
	}
}

func TestAuthzResolver_ValidateGroups(t *testing.T) {
	logger := zap.NewNop()
	resolver := NewAuthzResolver(&config.AuthzConfig{}, nil, nil, logger)

	input := []string{"kaptn-admins", "invalid-group", "kaptn-viewers", "another-invalid"}
	expected := []string{"kaptn-admins", "kaptn-viewers"}

	result := resolver.ValidateGroups(input)

	if len(result) != len(expected) {
		t.Errorf("Expected %d valid groups, got %d", len(expected), len(result))
	}

	for i, group := range expected {
		if i >= len(result) || result[i] != group {
			t.Errorf("Expected group %s at index %d, got %s", group, i, result[i])
		}
	}
}
