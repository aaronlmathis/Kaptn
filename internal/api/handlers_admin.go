package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"go.uber.org/zap"
)

// Phase 8: Admin Utilities & Observability

// handleBindingsReload forces a reload of the user bindings store (if applicable)
func (s *Server) handleBindingsReload(w http.ResponseWriter, r *http.Request) {
	// Get security context first
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		if secErr, ok := err.(*SecurityError); ok {
			s.writeSecurityError(w, secErr, nil)
		} else {
			s.writeSecurityError(w, &SecurityError{
				Code:    "INTERNAL_ERROR",
				Message: "Internal server error",
				Status:  http.StatusInternalServerError,
			}, nil)
		}
		return
	}

	// Log the reload attempt
	s.logger.Info("User bindings reload requested",
		zap.String("user_sub", secCtx.User.Sub),
		zap.String("user_email", secCtx.User.Email),
		zap.String("request_path", r.URL.Path),
		zap.String("remote_addr", r.RemoteAddr))

	// Build reload result - this is a placeholder for actual store reload functionality
	reloadResult := map[string]interface{}{
		"status":    "success",
		"message":   "Bindings store reload functionality not yet implemented",
		"timestamp": time.Now().UTC(),
		"mode":      s.config.Authz.Mode,
		"note":      "This endpoint is ready for integration with actual bindings store",
	}

	s.logger.Info("User bindings reload completed",
		zap.String("user_email", secCtx.User.Email),
		zap.String("authz_mode", s.config.Authz.Mode))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reloadResult)
}

// handleGenericSAR provides a generic SelfSubjectAccessReview runner for debugging
func (s *Server) handleGenericSAR(w http.ResponseWriter, r *http.Request) {
	// Get security context first
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		if secErr, ok := err.(*SecurityError); ok {
			s.writeSecurityError(w, secErr, nil)
		} else {
			s.writeSecurityError(w, &SecurityError{
				Code:    "INTERNAL_ERROR",
				Message: "Internal server error",
				Status:  http.StatusInternalServerError,
			}, nil)
		}
		return
	}

	// Parse query parameters for SAR check
	verb := r.URL.Query().Get("verb")
	group := r.URL.Query().Get("group")       // resource group (e.g., "apps")
	resource := r.URL.Query().Get("resource") // resource type (e.g., "deployments")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")

	// Default values
	if verb == "" {
		verb = "get"
	}
	if resource == "" {
		resource = "pods"
	}

	// Log the SAR check request
	s.logger.Info("Generic SAR check requested",
		zap.String("user_sub", secCtx.User.Sub),
		zap.String("user_email", secCtx.User.Email),
		zap.String("verb", verb),
		zap.String("group", group),
		zap.String("resource", resource),
		zap.String("namespace", namespace),
		zap.String("name", name),
		zap.String("request_path", r.URL.Path))

	// Perform the SAR check
	allowed, err := secCtx.SSARHelper.CanPerformAction(
		r.Context(),
		secCtx.Client,
		verb,
		group,
		resource,
		namespace,
		name,
	)

	if err != nil {
		s.logger.Error("Generic SAR check failed",
			zap.Error(err),
			zap.String("user_email", secCtx.User.Email),
			zap.String("verb", verb),
			zap.String("resource", resource))

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "Failed to perform SAR check",
			"status":  "error",
			"details": err.Error(),
		})
		return
	}

	// Log the result for audit trail
	if allowed {
		s.logger.Info("Generic SAR check - ALLOWED",
			zap.String("user_sub", secCtx.User.Sub),
			zap.String("user_email", secCtx.User.Email),
			zap.Strings("user_groups", secCtx.User.Groups),
			zap.String("verb", verb),
			zap.String("group", group),
			zap.String("resource", resource),
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Bool("allowed", allowed))
	} else {
		s.logger.Warn("Generic SAR check - DENIED",
			zap.String("user_sub", secCtx.User.Sub),
			zap.String("user_email", secCtx.User.Email),
			zap.Strings("user_groups", secCtx.User.Groups),
			zap.String("verb", verb),
			zap.String("group", group),
			zap.String("resource", resource),
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Bool("allowed", allowed))
	}

	// Build response
	response := map[string]interface{}{
		"status":  "success",
		"allowed": allowed,
		"check": map[string]interface{}{
			"verb":      verb,
			"group":     group,
			"resource":  resource,
			"namespace": namespace,
			"name":      name,
		},
		"user": map[string]interface{}{
			"sub":    secCtx.User.Sub,
			"email":  secCtx.User.Email,
			"groups": secCtx.User.Groups,
		},
		"timestamp": time.Now().UTC(),
	}

	// Add reasoning for denial
	if !allowed {
		response["reasoning"] = map[string]interface{}{
			"message":    "Access denied by Kubernetes RBAC",
			"suggestion": "Check if user has appropriate role bindings for this resource",
			"debug_tip":  "Use 'kubectl auth can-i' with --as and --as-group flags to debug",
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handlePermissionsCheck shows comprehensive permissions for the current user
func (s *Server) handlePermissionsCheck(w http.ResponseWriter, r *http.Request) {
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

	// Common resources and operations to check
	checks := []k8s.PermissionCheck{
		{Verb: "list", Resource: "pods", Namespace: "default"},
		{Verb: "create", Resource: "pods", Namespace: "default"},
		{Verb: "update", Resource: "pods", Namespace: "default"},
		{Verb: "delete", Resource: "pods", Namespace: "default"},
		{Verb: "list", Resource: "deployments", Namespace: "default"},
		{Verb: "create", Resource: "deployments", Namespace: "default"},
		{Verb: "list", Resource: "services", Namespace: "default"},
		{Verb: "create", Resource: "services", Namespace: "default"},
		{Verb: "list", Resource: "namespaces", Namespace: ""},
		{Verb: "create", Resource: "namespaces", Namespace: ""},
	}

	// Check permissions
	ssarHelper := s.impersonationMgr.SSARHelper()
	results, err := ssarHelper.CheckMultiplePermissions(r.Context(), clients.Client(), checks)
	if err != nil {
		s.logger.Error("Failed to check permissions",
			zap.Error(err),
			zap.String("userEmail", user.Email))
		http.Error(w, "Failed to check permissions", http.StatusInternalServerError)
		return
	}

	// Format response
	response := map[string]interface{}{
		"user": map[string]interface{}{
			"email":  user.Email,
			"sub":    user.Sub,
			"groups": user.Groups,
		},
		"permissions": results,
		"summary": map[string]interface{}{
			"total_checks": len(checks),
			"allowed":      countAllowed(results),
			"denied":       len(checks) - countAllowed(results),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// countAllowed counts the number of allowed permissions
func countAllowed(results map[string]bool) int {
	count := 0
	for _, allowed := range results {
		if allowed {
			count++
		}
	}
	return count
}
