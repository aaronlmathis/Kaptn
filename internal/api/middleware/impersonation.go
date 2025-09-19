package middleware

import (
	"net/http"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"go.uber.org/zap"
)

// ImpersonationMiddleware provides middleware for adding impersonated Kubernetes clients to request context.
// This is moved from server.go to centralize impersonation logic.
type ImpersonationMiddleware struct {
	logger           *zap.Logger
	config           *config.Config
	impersonationMgr *k8s.ImpersonationManager
	authMiddleware   *auth.Middleware // For ConfigMap group resolution
}

// NewImpersonationMiddleware creates a new impersonation middleware.
func NewImpersonationMiddleware(logger *zap.Logger, config *config.Config, impMgr *k8s.ImpersonationManager, authMw *auth.Middleware) *ImpersonationMiddleware {
	return &ImpersonationMiddleware{
		logger:           logger,
		config:           config,
		impersonationMgr: impMgr,
		authMiddleware:   authMw,
	}
}

// Middleware returns an HTTP middleware that adds impersonated Kubernetes clients to the request context.
func (im *ImpersonationMiddleware) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only add impersonated clients if user is authenticated
		user, ok := auth.UserFromContext(r.Context())
		if !ok || user == nil {
			// No authenticated user, continue without impersonated clients
			next.ServeHTTP(w, r)
			return
		}

		// Get the formatted username for authorization lookup
		username := user.ID
		if im.config.Security.UsernameFormat != "" {
			format := im.config.Security.UsernameFormat
			username = strings.ReplaceAll(format, "{sub}", user.Sub)
			username = strings.ReplaceAll(username, "{email}", user.Email)
			username = strings.ReplaceAll(username, "{name}", user.Name)
		}

		// Use the groups already resolved by the auth middleware
		// The auth middleware has already done the group resolution, so we should trust those results
		effectiveGroups := user.Groups

		// Only do additional resolution if the auth middleware hasn't already resolved groups
		// This prevents double-resolution and race conditions
		if im.authMiddleware != nil && im.config != nil && im.config.Authz.Mode == "user_bindings" && len(user.Groups) == 0 {
			// Only try additional resolution if the user has no groups (indicating auth middleware failed)
			if binding, err := im.authMiddleware.GetUserBinding(r.Context(), username); err == nil {
				effectiveGroups = binding.Groups
				im.logger.Debug("Fallback: Using resolved groups from ConfigMap for impersonation",
					zap.String("username", username),
					zap.Strings("resolved_groups", effectiveGroups))
			} else {
				im.logger.Warn("No groups resolved and ConfigMap lookup failed - user may have no permissions",
					zap.String("username", username),
					zap.Error(err))
			}
		} else {
			im.logger.Debug("Using groups from auth middleware",
				zap.String("username", username),
				zap.Strings("effective_groups", effectiveGroups))
		}

		// Build impersonated clients with the correct groups
		clients, err := im.impersonationMgr.BuildClientsFromUserWithGroups(user, im.config.Security.UsernameFormat, effectiveGroups)
		if err != nil {
			im.logger.Error("Failed to build impersonated clients",
				zap.Error(err),
				zap.String("userEmail", user.Email),
				zap.String("userSub", user.Sub),
				zap.Strings("effective_groups", effectiveGroups))
			// Continue without impersonated clients rather than failing
			next.ServeHTTP(w, r)
			return
		}

		// Add impersonated clients to request context
		ctx := k8s.WithImpersonatedClients(r.Context(), clients)

		// If we have resolved groups from ConfigMap, update the user object with effective groups
		// This is important for permission checks in RequireWrite middleware
		if len(effectiveGroups) > 0 && !slicesEqual(user.Groups, effectiveGroups) {
			// Create a copy of the user with resolved groups
			updatedUser := *user
			updatedUser.Groups = effectiveGroups
			ctx = auth.WithUser(ctx, &updatedUser)

			im.logger.Debug("Updated user context with resolved groups",
				zap.String("userEmail", user.Email),
				zap.Strings("original_groups", user.Groups),
				zap.Strings("effective_groups", effectiveGroups))
		}

		im.logger.Debug("Added impersonated clients to request context",
			zap.String("userEmail", user.Email),
			zap.String("username", username),
			zap.Strings("effective_groups", effectiveGroups))

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireImpersonation returns middleware that ensures impersonated clients are available.
func (im *ImpersonationMiddleware) RequireImpersonation(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, ok := k8s.ImpersonatedClientsFromContext(r.Context())
		if !ok {
			im.logger.Warn("Impersonated clients not available in context")
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// slicesEqual checks if two string slices are equal
func slicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i, v := range a {
		if v != b[i] {
			return false
		}
	}
	return true
}
