package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// Metrics related handlers

func (s *Server) handleGetMetrics(w http.ResponseWriter, r *http.Request) {
	metrics, err := s.metricsService.GetClusterMetrics(r.Context())
	if err != nil {
		s.logger.Error("Failed to get cluster metrics", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(metrics)
}

func (s *Server) handleGetNamespaceMetrics(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	if namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace is required"})
		return
	}

	metrics, err := s.metricsService.GetNamespaceMetrics(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to get namespace metrics",
			zap.String("namespace", namespace),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(metrics)
}
