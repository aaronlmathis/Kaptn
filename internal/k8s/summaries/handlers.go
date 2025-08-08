package summaries

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// HTTPHandler handles HTTP requests for summaries
type HTTPHandler struct {
	logger  *zap.Logger
	service *SummaryService
}

// NewHTTPHandler creates a new summary HTTP handler
func NewHTTPHandler(logger *zap.Logger, service *SummaryService) *HTTPHandler {
	return &HTTPHandler{
		logger:  logger,
		service: service,
	}
}

// RegisterRoutes registers all summary routes with the given router
func (h *HTTPHandler) RegisterRoutes(r chi.Router) {
	r.Route("/api/v1/summaries", func(r chi.Router) {
		r.Get("/", h.GetAllSummaries)
		r.Get("/{resource}", h.GetResourceSummary)
		r.Get("/{resource}/namespaces/{namespace}", h.GetNamespacedResourceSummary)
		r.Get("/cards", h.GetSummaryCards)
		r.Get("/stats", h.GetCacheStats)
		r.Delete("/cache", h.ClearCache)
		r.Delete("/cache/{resource}", h.ClearResourceCache)
	})
}

// GetAllSummaries returns summaries for all resource types
func (h *HTTPHandler) GetAllSummaries(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	namespace := r.URL.Query().Get("namespace")

	// Get all resource types from config
	resourceTypes := []string{
		"pods", "nodes", "deployments", "services", "replicasets",
		"statefulsets", "daemonsets", "configmaps", "secrets", "endpoints",
	}

	summaries := make(map[string]*ResourceSummary)

	for _, resourceType := range resourceTypes {
		summary, err := h.service.GetResourceSummary(ctx, resourceType, namespace)
		if err != nil {
			h.logger.Warn("Failed to get summary",
				zap.String("resource", resourceType),
				zap.String("namespace", namespace),
				zap.Error(err))
			continue
		}
		summaries[resourceType] = summary
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"summaries": summaries,
		"timestamp": time.Now(),
		"namespace": namespace,
	})
}

// GetResourceSummary returns summary for a specific resource type
func (h *HTTPHandler) GetResourceSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	resourceType := chi.URLParam(r, "resource")
	namespace := r.URL.Query().Get("namespace")

	summary, err := h.service.GetResourceSummary(ctx, resourceType, namespace)
	if err != nil {
		h.logger.Error("Failed to get resource summary",
			zap.String("resource", resourceType),
			zap.String("namespace", namespace),
			zap.Error(err))
		h.writeError(w, http.StatusInternalServerError, "Failed to get summary", err)
		return
	}

	h.writeJSON(w, http.StatusOK, summary)
}

// GetNamespacedResourceSummary returns summary for a resource in a specific namespace
func (h *HTTPHandler) GetNamespacedResourceSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	resourceType := chi.URLParam(r, "resource")
	namespace := chi.URLParam(r, "namespace")

	summary, err := h.service.GetResourceSummary(ctx, resourceType, namespace)
	if err != nil {
		h.logger.Error("Failed to get namespaced resource summary",
			zap.String("resource", resourceType),
			zap.String("namespace", namespace),
			zap.Error(err))
		h.writeError(w, http.StatusInternalServerError, "Failed to get summary", err)
		return
	}

	h.writeJSON(w, http.StatusOK, summary)
}

// GetSummaryCards returns formatted summary cards for the dashboard
func (h *HTTPHandler) GetSummaryCards(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	namespace := r.URL.Query().Get("namespace")

	cards, err := h.service.GetSummaryCards(ctx, namespace)
	if err != nil {
		h.logger.Error("Failed to get summary cards",
			zap.String("namespace", namespace),
			zap.Error(err))
		h.writeError(w, http.StatusInternalServerError, "Failed to get summary cards", err)
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"cards":     cards,
		"timestamp": time.Now(),
		"namespace": namespace,
	})
}

// GetCacheStats returns cache statistics
func (h *HTTPHandler) GetCacheStats(w http.ResponseWriter, r *http.Request) {
	stats := h.service.GetCacheStats()
	h.writeJSON(w, http.StatusOK, stats)
}

// ClearCache clears all caches
func (h *HTTPHandler) ClearCache(w http.ResponseWriter, r *http.Request) {
	h.service.ClearAllCaches()
	h.logger.Info("All caches cleared via API")

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":   "All caches cleared",
		"timestamp": time.Now(),
	})
}

// ClearResourceCache clears cache for a specific resource type
func (h *HTTPHandler) ClearResourceCache(w http.ResponseWriter, r *http.Request) {
	resourceType := chi.URLParam(r, "resource")
	namespace := r.URL.Query().Get("namespace")

	h.service.InvalidateCache(resourceType, namespace)
	h.logger.Info("Resource cache cleared via API",
		zap.String("resource", resourceType),
		zap.String("namespace", namespace))

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":   "Resource cache cleared",
		"resource":  resourceType,
		"namespace": namespace,
		"timestamp": time.Now(),
	})
}

// writeJSON writes a JSON response
func (h *HTTPHandler) writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		h.logger.Error("Failed to encode JSON response", zap.Error(err))
	}
}

// writeError writes an error response
func (h *HTTPHandler) writeError(w http.ResponseWriter, status int, message string, err error) {
	h.logger.Error(message, zap.Error(err))

	errorResponse := map[string]interface{}{
		"error":     message,
		"status":    status,
		"timestamp": time.Now(),
	}

	h.writeJSON(w, status, errorResponse)
}

// Additional middleware can be added here

// WithCaching adds cache headers to responses
func (h *HTTPHandler) WithCaching(maxAge int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Set cache headers for GET requests
			if r.Method == http.MethodGet {
				w.Header().Set("Cache-Control", "public, max-age="+strconv.Itoa(maxAge))
				w.Header().Set("Vary", "Accept-Encoding")
			}

			next.ServeHTTP(w, r)
		})
	}
}

// WithRateLimit adds basic rate limiting (placeholder - would need proper implementation)
func (h *HTTPHandler) WithRateLimit() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// TODO: Implement rate limiting if needed
			next.ServeHTTP(w, r)
		})
	}
}
