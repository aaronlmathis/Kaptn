package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// handleGetSummaryCards returns summary cards for the dashboard
func (s *Server) handleGetSummaryCards(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get namespace from query parameters (optional)
	namespace := r.URL.Query().Get("namespace")

	// Get summary cards from summary service
	cards, err := s.summaryService.GetSummaryCards(ctx, namespace)
	if err != nil {
		s.logger.Error("Failed to get summary cards",
			zap.String("namespace", namespace),
			zap.Error(err))
		http.Error(w, "Failed to get summary cards", http.StatusInternalServerError)
		return
	}

	// Write response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"cards":     cards,
		"namespace": namespace,
	}); err != nil {
		s.logger.Error("Failed to encode summary cards response", zap.Error(err))
	}
}

// handleGetResourceSummary returns summary for a specific resource type
func (s *Server) handleGetResourceSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get resource type from URL path
	resourceType := chi.URLParam(r, "resource")
	if resourceType == "" {
		http.Error(w, "Resource type is required", http.StatusBadRequest)
		return
	}

	// Get namespace from query parameters (optional for cluster-wide summary)
	namespace := r.URL.Query().Get("namespace")

	// Get resource summary from summary service
	summary, err := s.summaryService.GetResourceSummary(ctx, resourceType, namespace)
	if err != nil {
		s.logger.Error("Failed to get resource summary",
			zap.String("resource", resourceType),
			zap.String("namespace", namespace),
			zap.Error(err))
		http.Error(w, "Failed to get resource summary", http.StatusInternalServerError)
		return
	}

	// Write response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(summary); err != nil {
		s.logger.Error("Failed to encode resource summary response", zap.Error(err))
	}
}

// handleGetNamespacedResourceSummary returns summary for a specific resource type in a namespace
func (s *Server) handleGetNamespacedResourceSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get parameters from URL path
	resourceType := chi.URLParam(r, "resource")
	namespace := chi.URLParam(r, "namespace")

	if resourceType == "" {
		http.Error(w, "Resource type is required", http.StatusBadRequest)
		return
	}

	if namespace == "" {
		http.Error(w, "Namespace is required", http.StatusBadRequest)
		return
	}

	// Get resource summary from summary service
	summary, err := s.summaryService.GetResourceSummary(ctx, resourceType, namespace)
	if err != nil {
		s.logger.Error("Failed to get namespaced resource summary",
			zap.String("resource", resourceType),
			zap.String("namespace", namespace),
			zap.Error(err))
		http.Error(w, "Failed to get resource summary", http.StatusInternalServerError)
		return
	}

	// Write response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(summary); err != nil {
		s.logger.Error("Failed to encode namespaced resource summary response", zap.Error(err))
	}
}
