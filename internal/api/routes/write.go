package routes

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// MountWrite mounts write routes (require write permissions)
func MountWrite(r chi.Router, s interface{}) {
	// Type assert to access server methods and properties
	server := s.(interface {
		// Config access
		GetAuthMode() string
		GetAuthMiddleware() interface{}
		GetConfig() interface{}
		GetLogger() interface{}

		// All write handler methods
		handleCordonNode(w http.ResponseWriter, r *http.Request)
		handleUncordonNode(w http.ResponseWriter, r *http.Request)
		handleDrainNode(w http.ResponseWriter, r *http.Request)
		handleValidateAction(w http.ResponseWriter, r *http.Request)
		handleBulkAction(w http.ResponseWriter, r *http.Request)
		handlePodsBulkAction(w http.ResponseWriter, r *http.Request)
		handleDeploymentsBulkAction(w http.ResponseWriter, r *http.Request)
		handleServicesBulkAction(w http.ResponseWriter, r *http.Request)
		handleConfigMapsBulkAction(w http.ResponseWriter, r *http.Request)
		handleSecretsBulkAction(w http.ResponseWriter, r *http.Request)
		handleScaleResource(w http.ResponseWriter, r *http.Request)
		handleDeleteResource(w http.ResponseWriter, r *http.Request)
		handleDeleteResourceQuota(w http.ResponseWriter, r *http.Request)
		handleCreateNamespace(w http.ResponseWriter, r *http.Request)
		handleDeleteNamespace(w http.ResponseWriter, r *http.Request)
		handleExecWebSocket(w http.ResponseWriter, r *http.Request)
		handleStartLogStream(w http.ResponseWriter, r *http.Request)
		handleStopLogStream(w http.ResponseWriter, r *http.Request)
		handleCreateSecret(w http.ResponseWriter, r *http.Request)
		handleUpdateSecret(w http.ResponseWriter, r *http.Request)
		handleDeleteSecret(w http.ResponseWriter, r *http.Request)
		handleGenerateRBACYAML(w http.ResponseWriter, r *http.Request)
		handleDryRunRBAC(w http.ResponseWriter, r *http.Request)
		handleApplyRBAC(w http.ResponseWriter, r *http.Request)
	})

	// Note: Middleware will be applied in the main API routing tier
	// This is a mechanical move, so we preserve existing middleware setup

	r.Post("/nodes/{nodeName}/cordon", server.handleCordonNode)
	r.Post("/nodes/{nodeName}/uncordon", server.handleUncordonNode)
	r.Post("/nodes/{nodeName}/drain", server.handleDrainNode)

	// Enhanced bulk actions endpoints
	r.Post("/actions/validate", server.handleValidateAction)
	r.Post("/actions/bulk", server.handleBulkAction)

	// Resource-specific bulk actions
	r.Post("/actions/pods", server.handlePodsBulkAction)
	r.Post("/actions/deployments", server.handleDeploymentsBulkAction)
	r.Post("/actions/services", server.handleServicesBulkAction)
	r.Post("/actions/configmaps", server.handleConfigMapsBulkAction)
	r.Post("/actions/secrets", server.handleSecretsBulkAction)

	// M5: Advanced write endpoints
	r.Post("/scale", server.handleScaleResource)
	r.Delete("/resources", server.handleDeleteResource)
	r.Delete("/resource-quotas/{namespace}/{name}", server.handleDeleteResourceQuota)
	r.Post("/namespaces", server.handleCreateNamespace)
	r.Delete("/namespaces/{namespace}", server.handleDeleteNamespace)
	r.Get("/exec/{sessionId}", server.handleExecWebSocket)
	r.Post("/logs/stream", server.handleStartLogStream)
	r.Delete("/logs/stream/{streamId}", server.handleStopLogStream)

	// Secrets management endpoints
	r.Post("/secrets", server.handleCreateSecret)
	r.Put("/secrets/{namespace}/{name}", server.handleUpdateSecret)
	r.Delete("/secrets/{namespace}/{name}", server.handleDeleteSecret)

	// RBAC builder endpoints
	r.Post("/rbac/generate", server.handleGenerateRBACYAML)
	r.Post("/rbac/dry-run", server.handleDryRunRBAC)
	r.Post("/rbac/apply", server.handleApplyRBAC)
}
