package server

import (
	"encoding/json"
	"net/http"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
)

// handleCheckPermission provides a REST endpoint for checking specific permissions
// This supports the UI gating requirements of Phase 6
func (s *Server) HandleCheckPermission(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user - this should be your Google user with resolved groups
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get query parameters
	verb := r.URL.Query().Get("verb")
	resource := r.URL.Query().Get("resource")
	namespace := r.URL.Query().Get("namespace")
	name := r.URL.Query().Get("name")

	if verb == "" || resource == "" {
		http.Error(w, "verb and resource parameters are required", http.StatusBadRequest)
		return
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Check permission using helper
	permissionHelper := s.impersonationMgr.PermissionHelper()
	allowed, err := permissionHelper.Can(r.Context(), clients.Client(), verb, resource, namespace, name)
	if err != nil {
		s.logger.Error("Failed to check permission",
			zap.Error(err),
			zap.String("verb", verb),
			zap.String("resource", resource),
			zap.String("namespace", namespace),
			zap.String("name", name))
		http.Error(w, "Failed to check permission", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"allowed":   allowed,
		"verb":      verb,
		"resource":  resource,
		"namespace": namespace,
		"name":      name,
		"user":      user.Email,
	})
}

// handleGetActionPermissions returns common UI action permissions for a namespace
func (s *Server) HandleGetActionPermissions(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user - this should be your Google user with resolved groups
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get namespace from URL or query parameter
	namespace := chi.URLParam(r, "namespace")
	if namespace == "" {
		namespace = r.URL.Query().Get("namespace")
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get action permissions
	permissionHelper := s.impersonationMgr.PermissionHelper()
	permissions, err := permissionHelper.GetActionPermissions(r.Context(), clients.Client(), namespace)
	if err != nil {
		s.logger.Error("Failed to get action permissions",
			zap.Error(err),
			zap.String("namespace", namespace))
		http.Error(w, "Failed to get permissions", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"namespace":   namespace,
		"permissions": permissions,
		"user":        user.Email,
	})
}

// handleCheckPageAccess implements page-level access gating as required by Phase 6
func (s *Server) HandleCheckPageAccess(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user - this should be your Google user with resolved groups
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get query parameters
	resource := r.URL.Query().Get("resource")
	namespace := r.URL.Query().Get("namespace")

	if resource == "" {
		http.Error(w, "resource parameter is required", http.StatusBadRequest)
		return
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Check page access
	permissionHelper := s.impersonationMgr.PermissionHelper()
	allowed, err := permissionHelper.CheckPageAccess(r.Context(), clients.Client(), resource, namespace)
	if err != nil {
		s.logger.Error("Failed to check page access",
			zap.Error(err),
			zap.String("resource", resource),
			zap.String("namespace", namespace))
		http.Error(w, "Failed to check page access", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"allowed":   allowed,
		"resource":  resource,
		"namespace": namespace,
		"user":      user.Email,
	})
}

// handleBulkPermissionCheck checks multiple permissions in a single request
func (s *Server) HandleBulkPermissionCheck(w http.ResponseWriter, r *http.Request) {
	// Get authenticated user - this should be your Google user with resolved groups
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var req struct {
		Checks []k8s.PermissionCheck `json:"checks"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Checks) == 0 {
		http.Error(w, "No permission checks provided", http.StatusBadRequest)
		return
	}

	// Get impersonated clients
	clients, err := s.GetImpersonatedClients(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated clients", zap.Error(err))
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Check permissions
	permissionHelper := s.impersonationMgr.PermissionHelper()
	results, err := permissionHelper.CheckMultipleActions(r.Context(), clients.Client(), req.Checks)
	if err != nil {
		s.logger.Error("Failed to check bulk permissions", zap.Error(err))
		http.Error(w, "Failed to check permissions", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": results,
		"user":    user.Email,
		"total":   len(req.Checks),
	})
}

// handleGetUserNamespacePermissions returns granular namespace-scoped permissions for the current user
func (s *Server) HandleGetUserNamespacePermissions(w http.ResponseWriter, r *http.Request) {
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
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get user's namespace permissions using the impersonated username
	clientset, ok := clients.Client().(*kubernetes.Clientset)
	if !ok {
		s.logger.Error("Failed to cast client to Clientset")
		http.Error(w, "Client type error", http.StatusInternalServerError)
		return
	}

	config := clients.RESTConfig()
	username := config.Impersonate.UserName
	if username == "" {
		username = user.Email // fallback
	}

	permissions, err := GetUserNamespacePermissions(r.Context(), clientset, username)
	if err != nil {
		s.logger.Error("Failed to get user namespace permissions",
			zap.Error(err),
			zap.String("user", user.Email))
		http.Error(w, "Failed to get permissions", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(permissions)
}
