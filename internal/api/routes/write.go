package routes

import (
	"github.com/go-chi/chi/v5"
)

// MountWrite mounts write routes (require write permissions). It accepts the
// WriteHandlers interface (declared in contracts.go) so routes never import the
// concrete server package.
func MountWrite(r chi.Router, h WriteHandlers) {
	// Node management
	r.Post("/nodes/{nodeName}/cordon", h.HandleCordonNode)
	r.Post("/nodes/{nodeName}/uncordon", h.HandleUncordonNode)
	r.Post("/nodes/{nodeName}/drain", h.HandleDrainNode)

    // Generic action endpoints
    r.Post("/actions", h.HandleExecuteActions)
    r.Post("/actions/validate", h.HandleValidateGenericActions)

	// Advanced write endpoints
	r.Post("/scale", h.HandleScaleResource)
	r.Delete("/resources", h.HandleDeleteResource)
	r.Delete("/resource-quotas/{namespace}/{name}", h.HandleDeleteResourceQuota)
	r.Post("/namespaces", h.HandleCreateNamespace)
	r.Delete("/namespaces/{namespace}", h.HandleDeleteNamespace)
	r.Get("/exec/{sessionId}", h.HandleExecWebSocket)
	r.Post("/logs/stream", h.HandleStartLogStream)
	r.Delete("/logs/stream/{streamId}", h.HandleStopLogStream)

	// Secrets management endpoints
	r.Post("/secrets", h.HandleCreateSecret)
	r.Put("/secrets/{namespace}/{name}", h.HandleUpdateSecret)
	r.Delete("/secrets/{namespace}/{name}", h.HandleDeleteSecret)

	// RBAC builder endpoints
	r.Post("/rbac/generate", h.HandleGenerateRBACYAML)
	r.Post("/rbac/dry-run", h.HandleDryRunRBAC)
	r.Post("/rbac/apply", h.HandleApplyRBAC)
}
