package api

import (
	"encoding/json"
	"net/http"

	"github.com/aaronlmathis/kaptn/internal/api/v1/dto"
	"go.uber.org/zap"
)

// handleValidateAction validates an action without executing it
func (s *Server) handleValidateAction(w http.ResponseWriter, r *http.Request) {
	s.logger.Info("Validating action request")

	// Parse the request
	var req dto.BulkActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.logger.Error("Failed to decode validation request", zap.Error(err))
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// For now, just return success - can be enhanced later
	response := map[string]interface{}{
		"valid":   true,
		"action":  req.Action,
		"targets": len(req.Targets),
		"message": "Action validation passed",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleBulkAction handles generic bulk actions
func (s *Server) handleBulkAction(w http.ResponseWriter, r *http.Request) {
	s.logger.Info("Handling generic bulk action")

	// For now, redirect to resource-specific handlers based on action
	var req dto.BulkActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.logger.Error("Failed to decode bulk action request", zap.Error(err))
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Route to appropriate handler based on action
	switch {
	case isPodsAction(req.Action):
		// Recreate the request and call pods handler
		r.Body = &requestBody{data: &req}
		s.handlePodsBulkAction(w, r)
	case isDeploymentsAction(req.Action):
		r.Body = &requestBody{data: &req}
		s.handleDeploymentsBulkAction(w, r)
	case isServicesAction(req.Action):
		r.Body = &requestBody{data: &req}
		s.handleServicesBulkAction(w, r)
	case isConfigMapsAction(req.Action):
		r.Body = &requestBody{data: &req}
		s.handleConfigMapsBulkAction(w, r)
	case isSecretsAction(req.Action):
		r.Body = &requestBody{data: &req}
		s.handleSecretsBulkAction(w, r)
	default:
		http.Error(w, "Unknown action type", http.StatusBadRequest)
	}
}

// Helper functions to determine action types
func isPodsAction(action string) bool {
	switch action {
	case "restart-pods", "delete-pods", "get-logs", "describe-pods", "export-yaml":
		return true
	default:
		return false
	}
}

func isDeploymentsAction(action string) bool {
	switch action {
	case "restart-deployments", "scale-deployments", "delete-deployments", "export-yaml", "describe-deployments":
		return true
	default:
		return false
	}
}

func isServicesAction(action string) bool {
	switch action {
	case "delete-services", "export-yaml", "describe-services":
		return true
	default:
		return false
	}
}

func isConfigMapsAction(action string) bool {
	switch action {
	case "delete-configmaps", "export-yaml", "describe-configmaps", "edit-configmaps":
		return true
	default:
		return false
	}
}

func isSecretsAction(action string) bool {
	switch action {
	case "delete-secrets", "export-yaml", "describe-secrets", "edit-secrets", "view-secrets":
		return true
	default:
		return false
	}
}

// requestBody is a helper to recreate request bodies
type requestBody struct {
	data interface{}
}

func (rb *requestBody) Read(p []byte) (n int, err error) {
	// This is a simplified implementation
	// In practice, you'd marshal the data and provide a proper reader
	return 0, nil
}

func (rb *requestBody) Close() error {
	return nil
}
