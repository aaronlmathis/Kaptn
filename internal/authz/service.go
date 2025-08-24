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
	rbacv1 "k8s.io/api/rbac/v1"
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

// SSRRCacheEntry represents a cached SSRR result
type SSRRCacheEntry struct {
	Rules     []rbacv1.PolicyRule
	ExpiresAt time.Time
}

// PerformanceMetrics tracks performance statistics
type PerformanceMetrics struct {
	mutex           sync.RWMutex
	TotalRequests   int64
	CacheHits       int64
	CacheMisses     int64
	SSRRCacheHits   int64
	SSRRCacheMisses int64
	TotalLatency    time.Duration
	SSARCalls       int64
	SSRRCalls       int64
	ErrorCount      int64
	LatencyBuckets  map[string]int64 // P50, P95, P99 counters
}

// AuditEntry represents an audit log entry
type AuditEntry struct {
	Timestamp   time.Time `json:"timestamp"`
	TraceID     string    `json:"trace_id"`
	UserID      string    `json:"user_id"`
	Groups      []string  `json:"groups"`
	GroupsHash  string    `json:"groups_hash"`
	Feature     string    `json:"feature"`
	Namespace   string    `json:"namespace"`
	Resource    string    `json:"resource,omitempty"`
	Decision    bool      `json:"decision"`
	Reason      string    `json:"reason,omitempty"`
	Latency     int64     `json:"latency_ms"`
	CacheHit    bool      `json:"cache_hit"`
	Method      string    `json:"method"` // "SSAR" or "SSRR"
}

// WorkerPool manages concurrent SSAR execution
type WorkerPool struct {
	size        int
	jobs        chan SSARJob
	results     chan SSARResult
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
	logger      *zap.Logger
	client      kubernetes.Interface
}

// SSARJob represents a single SSAR task
type SSARJob struct {
	Index   int
	SSAR    authorizationv1.SelfSubjectAccessReview
	TraceID string
}

// SSARResult represents the result of a SSAR task
type SSARResult struct {
	Index   int
	Allowed bool
	Reason  string
	Error   error
	Latency time.Duration
}

// CapabilityService handles capability checking with caching
type CapabilityService struct {
	logger           *zap.Logger
	cache            map[string]*CacheEntry
	ssrrCache        map[string]*SSRRCacheEntry
	mutex            sync.RWMutex
	ssrrMutex        sync.RWMutex
	ttl              time.Duration
	ssrrTTL          time.Duration
	metrics          *PerformanceMetrics
	enableSSRR       bool
	maxConcurrency   int
	auditLogger      *zap.Logger
}

