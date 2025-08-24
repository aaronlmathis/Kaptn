package authz

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zaptest"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestCapabilityService_Performance(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping performance test in short mode")
	}

	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 30*time.Second)

	// Create a fake Kubernetes client with fast responses
	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (bool, interface{}, error) {
			// Simulate a fast SSAR response
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

	// Test with 10 features as specified in acceptance criteria
	req := CapabilityRequest{
		Cluster:   "test-cluster",
		Namespace: "default",
		Features: []string{
			"pods.delete",
			"pods.logs",
			"pods.exec",
			"deployments.restart",
			"configmaps.edit",
			"secrets.read",
			"services.get",
			"namespaces.list",
			"roles.get",
			"events.list",
		},
	}

	userID := "test-user"
	groups := []string{"test-group"}
	ctx := context.Background()

	// Measure latency over multiple requests
	const numRequests = 100
	latencies := make([]time.Duration, numRequests)

	for i := 0; i < numRequests; i++ {
		start := time.Now()

		result, err := service.CheckCapabilities(ctx, fakeClient, req, userID, groups)

		latencies[i] = time.Since(start)

		require.NoError(t, err, "CheckCapabilities should not return error")
		assert.Len(t, result.Caps, 10, "Should return results for all 10 features")

		// Verify all capabilities are allowed in our test setup
		for feature, allowed := range result.Caps {
			assert.True(t, allowed, "Feature %s should be allowed in test setup", feature)
		}
	}

	// Calculate percentiles
	// Note: This is a simple percentile calculation for testing
	// In production, you'd use a proper statistics library
	sortedLatencies := make([]time.Duration, len(latencies))
	copy(sortedLatencies, latencies)

	// Simple bubble sort for testing purposes
	for i := 0; i < len(sortedLatencies); i++ {
		for j := 0; j < len(sortedLatencies)-1-i; j++ {
			if sortedLatencies[j] > sortedLatencies[j+1] {
				sortedLatencies[j], sortedLatencies[j+1] = sortedLatencies[j+1], sortedLatencies[j]
			}
		}
	}

	p50 := sortedLatencies[len(sortedLatencies)*50/100]
	p95 := sortedLatencies[len(sortedLatencies)*95/100]
	p99 := sortedLatencies[len(sortedLatencies)*99/100]

	t.Logf("Performance results for %d requests with 10 features:", numRequests)
	t.Logf("P50: %v", p50)
	t.Logf("P95: %v", p95)
	t.Logf("P99: %v", p99)

	// Phase 1 acceptance criteria: p95 latency ≤ 150 ms for 10 features
	assert.LessOrEqual(t, p95, 150*time.Millisecond,
		"P95 latency should be ≤ 150ms but was %v", p95)

	// Additional checks for reasonable performance
	assert.LessOrEqual(t, p50, 50*time.Millisecond,
		"P50 latency should be reasonable (≤ 50ms) but was %v", p50)
}

func TestCapabilityService_CacheEffectiveness(t *testing.T) {
	logger := zaptest.NewLogger(t)
	service := NewCapabilityService(logger, 30*time.Second)

	// Create a fake client that tracks how many times it's called
	callCount := 0
	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews",
		func(action ktesting.Action) (bool, interface{}, error) {
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
		Features:  []string{"pods.delete", "pods.logs"},
	}

	userID := "test-user"
	groups := []string{"test-group"}
	ctx := context.Background()

	// First request should hit the API
	_, err := service.CheckCapabilities(ctx, fakeClient, req, userID, groups)
	require.NoError(t, err)
	assert.Equal(t, 2, callCount, "Should make 2 SSAR calls for 2 features")

	// Second identical request should hit cache
	_, err = service.CheckCapabilities(ctx, fakeClient, req, userID, groups)
	require.NoError(t, err)
	assert.Equal(t, 2, callCount, "Should not make additional SSAR calls (cache hit)")

	// Different request should hit API again
	req.Features = []string{"secrets.read"}
	_, err = service.CheckCapabilities(ctx, fakeClient, req, userID, groups)
	require.NoError(t, err)
	assert.Equal(t, 3, callCount, "Should make 1 additional SSAR call for different request")
}
