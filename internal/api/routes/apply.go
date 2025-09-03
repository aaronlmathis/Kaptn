package routes

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// MountApply mounts apply routes (require write permissions with higher rate limits)
func MountApply(r chi.Router, s interface{}) {
	// Type assert to access server methods and properties
	server := s.(interface {
		// Apply handler methods
		handleApplyConfig(w http.ResponseWriter, r *http.Request)
		handleApplyYAML(w http.ResponseWriter, r *http.Request)
	})

	// Note: Middleware will be applied in the main API routing tier
	// This is a mechanical move, so we preserve existing middleware setup

	// Enhanced apply endpoint for Apply Config drawer
	r.Post("/apply", server.handleApplyConfig)
	// Existing namespace-specific apply endpoint
	r.Post("/namespaces/{namespace}/apply", server.handleApplyYAML)
}