// NewCapabilityService creates a new capability service
func NewCapabilityService(logger *zap.Logger, cacheTTL time.Duration) *CapabilityService {
	if cacheTTL == 0 {
		cacheTTL = 30 * time.Second // Default cache TTL
	}

	// Create audit logger (structured for audit trails)
	auditLogger := logger.Named("audit")

	service := &CapabilityService{
		logger:         logger,
		cache:          make(map[string]*CacheEntry),
		ssrrCache:      make(map[string]*SSRRCacheEntry),
		ttl:            cacheTTL,
		ssrrTTL:        60 * time.Second, // SSRR cache TTL (longer than SSAR)
		enableSSRR:     true,             // Enable SSRR fast-path by default
		maxConcurrency: 10,               // Default worker pool size
		auditLogger:    auditLogger,
		metrics: &PerformanceMetrics{
			LatencyBuckets: make(map[string]int64),
		},
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
	startTime := time.Now()
	traceID := generateTraceID()

	// Update metrics
	cs.updateMetrics(func(m *PerformanceMetrics) {
		m.TotalRequests++
	})

	// Create cache key
	cacheKey := cs.createCacheKey(userID, groups, req)

	// Check cache first
	if cachedResult := cs.getCachedResult(cacheKey); cachedResult != nil {
		cs.updateMetrics(func(m *PerformanceMetrics) {
			m.CacheHits++
		})
		
		latency := time.Since(startTime)
		cs.updateLatencyMetrics(latency)
		
		cs.logger.Debug("Returning cached capability result",
			zap.String("user_id", userID),
			zap.String("trace_id", traceID),
			zap.String("cache_key", cacheKey),
			zap.Duration("latency", latency))
		return *cachedResult, nil
	}

	cs.updateMetrics(func(m *PerformanceMetrics) {
		m.CacheMisses++
	})

	// Try SSRR fast-path for multiple capabilities
	if cs.enableSSRR && len(req.Features) > 3 && !cs.hasResourceNames(req) {
		if result, ok := cs.trySSRRFastPath(ctx, client, req, userID, groups, traceID); ok {
			latency := time.Since(startTime)
			cs.updateLatencyMetrics(latency)
			cs.cacheResult(cacheKey, result)
			return result, nil
		}
	}

	// Fall back to SSAR batch processing
	result, err := cs.processSSSRBatch(ctx, client, req, userID, groups, traceID)
	if err != nil {
		cs.updateMetrics(func(m *PerformanceMetrics) {
			m.ErrorCount++
		})
		return CapabilityResult{}, err
	}

	latency := time.Since(startTime)
	cs.updateLatencyMetrics(latency)

	// Cache the result
	cs.cacheResult(cacheKey, result)

	cs.logger.Debug("Capability check completed",
		zap.String("user_id", userID),
		zap.String("trace_id", traceID),
		zap.Int("capabilities_checked", len(req.Features)),
		zap.Int("allowed", cs.countAllowed(result.Caps)),
		zap.String("namespace", req.Namespace),
		zap.Duration("latency", latency))

	return result, nil
}

// evaluateBatchSSARSequential executes SSAR requests sequentially (legacy method)
func (cs *CapabilityService) evaluateBatchSSARSequential(
	ctx context.Context,
	client kubernetes.Interface,
	ssars []authorizationv1.SelfSubjectAccessReview,
) ([]bool, []string, error) {
	allowed := make([]bool, len(ssars))
	reasons := make([]string, len(ssars))

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

	cs.updateMetrics(func(m *PerformanceMetrics) {
		m.SSARCalls += int64(len(ssars))
	})

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

// cleanupCache removes expired entries periodically from both caches
func (cs *CapabilityService) cleanupCache() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now()
		
		// Cleanup capability cache
		cs.mutex.Lock()
		for key, entry := range cs.cache {
			if now.After(entry.ExpiresAt) {
				delete(cs.cache, key)
			}
		}
		cs.mutex.Unlock()
		
		// Cleanup SSRR cache
		cs.ssrrMutex.Lock()
		for key, entry := range cs.ssrrCache {
			if now.After(entry.ExpiresAt) {
				delete(cs.ssrrCache, key)
			}
		}
		cs.ssrrMutex.Unlock()
	}
}

