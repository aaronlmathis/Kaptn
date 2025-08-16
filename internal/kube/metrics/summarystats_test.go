package metrics

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zaptest"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

func TestSummaryStatsAdapter_NewSummaryStatsAdapter(t *testing.T) {
	logger := zaptest.NewLogger(t)
	kubeClient := fake.NewSimpleClientset()

	restConfig := &rest.Config{
		Host: "https://kubernetes.example.com",
	}

	adapter := NewSummaryStatsAdapter(logger, kubeClient, restConfig, false)

	assert.NotNil(t, adapter)
	assert.Equal(t, logger, adapter.logger)
	assert.Equal(t, kubeClient, adapter.kubeClient)
	assert.Equal(t, restConfig, adapter.restConfig)
	assert.NotNil(t, adapter.httpClient)
}

func TestSummaryStatsAdapter_HasSummaryAPI_NoNodes(t *testing.T) {
	logger := zaptest.NewLogger(t)
	kubeClient := fake.NewSimpleClientset()

	restConfig := &rest.Config{
		Host: "https://kubernetes.example.com",
	}

	adapter := NewSummaryStatsAdapter(logger, kubeClient, restConfig, false)

	result := adapter.HasSummaryAPI(context.Background())

	// Should return false when no nodes are available
	assert.False(t, result)
}

func TestSummaryStatsAdapter_HasSummaryAPI_WithNodes(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create a fake node
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-node",
		},
		Status: corev1.NodeStatus{
			Conditions: []corev1.NodeCondition{
				{
					Type:   corev1.NodeReady,
					Status: corev1.ConditionTrue,
				},
			},
		},
	}

	kubeClient := fake.NewSimpleClientset(node)

	restConfig := &rest.Config{
		Host: "https://kubernetes.example.com",
	}

	adapter := NewSummaryStatsAdapter(logger, kubeClient, restConfig, false)

	result := adapter.HasSummaryAPI(context.Background())

	// Will return false because we can't actually reach the Summary API in tests
	// This is expected behavior for unit tests
	assert.False(t, result)
}

func TestSummaryStatsAdapter_ListNodeNetworkStats_NoNodes(t *testing.T) {
	logger := zaptest.NewLogger(t)
	kubeClient := fake.NewSimpleClientset()

	restConfig := &rest.Config{
		Host: "https://kubernetes.example.com",
	}

	adapter := NewSummaryStatsAdapter(logger, kubeClient, restConfig, false)

	result, err := adapter.ListNodeNetworkStats(context.Background())

	require.NoError(t, err)
	assert.Empty(t, result)
}

func TestSummaryStatsAdapter_GetClusterNetworkStats_NoNodes(t *testing.T) {
	logger := zaptest.NewLogger(t)
	kubeClient := fake.NewSimpleClientset()

	restConfig := &rest.Config{
		Host: "https://kubernetes.example.com",
	}

	adapter := NewSummaryStatsAdapter(logger, kubeClient, restConfig, false)

	result, err := adapter.GetClusterNetworkStats(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "cluster", result.NodeName)
	assert.Equal(t, uint64(0), result.RxBytes)
	assert.Equal(t, uint64(0), result.TxBytes)
}
