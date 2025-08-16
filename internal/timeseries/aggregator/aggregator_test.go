package aggregator

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	metricsfake "k8s.io/metrics/pkg/client/clientset/versioned/fake"

	"github.com/aaronlmathis/kaptn/internal/timeseries"
)

func TestNewAggregator(t *testing.T) {
	logger := zap.NewNop()
	store := timeseries.NewMemStore(timeseries.DefaultConfig())
	kubeClient := fake.NewSimpleClientset()
	metricsClient := metricsfake.NewSimpleClientset().MetricsV1beta1()
	restConfig := &rest.Config{}
	config := DefaultConfig()

	aggregator := NewAggregator(logger, store, kubeClient, metricsClient, restConfig, config)

	assert.NotNil(t, aggregator)
	assert.Equal(t, logger, aggregator.logger)
	assert.Equal(t, store, aggregator.store)
	assert.Equal(t, config, aggregator.config)
	assert.NotNil(t, aggregator.hostSnapshots)
	assert.NotNil(t, aggregator.stopCh)
	assert.NotNil(t, aggregator.done)
}

func TestDefaultConfig(t *testing.T) {
	config := DefaultConfig()

	assert.Equal(t, 1*time.Second, config.TickInterval)
	assert.Equal(t, 30*time.Second, config.CapacityRefreshInterval)
	assert.True(t, config.Enabled)
	assert.False(t, config.InsecureTLS)
}

func TestAggregatorStartStop(t *testing.T) {
	logger := zap.NewNop()
	store := timeseries.NewMemStore(timeseries.DefaultConfig())
	kubeClient := fake.NewSimpleClientset()
	metricsClient := metricsfake.NewSimpleClientset().MetricsV1beta1()
	restConfig := &rest.Config{}
	config := DefaultConfig()
	config.Enabled = false // Disable to prevent actual collection during test

	aggregator := NewAggregator(logger, store, kubeClient, metricsClient, restConfig, config)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	err := aggregator.Start(ctx)
	assert.NoError(t, err)

	// Cancel context and stop aggregator
	cancel()
	aggregator.Stop()
}

func TestHostSnapUpdate(t *testing.T) {
	logger := zap.NewNop()
	store := timeseries.NewMemStore(timeseries.DefaultConfig())
	kubeClient := fake.NewSimpleClientset()
	metricsClient := metricsfake.NewSimpleClientset().MetricsV1beta1()
	restConfig := &rest.Config{}
	config := DefaultConfig()

	aggregator := NewAggregator(logger, store, kubeClient, metricsClient, restConfig, config)

	// Test updating host snapshot
	aggregator.mu.Lock()
	aggregator.hostSnapshots["test-node"] = &hostSnap{
		Cores:        4.0,
		CPUUsedCores: 2.0,
		LastRx:       1000,
		LastTx:       2000,
		LastTs:       time.Now(),
	}
	aggregator.mu.Unlock()

	aggregator.mu.RLock()
	snap := aggregator.hostSnapshots["test-node"]
	aggregator.mu.RUnlock()

	assert.Equal(t, 4.0, snap.Cores)
	assert.Equal(t, 2.0, snap.CPUUsedCores)
	assert.Equal(t, uint64(1000), snap.LastRx)
	assert.Equal(t, uint64(2000), snap.LastTx)
}