// GetCacheStats returns enhanced cache statistics including performance metrics
func (cs *CapabilityService) GetCacheStats() map[string]interface{} {
	cs.mutex.RLock()
	defer cs.mutex.RUnlock()
	
	cs.ssrrMutex.RLock()
	defer cs.ssrrMutex.RUnlock()

	expired := 0
	ssrrExpired := 0
	now := time.Now()
	
	for _, entry := range cs.cache {
		if now.After(entry.ExpiresAt) {
			expired++
		}
	}
	
	for _, entry := range cs.ssrrCache {
		if now.After(entry.ExpiresAt) {
			ssrrExpired++
		}
	}

	// Get metrics snapshot
	cs.metrics.mutex.RLock()
	metricsSnapshot := map[string]interface{}{
		"total_requests":     cs.metrics.TotalRequests,
		"cache_hits":         cs.metrics.CacheHits,
		"cache_misses":       cs.metrics.CacheMisses,
		"ssrr_cache_hits":    cs.metrics.SSRRCacheHits,
		"ssrr_cache_misses":  cs.metrics.SSRRCacheMisses,
		"ssar_calls":         cs.metrics.SSARCalls,
		"ssrr_calls":         cs.metrics.SSRRCalls,
		"error_count":        cs.metrics.ErrorCount,
		"total_latency_ms":   cs.metrics.TotalLatency.Milliseconds(),
		"latency_buckets":    cs.metrics.LatencyBuckets,
	}
	cs.metrics.mutex.RUnlock()

	// Calculate cache hit rate
	var cacheHitRate float64
	if cs.metrics.TotalRequests > 0 {
		cacheHitRate = float64(cs.metrics.CacheHits) / float64(cs.metrics.TotalRequests) * 100
	}

	// Calculate average latency
	var avgLatencyMs float64
	if cs.metrics.TotalRequests > 0 {
		avgLatencyMs = float64(cs.metrics.TotalLatency.Milliseconds()) / float64(cs.metrics.TotalRequests)
	}

	return map[string]interface{}{
		"capability_cache": map[string]interface{}{
			"total_entries":   len(cs.cache),
			"expired_entries": expired,
			"valid_entries":   len(cs.cache) - expired,
			"ttl_seconds":     int(cs.ttl.Seconds()),
		},
		"ssrr_cache": map[string]interface{}{
			"total_entries":   len(cs.ssrrCache),
			"expired_entries": ssrrExpired,
			"valid_entries":   len(cs.ssrrCache) - ssrrExpired,
			"ttl_seconds":     int(cs.ssrrTTL.Seconds()),
		},
		"performance_metrics": metricsSnapshot,
		"cache_hit_rate_percent": cacheHitRate,
		"avg_latency_ms":         avgLatencyMs,
		"worker_pool_size":       cs.maxConcurrency,
		"ssrr_enabled":           cs.enableSSRR,
	}
}

// generateTraceID creates a unique trace ID for request tracking
func generateTraceID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

// updateMetrics safely updates performance metrics
func (cs *CapabilityService) updateMetrics(updater func(*PerformanceMetrics)) {
	cs.metrics.mutex.Lock()
	defer cs.metrics.mutex.Unlock()
	updater(cs.metrics)
}

// updateLatencyMetrics updates latency statistics
func (cs *CapabilityService) updateLatencyMetrics(latency time.Duration) {
	cs.updateMetrics(func(m *PerformanceMetrics) {
		m.TotalLatency += latency
		
		// Update latency buckets for percentile calculation
		ms := latency.Milliseconds()
		if ms <= 50 {
			m.LatencyBuckets["p50"]++
		} else if ms <= 100 {
			m.LatencyBuckets["p95"]++
		} else {
			m.LatencyBuckets["p99"]++
		}
	})
}

// hasResourceNames checks if the request includes specific resource names
func (cs *CapabilityService) hasResourceNames(req CapabilityRequest) bool {
	return len(req.ResourceNames) > 0
}

// worker processes SSAR jobs
func (wp *WorkerPool) worker(id int) {
	defer wp.wg.Done()
	
	wp.logger.Debug("Worker started", zap.Int("worker_id", id))
	
	for {
		select {
		case job := <-wp.jobs:
			start := time.Now()
			
			// Execute the SSAR request
			result, err := wp.client.AuthorizationV1().SelfSubjectAccessReviews().Create(
				wp.ctx,
				&job.SSAR,
				metav1.CreateOptions{},
			)
			
			latency := time.Since(start)
			
			if err != nil {
				wp.results <- SSARResult{
					Index:   job.Index,
					Allowed: false,
					Reason:  "",
					Error:   err,
					Latency: latency,
				}
			} else {
				wp.results <- SSARResult{
					Index:   job.Index,
					Allowed: result.Status.Allowed,
					Reason:  result.Status.Reason,
					Error:   nil,
					Latency: latency,
				}
			}
			
		case <-wp.ctx.Done():
			wp.logger.Debug("Worker stopping", zap.Int("worker_id", id))
			return
		}
	}
}

// Close shuts down the worker pool
func (wp *WorkerPool) Close() {
	close(wp.jobs)
	wp.cancel()
	wp.wg.Wait()
	close(wp.results)
}

