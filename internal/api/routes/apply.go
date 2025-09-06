package routes

import (
	"github.com/go-chi/chi/v5"
)

// MountApply mounts apply routes (require write permissions with higher rate limits).
// It accepts the ApplyHandlers interface (declared in contracts.go) so routes never import the
// concrete server package.
func MountApply(r chi.Router, h ApplyHandlers) {
	// Enhanced apply endpoint for Apply Config drawer
	r.Post("/apply", h.HandleApplyConfig)
	// Existing namespace-specific apply endpoint
	r.Post("/namespaces/{namespace}/apply", h.HandleApplyYAML)
}
