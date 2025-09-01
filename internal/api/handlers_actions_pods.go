package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/aaronlmathis/kaptn/internal/api/v1/dto"
	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/k8s/actions"
	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

// handlePodsBulkAction handles bulk actions for pods
func (s *Server) handlePodsBulkAction(w http.ResponseWriter, r *http.Request) {
	requestID := middleware.GetReqID(r.Context())

	// Parse the bulk action request
	var req dto.BulkActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.logger.Error("Failed to decode bulk action request", zap.Error(err))
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get user from context
	user, ok := getUserFromContext(r.Context())
	if !ok || user == nil {
		s.logger.Error("Failed to get user from context")
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Get impersonated client from context
	impersonatedClient, err := s.GetImpersonatedClient(r)
	if err != nil {
		s.logger.Error("Failed to get impersonated client", zap.Error(err))
		http.Error(w, "Failed to get user context", http.StatusInternalServerError)
		return
	}

	// Convert bulk request to action request
	actionReq := s.convertBulkToActionRequest(&req, user, requestID)

	// Execute the action through the coordinator
	result, err := s.actionCoordinator.ExecuteAction(r.Context(), actionReq, impersonatedClient)
	if err != nil {
		s.logger.Error("Failed to execute pods bulk action",
			zap.Error(err),
			zap.String("action", req.Action),
			zap.Int("target_count", len(req.Targets)))

		// Return error but include any result data
		response := s.convertActionResultToResponse(result, err, requestID, len(req.Targets))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	// Convert result to response
	response := s.convertActionResultToResponse(result, nil, requestID, len(req.Targets))
	statusCode := http.StatusOK

	if result.RequiresConfirmation && !req.ForceConfirm {
		statusCode = http.StatusPreconditionRequired // 428
	}

	// Return the result
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(response); err != nil {
		s.logger.Error("Failed to encode response", zap.Error(err))
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}
}

// convertBulkToActionRequest converts a bulk action request to an ActionRequest
func (s *Server) convertBulkToActionRequest(req *dto.BulkActionRequest, user *auth.User, requestID string) *actions.ActionRequest {
	// Convert targets to TargetResource format
	var targets []actions.TargetResource
	for _, target := range req.Targets {
		targets = append(targets, actions.TargetResource{
			Namespace: target.Namespace,
			Name:      target.Name,
		})
	}

	// Determine the resource type and verb from action
	resource, verb := parseAction(req.Action)

	return &actions.ActionRequest{
		ID:           requestID,
		Action:       req.Action,
		Verb:         verb,
		Resource:     resource,
		Targets:      targets,
		Params:       req.Params,
		DryRun:       req.DryRun,
		Timeout:      30 * time.Second, // Default timeout
		User:         user.Email,
		UserGroups:   user.Groups,
		ForceConfirm: req.ForceConfirm,
		Metadata: map[string]string{
			"request_id": requestID,
			"source":     "bulk_action",
		},
	}
}

// convertActionResultToResponse converts an ActionResult to BulkActionResponse
func (s *Server) convertActionResultToResponse(result *actions.ActionResult, err error, requestID string, totalTargets int) *dto.BulkActionResponse {
	response := &dto.BulkActionResponse{
		RequestID:      requestID,
		ResourcesTotal: totalTargets,
	}

	if result != nil {
		response.Success = result.Success
		response.Message = result.Message
		response.ResourcesAffected = result.ResourcesAffected
		response.Details = result.Details
		response.RequiresConfirmation = result.RequiresConfirmation

		// Extract safety violations if present
		if result.SafetyResult != nil {
			response.SafetyViolations = result.SafetyResult.Violations
		}
	}

	if err != nil {
		response.Success = false
		if response.Message == "" {
			response.Message = err.Error()
		}
	}

	return response
}

// parseAction extracts resource and verb from action string
func parseAction(action string) (resource, verb string) {
	// Map action strings to resource types and verbs
	switch action {
	case "restart-pods":
		return "pods", "update"
	case "delete-pods":
		return "pods", "delete"
	case "get-logs":
		return "pods", "get"
	case "describe-pods":
		return "pods", "get"
	case "export-yaml":
		return "pods", "get"
	case "restart-deployments":
		return "deployments", "update"
	case "scale-deployments":
		return "deployments", "update"
	case "delete-deployments":
		return "deployments", "delete"
	case "describe-deployments":
		return "deployments", "get"
	case "delete-services":
		return "services", "delete"
	case "describe-services":
		return "services", "get"
	case "delete-configmaps":
		return "configmaps", "delete"
	case "edit-configmaps":
		return "configmaps", "update"
	case "describe-configmaps":
		return "configmaps", "get"
	case "delete-secrets":
		return "secrets", "delete"
	case "edit-secrets":
		return "secrets", "update"
	case "view-secrets":
		return "secrets", "get"
	case "describe-secrets":
		return "secrets", "get"
	default:
		return "unknown", "unknown"
	}
}
