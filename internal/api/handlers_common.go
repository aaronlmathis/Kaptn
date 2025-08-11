package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
)

// handleExportResource handles GET /api/v1/namespaces/{namespace}/{kind}/{name}/export
// @Summary Export resource
// @Description Export a resource (namespaced or cluster-scoped) as YAML/JSON.
// @Tags Resources
// @Produce json
// @Param namespace path string true "Namespace (empty for cluster-scoped resources)"
// @Param kind path string true "Resource kind (e.g., Pod, Deployment, Node, etc.)"
// @Param name path string true "Resource name"
// @Success 200 {object} interface{} "Exported resource object"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/namespaces/{namespace}/{kind}/{name}/export [get]
func (s *Server) handleExportResource(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	kind := chi.URLParam(r, "kind")
	name := chi.URLParam(r, "name")

	if kind == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "kind and name are required"})
		return
	}

	// For cluster-scoped resources, namespace can be empty
	// Check if this is a cluster-scoped resource
	clusterScopedResources := map[string]bool{
		"StorageClass":       true,
		"PersistentVolume":   true,
		"ClusterRole":        true,
		"ClusterRoleBinding": true,
		"Node":               true,
		"CSIDriver":          true,
		"Namespace":          true,
	}

	// If it's not a cluster-scoped resource, namespace is required
	if !clusterScopedResources[kind] && namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace is required for namespaced resources"})
		return
	}

	export, err := s.resourceManager.ExportResource(r.Context(), namespace, name, kind)
	if err != nil {
		s.logger.Error("Failed to export resource",
			zap.String("namespace", namespace),
			zap.String("kind", kind),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(export)
}

// handleExportClusterScopedResource handles GET /api/v1/{kind}/{name}/export
// @Summary Export cluster-scoped resource
// @Description Export a cluster-scoped resource as YAML/JSON.
// @Tags Resources
// @Produce json
// @Param kind path string true "Resource kind (e.g., Node, ClusterRole, etc.)"
// @Param name path string true "Resource name"
// @Success 200 {object} interface{} "Exported resource object"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/{kind}/{name}/export [get]
func (s *Server) handleExportClusterScopedResource(w http.ResponseWriter, r *http.Request) {
	kind := chi.URLParam(r, "kind")
	name := chi.URLParam(r, "name")

	if kind == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "kind and name are required"})
		return
	}

	// This endpoint is specifically for cluster-scoped resources, so pass empty namespace
	export, err := s.resourceManager.ExportResource(r.Context(), "", name, kind)
	if err != nil {
		s.logger.Error("Failed to export cluster-scoped resource",
			zap.String("kind", kind),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(export)
}

// handleGetPodLogs handles GET /api/v1/namespaces/{namespace}/pods/{podName}/logs
// @Summary Get pod logs
// @Description Get logs for a specific pod and (optionally) container.
// @Tags Pods
// @Produce plain
// @Param namespace path string true "Namespace"
// @Param podName path string true "Pod name"
// @Param container query string false "Container name (optional)"
// @Param tailLines query int false "Number of lines from the end of the logs"
// @Success 200 {string} string "Pod logs"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/namespaces/{namespace}/pods/{podName}/logs [get]
func (s *Server) handleGetPodLogs(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	podName := chi.URLParam(r, "podName")
	containerName := r.URL.Query().Get("container")

	if namespace == "" || podName == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace and podName are required"})
		return
	}

	var tailLines *int64
	if tail := r.URL.Query().Get("tailLines"); tail != "" {
		if lines, err := strconv.ParseInt(tail, 10, 64); err == nil {
			tailLines = &lines
		}
	}

	logs, err := s.resourceManager.GetPodLogs(r.Context(), namespace, podName, containerName, tailLines)
	if err != nil {
		s.logger.Error("Failed to get pod logs",
			zap.String("namespace", namespace),
			zap.String("pod", podName),
			zap.String("container", containerName),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(logs))
}

// Phase 7: Secure Handler Patterns with SSAR checks and impersonated clients

// SecurityContext holds information for secure operations
type SecurityContext struct {
	User           *auth.User
	Client         kubernetes.Interface
	SSARHelper     *k8s.SSARHelper
	Logger         *zap.Logger
	RequestContext string
}

// getSecurityContext extracts user and impersonated client from request
func (s *Server) getSecurityContext(r *http.Request) (*SecurityContext, error) {
	// Get authenticated user
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		return nil, &SecurityError{
			Code:    "UNAUTHORIZED",
			Message: "Authentication required",
			Status:  http.StatusUnauthorized,
		}
	}

	// Get impersonated client
	client, err := s.GetImpersonatedClient(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated client",
			zap.Error(err),
			zap.String("user", user.Email))
		return nil, &SecurityError{
			Code:    "IMPERSONATION_FAILED",
			Message: "Failed to create impersonated client",
			Status:  http.StatusInternalServerError,
		}
	}

	return &SecurityContext{
		User:           user,
		Client:         client,
		SSARHelper:     s.impersonationMgr.SSARHelper(),
		Logger:         s.logger,
		RequestContext: r.URL.Path,
	}, nil
}

// SecurityError represents an authentication/authorization error
type SecurityError struct {
	Code    string
	Message string
	Status  int
}

func (e *SecurityError) Error() string {
	return e.Message
}

