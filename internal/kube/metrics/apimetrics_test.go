package metrics

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zaptest"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	fakeMetrics "k8s.io/metrics/pkg/client/clientset/versioned/fake"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
)

func TestAPIMetricsAdapter_HasMetricsAPI(t *testing.T) {
	logger := zaptest.NewLogger(t)

	tests := []struct {
		name      string
		hasClient bool
		expected  bool
	}{
		{
			name:      "metrics API available",
			hasClient: true,
			expected:  true,
		},
		{
			name:      "metrics API not available",
			hasClient: false,
			expected:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			kubeClient := fake.NewSimpleClientset()

			var adapter *APIMetricsAdapter
			if tt.hasClient {
				metricsClient := fakeMetrics.NewSimpleClientset()
				adapter = NewAPIMetricsAdapter(logger, kubeClient, metricsClient.MetricsV1beta1())
			} else {
				adapter = NewAPIMetricsAdapter(logger, kubeClient, nil)
			}

			result := adapter.HasMetricsAPI(context.Background())
			assert.Equal(t, tt.expected, result)

			// Test that subsequent calls return cached result
			result2 := adapter.HasMetricsAPI(context.Background())
			assert.Equal(t, tt.expected, result2)
		})
	}
}

func TestAPIMetricsAdapter_ListNodeCPUUsage_NoMetricsAPI(t *testing.T) {
	logger := zaptest.NewLogger(t)
	kubeClient := fake.NewSimpleClientset()

	adapter := NewAPIMetricsAdapter(logger, kubeClient, nil)

	result, err := adapter.ListNodeCPUUsage(context.Background())

	require.NoError(t, err)
	assert.Equal(t, map[string]float64{}, result)
}

func TestAPIMetricsAdapter_ListNodeCPUUsage_WithMetricsAPI(t *testing.T) {
	logger := zaptest.NewLogger(t)

	kubeClient := fake.NewSimpleClientset()
	metricsClient := fakeMetrics.NewSimpleClientset()
	adapter := NewAPIMetricsAdapter(logger, kubeClient, metricsClient.MetricsV1beta1())

	result, err := adapter.ListNodeCPUUsage(context.Background())

	require.NoError(t, err)
	// With fake client, we expect empty results but no error
	assert.Equal(t, map[string]float64{}, result)
}

func TestAPIMetricsAdapter_ListNodeMemoryUsage_NoMetricsAPI(t *testing.T) {
	logger := zaptest.NewLogger(t)
	kubeClient := fake.NewSimpleClientset()

	adapter := NewAPIMetricsAdapter(logger, kubeClient, nil)

	result, err := adapter.ListNodeMemoryUsage(context.Background())

	require.NoError(t, err)
	assert.Equal(t, map[string]float64{}, result)
}

func TestAPIMetricsAdapter_ListNodeMemoryUsage_WithMetricsAPI(t *testing.T) {
	logger := zaptest.NewLogger(t)
	kubeClient := fake.NewSimpleClientset()

	// Create fake node metrics
	nodeMetrics := &metricsv1beta1.NodeMetricsList{
		Items: []metricsv1beta1.NodeMetrics{
			{
				ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
				Usage: corev1.ResourceList{
					corev1.ResourceMemory: *resource.NewQuantity(2*1024*1024*1024, resource.BinarySI), // 2Gi
				},
			},
			{
				ObjectMeta: metav1.ObjectMeta{Name: "node-2"},
				Usage: corev1.ResourceList{
					corev1.ResourceMemory: *resource.NewQuantity(4*1024*1024*1024, resource.BinarySI), // 4Gi
				},
			},
		},
	}

	metricsClient := fakeMetrics.NewSimpleClientset(nodeMetrics)
	adapter := NewAPIMetricsAdapter(logger, kubeClient, metricsClient.MetricsV1beta1())

	result, err := adapter.ListNodeMemoryUsage(context.Background())

	require.NoError(t, err)
	expected := map[string]float64{
		"node-1": float64(2 * 1024 * 1024 * 1024),
		"node-2": float64(4 * 1024 * 1024 * 1024),
	}
	assert.Equal(t, expected, result)
}

func TestAPIMetricsAdapter_GetTotalClusterCPUUsage(t *testing.T) {
	logger := zaptest.NewLogger(t)

	kubeClient := fake.NewSimpleClientset()
	metricsClient := fakeMetrics.NewSimpleClientset()
	adapter := NewAPIMetricsAdapter(logger, kubeClient, metricsClient.MetricsV1beta1())

	result, err := adapter.GetTotalClusterCPUUsage(context.Background())

	require.NoError(t, err)
	// With fake client, we expect 0 but no error
	assert.Equal(t, 0.0, result)
}
