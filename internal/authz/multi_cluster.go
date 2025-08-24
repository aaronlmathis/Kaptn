package authz

import (
	"context"
	"fmt"
	"sync"

	"go.uber.org/zap"
	authorizationv1 "k8s.io/api/authorization/v1"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/kubernetes"
)

// MultiClusterAuthzService handles authorization across multiple clusters
type MultiClusterAuthzService struct {
	logger            *zap.Logger
	clusterClients    map[string]kubernetes.Interface
	clusterDiscovery  map[string]discovery.DiscoveryInterface
	clusterCRDs       map[string]*CRDDiscoveryService
	clusterCapService map[string]*CapabilityService
	mutex             sync.RWMutex
}

// NewMultiClusterAuthzService creates a new multi-cluster authorization service
func NewMultiClusterAuthzService(logger *zap.Logger) *MultiClusterAuthzService {
	return &MultiClusterAuthzService{
		logger:            logger.Named("multi-cluster-authz"),
		clusterClients:    make(map[string]kubernetes.Interface),
		clusterDiscovery:  make(map[string]discovery.DiscoveryInterface),
		clusterCRDs:       make(map[string]*CRDDiscoveryService),
		clusterCapService: make(map[string]*CapabilityService),
	}
}

// AddCluster registers a new cluster for authorization
func (mcas *MultiClusterAuthzService) AddCluster(clusterID string, client kubernetes.Interface) error {
	mcas.mutex.Lock()
	defer mcas.mutex.Unlock()

	mcas.logger.Info("Adding cluster to multi-cluster authorization service",
		zap.String("cluster_id", clusterID))

	// Store client
	mcas.clusterClients[clusterID] = client

	// Create discovery client
	discoveryClient := client.Discovery()
	mcas.clusterDiscovery[clusterID] = discoveryClient

	// Create CRD discovery service for this cluster
	crdService := NewCRDDiscoveryService(mcas.logger, client, discoveryClient)
	mcas.clusterCRDs[clusterID] = crdService

	// Create capability service for this cluster
	capService := NewCapabilityService(mcas.logger, 0) // Use default TTL
	mcas.clusterCapService[clusterID] = capService

	// Start auto-refresh for CRDs in background
	go crdService.StartAutoRefresh(context.Background())

	mcas.logger.Info("Successfully added cluster",
		zap.String("cluster_id", clusterID))

	return nil
}

// RemoveCluster removes a cluster from authorization
func (mcas *MultiClusterAuthzService) RemoveCluster(clusterID string) {
	mcas.mutex.Lock()
	defer mcas.mutex.Unlock()

	mcas.logger.Info("Removing cluster from multi-cluster authorization service",
		zap.String("cluster_id", clusterID))

	// Clean up services
	if capService, exists := mcas.clusterCapService[clusterID]; exists {
		capService.Close()
	}

	// Remove from maps
	delete(mcas.clusterClients, clusterID)
	delete(mcas.clusterDiscovery, clusterID)
	delete(mcas.clusterCRDs, clusterID)
	delete(mcas.clusterCapService, clusterID)

	mcas.logger.Info("Successfully removed cluster",
		zap.String("cluster_id", clusterID))
}

// CheckCapabilities checks capabilities for a specific cluster
func (mcas *MultiClusterAuthzService) CheckCapabilities(
	ctx context.Context,
	clusterID string,
	req CapabilityRequest,
	userID string,
	groups []string,
) (CapabilityResult, error) {
	mcas.mutex.RLock()
	client, clientExists := mcas.clusterClients[clusterID]
	capService, serviceExists := mcas.clusterCapService[clusterID]
	crdService, crdExists := mcas.clusterCRDs[clusterID]
	mcas.mutex.RUnlock()

	if !clientExists || !serviceExists || !crdExists {
		return CapabilityResult{}, fmt.Errorf("cluster %s not found or not configured", clusterID)
	}

	// Ensure CRDs are refreshed if needed
	if crdService.ShouldRefresh() {
		mcas.logger.Debug("Refreshing CRDs for cluster", zap.String("cluster_id", clusterID))
		if err := crdService.RefreshCRDs(ctx); err != nil {
			mcas.logger.Warn("Failed to refresh CRDs for cluster",
				zap.String("cluster_id", clusterID),
				zap.Error(err))
		}
	}

	// Use the enhanced capability service with CRD support
	return mcas.checkCapabilitiesWithCRDs(ctx, client, capService, crdService, req, userID, groups)
}

// checkCapabilitiesWithCRDs performs capability checking with CRD support
func (mcas *MultiClusterAuthzService) checkCapabilitiesWithCRDs(
	ctx context.Context,
	client kubernetes.Interface,
	capService *CapabilityService,
	crdService *CRDDiscoveryService,
	req CapabilityRequest,
	userID string,
	groups []string,
) (CapabilityResult, error) {
	// Create a custom capability service that knows about CRDs
	return mcas.processCapabilitiesWithCRDSupport(ctx, client, capService, crdService, req, userID, groups)
}

