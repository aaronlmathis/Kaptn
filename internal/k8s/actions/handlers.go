package actions

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/aaronlmathis/kaptn/internal/k8s"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

// EnhancedActionHandlers provides HTTP handlers for the enhanced actions system
type EnhancedActionHandlers struct {
	logger      *zap.Logger
	coordinator *ActionCoordinator
}

// NewEnhancedActionHandlers creates new enhanced action handlers
func NewEnhancedActionHandlers(logger *zap.Logger, coordinator *ActionCoordinator) *EnhancedActionHandlers {
	return &EnhancedActionHandlers{
		logger:      logger,
		coordinator: coordinator,
	}
}

// BulkActionRequest represents a bulk action request from the frontend
type BulkActionRequest struct {
	Action       string                 `json:"action"`  // e.g., "restart-pods", "delete-deployments"
	Targets      []BulkActionTarget     `json:"targets"` // Resources to act upon
	Params       map[string]interface{} `json:"params,omitempty"`
	DryRun       bool                   `json:"dry_run"`
	ForceConfirm bool                   `json:"force_confirm"` // User confirmed destructive action
}

// BulkActionTarget represents a target resource for bulk actions
type BulkActionTarget struct {
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

// BulkActionResponse represents the response to a bulk action
type BulkActionResponse struct {
	Success              bool                   `json:"success"`
	RequestID            string                 `json:"request_id"`
	Message              string                 `json:"message"`
	ResourcesAffected    int                    `json:"resources_affected"`
	ResourcesTotal       int                    `json:"resources_total"`
	Details              map[string]interface{} `json:"details,omitempty"`
	RequiresConfirmation bool                   `json:"requires_confirmation,omitempty"`
	SafetyViolations     []SafetyViolation      `json:"safety_violations,omitempty"`
	Warnings             []string               `json:"warnings,omitempty"`
}

// RegisterRoutes registers the enhanced action routes
func (h *EnhancedActionHandlers) RegisterRoutes(r chi.Router) {
	r.Route("/api/v1/actions", func(r chi.Router) {
		r.Post("/bulk", h.HandleBulkAction)
		r.Post("/validate", h.HandleValidateAction)
		r.Get("/safety-config", h.HandleGetSafetyConfig)
	})
}

// HandleBulkAction handles bulk action requests
func (h *EnhancedActionHandlers) HandleBulkAction(w http.ResponseWriter, r *http.Request) {
	requestID := middleware.GetReqID(r.Context())

	h.logger.Info("Received bulk action request", zap.String("request_id", requestID))

	// Parse request
	var req BulkActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	// Validate request
	if err := h.validateBulkActionRequest(&req); err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, "Request validation failed", err.Error())
		return
	}

	// Get user context (from your existing auth middleware)
	user, err := h.getUserFromContext(r)
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, "Authentication required", err.Error())
		return
	}

	// Get impersonated clients from request context (set by middleware)
	impersonatedClients, err := h.getImpersonatedClientsFromContext(r)
	if err != nil {
		h.logger.Error("Failed to get impersonated clients", zap.Error(err))
		h.writeErrorResponse(w, http.StatusInternalServerError, "Failed to get user permissions", err.Error())
		return
	}

	// Convert to internal action request
	actionReq := h.convertToActionRequest(&req, user, requestID)

	// Execute the action
	result, err := h.coordinator.ExecuteAction(r.Context(), actionReq, impersonatedClients.Client())
	if err != nil {
		h.logger.Error("Action execution failed",
			zap.String("request_id", requestID),
			zap.String("action", req.Action),
			zap.Error(err))

		// Convert result to response even on error (it may contain useful info)
		response := h.convertToResponse(result, err)
		h.writeJSONResponse(w, http.StatusBadRequest, response)
		return
	}

	// Convert to response
	response := h.convertToResponse(result, nil)
	statusCode := http.StatusOK

	if result.RequiresConfirmation && !req.ForceConfirm {
		statusCode = http.StatusPreconditionRequired // 428
	}

	h.writeJSONResponse(w, statusCode, response)
}

