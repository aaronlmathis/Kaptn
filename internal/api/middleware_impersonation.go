package api

import (
	"net/http"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"go.uber.org/zap"
)

// ImpersonationMiddleware creates a middleware that adds impersonated Kubernetes clients to the request context
func (s *Server) ImpersonationMiddleware(next http.Handler) http.Handler {
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
		if s.config.Security.UsernameFormat != "" {
			format := s.config.Security.UsernameFormat
			username = strings.ReplaceAll(format, "{sub}", user.Sub)
			username = strings.ReplaceAll(username, "{email}", user.Email)
			username = strings.ReplaceAll(username, "{name}", user.Name)
		}

		// Try to get resolved groups from auth middleware (ConfigMap)
		effectiveGroups := user.Groups // fallback to original groups
		if s.authMiddleware != nil {
			if binding, err := s.authMiddleware.GetUserBinding(r.Context(), username); err == nil {
				effectiveGroups = binding.Groups
				s.logger.Debug("Using resolved groups from ConfigMap for impersonation",
					zap.String("username", username),
					zap.Strings("original_groups", user.Groups),
					zap.Strings("resolved_groups", effectiveGroups))
			} else {
				s.logger.Debug("Could not resolve groups from ConfigMap, using original groups",
					zap.String("username", username),
					zap.Error(err))
			}
		}

		// Build impersonated clients with the correct groups
		clients, err := s.impersonationMgr.BuildClientsFromUserWithGroups(user, s.config.Security.UsernameFormat, effectiveGroups)
		if err != nil {
			s.logger.Error("Failed to build impersonated clients",
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

		s.logger.Debug("Added impersonated clients to request context",
			zap.String("userEmail", user.Email),
			zap.String("username", username),
			zap.Strings("effective_groups", effectiveGroups))

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireImpersonation is middleware that ensures impersonated clients are available
func (s *Server) RequireImpersonation(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.HasImpersonatedClients(r) {
			s.logger.Warn("Impersonated clients not available in context")
			http.Error(w, "Authentication required", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
