package routes

import (
	"github.com/go-chi/chi/v5"
)

// MountStatic mounts static file serving routes (SPA catch-all /*).
// It accepts the StaticHandlers interface (declared in contracts.go) so routes never import the
// concrete server package.
func MountStatic(r chi.Router, h StaticHandlers) {
	// Serve static files from frontend/dist directory with session injection
	r.Handle("/*", h.GetStaticHandler())
}
