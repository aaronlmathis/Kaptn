package summaries

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/informers"
	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
)

// SummaryService provides resource summary data aggregation and caching
type SummaryService struct {
	logger      *zap.Logger
	kubeClient  kubernetes.Interface
	informerMgr *informers.Manager
	wsHub       *ws.Hub
	cache       *Cache
	config      *SummaryConfig

	// Background processing
	backgroundCtx    context.Context
	backgroundCancel context.CancelFunc
	backgroundMutex  sync.Mutex
	running          bool
}

// NewSummaryService creates a new summary service
func NewSummaryService(logger *zap.Logger, kubeClient kubernetes.Interface, informerMgr *informers.Manager, config *SummaryConfig) *SummaryService {
	if config == nil {
		config = DefaultSummaryConfig()
	}

	// Parse cache TTL configurations
	if err := config.ParseCacheTTLs(); err != nil {
		logger.Warn("Failed to parse cache TTL config, using defaults", zap.Error(err))
		config = DefaultSummaryConfig()
		config.ParseCacheTTLs()
	}

	backgroundCtx, backgroundCancel := context.WithCancel(context.Background())

	return &SummaryService{
		logger:           logger,
		kubeClient:       kubeClient,
		informerMgr:      informerMgr,
		cache:            NewCache(config.MaxCacheSize),
		config:           config,
		backgroundCtx:    backgroundCtx,
		backgroundCancel: backgroundCancel,
	}
}

// SetWebSocketHub sets the WebSocket hub for real-time updates
func (s *SummaryService) SetWebSocketHub(hub *ws.Hub) {
	s.wsHub = hub
}

// GetResourceSummary returns summary data for a specific resource type
func (s *SummaryService) GetResourceSummary(ctx context.Context, resource, namespace string) (*ResourceSummary, error) {
	// Check cache first
	cacheKey := GenerateCacheKey(resource, namespace)
	if cached, found := s.cache.Get(cacheKey); found {
		s.logger.Debug("Returning cached summary data",
			zap.String("resource", resource),
			zap.String("namespace", namespace))
		return cached, nil
	}

	// Cache miss - compute fresh summary
	s.logger.Debug("Computing fresh summary data",
		zap.String("resource", resource),
		zap.String("namespace", namespace))

	summary, err := s.computeResourceSummary(ctx, resource, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to compute summary for %s: %w", resource, err)
	}

	// Cache the result
	ttl := s.config.GetCacheTTL(resource)
	s.cache.Set(cacheKey, summary, ttl)

	return summary, nil
}

// InvalidateCache invalidates cached summaries for a resource type
func (s *SummaryService) InvalidateCache(resource, namespace string) {
	if namespace == "" {
		// Invalidate all instances of this resource type
		s.cache.InvalidatePattern(resource, "")
	} else {
		// Invalidate specific resource in namespace
		cacheKey := GenerateCacheKey(resource, namespace)
		s.cache.Invalidate(cacheKey)
	}

	s.logger.Debug("Invalidated summary cache",
		zap.String("resource", resource),
		zap.String("namespace", namespace))
}

// GetCacheStats returns cache performance statistics
func (s *SummaryService) GetCacheStats() map[string]interface{} {
	return s.cache.GetStats()
}

// StartBackgroundProcessing starts background summary refresh and WebSocket updates
func (s *SummaryService) StartBackgroundProcessing() {
	s.backgroundMutex.Lock()
	defer s.backgroundMutex.Unlock()

	if s.running {
		return
	}

	s.running = true

	if s.config.BackgroundRefresh {
		go s.backgroundRefreshLoop()
		s.logger.Info("Started background summary refresh")
	}

	// Setup event handlers for real-time invalidation
	s.setupInformerEventHandlers()

	s.logger.Info("Summary service background processing started")
}