// processCapabilitiesWithCRDSupport processes capabilities using both static and dynamic registries
func (mcas *MultiClusterAuthzService) processCapabilitiesWithCRDSupport(
	ctx context.Context,
	client kubernetes.Interface,
	capService *CapabilityService,
	crdService *CRDDiscoveryService,
	req CapabilityRequest,
	userID string,
	groups []string,
) (CapabilityResult, error) {
	traceID := generateTraceID()

	// Update metrics
	capService.updateMetrics(func(m *PerformanceMetrics) {
		m.TotalRequests++
	})

	// Create cache key
	cacheKey := capService.createCacheKey(userID, groups, req)

	// Check cache first
	if cachedResult := capService.getCachedResult(cacheKey); cachedResult != nil {
		capService.updateMetrics(func(m *PerformanceMetrics) {
			m.CacheHits++
		})
		return *cachedResult, nil
	}

	capService.updateMetrics(func(m *PerformanceMetrics) {
		m.CacheMisses++
	})

	// Build SSAR requests using both static and dynamic registries
	ssars, capabilityIndex, err := mcas.buildBatchSSARWithCRDs(req.Features, req.Namespace, req.ResourceNames, crdService)
	if err != nil {
		return CapabilityResult{}, fmt.Errorf("failed to build SSAR requests: %w", err)
	}

	if len(ssars) == 0 {
		return CapabilityResult{Caps: make(map[string]bool)}, nil
	}

	// Use enhanced batch evaluation
	allowed, reasons, err := capService.evaluateBatchSSARWithPool(ctx, client, ssars, traceID)
	if err != nil {
		return CapabilityResult{}, fmt.Errorf("failed to evaluate capabilities: %w", err)
	}

	// Build result
	result := CapabilityResult{
		Caps:    make(map[string]bool, len(capabilityIndex)),
		Reasons: make(map[string]string),
	}

	for i, capability := range capabilityIndex {
		result.Caps[capability] = allowed[i]
		if !allowed[i] && reasons[i] != "" {
			result.Reasons[capability] = reasons[i]
		}
	}

	// Cache the result
	capService.cacheResult(cacheKey, result)

	return result, nil
}

// buildBatchSSARWithCRDs builds SSAR requests using both static and dynamic capability registries
func (mcas *MultiClusterAuthzService) buildBatchSSARWithCRDs(
	features []string,
	namespace string,
	resourceNames map[string]string,
	crdService *CRDDiscoveryService,
) ([]authorizationv1.SelfSubjectAccessReview, []string, error) {
	var ssars []authorizationv1.SelfSubjectAccessReview
	var capabilityIndex []string

	for _, feature := range features {
		// Try to get capability from CRD service (which checks both static and dynamic)
		def, exists := crdService.GetCapabilityCheck(feature)
		if !exists {
			mcas.logger.Debug("Unknown capability requested", zap.String("capability", feature))
			continue
		}

		// Determine resource name for object-level checks
		var resourceName string
		if resourceNames != nil {
			resourceName = resourceNames[feature]
		}

		// Build SSAR
		ssar := BuildSSAR(def, namespace, resourceName)
		ssars = append(ssars, ssar)
		capabilityIndex = append(capabilityIndex, feature)
	}

	return ssars, capabilityIndex, nil
}

// GetClusterCapabilities returns all capabilities for a specific cluster
func (mcas *MultiClusterAuthzService) GetClusterCapabilities(clusterID string) ([]string, error) {
	mcas.mutex.RLock()
	crdService, exists := mcas.clusterCRDs[clusterID]
	mcas.mutex.RUnlock()

	if !exists {
		return nil, fmt.Errorf("cluster %s not found", clusterID)
	}

	return crdService.GetAllCapabilities(), nil
}

// GetClusterStats returns statistics for all clusters
func (mcas *MultiClusterAuthzService) GetClusterStats() map[string]interface{} {
	mcas.mutex.RLock()
	defer mcas.mutex.RUnlock()

	stats := make(map[string]interface{})
	clusterStats := make(map[string]interface{})

	for clusterID, crdService := range mcas.clusterCRDs {
		clusterInfo := make(map[string]interface{})

		// Get CRD stats
		clusterInfo["crd_discovery"] = crdService.GetStats()

		// Get capability service stats
		if capService, exists := mcas.clusterCapService[clusterID]; exists {
			clusterInfo["capability_service"] = capService.GetCacheStats()
		}

		clusterStats[clusterID] = clusterInfo
	}

	stats["clusters"] = clusterStats
	stats["total_clusters"] = len(mcas.clusterClients)

	return stats
}

// GetRegisteredClusters returns a list of registered cluster IDs
func (mcas *MultiClusterAuthzService) GetRegisteredClusters() []string {
	mcas.mutex.RLock()
	defer mcas.mutex.RUnlock()

	clusters := make([]string, 0, len(mcas.clusterClients))
	for clusterID := range mcas.clusterClients {
		clusters = append(clusters, clusterID)
	}

	return clusters
}

// RefreshAllCRDs refreshes CRDs for all registered clusters
func (mcas *MultiClusterAuthzService) RefreshAllCRDs(ctx context.Context) error {
	mcas.mutex.RLock()
	crdServices := make(map[string]*CRDDiscoveryService)
	for clusterID, service := range mcas.clusterCRDs {
		crdServices[clusterID] = service
	}
	mcas.mutex.RUnlock()

	var firstError error
	for clusterID, crdService := range crdServices {
		if err := crdService.RefreshCRDs(ctx); err != nil {
			mcas.logger.Error("Failed to refresh CRDs for cluster",
				zap.String("cluster_id", clusterID),
				zap.Error(err))
			if firstError == nil {
				firstError = err
			}
		}
	}

	return firstError
}

// Close shuts down all cluster services
func (mcas *MultiClusterAuthzService) Close() {
	mcas.mutex.Lock()
	defer mcas.mutex.Unlock()

	for clusterID, capService := range mcas.clusterCapService {
		mcas.logger.Debug("Closing capability service for cluster", zap.String("cluster_id", clusterID))
		capService.Close()
	}

	mcas.logger.Info("Multi-cluster authorization service shut down")
}