// trySSRRFastPath attempts to use SelfSubjectRulesReview for fast capability checking
func (cs *CapabilityService) trySSRRFastPath(
	ctx context.Context,
	client kubernetes.Interface,
	req CapabilityRequest,
	userID string,
	groups []string,
	traceID string,
) (CapabilityResult, bool) {
	// Create SSRR cache key
	ssrrKey := cs.createSSRRCacheKey(userID, groups, req.Cluster, req.Namespace)
	
	// Check SSRR cache
	if rules := cs.getSSRRCachedRules(ssrrKey); rules != nil {
		cs.updateMetrics(func(m *PerformanceMetrics) {
			m.SSRRCacheHits++
		})
		
		return cs.evaluateCapabilitiesAgainstRules(req.Features, *rules, req.Namespace, traceID), true
	}

	cs.updateMetrics(func(m *PerformanceMetrics) {
		m.SSRRCacheMisses++
	})

	// Execute SSRR
	ssrr := &authorizationv1.SelfSubjectRulesReview{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "authorization.k8s.io/v1",
			Kind:       "SelfSubjectRulesReview",
		},
		Spec: authorizationv1.SelfSubjectRulesReviewSpec{
			Namespace: req.Namespace,
		},
	}

	result, err := client.AuthorizationV1().SelfSubjectRulesReviews().Create(ctx, ssrr, metav1.CreateOptions{})
	if err != nil {
		cs.logger.Warn("SSRR request failed, falling back to SSAR",
			zap.Error(err),
			zap.String("trace_id", traceID))
		return CapabilityResult{}, false
	}

	cs.updateMetrics(func(m *PerformanceMetrics) {
		m.SSRRCalls++
	})

	// Convert to PolicyRules and cache
	rules := make([]rbacv1.PolicyRule, len(result.Status.ResourceRules))
	for i, rule := range result.Status.ResourceRules {
		rules[i] = rbacv1.PolicyRule{
			Verbs:         rule.Verbs,
			APIGroups:     rule.APIGroups,
			Resources:     rule.Resources,
			ResourceNames: rule.ResourceNames,
		}
	}

	cs.cacheSSRRRules(ssrrKey, rules)

	return cs.evaluateCapabilitiesAgainstRules(req.Features, rules, req.Namespace, traceID), true
}

// processSSSRBatch processes capabilities using batch SSAR with worker pool
func (cs *CapabilityService) processSSSRBatch(
	ctx context.Context,
	client kubernetes.Interface,
	req CapabilityRequest,
	userID string,
	groups []string,
	traceID string,
) (CapabilityResult, error) {
	// Build SSAR requests
	ssars, capabilityIndex, err := BuildBatchSSAR(req.Features, req.Namespace, req.ResourceNames)
	if err != nil {
		return CapabilityResult{}, fmt.Errorf("failed to build SSAR requests: %w", err)
	}

	if len(ssars) == 0 {
		return CapabilityResult{Caps: make(map[string]bool)}, nil
	}

	// Use enhanced batch evaluation with worker pool
	allowed, reasons, err := cs.evaluateBatchSSARWithPool(ctx, client, ssars, traceID)
	if err != nil {
		return CapabilityResult{}, fmt.Errorf("failed to evaluate capabilities: %w", err)
	}

	// Build result with audit logging
	result := CapabilityResult{
		Caps:    make(map[string]bool, len(capabilityIndex)),
		Reasons: make(map[string]string),
	}

	groupsHash := cs.hashGroups(groups)
	
	for i, capability := range capabilityIndex {
		result.Caps[capability] = allowed[i]
		if !allowed[i] && reasons[i] != "" {
			result.Reasons[capability] = reasons[i]
		}

		// Audit log each capability decision
		cs.auditCapabilityDecision(AuditEntry{
			Timestamp:  time.Now(),
			TraceID:    traceID,
			UserID:     userID,
			Groups:     groups,
			GroupsHash: groupsHash,
			Feature:    capability,
			Namespace:  req.Namespace,
			Decision:   allowed[i],
			Reason:     reasons[i],
			CacheHit:   false,
			Method:     "SSAR",
		})
	}

	return result, nil
}

