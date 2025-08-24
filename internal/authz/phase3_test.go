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
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestPhase3_BasicFunctionality(t *testing.T) {
	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 30*time.Second)

	// Create simple fake client
	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			sar := &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: true,
				},
			}
			return true, sar, nil
		})

	req := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "default",
		Features:  []string{"pods.delete", "pods.logs"},
	}

	ctx := context.Background()
	result, err := service.CheckCapabilities(ctx, fakeClient, req, "user", []string{"group"})

	require.NoError(t, err)
	assert.Len(t, result.Caps, 2, "Should return results for all features")
	assert.True(t, result.Caps["pods.delete"])
	assert.True(t, result.Caps["pods.logs"])

	// Check cache stats
	stats := service.GetCacheStats()
	assert.Contains(t, stats, "performance_metrics")
	assert.Contains(t, stats, "cache_hit_rate_percent")

	t.Logf("Cache stats: %+v", stats)
}

func TestPhase3_PerformanceWithSmallBatch(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance test in short mode")
	}

	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 30*time.Second)

	callCount := 0
	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			callCount++
			time.Sleep(2 * time.Millisecond) // Simulate realistic latency
			
			sar := &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: true,
				},
			}
			return true, sar, nil
		})

	// Test with realistic number of features
	req := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "default",
		Features: []string{
			"pods.delete", "pods.logs", "pods.exec", "pods.get",
			"deployments.restart", "deployments.get", "deployments.list",
			"configmaps.edit", "configmaps.get", "configmaps.list",
			"secrets.read", "secrets.list",
			"services.get", "services.list",
			"events.list", "events.get",
		},
	}

	ctx := context.Background()
	start := time.Now()
	
	result, err := service.CheckCapabilities(ctx, fakeClient, req, "user", []string{"group"})
	elapsed := time.Since(start)
	
	require.NoError(t, err)
	assert.Len(t, result.Caps, 16, "Should return results for all 16 features")
	
	t.Logf("Performance results:")
	t.Logf("  Features: %d", len(req.Features))
	t.Logf("  SSAR calls: %d", callCount)
	t.Logf("  Total time: %v", elapsed)
	t.Logf("  Average per feature: %v", elapsed/time.Duration(len(req.Features)))
	
	// Verify all capabilities are allowed
	for feature, allowed := range result.Caps {
		assert.True(t, allowed, "Feature %s should be allowed", feature)
	}
	
	// Check metrics
	stats := service.GetCacheStats()
	perfMetrics := stats["performance_metrics"].(map[string]interface{})
	assert.Greater(t, perfMetrics["total_requests"].(int64), int64(0))
	assert.Greater(t, perfMetrics["ssar_calls"].(int64), int64(0))
	
	// Should complete within reasonable time
	assert.LessOrEqual(t, elapsed, 100*time.Millisecond,
		"Should complete within 100ms but took %v", elapsed)
}

func TestPhase3_CacheHitRate(t *testing.T) {
	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 30*time.Second)

	callCount := 0
	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			callCount++
			sar := &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: true,
				},
			}
			return true, sar, nil
		})

	req := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "default",
		Features:  []string{"pods.delete", "pods.logs", "pods.exec"},
	}

	ctx := context.Background()
	
	// First request - should hit API
	_, err := service.CheckCapabilities(ctx, fakeClient, req, "user", []string{"group"})
	require.NoError(t, err)
	firstCallCount := callCount
	
	// Second request - should hit cache
	_, err = service.CheckCapabilities(ctx, fakeClient, req, "user", []string{"group"})
	require.NoError(t, err)
	secondCallCount := callCount
	
	// Third request - should hit cache
	_, err = service.CheckCapabilities(ctx, fakeClient, req, "user", []string{"group"})
	require.NoError(t, err)
	thirdCallCount := callCount
	
	// Verify caching behavior
	assert.Equal(t, 3, firstCallCount, "First request should make 3 SSAR calls")
	assert.Equal(t, 3, secondCallCount, "Second request should not make additional calls (cached)")
	assert.Equal(t, 3, thirdCallCount, "Third request should not make additional calls (cached)")
	
	// Check cache hit rate
	stats := service.GetCacheStats()
	cacheHitRate := stats["cache_hit_rate_percent"].(float64)
	
	t.Logf("Cache hit rate: %.2f%%", cacheHitRate)
	
	// Should have good cache hit rate (2 cache hits out of 3 requests = 66.7%)
	assert.GreaterOrEqual(t, cacheHitRate, 50.0, 
		"Cache hit rate should be at least 50%% but was %.2f%%", cacheHitRate)
}

func TestPhase3_AuditLogging(t *testing.T) {
	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 1*time.Second) // Short TTL

	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			sar := &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: false,
					Reason:  "test denial",
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
	result, err := service.CheckCapabilities(ctx, fakeClient, req, "test-user", []string{"test-group"})
	
	require.NoError(t, err)
	assert.False(t, result.Caps["pods.delete"], "Should be denied")
	assert.Contains(t, result.Reasons["pods.delete"], "test denial")
	
	// Verify audit information is available
	stats := service.GetCacheStats()
	perfMetrics := stats["performance_metrics"].(map[string]interface{})
	assert.Equal(t, int64(1), perfMetrics["total_requests"].(int64))
	
	t.Log("Audit logging test completed - check logs for audit entries")
}

func TestPhase3_MetricsCollection(t *testing.T) {
	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 30*time.Second)

	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
			sar := &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: true,
				},
			}
			return true, sar, nil
		})

	req := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "default",
		Features:  []string{"pods.delete", "pods.logs"},
	}

	ctx := context.Background()
	
	// Make some requests
	for i := 0; i < 5; i++ {
		modifiedReq := req
		modifiedReq.Namespace = fmt.Sprintf("ns-%d", i)
		_, err := service.CheckCapabilities(ctx, fakeClient, modifiedReq, "user", []string{"group"})
		require.NoError(t, err)
	}

	// Check comprehensive metrics
	stats := service.GetCacheStats()
	
	// Verify all expected metrics are present
	assert.Contains(t, stats, "capability_cache")
	assert.Contains(t, stats, "ssrr_cache")
	assert.Contains(t, stats, "performance_metrics")
	assert.Contains(t, stats, "cache_hit_rate_percent")
	assert.Contains(t, stats, "avg_latency_ms")
	assert.Contains(t, stats, "worker_pool_size")
	assert.Contains(t, stats, "ssrr_enabled")
	
	perfMetrics := stats["performance_metrics"].(map[string]interface{})
	assert.Equal(t, int64(5), perfMetrics["total_requests"].(int64))
	assert.Greater(t, perfMetrics["ssar_calls"].(int64), int64(0))
	
	t.Logf("Comprehensive metrics: %+v", stats)
}
