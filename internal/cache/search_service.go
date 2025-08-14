package cache

import (
	"context"
	"fmt"

	"go.uber.org/zap"
)

// SearchResult represents a search result
type SearchResult struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace,omitempty"`
	ResourceType string            `json:"resourceType"`
	Kind         string            `json:"kind"`
	URL          string            `json:"url"`
	Labels       map[string]string `json:"labels,omitempty"`
	CreationTime string            `json:"creationTimestamp,omitempty"`
	Age          string            `json:"age,omitempty"`
}

// SearchResponse represents the response from a search operation
type SearchResponse struct {
	Results []*SearchResult `json:"results"`
	Total   int             `json:"total"`
	Query   string          `json:"query"`
}

// SearchService provides search functionality over cached resources
type SearchService struct {
	logger *zap.Logger
	cache  *ResourceCache
}

// NewSearchService creates a new search service
func NewSearchService(logger *zap.Logger, cache *ResourceCache) *SearchService {
	return &SearchService{
		logger: logger,
		cache:  cache,
	}
}

// Search performs a search query against cached resources
func (ss *SearchService) Search(ctx context.Context, query string, resourceTypes []string, namespace string, limit int) (*SearchResponse, error) {
	if limit <= 0 {
		limit = 100 // Default limit
	}

	ss.logger.Debug("Performing search",
		zap.String("query", query),
		zap.Strings("resourceTypes", resourceTypes),
		zap.String("namespace", namespace),
		zap.Int("limit", limit))

	// Search the cache
	cacheResults, err := ss.cache.Search(query, resourceTypes, namespace, limit)
	if err != nil {
		return nil, fmt.Errorf("cache search failed: %w", err)
	}

	// Convert cache results to search results
	results := make([]*SearchResult, 0, len(cacheResults))
	for _, item := range cacheResults {
		result := &SearchResult{
			ID:           item.ID,
			Name:         item.Name,
			Namespace:    item.Namespace,
			ResourceType: item.ResourceType,
			Kind:         item.Kind,
			URL:          ss.generateResourceURL(item),
			Labels:       item.Labels,
			Age:          item.Age,
		}

		if !item.CreationTime.IsZero() {
			result.CreationTime = item.CreationTime.Format("2006-01-02T15:04:05Z")
		}

		results = append(results, result)
	}

	response := &SearchResponse{
		Results: results,
		Total:   len(results),
		Query:   query,
	}

	ss.logger.Debug("Search completed",
		zap.String("query", query),
		zap.Int("totalResults", len(results)))

	return response, nil
}

// generateResourceURL generates the frontend URL for a resource
func (ss *SearchService) generateResourceURL(item *ResourceCacheItem) string {
	switch item.ResourceType {
	case "pods":
		if item.Namespace != "" {
			return fmt.Sprintf("/pods/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/pods/%s", item.Name)
	case "deployments":
		if item.Namespace != "" {
			return fmt.Sprintf("/deployments/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/deployments/%s", item.Name)
	case "services":
		if item.Namespace != "" {
			return fmt.Sprintf("/services/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/services/%s", item.Name)
	case "configmaps":
		if item.Namespace != "" {
			return fmt.Sprintf("/config-maps/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/config-maps/%s", item.Name)
	case "secrets":
		if item.Namespace != "" {
			return fmt.Sprintf("/secrets/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/secrets/%s", item.Name)
	case "nodes":
		return fmt.Sprintf("/nodes/%s", item.Name)
	case "namespaces":
		return fmt.Sprintf("/namespaces/%s", item.Name)
	case "statefulsets":
		if item.Namespace != "" {
			return fmt.Sprintf("/statefulsets/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/statefulsets/%s", item.Name)
	case "daemonsets":
		if item.Namespace != "" {
			return fmt.Sprintf("/daemonsets/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/daemonsets/%s", item.Name)
	case "replicasets":
		if item.Namespace != "" {
			return fmt.Sprintf("/replicasets/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/replicasets/%s", item.Name)
	case "jobs":
		if item.Namespace != "" {
			return fmt.Sprintf("/k8s-jobs/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/k8s-jobs/%s", item.Name)
	case "cronjobs":
		if item.Namespace != "" {
			return fmt.Sprintf("/cronjobs/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/cronjobs/%s", item.Name)
	case "serviceaccounts":
		if item.Namespace != "" {
			return fmt.Sprintf("/service-accounts/%s/%s", item.Namespace, item.Name)
		}
		return fmt.Sprintf("/service-accounts/%s", item.Name)
	default:
		// Generic fallback
		if item.Namespace != "" {
			return fmt.Sprintf("/%s/%s/%s", item.ResourceType, item.Namespace, item.Name)
		}
		return fmt.Sprintf("/%s/%s", item.ResourceType, item.Name)
	}
}

// GetCacheStats returns statistics about the cache
func (ss *SearchService) GetCacheStats() map[string]interface{} {
	return ss.cache.GetStats()
}

// RefreshCache forces a cache refresh
func (ss *SearchService) RefreshCache(ctx context.Context) error {
	ss.logger.Info("Force refreshing search cache")
	return ss.cache.ForceRefresh(ctx)
}
