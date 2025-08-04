package api

import (
	"encoding/json"
	"io"
	"net/http"

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

	err := s.resourceManager.DeleteResource(r.Context(), req)
	if err != nil {
		s.logger.Error("Failed to delete resource",
			zap.String("namespace", req.Namespace),
			zap.String("name", req.Name),
			zap.String("kind", req.Kind),
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
