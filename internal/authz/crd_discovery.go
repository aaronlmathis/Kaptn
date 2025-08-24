package authz

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/kubernetes"
)

// CRDDiscoveryService handles dynamic CRD discovery and capability registration
type CRDDiscoveryService struct {
	logger          *zap.Logger
	discoveryClient discovery.DiscoveryInterface
	kubeClient      kubernetes.Interface
	dynamicRegistry map[string]CapabilityCheck
	mutex           sync.RWMutex
	lastRefresh     time.Time
	refreshInterval time.Duration
}

// NewCRDDiscoveryService creates a new CRD discovery service
func NewCRDDiscoveryService(
	logger *zap.Logger,
	kubeClient kubernetes.Interface,
	discoveryClient discovery.DiscoveryInterface,
) *CRDDiscoveryService {
	return &CRDDiscoveryService{
		logger:          logger.Named("crd-discovery"),
		kubeClient:      kubeClient,
		discoveryClient: discoveryClient,
		dynamicRegistry: make(map[string]CapabilityCheck),
		refreshInterval: 5 * time.Minute, // Refresh CRDs every 5 minutes
	}
}

// RefreshCRDs discovers and registers capabilities for all CRDs in the cluster
func (cds *CRDDiscoveryService) RefreshCRDs(ctx context.Context) error {
	cds.mutex.Lock()
	defer cds.mutex.Unlock()

	cds.logger.Debug("Starting CRD discovery and registration using API discovery")

	// Get all API resources using discovery client
	apiResourceLists, err := cds.discoveryClient.ServerPreferredResources()
	if err != nil {
		cds.logger.Error("Failed to discover API resources", zap.Error(err))
		return fmt.Errorf("failed to discover API resources: %w", err)
	}

	newRegistry := make(map[string]CapabilityCheck)
	crdCount := 0

	for _, apiResourceList := range apiResourceLists {
		gv, err := schema.ParseGroupVersion(apiResourceList.GroupVersion)
		if err != nil {
			cds.logger.Debug("Failed to parse group version",
				zap.String("group_version", apiResourceList.GroupVersion),
				zap.Error(err))
			continue
		}

		// Skip core Kubernetes groups - we handle these in static registry
		if cds.isCoreKubernetesGroup(gv.Group) {
			continue
		}

		for _, apiResource := range apiResourceList.APIResources {
			// Skip sub-resources (like logs, exec, etc.)
			if strings.Contains(apiResource.Name, "/") {
				continue
			}

			// Skip if resource doesn't support standard verbs
			if !cds.hasStandardVerbs(apiResource) {
				continue
			}

			capabilities := cds.generateCapabilitiesForAPIResource(gv.Group, apiResource)
			for capKey, capCheck := range capabilities {
				newRegistry[capKey] = capCheck
			}
			crdCount++
		}
	}

	// Replace the entire dynamic registry
	cds.dynamicRegistry = newRegistry
	cds.lastRefresh = time.Now()

	cds.logger.Info("CRD discovery completed using API discovery",
		zap.Int("custom_resources_found", crdCount),
		zap.Int("capabilities_registered", len(newRegistry)))

	return nil
}

// isCoreKubernetesGroup checks if a group is part of core Kubernetes
func (cds *CRDDiscoveryService) isCoreKubernetesGroup(group string) bool {
	coreGroups := map[string]bool{
		"":                             true, // core group
		"apps":                         true,
		"batch":                        true,
		"networking.k8s.io":            true,
		"storage.k8s.io":               true,
		"rbac.authorization.k8s.io":    true,
		"autoscaling":                  true,
		"policy":                       true,
		"scheduling.k8s.io":            true,
		"admissionregistration.k8s.io": true,
		"metrics.k8s.io":               true,
		"apiextensions.k8s.io":         true,
		"authentication.k8s.io":        true,
		"authorization.k8s.io":         true,
		"certificates.k8s.io":          true,
		"coordination.k8s.io":          true,
		"discovery.k8s.io":             true,
		"events.k8s.io":                true,
		"flowcontrol.apiserver.k8s.io": true,
		"node.k8s.io":                  true,
	}
	return coreGroups[group]
}

// hasStandardVerbs checks if the API resource supports standard CRUD verbs
func (cds *CRDDiscoveryService) hasStandardVerbs(apiResource metav1.APIResource) bool {
	verbSet := make(map[string]bool)
	for _, verb := range apiResource.Verbs {
		verbSet[verb] = true
	}

	// Require at least get and list to be considered a manageable resource
	return verbSet["get"] && verbSet["list"]
}

