package routes

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// MountPublic mounts public routes (no authentication required)
func MountPublic(r chi.Router, handlers PublicHandlers) {
	// Basic info endpoint (public)
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "Kubernetes Admin Dashboard API v1", "status": "ready"}`))
	})

	// Authentication endpoints (public) - using contract interface
	r.Post("/auth/login", handlers.HandleLogin)
	r.Get("/auth/callback", handlers.HandleAuthCallback)
	r.Post("/auth/logout", handlers.HandleLogout)
	r.Post("/auth/refresh", handlers.HandleRefresh)
	r.Get("/auth/me", handlers.HandleMe)
	r.Get("/auth/jwks", handlers.HandleJWKS)

	// Debug endpoint for authentication state
	r.Get("/auth/debug", handlers.HandleDebugUser)

	// Public configuration endpoint
	r.Get("/config", handlers.HandlePublicConfig)
}
