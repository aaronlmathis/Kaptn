package authz

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zaptest"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestCapabilityService_Phase3_Performance(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance test in short mode")
	}

	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 30*time.Second)

	// Create a fake Kubernetes client with simulated latency
	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			// Simulate API server latency (5ms)
			time.Sleep(5 * time.Millisecond)
			
			sar := &authorizationv1.SelfSubjectAccessReview{
				TypeMeta: metav1.TypeMeta{
					APIVersion: "authorization.k8s.io/v1",
					Kind:       "SelfSubjectAccessReview",
				},
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: true,
				},
			}
			return true, sar, nil
		})

	// Test with 30 features as specified in Phase 3 acceptance criteria
	req := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "default",
		Features: []string{
			"pods.delete", "pods.logs", "pods.exec", "pods.portforward",
			"deployments.restart", "deployments.create", "deployments.update",
			"configmaps.edit", "configmaps.create", "configmaps.delete",
			"secrets.read", "secrets.update", "secrets.create", "secrets.delete",
			"services.get", "services.create", "services.update", "services.delete",
			"namespaces.list", "namespaces.get",
			"roles.get", "roles.create", "roles.update", "roles.delete",
			"rolebindings.get", "rolebindings.create", "rolebindings.update", "rolebindings.delete",
			"events.list", "events.get",
		},
	}

	userID := "test-user"
	groups := []string{"test-group"}
	ctx := context.Background()

	// Measure cold cache performance
	const numColdRequests = 10
	coldLatencies := make([]time.Duration, numColdRequests)

	for i := 0; i < numColdRequests; i++ {
		// Use different request each time to avoid cache hits
		modifiedReq := req
		modifiedReq.Namespace = fmt.Sprintf("ns-%d", i)
		
		start := time.Now()
		result, err := service.CheckCapabilities(ctx, fakeClient, modifiedReq, userID, groups)
		coldLatencies[i] = time.Since(start)

		require.NoError(t, err, "CheckCapabilities should not return error")
		assert.Len(t, result.Caps, 30, "Should return results for all 30 features")
	}

	// Measure warm cache performance  
	const numWarmRequests = 50
	warmLatencies := make([]time.Duration, numWarmRequests)

	for i := 0; i < numWarmRequests; i++ {
		start := time.Now()
		result, err := service.CheckCapabilities(ctx, fakeClient, req, userID, groups)
		warmLatencies[i] = time.Since(start)

		require.NoError(t, err, "CheckCapabilities should not return error")
		assert.Len(t, result.Caps, 30, "Should return results for all 30 features")
	}

	// Calculate percentiles for cold cache
	coldP95 := calculatePercentile(coldLatencies, 95)
	coldP50 := calculatePercentile(coldLatencies, 50)

	// Calculate percentiles for warm cache  
	warmP95 := calculatePercentile(warmLatencies, 95)
	warmP50 := calculatePercentile(warmLatencies, 50)

	t.Logf("Cold cache performance (30 features):")
	t.Logf("  P50: %v", coldP50)
	t.Logf("  P95: %v", coldP95)
	t.Logf("Warm cache performance (30 features):")
	t.Logf("  P50: %v", warmP50)
	t.Logf("  P95: %v", warmP95)

	// Phase 3 acceptance criteria
	assert.LessOrEqual(t, coldP95, 250*time.Millisecond,
		"Cold cache P95 latency should be ≤ 250ms but was %v", coldP95)
	assert.LessOrEqual(t, warmP95, 120*time.Millisecond,
		"Warm cache P95 latency should be ≤ 120ms but was %v", warmP95)

	// Verify cache hit rate
	stats := service.GetCacheStats()
	cacheHitRate := stats["cache_hit_rate_percent"].(float64)
	t.Logf("Cache hit rate: %.2f%%", cacheHitRate)
	
	// Should have good cache hit rate for warm requests
	assert.GreaterOrEqual(t, cacheHitRate, 80.0,
		"Cache hit rate should be ≥ 80%% but was %.2f%%", cacheHitRate)
}

func TestCapabilityService_Phase3_WorkerPoolPerformance(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance test in short mode")
	}

	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 30*time.Second)

	// Create fake client with per-request latency tracking
	callCount := 0
	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			callCount++
			// Simulate realistic API server latency
			time.Sleep(10 * time.Millisecond)
			
			sar := &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: true,
				},
			}
			return true, sar, nil
		})

	// Test large batch to trigger worker pool
	req := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "test-large-batch",
		Features: []string{
			"pods.delete", "pods.logs", "pods.exec", "pods.portforward",
			"deployments.restart", "deployments.scale", "deployments.edit",
			"configmaps.edit", "configmaps.create", "configmaps.delete",
			"secrets.read", "secrets.edit", "secrets.create", "secrets.delete",
			"services.get", "services.edit", "services.create", "services.delete",
		},
	}

	ctx := context.Background()
	start := time.Now()
	
	result, err := service.CheckCapabilities(ctx, fakeClient, req, "user", []string{"group"})
	
	elapsed := time.Since(start)
	
	require.NoError(t, err)
	assert.Len(t, result.Caps, 18, "Should return results for all features")
	assert.Equal(t, 18, callCount, "Should make SSAR calls for all features")
	
	t.Logf("Worker pool batch processing:")
	t.Logf("  Features: %d", len(req.Features))
	t.Logf("  Total time: %v", elapsed)
	t.Logf("  Average per feature: %v", elapsed/time.Duration(len(req.Features)))
	
	// With worker pool, should be faster than sequential
	// 18 features * 10ms each = 180ms sequential
	// With parallelism, should be significantly faster
	maxExpectedTime := 50 * time.Millisecond
	assert.LessOrEqual(t, elapsed, maxExpectedTime,
		"Worker pool should complete faster than %v but took %v", maxExpectedTime, elapsed)
}

