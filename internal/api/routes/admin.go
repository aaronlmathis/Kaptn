package routes

import (
	"github.com/go-chi/chi/v5"
)

// MountAdmin mounts admin routes (require authentication)
func MountAdmin(r chi.Router, handlers AdminHandlers) {
	// Note: Auth middleware will be applied at the group level in the main server setup

	r.Get("/admin/authz/preview", handlers.HandleAuthzPreview)
	r.Get("/admin/authz/permissions-check", handlers.HandlePermissionsCheck)
	r.Post("/auth/revoke-user-sessions", handlers.HandleRevokeUserSessions)

	// Phase 8: Admin Utilities & Observability
	r.Post("/admin/authz/reload", handlers.HandleBindingsReload)
	r.Get("/admin/authz/sar", handlers.HandleGenericSAR)
}
