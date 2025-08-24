package authz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// CapabilityRequest represents a request to check user capabilities
type CapabilityRequest struct {
	Cluster       string            `json:"cluster"`                 // Multi-cluster support (for future)
	Namespace     string            `json:"namespace,omitempty"`     // Optional namespace context
	Features      []string          `json:"features"`                // Capability keys to check
	ResourceNames map[string]string `json:"resourceNames,omitempty"` // Optional per-feature resource names
}

// CapabilityResult represents the response with capability results
type CapabilityResult struct {
	Caps    map[string]bool   `json:"caps"`              // Feature -> allowed mapping
	Reasons map[string]string `json:"reasons,omitempty"` // Feature -> reason mapping (for denies)
}

// CacheEntry represents a cached capability result
type CacheEntry struct {
	Result    CapabilityResult
	ExpiresAt time.Time
}

// CapabilityService handles capability checking with caching
type CapabilityService struct {
	logger *zap.Logger
	cache  map[string]*CacheEntry
	mutex  sync.RWMutex
	ttl    time.Duration
}

// NewCapabilityService creates a new capability service
func NewCapabilityService(logger *zap.Logger, cacheTTL time.Duration) *CapabilityService {
	if cacheTTL == 0 {
		cacheTTL = 30 * time.Second // Default cache TTL
	}

	service := &CapabilityService{
		logger: logger,
		cache:  make(map[string]*CacheEntry),
		ttl:    cacheTTL,
	}

	// Start cache cleanup goroutine
	go service.cleanupCache()

	return service
}

// CheckCapabilities evaluates multiple capabilities using impersonated client
func (cs *CapabilityService) CheckCapabilities(
	ctx context.Context,
	client kubernetes.Interface,
	req CapabilityRequest,
	userID string,
	groups []string,
) (CapabilityResult, error) {
	// Create cache key
	cacheKey := cs.createCacheKey(userID, groups, req)

	// Check cache first
	if cachedResult := cs.getCachedResult(cacheKey); cachedResult != nil {
		cs.logger.Debug("Returning cached capability result",
			zap.String("user_id", userID),
			zap.String("cache_key", cacheKey))
		return *cachedResult, nil
	}

	// Build SSAR requests
	ssars, capabilityIndex, err := BuildBatchSSAR(req.Features, req.Namespace, req.ResourceNames)
	if err != nil {
		return CapabilityResult{}, fmt.Errorf("failed to build SSAR requests: %w", err)
	}

	if len(ssars) == 0 {
		// No valid capabilities provided
		return CapabilityResult{
			Caps: make(map[string]bool),
		}, nil
	}

	// Execute batch SSAR
	allowed, reasons, err := cs.evaluateBatchSSAR(ctx, client, ssars)
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
	cs.cacheResult(cacheKey, result)

	cs.logger.Debug("Capability check completed",
		zap.String("user_id", userID),
		zap.Int("capabilities_checked", len(capabilityIndex)),
		zap.Int("allowed", cs.countAllowed(result.Caps)),
		zap.String("namespace", req.Namespace))

	return result, nil
}

// evaluateBatchSSAR executes multiple SSAR requests
func (cs *CapabilityService) evaluateBatchSSAR(
	ctx context.Context,
	client kubernetes.Interface,
	ssars []authorizationv1.SelfSubjectAccessReview,
) ([]bool, []string, error) {
	allowed := make([]bool, len(ssars))
	reasons := make([]string, len(ssars))

	// For now, execute sequentially
	// TODO: In Phase 3, implement worker pool for parallel execution
	for i, ssar := range ssars {
		result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(
			ctx,
			&ssar,
			metav1.CreateOptions{},
		)
		if err != nil {
			cs.logger.Error("SSAR request failed",
				zap.Error(err),
				zap.String("verb", ssar.Spec.ResourceAttributes.Verb),
				zap.String("resource", ssar.Spec.ResourceAttributes.Resource),
				zap.String("namespace", ssar.Spec.ResourceAttributes.Namespace))
			allowed[i] = false
			reasons[i] = fmt.Sprintf("SSAR failed: %v", err)
			continue
		}

		allowed[i] = result.Status.Allowed
		if !result.Status.Allowed {
			reasons[i] = result.Status.Reason
		}

		cs.logger.Debug("SSAR completed",
			zap.String("verb", ssar.Spec.ResourceAttributes.Verb),
			zap.String("resource", ssar.Spec.ResourceAttributes.Resource),
			zap.String("namespace", ssar.Spec.ResourceAttributes.Namespace),
			zap.Bool("allowed", result.Status.Allowed),
			zap.String("reason", result.Status.Reason))
	}

	return allowed, reasons, nil
}