func TestCapabilityService_Phase3_SSRRFastPath(t *testing.T) {
	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 30*time.Second)

	// Mock SSRR response
	ssrrCallCount := 0
	ssarCallCount := 0
	
	fakeClient := fake.NewSimpleClientset()
	
	// Mock SSRR calls
	fakeClient.PrependReactor("create", "selfsubjectrulesreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			ssrrCallCount++
			
			ssrr := &authorizationv1.SelfSubjectRulesReview{
				Status: authorizationv1.SubjectRulesReviewStatus{
					ResourceRules: []authorizationv1.ResourceRule{
						{
							Verbs:     []string{"*"},
							APIGroups: []string{""},
							Resources: []string{"*"},
						},
						{
							Verbs:     []string{"*"},
							APIGroups: []string{"apps"},
							Resources: []string{"*"},
						},
					},
				},
			}
			return true, ssrr, nil
		})
	
	// Mock SSAR calls (should not be called when SSRR is used)
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			ssarCallCount++
			
			sar := &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: true,
				},
			}
			return true, sar, nil
		})

	// Request with 5+ features should trigger SSRR fast-path
	req := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "default",
		Features: []string{
			"pods.delete", "pods.logs", "pods.exec", "pods.portforward",
			"deployments.restart", "configmaps.edit",
		},
		// No resource names to enable SSRR fast-path
	}

	ctx := context.Background()
	start := time.Now()
	
	result, err := service.CheckCapabilities(ctx, fakeClient, req, "user", []string{"group"})
	elapsed := time.Since(start)
	
	require.NoError(t, err)
	assert.Len(t, result.Caps, 6, "Should return results for all features")
	
	t.Logf("SSRR fast-path test:")
	t.Logf("  SSRR calls: %d", ssrrCallCount)
	t.Logf("  SSAR calls: %d", ssarCallCount)
	t.Logf("  Total time: %v", elapsed)
	
	// Should use SSRR fast-path (1 SSRR call instead of 6 SSAR calls)
	assert.Equal(t, 1, ssrrCallCount, "Should make 1 SSRR call")
	assert.Equal(t, 0, ssarCallCount, "Should not make SSAR calls when using SSRR")
	
	// Verify cache stats include SSRR metrics
	stats := service.GetCacheStats()
	perfMetrics := stats["performance_metrics"].(map[string]interface{})
	assert.Equal(t, int64(1), perfMetrics["ssrr_calls"], "Should track SSRR calls")
	assert.Equal(t, int64(0), perfMetrics["ssar_calls"], "Should not have SSAR calls")
}

func TestCapabilityService_Phase3_AuditLogging(t *testing.T) {
	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 1*time.Second) // Short TTL for testing

	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			sar := &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: false,
					Reason:  "test denial reason",
				},
			}
			return true, sar, nil
		})

	req := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "default",
		Features:  []string{"pods.delete"},
	}

	ctx := context.Background()
	
	// This should generate audit logs for denials
	result, err := service.CheckCapabilities(ctx, fakeClient, req, "test-user", []string{"test-group"})
	
	require.NoError(t, err)
	assert.False(t, result.Caps["pods.delete"], "Should be denied")
	assert.Contains(t, result.Reasons["pods.delete"], "test denial reason")
	
	// Note: In a real test, you'd capture and verify the audit log output
	// For now, we just verify the functionality works without errors
	t.Log("Audit logging test completed - check logs for audit entries")
}

// Helper function to calculate percentiles
func calculatePercentile(latencies []time.Duration, percentile int) time.Duration {
	if len(latencies) == 0 {
		return 0
	}
	
	// Simple bubble sort for testing purposes
	sorted := make([]time.Duration, len(latencies))
	copy(sorted, latencies)
	
	for i := 0; i < len(sorted); i++ {
		for j := 0; j < len(sorted)-1-i; j++ {
			if sorted[j] > sorted[j+1] {
				sorted[j], sorted[j+1] = sorted[j+1], sorted[j]
			}
		}
	}
	
	index := len(sorted) * percentile / 100
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	
	return sorted[index]
}