// HandleValidateAction validates an action without executing it
func (h *EnhancedActionHandlers) HandleValidateAction(w http.ResponseWriter, r *http.Request) {
	// Similar to HandleBulkAction but only validate, don't execute
	var req BulkActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeErrorResponse(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	// Force dry run for validation
	req.DryRun = true

	user, err := h.getUserFromContext(r)
	if err != nil {
		h.writeErrorResponse(w, http.StatusUnauthorized, "Authentication required", err.Error())
		return
	}

	impersonatedClients, err := h.getImpersonatedClientsFromContext(r)
	if err != nil {
		h.writeErrorResponse(w, http.StatusInternalServerError, "Failed to get user permissions", err.Error())
		return
	}

	actionReq := h.convertToActionRequest(&req, user, middleware.GetReqID(r.Context()))
	result, _ := h.coordinator.ExecuteAction(r.Context(), actionReq, impersonatedClients.Client())

	response := h.convertToResponse(result, nil)
	h.writeJSONResponse(w, http.StatusOK, response)
}

// HandleGetSafetyConfig returns the current safety configuration
func (h *EnhancedActionHandlers) HandleGetSafetyConfig(w http.ResponseWriter, r *http.Request) {
	// This would get safety config from the coordinator's safety guard
	config := map[string]interface{}{
		"denied_namespaces": []string{
			"kube-system", "kube-public", "kube-node-lease",
			"monitoring", "prometheus", "grafana", "istio-system",
			"cert-manager", "ingress-nginx", "kaptn",
		},
		"destructive_actions_require_confirmation": true,
		"bulk_operation_limit":                     50,
		"production_mode":                          true,
	}

	h.writeJSONResponse(w, http.StatusOK, config)
}

// Helper methods

func (h *EnhancedActionHandlers) validateBulkActionRequest(req *BulkActionRequest) error {
	if req.Action == "" {
		return fmt.Errorf("action is required")
	}

	if len(req.Targets) == 0 {
		return fmt.Errorf("at least one target is required")
	}

	if len(req.Targets) > 50 {
		return fmt.Errorf("bulk operations are limited to 50 resources")
	}

	// Validate action is supported
	supportedActions := map[string]bool{
		"restart-pods":        true,
		"delete-pods":         true,
		"restart-deployments": true,
		"scale-deployments":   true,
		"delete-deployments":  true,
		"cordon-nodes":        true,
		"drain-nodes":         true,
		"delete-services":     true,
		"export-yaml":         true,
		"copy-names":          true,
	}

	if !supportedActions[req.Action] {
		return fmt.Errorf("unsupported action: %s", req.Action)
	}

	return nil
}

func (h *EnhancedActionHandlers) getUserFromContext(r *http.Request) (*UserContext, error) {
	// This should integrate with your existing auth middleware
	// For now, I'll create a simple structure

	// Extract from your existing context - adjust this to match your User type
	userCtx := r.Context().Value("user")
	if userCtx == nil {
		return nil, fmt.Errorf("no user in context")
	}

	// Convert to our UserContext - adjust based on your actual User struct
	user, ok := userCtx.(interface {
		GetEmail() string
		GetSubject() string
		GetGroups() []string
	})

	if !ok {
		return nil, fmt.Errorf("invalid user type in context")
	}

	return &UserContext{
		Email:   user.GetEmail(),
		Subject: user.GetSubject(),
		Groups:  user.GetGroups(),
	}, nil
}

func (h *EnhancedActionHandlers) convertToActionRequest(req *BulkActionRequest, user *UserContext, requestID string) *ActionRequest {
	// Map frontend action to backend verb and resource
	verb, resource := h.mapActionToVerbResource(req.Action)

	// Convert targets
	targets := make([]TargetResource, len(req.Targets))
	for i, target := range req.Targets {
		targets[i] = TargetResource{
			Namespace: target.Namespace,
			Name:      target.Name,
		}
	}

	return &ActionRequest{
		ID:           requestID,
		Action:       req.Action,
		Verb:         verb,
		Resource:     resource,
		Targets:      targets,
		Params:       req.Params,
		DryRun:       req.DryRun,
		User:         user.Email,
		UserGroups:   user.Groups,
		ForceConfirm: req.ForceConfirm,
	}
}

func (h *EnhancedActionHandlers) mapActionToVerbResource(action string) (string, string) {
	mapping := map[string]struct{ verb, resource string }{
		"restart-pods":        {"delete", "pods"},
		"delete-pods":         {"delete", "pods"},
		"restart-deployments": {"patch", "deployments"},
		"scale-deployments":   {"patch", "deployments"},
		"delete-deployments":  {"delete", "deployments"},
		"cordon-nodes":        {"patch", "nodes"},
		"drain-nodes":         {"patch", "nodes"},
		"delete-services":     {"delete", "services"},
		"export-yaml":         {"get", ""},  // Resource determined by context
		"copy-names":          {"list", ""}, // Non-destructive operation
	}

	if mapping, exists := mapping[action]; exists {
		return mapping.verb, mapping.resource
	}

	return "get", "unknown"
}

func (h *EnhancedActionHandlers) convertToResponse(result *ActionResult, err error) *BulkActionResponse {
	response := &BulkActionResponse{
		Success:              result.Success,
		RequestID:            result.ID,
		Message:              result.Message,
		ResourcesAffected:    result.ResourcesAffected,
		Details:              result.Details,
		RequiresConfirmation: result.RequiresConfirmation,
	}

	if result.SafetyResult != nil {
		response.SafetyViolations = result.SafetyResult.Violations
		response.Warnings = result.SafetyResult.Warnings
	}

	if err != nil && response.Message == "" {
		response.Message = err.Error()
	}

	// Calculate total from targets if available
	if targetsCount, ok := result.Details["target_count"].(int); ok {
		response.ResourcesTotal = targetsCount
	}

	return response
}

func (h *EnhancedActionHandlers) writeJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func (h *EnhancedActionHandlers) writeErrorResponse(w http.ResponseWriter, statusCode int, message, details string) {
	response := map[string]interface{}{
		"success": false,
		"error":   message,
	}
	if details != "" {
		response["details"] = details
	}

	h.writeJSONResponse(w, statusCode, response)
}

func (h *EnhancedActionHandlers) getImpersonatedClientsFromContext(r *http.Request) (*k8s.ImpersonatedClients, error) {
	clients, ok := k8s.ImpersonatedClientsFromContext(r.Context())
	if !ok {
		return nil, fmt.Errorf("no impersonated clients found in request context")
	}
	return clients, nil
}

// UserContext represents the user context for actions
type UserContext struct {
	Email   string   `json:"email"`
	Subject string   `json:"subject"`
	Groups  []string `json:"groups"`
}