// StopBackgroundProcessing stops background processing
func (s *SummaryService) StopBackgroundProcessing() {
	s.backgroundMutex.Lock()
	defer s.backgroundMutex.Unlock()

	if !s.running {
		return
	}

	s.backgroundCancel()
	s.running = false

	s.logger.Info("Summary service background processing stopped")
}

// computeResourceSummary computes summary data for a specific resource
func (s *SummaryService) computeResourceSummary(ctx context.Context, resource, namespace string) (*ResourceSummary, error) {
	startTime := time.Now()

	var cards []SummaryCard
	var err error

	// Route to specific computation function based on resource type
	switch resource {
	case "pods":
		cards, err = s.computePodSummary(ctx, namespace)
	case "nodes":
		cards, err = s.computeNodeSummary(ctx, namespace)
	case "deployments":
		cards, err = s.computeDeploymentSummary(ctx, namespace)
	case "services":
		cards, err = s.computeServiceSummary(ctx, namespace)
	case "replicasets":
		cards, err = s.computeReplicaSetSummary(ctx, namespace)
	case "statefulsets":
		cards, err = s.computeStatefulSetSummary(ctx, namespace)
	case "daemonsets":
		cards, err = s.computeDaemonSetSummary(ctx, namespace)
	case "configmaps":
		cards, err = s.computeConfigMapSummary(ctx, namespace)
	case "secrets":
		cards, err = s.computeSecretSummary(ctx, namespace)
	case "endpoints":
		cards, err = s.computeEndpointSummary(ctx, namespace)
	default:
		return nil, fmt.Errorf("unsupported resource type: %s", resource)
	}

	if err != nil {
		return nil, err
	}

	// Extract summary statistics from cards
	total := 0
	status := make(map[string]int)
	capacity := make(map[string]float64)
	usage := make(map[string]float64)
	activity := make(map[string]int)
	distribution := make(map[string]int)

	// Parse summary data from cards based on resource type
	if len(cards) > 0 {
		total = s.extractTotalFromCards(cards, resource)
		status = s.extractStatusFromCards(cards, resource)
		capacity = s.extractCapacityFromCards(cards, resource)
		usage = s.extractUsageFromCards(cards, resource)
		activity = s.extractActivityFromCards(cards, resource)
		distribution = s.extractDistributionFromCards(cards, resource)
	}

	summary := &ResourceSummary{
		Resource:     resource,
		Namespace:    namespace,
		Total:        total,
		Status:       status,
		Capacity:     capacity,
		Usage:        usage,
		Activity:     activity,
		Distribution: distribution,
		Cards:        cards,
		LastUpdated:  time.Now(),
		CacheHit:     false,
	}

	duration := time.Since(startTime)
	s.logger.Debug("Computed summary data",
		zap.String("resource", resource),
		zap.String("namespace", namespace),
		zap.Duration("duration", duration),
		zap.Int("cards", len(cards)))

	return summary, nil
}

// backgroundRefreshLoop periodically refreshes critical summaries
func (s *SummaryService) backgroundRefreshLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.backgroundCtx.Done():
			return
		case <-ticker.C:
			s.refreshCriticalSummaries()
		}
	}
}

// refreshCriticalSummaries pre-computes summaries for high-traffic resources
func (s *SummaryService) refreshCriticalSummaries() {
	criticalResources := s.config.RealtimeResources

	for _, resource := range criticalResources {
		// Refresh cluster-wide summary
		go s.precomputeSummary(resource, "")

		// Refresh per-namespace summaries for active namespaces
		activeNamespaces := s.getActiveNamespaces()
		for _, ns := range activeNamespaces {
			go s.precomputeSummary(resource, ns)
		}
	}
}

// precomputeSummary computes and caches a summary without returning it
func (s *SummaryService) precomputeSummary(resource, namespace string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := s.GetResourceSummary(ctx, resource, namespace)
	if err != nil {
		s.logger.Warn("Failed to precompute summary",
			zap.String("resource", resource),
			zap.String("namespace", namespace),
			zap.Error(err))
	}
}

