package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/config"
	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
)

// UserBinding represents a user's authorization binding
type UserBinding struct {
	UserID     string   `json:"user_id"`
	Email      string   `json:"email,omitempty"`
	Groups     []string `json:"groups"`
	Namespaces []string `json:"namespaces,omitempty"` // Empty means all namespaces
}

// AuthzResolver handles authorization logic for converting OIDC users to Kubernetes RBAC subjects
type AuthzResolver struct {
	config        *config.AuthzConfig
	bindings      *config.BindingsConfig
	groupResolver GroupResolver
	logger        *zap.Logger
}

// AuthzResult contains the resolved authorization information
type AuthzResult struct {
	Username   string   `json:"username"`   // Formatted username for RBAC subjects
	Groups     []string `json:"groups"`     // Kubernetes groups for impersonation
	Namespaces []string `json:"namespaces"` // Accessible namespaces (empty = all)
}

// NewAuthzResolver creates a new authorization resolver
func NewAuthzResolver(config *config.AuthzConfig, bindings *config.BindingsConfig, k8sClient kubernetes.Interface, logger *zap.Logger) *AuthzResolver {
	resolver := &AuthzResolver{
		config:   config,
		bindings: bindings,
		logger:   logger,
	}

	// Initialize the appropriate group resolver based on mode
	switch config.Mode {
	case "idp_groups":
		resolver.groupResolver = NewIdPGroupsResolver(config.GroupsPrefixAllowlist, logger)
	case "user_bindings":
		// Initialize ConfigMap binding store
		if bindings.Source == "configmap" {
			store, err := NewConfigMapBindingStore(k8sClient, bindings.ConfigMap.Namespace, bindings.ConfigMap.Name, logger)
			if err != nil {
				logger.Error("Failed to initialize ConfigMap binding store", zap.Error(err))
				// Return resolver without group resolver - will fail at runtime
			} else {
				resolver.groupResolver = NewUserBindingsResolver(store, logger)
			}
		}
	}

	return resolver
}

// ResolveAuthorization resolves authorization for an OIDC user
func (a *AuthzResolver) ResolveAuthorization(ctx context.Context, userInfo *User, usernameFormat string) (*AuthzResult, error) {
	if a.groupResolver == nil {
		return nil, fmt.Errorf("group resolver not initialized for mode: %s", a.config.Mode)
	}

	// Format the username according to configuration
	username := a.formatUsername(userInfo, usernameFormat)

	// Resolve groups using the configured resolver
	groups, err := a.groupResolver.ResolveGroups(ctx, userInfo)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve groups: %w", err)
	}

	// Validate groups to ensure only known Kaptn groups
	validGroups := a.ValidateGroups(groups)

	return &AuthzResult{
		Username:   username,
		Groups:     validGroups,
		Namespaces: []string{}, // TODO: Extract from user bindings in future enhancement
	}, nil
}

// formatUsername applies the configured username format
func (a *AuthzResolver) formatUsername(userInfo *User, format string) string {
	// Replace placeholders in the format string
	username := format
	username = strings.ReplaceAll(username, "{sub}", userInfo.Sub)
	username = strings.ReplaceAll(username, "{email}", userInfo.Email)
	username = strings.ReplaceAll(username, "{name}", userInfo.Name)

	// Handle nested claims if needed
	if strings.Contains(format, "{") {
		a.logger.Warn("Unknown placeholder in username format",
			zap.String("format", format),
			zap.String("result", username))
	}

	return username
}

// ValidateGroups checks that the resolved groups match expected Kaptn groups
func (a *AuthzResolver) ValidateGroups(groups []string) []string {
	validGroups := make([]string, 0, len(groups))
	validGroupSet := map[string]bool{
		"kaptn-admins":     true,
		"kaptn-developers": true,
		"kaptn-viewers":    true,
	}

	for _, group := range groups {
		if validGroupSet[group] {
			validGroups = append(validGroups, group)
		} else {
			a.logger.Warn("Unknown group in user binding, skipping",
				zap.String("group", group))
		}
	}

	return validGroups
}

// CreateSampleConfigMap creates a sample ConfigMap with user bindings for testing
func CreateSampleConfigMap() map[string]string {
	// Sample bindings showing different user types
	adminBinding := UserBinding{
		UserID:     "admin@example.com",
		Email:      "admin@example.com",
		Groups:     []string{"kaptn-admins"},
		Namespaces: []string{}, // All namespaces
	}

	devBinding := UserBinding{
		UserID:     "dev@example.com",
		Email:      "dev@example.com",
		Groups:     []string{"kaptn-developers"},
		Namespaces: []string{"development", "staging"},
	}

	viewerBinding := UserBinding{
		UserID:     "viewer@example.com",
		Email:      "viewer@example.com",
		Groups:     []string{"kaptn-viewers"},
		Namespaces: []string{"development"},
	}

	// Marshal to JSON
	adminJSON, _ := json.Marshal(adminBinding)
	devJSON, _ := json.Marshal(devBinding)
	viewerJSON, _ := json.Marshal(viewerBinding)

	return map[string]string{
		"admin@example.com":  string(adminJSON),
		"dev@example.com":    string(devJSON),
		"viewer@example.com": string(viewerJSON),
		// Example of binding by OIDC subject ID
		"google-oauth2|123456789": string(adminJSON),
	}
}
