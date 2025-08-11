package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"go.uber.org/zap"
)

// handleSSARTest provides a test endpoint for SelfSubjectAccessReview functionality
func (s *Server) handleSSARTest(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Impersonated clients not available", http.StatusInternalServerError)
		return
	}

	// Test some common permissions
	ssarHelper := s.impersonationMgr.SSARHelper()
	permissions := []k8s.PermissionCheck{
		{Verb: "list", Resource: "pods", Namespace: "default"},
		{Verb: "create", Resource: "deployments", Namespace: "default"},
		{Verb: "delete", Resource: "pods", Namespace: "default"},
		{Verb: "get", Resource: "secrets", Namespace: "default"},
		{Verb: "list", Resource: "namespaces", Namespace: ""},
		{Verb: "create", Resource: "roles", Namespace: "default"},
	}

	results, err := ssarHelper.CheckMultiplePermissions(r.Context(), clients.Client(), permissions)
	if err != nil {
		s.logger.Error("Failed to check permissions", zap.Error(err))
		http.Error(w, "Failed to check permissions", http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"user": map[string]interface{}{
			"sub":     user.Sub,
			"email":   user.Email,
			"name":    user.Name,
			"picture": user.Picture,
			"groups":  user.Groups,
		},
		"permissions": results,
		"impersonation_info": map[string]interface{}{
			"username_format": s.config.Security.UsernameFormat,
			"has_clients":     true,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Enhanced version of the existing authz preview endpoint
func (s *Server) handleAuthzPreviewEnhanced(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Format username as it would appear in RBAC
	username := s.formatUsernameForDisplay(user)

	// Check if impersonated clients are available
	hasClients := s.HasImpersonatedClients(r)

	response := map[string]interface{}{
		"user": map[string]interface{}{
			"sub":     user.Sub,
			"email":   user.Email,
			"name":    user.Name,
			"picture": user.Picture,
			"groups":  user.Groups,
		},
		"kubernetes": map[string]interface{}{
			"username":                 username,
			"groups":                   user.Groups,
			"has_impersonated_clients": hasClients,
		},
		"config": map[string]interface{}{
			"auth_mode":       s.config.Security.AuthMode,
			"username_format": s.config.Security.UsernameFormat,
			"authz_mode":      s.config.Authz.Mode,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// formatUsernameForDisplay formats the username as it would appear in Kubernetes RBAC
func (s *Server) formatUsernameForDisplay(user *auth.User) string {
	if s.impersonationMgr != nil {
		clients, err := s.impersonationMgr.BuildClientsFromUser(user, s.config.Security.UsernameFormat)
		if err == nil && clients != nil {
			// Extract the username from the impersonation config
			return clients.RESTConfig().Impersonate.UserName
		}
	}

	// Fallback to manual formatting
	format := s.config.Security.UsernameFormat
	if format == "" {
		if user.Sub != "" {
			return "oidc:" + user.Sub
		}
		return "email:" + user.Email
	}

	// Simple replacement for display
	result := format
	result = strings.ReplaceAll(result, "{sub}", user.Sub)
	result = strings.ReplaceAll(result, "{email}", user.Email)
	result = strings.ReplaceAll(result, "{name}", user.Name)
	result = strings.ReplaceAll(result, "{id}", user.ID)

	return result
}
