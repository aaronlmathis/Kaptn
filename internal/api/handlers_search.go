package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"go.uber.org/zap"
)

// handleSearch handles the search endpoint
// @Summary Search resources
// @Description Search across all Kubernetes resources using cached data
// @Tags search
// @Accept json
// @Produce json
// @Param q query string true "Search query"
// @Param types query string false "Comma-separated list of resource types to filter by"
// @Param namespace query string false "Namespace to search within"
// @Param limit query int false "Maximum number of results to return" default(100)
// @Success 200 {object} map[string]interface{} "Search results"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/search [get]
func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	// Get query parameters
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		s.respondWithError(w, http.StatusBadRequest, "Query parameter 'q' is required", nil)
		return
	}

	// Parse resource types filter
	var resourceTypes []string
	if typesParam := strings.TrimSpace(r.URL.Query().Get("types")); typesParam != "" {
		resourceTypes = strings.Split(typesParam, ",")
		for i, t := range resourceTypes {
			resourceTypes[i] = strings.TrimSpace(t)
		}
	}

	// Parse namespace filter
	namespace := strings.TrimSpace(r.URL.Query().Get("namespace"))

	// Parse limit
	limit := 100 // Default limit
	if limitParam := strings.TrimSpace(r.URL.Query().Get("limit")); limitParam != "" {
		if parsedLimit, err := strconv.Atoi(limitParam); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}

	// Perform the search
	searchResponse, err := s.searchService.Search(r.Context(), query, resourceTypes, namespace, limit)
	if err != nil {
		s.logger.Error("Search failed",
			zap.String("query", query),
			zap.Strings("resourceTypes", resourceTypes),
			zap.String("namespace", namespace),
			zap.Error(err))
		s.respondWithError(w, http.StatusInternalServerError, "Search failed", err)
		return
	}

	s.logger.Debug("Search completed",
		zap.String("query", query),
		zap.Int("totalResults", searchResponse.Total),
		zap.Strings("resourceTypes", resourceTypes),
		zap.String("namespace", namespace))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"data":   searchResponse,
	})
}

// handleSearchStats handles the search cache statistics endpoint
// @Summary Get search cache statistics
// @Description Get statistics about the search cache including size and last refresh time
// @Tags search
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{} "Cache statistics"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/search/stats [get]
func (s *Server) handleSearchStats(w http.ResponseWriter, r *http.Request) {
	stats := s.searchService.GetCacheStats()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"data":   stats,
	})
}

// handleRefreshSearchCache handles the search cache refresh endpoint
// @Summary Refresh search cache
// @Description Force refresh of the search cache with latest resource data
// @Tags search
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{} "Refresh initiated"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/search/refresh [post]
func (s *Server) handleRefreshSearchCache(w http.ResponseWriter, r *http.Request) {
	err := s.searchService.RefreshCache(r.Context())
	if err != nil {
		s.logger.Error("Failed to refresh search cache", zap.Error(err))
		s.respondWithError(w, http.StatusInternalServerError, "Failed to refresh cache", err)
		return
	}

	s.logger.Info("Search cache refresh completed")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "success",
		"message": "Cache refreshed successfully",
	})
}