// createCacheKey creates a cache key from user context and request
func (cs *CapabilityService) createCacheKey(userID string, groups []string, req CapabilityRequest) string {
	// Sort groups for consistent hashing
	sortedGroups := make([]string, len(groups))
	copy(sortedGroups, groups)
	sort.Strings(sortedGroups)

	// Sort features for consistent hashing
	sortedFeatures := make([]string, len(req.Features))
	copy(sortedFeatures, req.Features)
	sort.Strings(sortedFeatures)

	// Create resource names string
	var resourceNamesStr strings.Builder
	if req.ResourceNames != nil {
		keys := make([]string, 0, len(req.ResourceNames))
		for k := range req.ResourceNames {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			resourceNamesStr.WriteString(fmt.Sprintf("%s=%s;", k, req.ResourceNames[k]))
		}
	}

	// Create hash input
	input := fmt.Sprintf("user=%s|groups=%s|cluster=%s|ns=%s|features=%s|resources=%s",
		userID,
		strings.Join(sortedGroups, ","),
		req.Cluster,
		req.Namespace,
		strings.Join(sortedFeatures, ","),
		resourceNamesStr.String(),
	)

	// Create SHA256 hash
	hash := sha256.Sum256([]byte(input))
	return hex.EncodeToString(hash[:])
}

// getCachedResult retrieves a cached result if valid
func (cs *CapabilityService) getCachedResult(cacheKey string) *CapabilityResult {
	cs.mutex.RLock()
	defer cs.mutex.RUnlock()

	entry, exists := cs.cache[cacheKey]
	if !exists {
		return nil
	}

	if time.Now().After(entry.ExpiresAt) {
		return nil
	}

	return &entry.Result
}

// cacheResult stores a result in the cache
func (cs *CapabilityService) cacheResult(cacheKey string, result CapabilityResult) {
	cs.mutex.Lock()
	defer cs.mutex.Unlock()

	cs.cache[cacheKey] = &CacheEntry{
		Result:    result,
		ExpiresAt: time.Now().Add(cs.ttl),
	}
}

// cleanupCache removes expired entries periodically
func (cs *CapabilityService) cleanupCache() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		cs.mutex.Lock()
		now := time.Now()
		for key, entry := range cs.cache {
			if now.After(entry.ExpiresAt) {
				delete(cs.cache, key)
			}
		}
		cs.mutex.Unlock()
	}
}

// countAllowed counts how many capabilities are allowed
func (cs *CapabilityService) countAllowed(caps map[string]bool) int {
	count := 0
	for _, allowed := range caps {
		if allowed {
			count++
		}
	}
	return count
}

// GetCacheStats returns cache statistics
func (cs *CapabilityService) GetCacheStats() map[string]interface{} {
	cs.mutex.RLock()
	defer cs.mutex.RUnlock()

	expired := 0
	now := time.Now()
	for _, entry := range cs.cache {
		if now.After(entry.ExpiresAt) {
			expired++
		}
	}

	return map[string]interface{}{
		"total_entries":   len(cs.cache),
		"expired_entries": expired,
		"valid_entries":   len(cs.cache) - expired,
		"ttl_seconds":     int(cs.ttl.Seconds()),
	}
}