// generateCapabilitiesForAPIResource creates capability mappings for an API resource
func (cds *CRDDiscoveryService) generateCapabilitiesForAPIResource(group string, apiResource metav1.APIResource) map[string]CapabilityCheck {
	capabilities := make(map[string]CapabilityCheck)

	// Create a safe capability key prefix from the resource name
	capabilityPrefix := strings.ToLower(apiResource.Name)

	// Generate capabilities for each supported verb
	for _, verb := range apiResource.Verbs {
		// Skip non-standard verbs
		if !cds.isStandardVerb(verb) {
			continue
		}

		capabilityKey := fmt.Sprintf("%s.%s", capabilityPrefix, verb)

		capabilities[capabilityKey] = CapabilityCheck{
			Group:      group,
			Resource:   apiResource.Name,
			Verb:       verb,
			Namespaced: apiResource.Namespaced,
		}
	}

	if len(capabilities) > 0 {
		cds.logger.Debug("Generated capabilities for custom resource",
			zap.String("group", group),
			zap.String("resource", apiResource.Name),
			zap.Bool("namespaced", apiResource.Namespaced),
			zap.Int("capabilities_count", len(capabilities)))
	}

	return capabilities
}

// isStandardVerb checks if a verb is one we want to create capabilities for
func (cds *CRDDiscoveryService) isStandardVerb(verb string) bool {
	standardVerbs := map[string]bool{
		"get":    true,
		"list":   true,
		"create": true,
		"update": true,
		"delete": true,
		"patch":  true,
		"watch":  true,
	}
	return standardVerbs[verb]
}

// GetCapabilityCheck retrieves a capability check, checking both static registry and dynamic CRDs
func (cds *CRDDiscoveryService) GetCapabilityCheck(capability string) (CapabilityCheck, bool) {
	// First check static registry
	if check, exists := Registry[capability]; exists {
		return check, true
	}

	// Then check dynamic registry
	cds.mutex.RLock()
	defer cds.mutex.RUnlock()

	check, exists := cds.dynamicRegistry[capability]
	return check, exists
}

// GetAllCapabilities returns all capabilities (static + dynamic)
func (cds *CRDDiscoveryService) GetAllCapabilities() []string {
	capabilities := make([]string, 0, len(Registry)+len(cds.dynamicRegistry))

	// Add static capabilities
	for capability := range Registry {
		capabilities = append(capabilities, capability)
	}

	// Add dynamic CRD capabilities
	cds.mutex.RLock()
	for capability := range cds.dynamicRegistry {
		capabilities = append(capabilities, capability)
	}
	cds.mutex.RUnlock()

	return capabilities
}

// GetDynamicCapabilities returns only the dynamically discovered CRD capabilities
func (cds *CRDDiscoveryService) GetDynamicCapabilities() map[string]CapabilityCheck {
	cds.mutex.RLock()
	defer cds.mutex.RUnlock()

	// Create a copy to avoid race conditions
	result := make(map[string]CapabilityCheck, len(cds.dynamicRegistry))
	for k, v := range cds.dynamicRegistry {
		result[k] = v
	}

	return result
}

// ShouldRefresh checks if CRDs should be refreshed based on time interval
func (cds *CRDDiscoveryService) ShouldRefresh() bool {
	cds.mutex.RLock()
	defer cds.mutex.RUnlock()

	return time.Since(cds.lastRefresh) > cds.refreshInterval
}

// StartAutoRefresh starts a goroutine that periodically refreshes CRDs
func (cds *CRDDiscoveryService) StartAutoRefresh(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(cds.refreshInterval)
		defer ticker.Stop()

		// Initial refresh
		if err := cds.RefreshCRDs(ctx); err != nil {
			cds.logger.Error("Initial CRD refresh failed", zap.Error(err))
		}

		for {
			select {
			case <-ctx.Done():
				cds.logger.Debug("CRD auto-refresh stopped")
				return
			case <-ticker.C:
				if err := cds.RefreshCRDs(ctx); err != nil {
					cds.logger.Error("Periodic CRD refresh failed", zap.Error(err))
				}
			}
		}
	}()

	cds.logger.Info("CRD auto-refresh started",
		zap.Duration("refresh_interval", cds.refreshInterval))
}

// GetStats returns statistics about CRD discovery
func (cds *CRDDiscoveryService) GetStats() map[string]interface{} {
	cds.mutex.RLock()
	defer cds.mutex.RUnlock()

	return map[string]interface{}{
		"dynamic_capabilities_count": len(cds.dynamicRegistry),
		"static_capabilities_count":  len(Registry),
		"last_refresh":               cds.lastRefresh,
		"refresh_interval_seconds":   int(cds.refreshInterval.Seconds()),
		"time_since_refresh_seconds": int(time.Since(cds.lastRefresh).Seconds()),
	}
}
