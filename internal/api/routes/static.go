package routes

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// StaticHandlerServer represents the interface for static server handlers
type StaticHandlerServer interface {
	GetStaticHandler() http.Handler
}

// MountStatic mounts static file serving routes (SPA catch-all /*)
func MountStatic(r chi.Router, server interface{}) {
	s := server.(StaticHandlerServer)

	// Serve static files from frontend/dist directory with session injection
	r.Handle("/*", s.GetStaticHandler())
}
