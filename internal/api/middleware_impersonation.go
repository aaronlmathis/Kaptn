package api

import (
	"net/http"

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

		// Build impersonated clients for the authenticated user
		clients, err := s.impersonationMgr.BuildClientsFromUser(user, s.config.Security.UsernameFormat)
		if err != nil {
			s.logger.Error("Failed to build impersonated clients",
				zap.Error(err),
				zap.String("userEmail", user.Email),
				zap.String("userSub", user.Sub))
			// Continue without impersonated clients rather than failing
			next.ServeHTTP(w, r)
			return
		}

		// Add impersonated clients to request context
		ctx := k8s.WithImpersonatedClients(r.Context(), clients)

		s.logger.Debug("Added impersonated clients to request context",
			zap.String("userEmail", user.Email),
			zap.Strings("groups", user.Groups))

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