// createSSRRCacheKey creates a cache key for SSRR results
func (cs *CapabilityService) createSSRRCacheKey(userID string, groups []string, cluster, namespace string) string {
	sortedGroups := make([]string, len(groups))
	copy(sortedGroups, groups)
	sort.Strings(sortedGroups)

	input := fmt.Sprintf("ssrr:user=%s|groups=%s|cluster=%s|ns=%s",
		userID,
		strings.Join(sortedGroups, ","),
		cluster,
		namespace,
	)

	hash := sha256.Sum256([]byte(input))
	return hex.EncodeToString(hash[:])
}

// getSSRRCachedRules retrieves cached SSRR rules
func (cs *CapabilityService) getSSRRCachedRules(cacheKey string) *[]rbacv1.PolicyRule {
	cs.ssrrMutex.RLock()
	defer cs.ssrrMutex.RUnlock()

	entry, exists := cs.ssrrCache[cacheKey]
	if !exists {
		return nil
	}

	if time.Now().After(entry.ExpiresAt) {
		return nil
	}

	return &entry.Rules
}

// cacheSSRRRules stores SSRR rules in cache
func (cs *CapabilityService) cacheSSRRRules(cacheKey string, rules []rbacv1.PolicyRule) {
	cs.ssrrMutex.Lock()
	defer cs.ssrrMutex.Unlock()

	cs.ssrrCache[cacheKey] = &SSRRCacheEntry{
		Rules:     rules,
		ExpiresAt: time.Now().Add(cs.ssrrTTL),
	}
}

// evaluateCapabilitiesAgainstRules evaluates capabilities against cached RBAC rules
func (cs *CapabilityService) evaluateCapabilitiesAgainstRules(
	features []string,
	rules []rbacv1.PolicyRule,
	namespace string,
	traceID string,
) CapabilityResult {
	result := CapabilityResult{
		Caps:    make(map[string]bool, len(features)),
		Reasons: make(map[string]string),
	}

	for _, feature := range features {
		def, exists := GetCapabilityCheck(feature)
		if !exists {
			result.Caps[feature] = false
			result.Reasons[feature] = "unknown capability"
			continue
		}

		allowed := cs.checkRuleMatch(def, rules, namespace)
		result.Caps[feature] = allowed
		if !allowed {
			result.Reasons[feature] = "insufficient permissions"
		}
	}

	return result
}

// checkRuleMatch checks if a capability matches any of the provided rules
func (cs *CapabilityService) checkRuleMatch(def CapabilityCheck, rules []rbacv1.PolicyRule, namespace string) bool {
	for _, rule := range rules {
		if cs.matchesRule(def, rule, namespace) {
			return true
		}
	}
	return false
}

// matchesRule checks if a capability definition matches a specific rule
func (cs *CapabilityService) matchesRule(def CapabilityCheck, rule rbacv1.PolicyRule, namespace string) bool {
	// Check API groups
	if !cs.matchesAPIGroups(def.Group, rule.APIGroups) {
		return false
	}

	// Check resources
	if !cs.matchesResources(def.Resource, def.Subresource, rule.Resources) {
		return false
	}

	// Check verbs
	if !cs.matchesVerbs(def.Verb, rule.Verbs) {
		return false
	}

	return true
}

// matchesAPIGroups checks if the required API group is covered by the rule
func (cs *CapabilityService) matchesAPIGroups(requiredGroup string, ruleGroups []string) bool {
	for _, group := range ruleGroups {
		if group == "*" || group == requiredGroup {
			return true
		}
	}
	return false
}

// matchesResources checks if the required resource/subresource is covered by the rule
func (cs *CapabilityService) matchesResources(requiredResource, requiredSubresource string, ruleResources []string) bool {
	resourceToCheck := requiredResource
	if requiredSubresource != "" {
		resourceToCheck = requiredResource + "/" + requiredSubresource
	}

	for _, resource := range ruleResources {
		if resource == "*" || resource == resourceToCheck || resource == requiredResource {
			return true
		}
	}
	return false
}

