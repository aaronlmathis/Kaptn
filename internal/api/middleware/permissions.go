package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"go.uber.org/zap"
)

// PermissionChecker interface defines the contract for checking user permissions.
type PermissionChecker interface {
	Can(ctx context.Context, user *auth.User, verb, resource, namespace, name string) error
}

// SSARPermissionChecker implements PermissionChecker using Kubernetes SubjectAccessReview.
type SSARPermissionChecker struct {
	logger           *zap.Logger
	config           *config.Config
	impersonationMgr *k8s.ImpersonationManager
}

// NewSSARPermissionChecker creates a new SSAR-based permission checker.
func NewSSARPermissionChecker(logger *zap.Logger, config *config.Config, impMgr *k8s.ImpersonationManager) *SSARPermissionChecker {
	return &SSARPermissionChecker{
		logger:           logger,
		config:           config,
		impersonationMgr: impMgr,
	}
}

// Can checks if the user can perform the specified action using Kubernetes SSAR.
func (s *SSARPermissionChecker) Can(ctx context.Context, user *auth.User, verb, resource, namespace, name string) error {
	// If auth mode is none, allow all operations (development mode)
	if s.config.Security.AuthMode == "none" {
		return nil
	}

	// Get impersonated clients from context
	clients, ok := k8s.ImpersonatedClientsFromContext(ctx)
	if !ok {
		return &PermissionError{
			Code:    "UNAUTHORIZED",
			Message: "Authentication required - no impersonated clients found",
			Status:  http.StatusUnauthorized,
		}
	}

	// Use SSAR helper to check permission
	ssarHelper := s.impersonationMgr.SSARHelper()
	allowed, err := ssarHelper.CanPerformAction(ctx, clients.Client(), verb, "", resource, namespace, name)
	if err != nil {
		s.logger.Error("Permission check failed",
			zap.Error(err),
			zap.String("user", user.Email),
			zap.String("verb", verb),
			zap.String("resource", resource),
			zap.String("namespace", namespace),
			zap.String("name", name))

		// Check if this is an authentication/authorization error
		errMsg := err.Error()
		if strings.Contains(errMsg, "forbidden") || strings.Contains(errMsg, "unauthorized") ||
			strings.Contains(errMsg, "authentication") || strings.Contains(errMsg, "token") {
			return &PermissionError{
				Code:    "UNAUTHORIZED",
				Message: "Authentication required",
				Status:  http.StatusUnauthorized,
			}
		}

		return &PermissionError{
			Code:    "PERMISSION_CHECK_FAILED",
			Message: "Failed to check permissions",
			Status:  http.StatusInternalServerError,
		}
	}

	if !allowed {
		return &PermissionError{
			Code:    "FORBIDDEN",
			Message: fmt.Sprintf("Access denied: cannot %s %s in namespace %s", verb, resource, namespace),
			Status:  http.StatusForbidden,
		}
	}

	return nil
}

// PermissionMiddleware provides middleware for checking resource permissions.
type PermissionMiddleware struct {
	logger        *zap.Logger
	config        *config.Config
	checker       PermissionChecker
	authExtractor *AuthExtractor
}

// NewPermissionMiddleware creates a new permission middleware.
func NewPermissionMiddleware(logger *zap.Logger, config *config.Config, checker PermissionChecker) *PermissionMiddleware {
	return &PermissionMiddleware{
		logger:        logger,
		config:        config,
		checker:       checker,
		authExtractor: NewAuthExtractor(logger),
	}
}

// ResourcePermission represents a required permission for a resource action.
type ResourcePermission struct {
	Verb      string
	Resource  string
	Namespace string
	Name      string
}

// RequirePermission returns middleware that requires specific permissions.
func (m *PermissionMiddleware) RequirePermission(perm ResourcePermission) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip permission check if auth mode is none
			if m.config.Security.AuthMode == "none" {
				next.ServeHTTP(w, r)
				return
			}

			// Get authenticated user
			user, err := m.authExtractor.RequireUser(r.Context())
			if err != nil {
				writeError(w, m.logger, err)
				return
			}

			// Check permission
			if err := m.checker.Can(r.Context(), user, perm.Verb, perm.Resource, perm.Namespace, perm.Name); err != nil {
				m.logger.Warn("Permission denied",
					zap.String("user", user.Email),
					zap.String("verb", perm.Verb),
					zap.String("resource", perm.Resource),
					zap.String("namespace", perm.Namespace),
					zap.String("name", perm.Name),
					zap.Error(err))
				writeError(w, m.logger, err)
				return
			}

			m.logger.Debug("Permission granted",
				zap.String("user", user.Email),
				zap.String("verb", perm.Verb),
				zap.String("resource", perm.Resource),
				zap.String("namespace", perm.Namespace))

			next.ServeHTTP(w, r)
		})
	}
}

// PermissionError represents a permission-related error.
type PermissionError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Status  int    `json:"-"`
}

func (e *PermissionError) Error() string {
	return e.Message
}

// writeError writes an error response to the client.
func writeError(w http.ResponseWriter, logger *zap.Logger, err error) {
	var status int
	var code, message string

	switch e := err.(type) {
	case *AuthError:
		status = e.Status
		code = e.Code
		message = e.Message
	case *PermissionError:
		status = e.Status
		code = e.Code
		message = e.Message
	default:
		status = http.StatusInternalServerError
		code = "INTERNAL_ERROR"
		message = "Internal server error"
		logger.Error("Unexpected error", zap.Error(err))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	fmt.Fprintf(w, `{"error":"%s","code":"%s"}`, message, code)
}