// writeSecurityError writes a structured security error response
func (s *Server) writeSecurityError(w http.ResponseWriter, err *SecurityError, user *auth.User) {
	// Log security event
	if user != nil {
		s.logger.Warn("Security error",
			zap.String("user_sub", user.Sub),
			zap.String("user_email", user.Email),
			zap.String("error_code", err.Code),
			zap.String("error_message", err.Message),
			zap.Int("status", err.Status))
	} else {
		s.logger.Warn("Security error - no user context",
			zap.String("error_code", err.Code),
			zap.String("error_message", err.Message),
			zap.Int("status", err.Status))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(err.Status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":  err.Message,
		"code":   err.Code,
		"status": "error",
	})
}

// checkResourcePermission performs SSAR check for a specific resource operation
func (s *Server) checkResourcePermission(ctx context.Context, secCtx *SecurityContext, verb, resource, namespace, name string) error {
	if secCtx.SSARHelper == nil {
		return &SecurityError{
			Code:    "SSAR_UNAVAILABLE",
			Message: "Permission checking unavailable",
			Status:  http.StatusInternalServerError,
		}
	}

	// Check permission using SSAR helper
	allowed, err := secCtx.SSARHelper.CanPerformAction(
		ctx,
		secCtx.Client,
		verb,
		"", // group - empty for core resources
		resource,
		namespace,
		name,
	)

	// Get request from context for audit logging
	if req, ok := ctx.Value("http_request").(*http.Request); ok {
		if err != nil {
			s.logAuditEvent(req, secCtx.User, verb, resource, namespace, name, "ERROR", err)
		} else if allowed {
			s.logAuditEvent(req, secCtx.User, verb, resource, namespace, name, "ALLOWED", nil)
		} else {
			s.logAuditEvent(req, secCtx.User, verb, resource, namespace, name, "DENIED", nil)
		}
	}

	if err != nil {
		secCtx.Logger.Error("SSAR check failed",
			zap.Error(err),
			zap.String("user", secCtx.User.Email),
			zap.String("verb", verb),
			zap.String("resource", resource),
			zap.String("namespace", namespace))
		return &SecurityError{
			Code:    "PERMISSION_CHECK_FAILED",
			Message: "Failed to check permissions",
			Status:  http.StatusInternalServerError,
		}
	}

	if !allowed {
		secCtx.Logger.Info("Permission denied",
			zap.String("user", secCtx.User.Email),
			zap.String("user_sub", secCtx.User.Sub),
			zap.Strings("user_groups", secCtx.User.Groups),
			zap.String("verb", verb),
			zap.String("resource", resource),
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.String("path", secCtx.RequestContext))

		permissionMsg := "Insufficient permissions"
		if namespace != "" {
			permissionMsg = fmt.Sprintf("Insufficient permissions to %s %s in namespace %s", verb, resource, namespace)
		} else {
			permissionMsg = fmt.Sprintf("Insufficient permissions to %s %s", verb, resource)
		}

		return &SecurityError{
			Code:    "FORBIDDEN",
			Message: permissionMsg,
			Status:  http.StatusForbidden,
		}
	}

	// Log successful authorization
	secCtx.Logger.Debug("Permission granted",
		zap.String("user", secCtx.User.Email),
		zap.String("verb", verb),
		zap.String("resource", resource),
		zap.String("namespace", namespace),
		zap.String("name", name))

	return nil
}

// Phase 8: Enhanced audit logging for observability

// logAuditEvent logs a structured audit event for a resource operation
func (s *Server) logAuditEvent(r *http.Request, user *auth.User, verb, resource, namespace, name string, decision string, err error) {
	requestID := middleware.GetReqID(r.Context())
	if requestID == "" {
		requestID = "unknown"
	}

	logFields := []zap.Field{
		zap.String("event_type", "audit"),
		zap.String("request_id", requestID),
		zap.String("user_sub", user.Sub),
		zap.String("user_email", user.Email),
		zap.Strings("user_groups", user.Groups),
		zap.String("verb", verb),
		zap.String("resource", resource),
		zap.String("namespace", namespace),
		zap.String("name", name),
		zap.String("decision", decision),
		zap.String("path", r.URL.Path),
		zap.String("method", r.Method),
		zap.String("remote_addr", r.RemoteAddr),
		zap.String("user_agent", r.UserAgent()),
	}

	if err != nil {
		logFields = append(logFields, zap.Error(err))
	}

	// Log at appropriate level based on decision
	switch strings.ToUpper(decision) {
	case "ALLOWED", "SUCCESS":
		s.logger.Info("Audit event", logFields...)
	case "DENIED", "FORBIDDEN":
		s.logger.Warn("Audit event - access denied", logFields...)
	case "ERROR", "FAILED":
		s.logger.Error("Audit event - error", logFields...)
	default:
		s.logger.Info("Audit event", logFields...)
	}
}

// logSecurityEvent logs important security-related events
func (s *Server) logSecurityEvent(r *http.Request, user *auth.User, eventType, message string, details map[string]interface{}) {
	requestID := middleware.GetReqID(r.Context())
	if requestID == "" {
		requestID = "unknown"
	}

	logFields := []zap.Field{
		zap.String("event_type", "security"),
		zap.String("security_event", eventType),
		zap.String("request_id", requestID),
		zap.String("message", message),
		zap.String("path", r.URL.Path),
		zap.String("method", r.Method),
		zap.String("remote_addr", r.RemoteAddr),
		zap.String("user_agent", r.UserAgent()),
	}

	if user != nil {
		logFields = append(logFields,
			zap.String("user_sub", user.Sub),
			zap.String("user_email", user.Email),
			zap.Strings("user_groups", user.Groups))
	}

	if details != nil {
		for key, value := range details {
			logFields = append(logFields, zap.Any(fmt.Sprintf("detail_%s", key), value))
		}
	}

	s.logger.Warn("Security event", logFields...)
}