// matchesVerbs checks if the required verb is covered by the rule
func (cs *CapabilityService) matchesVerbs(requiredVerb string, ruleVerbs []string) bool {
	for _, verb := range ruleVerbs {
		if verb == "*" || verb == requiredVerb {
			return true
		}
	}
	return false
}

// evaluateBatchSSARWithPool executes SSAR requests using worker pool
func (cs *CapabilityService) evaluateBatchSSARWithPool(
	ctx context.Context,
	client kubernetes.Interface,
	ssars []authorizationv1.SelfSubjectAccessReview,
	traceID string,
) ([]bool, []string, error) {
	if len(ssars) == 0 {
		return []bool{}, []string{}, nil
	}

	// For small batches, use sequential processing
	if len(ssars) <= 3 {
		return cs.evaluateBatchSSARSequential(ctx, client, ssars)
	}

	// Create temporary worker pool with client for this batch
	poolCtx, poolCancel := context.WithCancel(ctx)
	defer poolCancel()
	
	pool := &WorkerPool{
		size:    cs.maxConcurrency,
		jobs:    make(chan SSARJob, cs.maxConcurrency*2),
		results: make(chan SSARResult, cs.maxConcurrency*2),
		ctx:     poolCtx,
		cancel:  poolCancel,
		logger:  cs.logger.Named("worker-pool"),
		client:  client,
	}

	// Start workers
	for i := 0; i < pool.size; i++ {
		pool.wg.Add(1)
		go pool.worker(i)
	}

	allowed := make([]bool, len(ssars))
	reasons := make([]string, len(ssars))
	
	// Submit jobs
	for i, ssar := range ssars {
		select {
		case pool.jobs <- SSARJob{
			Index:   i,
			SSAR:    ssar,
			TraceID: traceID,
		}:
		case <-ctx.Done():
			pool.Close()
			return nil, nil, ctx.Err()
		}
	}

	// Collect results
	for i := 0; i < len(ssars); i++ {
		select {
		case result := <-pool.results:
			if result.Error != nil {
				allowed[result.Index] = false
				reasons[result.Index] = fmt.Sprintf("SSAR failed: %v", result.Error)
			} else {
				allowed[result.Index] = result.Allowed
				reasons[result.Index] = result.Reason
			}
		case <-ctx.Done():
			pool.Close()
			return nil, nil, ctx.Err()
		}
	}

	// Clean up the temporary pool
	pool.Close()

	cs.updateMetrics(func(m *PerformanceMetrics) {
		m.SSARCalls += int64(len(ssars))
	})

	return allowed, reasons, nil
}

// hashGroups creates a consistent hash of user groups
func (cs *CapabilityService) hashGroups(groups []string) string {
	sortedGroups := make([]string, len(groups))
	copy(sortedGroups, groups)
	sort.Strings(sortedGroups)
	
	input := strings.Join(sortedGroups, "|")
	hash := sha256.Sum256([]byte(input))
	return hex.EncodeToString(hash[:8]) // Use first 8 bytes for shorter hash
}

// auditCapabilityDecision logs capability decisions for audit trails
func (cs *CapabilityService) auditCapabilityDecision(entry AuditEntry) {
	cs.auditLogger.Info("capability_decision",
		zap.Time("timestamp", entry.Timestamp),
		zap.String("trace_id", entry.TraceID),
		zap.String("user_id", entry.UserID),
		zap.Strings("groups", entry.Groups),
		zap.String("groups_hash", entry.GroupsHash),
		zap.String("feature", entry.Feature),
		zap.String("namespace", entry.Namespace),
		zap.String("resource", entry.Resource),
		zap.Bool("decision", entry.Decision),
		zap.String("reason", entry.Reason),
		zap.Int64("latency_ms", entry.Latency),
		zap.Bool("cache_hit", entry.CacheHit),
		zap.String("method", entry.Method),
	)
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

// Close shuts down the capability service
func (cs *CapabilityService) Close() {
	// No global worker pool to close since we use temporary ones per batch
	cs.logger.Debug("Capability service shut down")
}