// getActiveNamespaces returns a list of namespaces with recent activity
func (s *SummaryService) getActiveNamespaces() []string {
	// For now, return common active namespaces
	// TODO: Implement smart detection based on pod activity
	return []string{"default", "kube-system", "monitoring", "ingress-nginx"}
}

// setupInformerEventHandlers sets up event handlers for cache invalidation
func (s *SummaryService) setupInformerEventHandlers() {
	if s.informerMgr == nil {
		return
	}

	// Create summary event handler
	handler := NewSummaryEventHandler(s.logger, s, s.wsHub, s.config)

	// Add handlers for resources with informers
	s.informerMgr.AddPodEventHandler(handler)
	s.informerMgr.AddNodeEventHandler(handler)
	s.informerMgr.AddDeploymentEventHandler(handler)
	s.informerMgr.AddServiceEventHandler(handler)
	s.informerMgr.AddReplicaSetEventHandler(handler)
	s.informerMgr.AddStatefulSetEventHandler(handler)
	s.informerMgr.AddDaemonSetEventHandler(handler)
	s.informerMgr.AddConfigMapEventHandler(handler)
	s.informerMgr.AddSecretEventHandler(handler)
	s.informerMgr.AddEndpointEventHandler(handler)

	s.logger.Info("Setup summary event handlers for real-time cache invalidation")
}

// ClearAllCaches clears all cache entries
func (s *SummaryService) ClearAllCaches() {
	s.cache.Clear()
	s.logger.Info("All caches cleared")
}

// GetSummaryCards returns formatted summary cards for the dashboard
func (s *SummaryService) GetSummaryCards(ctx context.Context, namespace string) ([]*SummaryCard, error) {
	// Get summaries for key resource types that should appear as cards
	cardResourceTypes := []string{
		"pods", "nodes", "deployments", "services",
	}

	cards := make([]*SummaryCard, 0, len(cardResourceTypes))

	for _, resourceType := range cardResourceTypes {
		summary, err := s.GetResourceSummary(ctx, resourceType, namespace)
		if err != nil {
			s.logger.Warn("Failed to get summary for card",
				zap.String("resource", resourceType),
				zap.String("namespace", namespace),
				zap.Error(err))
			continue
		}

		card := s.summaryToCard(summary, resourceType)
		if card != nil {
			cards = append(cards, card)
		}
	}

	return cards, nil
}

// summaryToCard converts a ResourceSummary to a SummaryCard
func (s *SummaryService) summaryToCard(summary *ResourceSummary, resourceType string) *SummaryCard {
	if summary == nil {
		return nil
	}

	card := &SummaryCard{
		Title:       s.getCardTitle(resourceType),
		Description: s.getCardDescription(resourceType, summary),
		Count:       summary.Total,
		Healthy:     s.getHealthyCount(summary),
		Icon:        s.getCardIcon(resourceType),
		Color:       s.getCardColor(summary),
		Trend:       s.getCardTrend(summary),
		LastUpdated: summary.LastUpdated,
	}

	return card
}

// getCardTitle returns the display title for a resource type
func (s *SummaryService) getCardTitle(resourceType string) string {
	titles := map[string]string{
		"pods":         "Pods",
		"nodes":        "Nodes",
		"deployments":  "Deployments",
		"services":     "Services",
		"replicasets":  "ReplicaSets",
		"statefulsets": "StatefulSets",
		"daemonsets":   "DaemonSets",
		"configmaps":   "ConfigMaps",
		"secrets":      "Secrets",
		"endpoints":    "Endpoints",
	}

	if title, exists := titles[resourceType]; exists {
		return title
	}
	return resourceType
}

