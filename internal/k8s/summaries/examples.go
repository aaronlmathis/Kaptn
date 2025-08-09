package summaries

import (
	"context"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/informers"
	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
)

// ExampleIntegration shows how to integrate the summary service into your application
func ExampleIntegration(logger *zap.Logger, kubeClient kubernetes.Interface, router chi.Router, wsHub *ws.Hub) (*SummaryService, error) {
	// Create summary configuration
	config := &SummaryConfig{
		EnableWebSocketUpdates: true,
		RealtimeResources: []string{
			"pods", "nodes", "deployments", "services",
		},
		CacheTTL: map[string]string{
			"pods":         "30s",
			"nodes":        "60s",
			"deployments":  "30s",
			"services":     "60s",
			"replicasets":  "45s",
			"statefulsets": "45s",
			"daemonsets":   "45s",
			"configmaps":   "120s",
			"secrets":      "120s",
			"endpoints":    "60s",
		},
		MaxCacheSize:      1000,
		BackgroundRefresh: true,
	}

	// Initialize config (parse TTL strings)
	if err := config.Initialize(); err != nil {
		return nil, err
	}

	// Create informer manager (nil dynamic client for this example)
	informerMgr := informers.NewManager(logger, kubeClient, nil)

	// Create summary service
	summaryService := NewSummaryService(logger, kubeClient, informerMgr, config)

	// Create HTTP handler
	httpHandler := NewHTTPHandler(logger, summaryService)

	// Register routes
	httpHandler.RegisterRoutes(router)

	// Example: Add custom middleware for caching (optional)
	router.Use(httpHandler.WithCaching(30)) // 30 second cache headers

	// Start informers
	if err := informerMgr.Start(); err != nil {
		return nil, err
	}

	// Start background processing
	summaryService.StartBackgroundProcessing()

	logger.Info("Summary service integrated successfully",
		zap.Bool("websockets", config.EnableWebSocketUpdates),
		zap.Int("realtime_resources", len(config.RealtimeResources)),
		zap.Int("max_cache_size", config.MaxCacheSize))

	return summaryService, nil
}

// Example usage patterns for the summary service
func ExampleUsage(service *SummaryService) {
	ctx := context.Background()

	// Example 1: Get pod summary for default namespace
	podSummary, err := service.GetResourceSummary(ctx, "pods", "default")
	if err != nil {
		// Handle error
		return
	}

	// Use the summary data
	_ = podSummary.Total    // Total number of pods
	_ = podSummary.Status   // Status breakdown (ready, not ready, etc.)
	_ = podSummary.Activity // Activity metrics (created last 24h)
	_ = podSummary.Cards    // Formatted cards for UI display

	// Example 2: Get cluster-wide node summary
	nodeSummary, err := service.GetResourceSummary(ctx, "nodes", "")
	if err != nil {
		// Handle error
		return
	}

	// Use node capacity information
	_ = nodeSummary.Capacity // Cluster capacity (CPU, memory)
	_ = nodeSummary.Total    // Total number of nodes

	// Example 3: Get summary cards for dashboard
	cards, err := service.GetSummaryCards(ctx, "default")
	if err != nil {
		// Handle error
		return
	}

	// Use formatted cards in UI
	for _, card := range cards {
		_ = card.Title       // Display title
		_ = card.Count       // Numeric count
		_ = card.Healthy     // Healthy count
		_ = card.Color       // Health-based color
		_ = card.Icon        // Resource icon
		_ = card.Description // Description text
	}

	// Example 4: Cache management
	service.InvalidateCache("pods", "default") // Invalidate specific cache
	service.ClearAllCaches()                   // Clear all caches

	// Example 5: Get cache statistics
	stats := service.GetCacheStats()
	hitRate := stats["hit_rate"].(float64) // Cache hit percentage
	items := stats["items"].(int)          // Number of cached items
	_ = hitRate
	_ = items
}

// Example HTTP usage
func ExampleHTTPEndpoints() {
	// The following endpoints are available:

	// GET /api/v1/summaries
	// Returns summaries for all resource types
	// Query params: ?namespace=default (optional)

	// GET /api/v1/summaries/pods
	// Returns summary for pods
	// Query params: ?namespace=default (optional)

	// GET /api/v1/summaries/pods/namespaces/default
	// Returns summary for pods in specific namespace

	// GET /api/v1/summaries/cards
	// Returns formatted summary cards for dashboard
	// Query params: ?namespace=default (optional)

	// GET /api/v1/summaries/stats
	// Returns cache statistics

	// DELETE /api/v1/summaries/cache
	// Clears all caches

	// DELETE /api/v1/summaries/cache/pods
	// Clears cache for specific resource type
	// Query params: ?namespace=default (optional)
}

// Example WebSocket integration
func ExampleWebSocketUsage(wsHub *ws.Hub) {
	// Subscribe to summary updates for specific resource types
	// Room names follow the pattern: "summaries:{resource}" or "summaries:{resource}:{namespace}"

	// Subscribe to all pod updates
	// wsHub.JoinRoom(clientID, "summaries:pods")

	// Subscribe to pod updates in specific namespace
	// wsHub.JoinRoom(clientID, "summaries:pods:default")

	// Subscribe to node updates (cluster-wide)
	// wsHub.JoinRoom(clientID, "summaries:nodes")

	// Events received will have the structure:
	// {
	//   "type": "summaryUpdate",
	//   "action": "added|updated|deleted",
	//   "resource": "pods",
	//   "namespace": "default",
	//   "summary": { /* ResourceSummary object */ },
	//   "timestamp": "2024-01-01T00:00:00Z"
	// }
}

// Example configuration patterns
func ExampleConfigurations() *SummaryConfig {
	// Production configuration
	return &SummaryConfig{
		EnableWebSocketUpdates: true,
		RealtimeResources: []string{
			"pods", "nodes", "deployments", "services",
		},
		CacheTTL: map[string]string{
			"pods":        "30s",  // High update frequency
			"nodes":       "120s", // Stable resources
			"deployments": "45s",  // Moderate updates
			"services":    "90s",  // Moderate updates
			"configmaps":  "300s", // Low update frequency
			"secrets":     "300s", // Low update frequency
		},
		MaxCacheSize:      5000, // Large cluster support
		BackgroundRefresh: true, // Enable proactive refresh
	}

	// Development configuration
	// return &SummaryConfig{
	//     EnableWebSocketUpdates: false,
	//     RealtimeResources:      []string{"pods"},
	//     CacheTTL: map[string]string{
	//         "pods": "10s",
	//     },
	//     MaxCacheSize:      100,
	//     BackgroundRefresh: false,
	// }
}

// Example error handling patterns
func ExampleErrorHandling(service *SummaryService) {
	ctx := context.Background()

	// Handle timeout scenarios
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	summary, err := service.GetResourceSummary(ctx, "pods", "default")
	if err != nil {
		switch {
		case ctx.Err() == context.DeadlineExceeded:
			// Handle timeout
			// Log warning, return cached data if available
		case err.Error() == "unsupported resource type":
			// Handle unsupported resource
			// Return error to client
		default:
			// Handle other errors
			// Log error, return generic error response
		}
		return
	}

	// Use summary
	_ = summary
}
