package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/k8s/actions"
	"github.com/aaronlmathis/kaptn/internal/k8s/resources"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

// Action handlers - Node operations, resource management, etc.

func (s *Server) handleCordonNode(w http.ResponseWriter, r *http.Request) {
	nodeName := chi.URLParam(r, "nodeName")
	requestID := middleware.GetReqID(r.Context())
	user, _ := getUserFromContext(r.Context())

	// Convert user to string for logging and service calls
	userStr := ""
	if user != nil {
		userStr = user.Email // or user.Subject, depending on what you want to log
	}

	s.logger.Info("Received cordon request",
		zap.String("requestId", requestID),
		zap.String("user", userStr),
		zap.String("node", nodeName))

	err := s.actionsService.CordonNode(r.Context(), requestID, userStr, nodeName)
	if err != nil {
		s.logger.Error("Failed to cordon node",
			zap.String("node", nodeName),
			zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUncordonNode(w http.ResponseWriter, r *http.Request) {
	nodeName := chi.URLParam(r, "nodeName")
	requestID := middleware.GetReqID(r.Context())
	user, _ := getUserFromContext(r.Context())

	// Convert user to string for logging and service calls
	userStr := ""
	if user != nil {
		userStr = user.Email // or user.Subject, depending on what you want to log
	}

	s.logger.Info("Received uncordon request",
		zap.String("requestId", requestID),
		zap.String("user", userStr),
		zap.String("node", nodeName))

	err := s.actionsService.UncordonNode(r.Context(), requestID, userStr, nodeName)
	if err != nil {
		s.logger.Error("Failed to uncordon node",
			zap.String("node", nodeName),
			zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDrainNode(w http.ResponseWriter, r *http.Request) {
	nodeName := chi.URLParam(r, "nodeName")
	requestID := middleware.GetReqID(r.Context())
	user, _ := getUserFromContext(r.Context())

	// Convert user to string for logging and service calls
	userStr := ""
	if user != nil {
		userStr = user.Email // or user.Subject, depending on what you want to log
	}

	s.logger.Info("Received drain request",
		zap.String("requestId", requestID),
		zap.String("user", userStr),
		zap.String("node", nodeName))

	// Parse drain options from request body
	var opts actions.DrainOptions
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&opts); err != nil {
			s.logger.Error("Failed to parse drain options", zap.Error(err))
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
	}

	jobID, err := s.actionsService.DrainNode(r.Context(), requestID, userStr, nodeName, opts)
	if err != nil {
		s.logger.Error("Failed to start drain operation",
			zap.String("node", nodeName),
			zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"jobId": jobID})
}

func (s *Server) handleListActionJobs(w http.ResponseWriter, r *http.Request) {
	jobs := s.actionsService.ListJobs()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"items": jobs,
			"total": len(jobs),
		},
	})
}

func (s *Server) handleGetActionJob(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobId")

	job, exists := s.actionsService.GetJob(jobID)
	if !exists {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

func (s *Server) handleApplyYAML(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	requestID := middleware.GetReqID(r.Context())
	user, _ := getUserFromContext(r.Context())

	// Convert user to string for logging and service calls
	userStr := ""
	if user != nil {
		userStr = user.Email // or user.Subject, depending on what you want to log
	}

	// Parse query parameters
	dryRun := r.URL.Query().Get("dryRun") == "true"
	force := r.URL.Query().Get("force") == "true"

	s.logger.Info("Received apply request",
		zap.String("requestId", requestID),
		zap.String("user", userStr),
		zap.String("namespace", namespace),
		zap.Bool("dryRun", dryRun),
		zap.Bool("force", force))

	// Read YAML content from request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		s.logger.Error("Failed to read request body", zap.Error(err))
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	yamlContent := string(body)
	if yamlContent == "" {
		s.logger.Error("Empty YAML content")
		http.Error(w, "Empty YAML content", http.StatusBadRequest)
		return
	}

	// Validate content type
	contentType := r.Header.Get("Content-Type")
	if contentType != "application/yaml" && contentType != "text/yaml" {
		s.logger.Warn("Unexpected content type", zap.String("contentType", contentType))
	}

	// Create apply options
	opts := actions.ApplyOptions{
		DryRun:    dryRun,
		Force:     force,
		Namespace: namespace,
	}

	// Apply the YAML
	result, err := s.applyService.ApplyYAML(r.Context(), requestID, userStr, yamlContent, opts)
	if err != nil {
		s.logger.Error("Failed to apply YAML",
			zap.String("requestId", requestID),
			zap.Error(err))

		// Check if it's a validation error (return 400) or server error (return 500)
		statusCode := http.StatusInternalServerError
		if result != nil && len(result.Errors) > 0 {
			// If we have structured errors, it's likely a validation issue
			statusCode = http.StatusBadRequest
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)

		if result != nil {
			json.NewEncoder(w).Encode(result)
		} else {
			json.NewEncoder(w).Encode(map[string]string{
				"error":   err.Error(),
				"success": "false",
			})
		}
		return
	}

	// Return successful result
	w.Header().Set("Content-Type", "application/json")
	if dryRun {
		w.WriteHeader(http.StatusOK)
	} else {
		if result.Success {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusBadRequest)
		}
	}

	json.NewEncoder(w).Encode(result)
}

func (s *Server) handleScaleResource(w http.ResponseWriter, r *http.Request) {
	var req resources.ScaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	err := s.resourceManager.ScaleResource(r.Context(), req)
	if err != nil {
		s.logger.Error("Failed to scale resource",
			zap.String("namespace", req.Namespace),
			zap.String("name", req.Name),
			zap.String("kind", req.Kind),
			zap.Int32("replicas", req.Replicas),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"success": "true"})
}

func (s *Server) handleDeleteResource(w http.ResponseWriter, r *http.Request) {
	var req resources.DeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	// Phase 7: Get security context for permission checking and audit logging
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		if secErr, ok := err.(*SecurityError); ok {
			s.writeSecurityError(w, secErr, nil)
		} else {
			http.Error(w, "Security context error", http.StatusInternalServerError)
		}
		return
	}

	// Convert Kind to lowercase resource name for RBAC check
	resourceName := strings.ToLower(req.Kind) + "s" // e.g., "Pod" -> "pods"
	if err := s.checkResourcePermission(r.Context(), secCtx, "delete", resourceName, req.Namespace, req.Name); err != nil {
		if secErr, ok := err.(*SecurityError); ok {
			s.writeSecurityError(w, secErr, secCtx.User)
		} else {
			http.Error(w, "Permission check failed", http.StatusInternalServerError)
		}
		return
	}

	err = s.resourceManager.DeleteResource(r.Context(), req)
	if err != nil {
		s.logger.Error("Failed to delete resource",
			zap.String("namespace", req.Namespace),
			zap.String("name", req.Name),
			zap.String("kind", req.Kind),
			zap.String("user", secCtx.User.Email),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Log successful deletion for audit
	s.logger.Info("Resource deleted successfully",
		zap.String("user", secCtx.User.Email),
		zap.String("user_sub", secCtx.User.Sub),
		zap.Strings("user_groups", secCtx.User.Groups),
		zap.String("namespace", req.Namespace),
		zap.String("name", req.Name),
		zap.String("kind", req.Kind))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"success": "true"})
}

func (s *Server) handleCreateNamespace(w http.ResponseWriter, r *http.Request) {
	var req resources.NamespaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	err := s.resourceManager.CreateNamespace(r.Context(), req)
	if err != nil {
		s.logger.Error("Failed to create namespace",
			zap.String("name", req.Name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"success": "true"})
}

func (s *Server) handleDeleteNamespace(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	if namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace is required"})
		return
	}

	err := s.resourceManager.DeleteNamespace(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to delete namespace",
			zap.String("namespace", namespace),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"success": "true"})
}

// ApplyConfigRequest represents the enhanced apply request for the Apply Config drawer
type ApplyConfigRequest struct {
	YAMLContent  string       `json:"yamlContent"`
	Files        []FileUpload `json:"files,omitempty"`
	Namespace    string       `json:"namespace,omitempty"`
	DryRun       bool         `json:"dryRun"`
	Force        bool         `json:"force"`
	Validate     bool         `json:"validate"`
	FieldManager string       `json:"fieldManager,omitempty"`
	ShowDiff     bool         `json:"showDiff"`
	ServerSide   bool         `json:"serverSide"`
}

// FileUpload represents an uploaded YAML file
type FileUpload struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// ApplyConfigResponse represents the enhanced apply response
type ApplyConfigResponse struct {
	Success          bool                     `json:"success"`
	Resources        []EnhancedResourceResult `json:"resources"`
	Errors           []ValidationError        `json:"errors,omitempty"`
	Warnings         []string                 `json:"warnings,omitempty"`
	Message          string                   `json:"message,omitempty"`
	Summary          *ApplySummary            `json:"summary,omitempty"`
	DangerousActions []DangerousAction        `json:"dangerousActions,omitempty"`
}

// EnhancedResourceResult extends ResourceResult with additional metadata
type EnhancedResourceResult struct {
	Name       string                 `json:"name"`
	Namespace  string                 `json:"namespace,omitempty"`
	Kind       string                 `json:"kind"`
	APIVersion string                 `json:"apiVersion"`
	Action     string                 `json:"action"` // "created", "updated", "unchanged", "error", "would-create", "would-update"
	Error      string                 `json:"error,omitempty"`
	Diff       map[string]interface{} `json:"diff,omitempty"`
	Source     string                 `json:"source,omitempty"` // "inline", "file:filename.yaml"
	Metadata   ResourceMetadata       `json:"metadata"`
	Status     string                 `json:"status"` // "success", "error", "warning"
	Links      []ResourceLink         `json:"links,omitempty"`
}

// ResourceMetadata contains extracted resource metadata
type ResourceMetadata struct {
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	CreatedAt   string            `json:"createdAt,omitempty"`
	OwnerRefs   []string          `json:"ownerRefs,omitempty"`
}

// ResourceLink represents a link to view the resource
type ResourceLink struct {
	Type string `json:"type"` // "view", "edit", "logs"
	URL  string `json:"url"`
	Text string `json:"text"`
}

// ValidationError represents a validation error with context
type ValidationError struct {
	Type       string `json:"type"` // "parsing", "schema", "conflict", "auth"
	Message    string `json:"message"`
	Field      string `json:"field,omitempty"`
	Resource   string `json:"resource,omitempty"`
	Line       int    `json:"line,omitempty"`
	Severity   string `json:"severity"` // "error", "warning"
	Suggestion string `json:"suggestion,omitempty"`
}

// ApplySummary provides an overview of the apply operation
type ApplySummary struct {
	TotalResources     int `json:"totalResources"`
	CreatedCount       int `json:"createdCount"`
	UpdatedCount       int `json:"updatedCount"`
	UnchangedCount     int `json:"unchangedCount"`
	ErrorCount         int `json:"errorCount"`
	NamespacedCount    int `json:"namespacedCount"`
	ClusterScopedCount int `json:"clusterScopedCount"`
}

// DangerousAction represents potentially destructive operations
type DangerousAction struct {
	Type         string `json:"type"` // "delete", "overwrite", "crd", "rbac"
	Resource     string `json:"resource"`
	Description  string `json:"description"`
	Risk         string `json:"risk"`         // "low", "medium", "high", "critical"
	Confirmation bool   `json:"confirmation"` // whether user confirmation is required
}

// handleApplyConfig handles POST /api/v1/apply - Enhanced apply for Apply Config drawer
// @Summary Apply Kubernetes configuration
// @Description Apply YAML configuration with support for multi-file apply, schema validation, diff preview, and more
// @Tags Apply
// @Accept json
// @Produce json
// @Param request body ApplyConfigRequest true "Apply configuration request"
// @Success 200 {object} ApplyConfigResponse "Apply operation completed"
// @Success 202 {object} ApplyConfigResponse "Apply operation accepted (async)"
// @Failure 400 {object} ApplyConfigResponse "Validation errors"
// @Failure 403 {object} map[string]string "Forbidden"
// @Failure 500 {object} ApplyConfigResponse "Internal server error"
// @Router /api/v1/apply [post]
func (s *Server) handleApplyConfig(w http.ResponseWriter, r *http.Request) {
	requestID := middleware.GetReqID(r.Context())
	user, _ := getUserFromContext(r.Context())

	// Convert user to string for logging and service calls
	userStr := ""
	if user != nil {
		userStr = user.Email
	}

	s.logger.Info("Received enhanced apply request",
		zap.String("requestId", requestID),
		zap.String("user", userStr))

	// Parse request body
	var req ApplyConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.logger.Error("Failed to parse apply request", zap.Error(err))
		s.respondWithError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Validate request
	if validationErrors := s.validateApplyRequest(&req); len(validationErrors) > 0 {
		response := &ApplyConfigResponse{
			Success: false,
			Errors:  validationErrors,
			Message: "Validation failed",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	s.logger.Info("Processing apply request",
		zap.String("requestId", requestID),
		zap.Bool("dryRun", req.DryRun),
		zap.Bool("force", req.Force),
		zap.Bool("validate", req.Validate),
		zap.String("namespace", req.Namespace),
		zap.Int("fileCount", len(req.Files)))

	// Process apply operation
	response := s.processApplyConfig(r.Context(), requestID, userStr, &req)

	// Set appropriate status code
	statusCode := http.StatusOK
	if !response.Success {
		statusCode = http.StatusBadRequest
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(response)
}

// validateApplyRequest validates the apply config request
func (s *Server) validateApplyRequest(req *ApplyConfigRequest) []ValidationError {
	var errors []ValidationError

	// Check if we have any content to apply
	hasContent := strings.TrimSpace(req.YAMLContent) != ""
	hasFiles := len(req.Files) > 0

	if !hasContent && !hasFiles {
		errors = append(errors, ValidationError{
			Type:     "validation",
			Message:  "No YAML content or files provided",
			Severity: "error",
		})
	}

	// Validate files if provided
	for i, file := range req.Files {
		if file.Name == "" {
			errors = append(errors, ValidationError{
				Type:     "validation",
				Message:  "File name is required",
				Resource: strconv.Itoa(i),
				Severity: "error",
			})
		}
		if strings.TrimSpace(file.Content) == "" {
			errors = append(errors, ValidationError{
				Type:     "validation",
				Message:  "File content cannot be empty",
				Resource: file.Name,
				Severity: "error",
			})
		}
		// Check file extension
		if !strings.HasSuffix(strings.ToLower(file.Name), ".yaml") &&
			!strings.HasSuffix(strings.ToLower(file.Name), ".yml") {
			errors = append(errors, ValidationError{
				Type:       "validation",
				Message:    "File must have .yaml or .yml extension",
				Resource:   file.Name,
				Severity:   "warning",
				Suggestion: "Rename file with .yaml or .yml extension",
			})
		}
	}

	// Validate field manager if provided
	if req.FieldManager != "" && len(req.FieldManager) > 128 {
		errors = append(errors, ValidationError{
			Type:     "validation",
			Message:  "Field manager name too long (max 128 characters)",
			Field:    "fieldManager",
			Severity: "error",
		})
	}

	return errors
}

// processApplyConfig processes the apply operation
func (s *Server) processApplyConfig(ctx context.Context, requestID, user string, req *ApplyConfigRequest) *ApplyConfigResponse {
	response := &ApplyConfigResponse{
		Success:   true,
		Resources: []EnhancedResourceResult{},
		Errors:    []ValidationError{},
		Warnings:  []string{},
		Summary:   &ApplySummary{},
	}

	// Collect all YAML content sources
	var yamlSources []struct {
		content string
		source  string
	}

	// Add inline content if provided
	if strings.TrimSpace(req.YAMLContent) != "" {
		yamlSources = append(yamlSources, struct {
			content string
			source  string
		}{
			content: req.YAMLContent,
			source:  "inline",
		})
	}

	// Add file contents
	for _, file := range req.Files {
		if strings.TrimSpace(file.Content) != "" {
			yamlSources = append(yamlSources, struct {
				content string
				source  string
			}{
				content: file.Content,
				source:  "file:" + file.Name,
			})
		}
	}

	// Process each YAML source
	for _, yamlSource := range yamlSources {
		s.logger.Info("Processing YAML source",
			zap.String("source", yamlSource.source),
			zap.String("requestId", requestID))

		// Create enhanced apply options
		opts := actions.ApplyOptions{
			DryRun:    req.DryRun,
			Force:     req.Force,
			Namespace: req.Namespace,
		}

		// Apply using existing service
		result, err := s.applyService.ApplyYAML(ctx, requestID, user, yamlSource.content, opts)
		if err != nil {
			s.logger.Error("Failed to apply YAML source",
				zap.String("source", yamlSource.source),
				zap.Error(err))

			response.Success = false
			response.Errors = append(response.Errors, ValidationError{
				Type:     "processing",
				Message:  err.Error(),
				Resource: yamlSource.source,
				Severity: "error",
			})
			continue
		}

		// Convert results to enhanced format
		for _, resource := range result.Resources {
			enhanced := s.convertToEnhancedResult(resource, yamlSource.source, req)
			response.Resources = append(response.Resources, enhanced)

			// Update summary counts
			response.Summary.TotalResources++
			switch enhanced.Action {
			case "created", "would-create":
				response.Summary.CreatedCount++
			case "updated", "would-update":
				response.Summary.UpdatedCount++
			case "unchanged":
				response.Summary.UnchangedCount++
			case "error":
				response.Summary.ErrorCount++
				response.Success = false
			}

			if enhanced.Namespace != "" {
				response.Summary.NamespacedCount++
			} else {
				response.Summary.ClusterScopedCount++
			}
		}

		// Add any errors from the apply result
		for _, errMsg := range result.Errors {
			response.Errors = append(response.Errors, ValidationError{
				Type:     "apply",
				Message:  errMsg,
				Resource: yamlSource.source,
				Severity: "error",
			})
			response.Success = false
		}
	}

	// Detect dangerous actions
	response.DangerousActions = s.detectDangerousActions(response.Resources)

	// Set response message
	if response.Success {
		if req.DryRun {
			response.Message = fmt.Sprintf("Dry run completed successfully for %d resources from %d sources",
				response.Summary.TotalResources, len(yamlSources))
		} else {
			response.Message = fmt.Sprintf("Successfully processed %d resources from %d sources",
				response.Summary.TotalResources, len(yamlSources))
		}
	} else {
		response.Message = fmt.Sprintf("Apply operation completed with %d errors", len(response.Errors))
	}

	return response
}

// convertToEnhancedResult converts a basic ResourceResult to EnhancedResourceResult
func (s *Server) convertToEnhancedResult(resource actions.ResourceResult, source string, req *ApplyConfigRequest) EnhancedResourceResult {
	enhanced := EnhancedResourceResult{
		Name:       resource.Name,
		Namespace:  resource.Namespace,
		Kind:       resource.Kind,
		APIVersion: resource.APIVersion,
		Action:     resource.Action,
		Error:      resource.Error,
		Diff:       resource.Diff,
		Source:     source,
		Metadata:   ResourceMetadata{},
		Status:     "success",
		Links:      []ResourceLink{},
	}

	// Adjust action for dry run
	if req.DryRun {
		switch resource.Action {
		case "created":
			enhanced.Action = "would-create"
		case "updated":
			enhanced.Action = "would-update"
		}
	}

	// Set status
	if resource.Error != "" {
		enhanced.Status = "error"
	}

	// Generate resource links
	enhanced.Links = s.generateResourceLinks(enhanced)

	return enhanced
}

// generateResourceLinks generates links to view/edit the resource
func (s *Server) generateResourceLinks(resource EnhancedResourceResult) []ResourceLink {
	var links []ResourceLink

	// Determine base URL for resource
	var baseURL string
	if resource.Namespace != "" {
		// Namespaced resource
		switch strings.ToLower(resource.Kind) {
		case "pod":
			baseURL = fmt.Sprintf("/pods/%s/%s", resource.Namespace, resource.Name)
		case "deployment":
			baseURL = fmt.Sprintf("/deployments/%s/%s", resource.Namespace, resource.Name)
		case "service":
			baseURL = fmt.Sprintf("/services/%s/%s", resource.Namespace, resource.Name)
		case "configmap":
			baseURL = fmt.Sprintf("/config-maps/%s/%s", resource.Namespace, resource.Name)
		default:
			// Generic namespaced resource
			baseURL = fmt.Sprintf("/namespaces/%s/%s/%s", resource.Namespace, strings.ToLower(resource.Kind), resource.Name)
		}
	} else {
		// Cluster-scoped resource
		switch strings.ToLower(resource.Kind) {
		case "node":
			baseURL = fmt.Sprintf("/nodes/%s", resource.Name)
		case "namespace":
			baseURL = fmt.Sprintf("/namespaces/%s", resource.Name)
		case "clusterrole":
			baseURL = fmt.Sprintf("/cluster-roles/%s", resource.Name)
		default:
			// Generic cluster-scoped resource
			baseURL = fmt.Sprintf("/%s/%s", strings.ToLower(resource.Kind), resource.Name)
		}
	}

	// Add view link
	if baseURL != "" {
		links = append(links, ResourceLink{
			Type: "view",
			URL:  baseURL,
			Text: "View Resource",
		})
	}

	// Add logs link for pods
	if strings.ToLower(resource.Kind) == "pod" && resource.Namespace != "" {
		links = append(links, ResourceLink{
			Type: "logs",
			URL:  fmt.Sprintf("/pods/%s/%s/logs", resource.Namespace, resource.Name),
			Text: "View Logs",
		})
	}

	return links
}

// detectDangerousActions identifies potentially dangerous operations
func (s *Server) detectDangerousActions(resources []EnhancedResourceResult) []DangerousAction {
	var dangerous []DangerousAction

	for _, resource := range resources {
		// Check for CRD operations
		if strings.ToLower(resource.Kind) == "customresourcedefinition" {
			dangerous = append(dangerous, DangerousAction{
				Type:         "crd",
				Resource:     fmt.Sprintf("%s/%s", resource.Kind, resource.Name),
				Description:  "Creating or modifying Custom Resource Definition",
				Risk:         "high",
				Confirmation: true,
			})
		}

		// Check for RBAC operations
		if strings.Contains(strings.ToLower(resource.Kind), "role") ||
			strings.Contains(strings.ToLower(resource.Kind), "binding") {
			dangerous = append(dangerous, DangerousAction{
				Type:         "rbac",
				Resource:     fmt.Sprintf("%s/%s", resource.Kind, resource.Name),
				Description:  "Modifying RBAC permissions",
				Risk:         "medium",
				Confirmation: true,
			})
		}

		// Check for namespace operations
		if strings.ToLower(resource.Kind) == "namespace" {
			dangerous = append(dangerous, DangerousAction{
				Type:         "namespace",
				Resource:     fmt.Sprintf("%s/%s", resource.Kind, resource.Name),
				Description:  "Creating or modifying namespace",
				Risk:         "medium",
				Confirmation: false,
			})
		}

		// Check for persistent volume operations
		if strings.ToLower(resource.Kind) == "persistentvolume" ||
			strings.ToLower(resource.Kind) == "persistentvolumeclaim" {
			dangerous = append(dangerous, DangerousAction{
				Type:         "storage",
				Resource:     fmt.Sprintf("%s/%s", resource.Kind, resource.Name),
				Description:  "Modifying persistent storage",
				Risk:         "high",
				Confirmation: true,
			})
		}
	}

	return dangerous
}

// respondWithError sends an error response
func (s *Server) respondWithError(w http.ResponseWriter, statusCode int, message string, err error) {
	response := map[string]interface{}{
		"success": false,
		"message": message,
	}

	if err != nil {
		response["error"] = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(response)
}
