package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// Metrics related handlers

func (s *Server) HandleGetMetrics(w http.ResponseWriter, r *http.Request) {
	metrics, err := s.metricsService.GetClusterMetrics(r.Context())
	if err != nil {
		s.logger.Error("Failed to get cluster metrics", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Enhance response with logs cache health
	response := map[string]interface{}{
		"cluster":    metrics,
		"timestamp":  time.Now(),
		"logs_cache": s.getLogsCacheHealth(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func (s *Server) HandleGetNamespaceMetrics(w http.ResponseWriter, r *http.Request) {
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

// getLogsCacheHealth returns logs cache health and statistics
func (s *Server) getLogsCacheHealth() map[string]interface{} {
	if s.logsCacheService == nil {
		return map[string]interface{}{
			"status":  "unavailable",
			"message": "logs cache service not initialized",
		}
	}

	// Get service statistics
	stats := s.logsCacheService.Stats()
	health := s.logsCacheService.Health()

	return map[string]interface{}{
		"status":  health.Status,
		"started": health.Started,
		"uptime":  health.Uptime.String(),
		"checks":  health.Checks,
		"statistics": map[string]interface{}{
			"global_ring_size":      stats.GlobalRingSize,
			"scoped_rings_count":    stats.ScopedRingsCount,
			"total_subscribers":     stats.TotalSubscribers,
			"ingest_rate":           stats.IngestRate,
			"last_ingest_time":      stats.LastIngestTime,
			"evictions_total":       stats.EvictionsTotal,
			"dropped_entries_total": stats.DroppedEntriesTotal,
		},
		"prometheus_metrics_enabled": true,
	}
}