// getCardDescription returns a description for the card
func (s *SummaryService) getCardDescription(resourceType string, summary *ResourceSummary) string {
	switch resourceType {
	case "pods":
		if summary.Status != nil {
			if ready, exists := summary.Status["ready"]; exists && ready > 0 {
				return fmt.Sprintf("%d running", ready)
			}
		}
		return "Pod workloads"
	case "nodes":
		if summary.Capacity != nil {
			if cpu, exists := summary.Capacity["cpu"]; exists {
				return fmt.Sprintf("%.1f CPU cores", cpu)
			}
		}
		return "Cluster nodes"
	case "deployments":
		if summary.Status != nil {
			if available, exists := summary.Status["available"]; exists && available > 0 {
				return fmt.Sprintf("%d available", available)
			}
		}
		return "Application deployments"
	case "services":
		return "Network services"
	default:
		return fmt.Sprintf("%s resources", resourceType)
	}
}

// getHealthyCount returns the number of healthy resources
func (s *SummaryService) getHealthyCount(summary *ResourceSummary) int {
	if summary.Status == nil {
		return 0
	}

	// Try different status fields
	if ready, exists := summary.Status["ready"]; exists {
		return ready
	}
	if available, exists := summary.Status["available"]; exists {
		return available
	}
	if running, exists := summary.Status["running"]; exists {
		return running
	}

	return 0
}

// getCardIcon returns the icon for a resource type
func (s *SummaryService) getCardIcon(resourceType string) string {
	icons := map[string]string{
		"pods":         "box",
		"nodes":        "server",
		"deployments":  "layers",
		"services":     "network",
		"replicasets":  "copy",
		"statefulsets": "database",
		"daemonsets":   "grid",
		"configmaps":   "settings",
		"secrets":      "lock",
		"endpoints":    "link",
	}

	if icon, exists := icons[resourceType]; exists {
		return icon
	}
	return "box"
}

// getCardColor returns the color for a card based on health
func (s *SummaryService) getCardColor(summary *ResourceSummary) string {
	if summary.Total == 0 {
		return "gray"
	}

	healthy := s.getHealthyCount(summary)
	healthRatio := float64(healthy) / float64(summary.Total)

	if healthRatio >= 0.9 {
		return "green"
	} else if healthRatio >= 0.7 {
		return "yellow"
	} else {
		return "red"
	}
}

// getCardTrend returns trend information (placeholder for now)
func (s *SummaryService) getCardTrend(summary *ResourceSummary) map[string]interface{} {
	// TODO: Implement trend calculation based on historical data
	return map[string]interface{}{
		"direction":  "stable",
		"percentage": 0,
	}
}

// Helper methods to extract data from cards for backward compatibility

// extractTotalFromCards extracts total count from summary cards
func (s *SummaryService) extractTotalFromCards(cards []SummaryCard, resource string) int {
	if len(cards) == 0 {
		return 0
	}

	// Look for "Total" card or first card with a numeric value
	for _, card := range cards {
		if strings.Contains(strings.ToLower(card.Title), "total") {
			if count, err := strconv.Atoi(card.Value); err == nil {
				return count
			}
		}
	}

	// Fallback: try to parse first card value
	if count, err := strconv.Atoi(cards[0].Value); err == nil {
		return count
	}

	return 0
}

// extractStatusFromCards extracts status counts from summary cards
func (s *SummaryService) extractStatusFromCards(cards []SummaryCard, resource string) map[string]int {
	status := make(map[string]int)

	for _, card := range cards {
		title := strings.ToLower(card.Title)
		value := card.Value

		// Handle "ready vs notready" format
		if strings.Contains(title, "ready") && strings.Contains(value, "/") {
			parts := strings.Split(value, "/")
			if len(parts) == 2 {
				if ready, err := strconv.Atoi(parts[0]); err == nil {
					status["ready"] = ready
				}
				if total, err := strconv.Atoi(parts[1]); err == nil {
					status["notready"] = total - status["ready"]
				}
			}
		}

		// Handle "available" status
		if strings.Contains(title, "available") {
			if available, err := strconv.Atoi(value); err == nil {
				status["available"] = available
			}
		}

		// Handle running/pending states based on card status
		if card.Status == "healthy" {
			if count, err := strconv.Atoi(value); err == nil {
				status["running"] = count
			}
		}
	}

	return status
}

// extractCapacityFromCards extracts capacity information
func (s *SummaryService) extractCapacityFromCards(cards []SummaryCard, resource string) map[string]float64 {
	capacity := make(map[string]float64)

	if resource == "nodes" {
		for _, card := range cards {
			if strings.Contains(strings.ToLower(card.Title), "cpu") {
				// Try to extract CPU capacity from card subtitle or footer
				if card.Subtitle != "" {
					if cpu := extractCPUFromText(card.Subtitle); cpu > 0 {
						capacity["cpu"] = cpu
					}
				}
			}
		}
	}

	return capacity
}

// extractUsageFromCards extracts usage information
func (s *SummaryService) extractUsageFromCards(cards []SummaryCard, resource string) map[string]float64 {
	usage := make(map[string]float64)

	for _, card := range cards {
		title := strings.ToLower(card.Title)
		if strings.Contains(title, "avg") || strings.Contains(title, "usage") {
			if strings.Contains(title, "cpu") || strings.Contains(title, "memory") {
				// Extract average CPU/memory from value
				if cpu := extractCPUFromText(card.Value); cpu > 0 {
					usage["cpu"] = cpu
				}
				if memory := extractMemoryFromText(card.Value); memory > 0 {
					usage["memory"] = memory
				}
			}
		}
	}

	return usage
}

// extractActivityFromCards extracts activity information
func (s *SummaryService) extractActivityFromCards(cards []SummaryCard, resource string) map[string]int {
	activity := make(map[string]int)

	for _, card := range cards {
		title := strings.ToLower(card.Title)
		if strings.Contains(title, "24h") || strings.Contains(title, "recent") {
			if count, err := strconv.Atoi(card.Value); err == nil {
				activity["last24h"] = count
			}
		}
	}

	return activity
}

// extractDistributionFromCards extracts distribution information
func (s *SummaryService) extractDistributionFromCards(cards []SummaryCard, resource string) map[string]int {
	distribution := make(map[string]int)

	// This would be resource-specific logic for service types, etc.
	// For now, return empty map

	return distribution
}

// Helper functions for parsing text values

// extractCPUFromText extracts CPU value from text (in cores)
func extractCPUFromText(text string) float64 {
	// Look for patterns like "1.5" or "1500m"
	if strings.Contains(text, "m") {
		// Millicores
		re := regexp.MustCompile(`(\d+(?:\.\d+)?)m`)
		if matches := re.FindStringSubmatch(text); len(matches) > 1 {
			if value, err := strconv.ParseFloat(matches[1], 64); err == nil {
				return value / 1000 // Convert millicores to cores
			}
		}
	} else {
		// Cores
		re := regexp.MustCompile(`(\d+(?:\.\d+)?)`)
		if matches := re.FindStringSubmatch(text); len(matches) > 1 {
			if value, err := strconv.ParseFloat(matches[1], 64); err == nil {
				return value
			}
		}
	}
	return 0
}

// extractMemoryFromText extracts memory value from text (in bytes)
func extractMemoryFromText(text string) float64 {
	// Look for patterns like "1Gi", "512Mi", etc.
	re := regexp.MustCompile(`(\d+(?:\.\d+)?)(Gi|Mi|Ki|G|M|K)?`)
	if matches := re.FindStringSubmatch(text); len(matches) > 2 {
		if value, err := strconv.ParseFloat(matches[1], 64); err == nil {
			unit := strings.ToLower(matches[2])
			switch unit {
			case "gi", "g":
				return value * 1024 * 1024 * 1024
			case "mi", "m":
				return value * 1024 * 1024
			case "ki", "k":
				return value * 1024
			default:
				return value
			}
		}
	}
	return 0
}
