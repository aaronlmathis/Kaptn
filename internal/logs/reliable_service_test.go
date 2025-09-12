package logs

import (
	"context"
	"testing"
	"time"

	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zaptest"
)

func TestReliableLogService(t *testing.T) {
	logger := zaptest.NewLogger(t)

	cfg := config.LogsServiceConfig{
		GlobalMaxEntries:              1000,
		GlobalMaxAge:                  time.Hour,
		ScopeMaxEntries:               100,
		ScopeMaxAge:                   time.Hour,
		MaxSubscribers:                10,
		BufferSize:                    100,
		EvictionInterval:              time.Minute,
		CleanupInterval:               time.Minute,
		BackgroundCollectionEnabled:   false, // Disable for unit test
		BackgroundCollectionRetention: "1h",
		MaxStreamsPerUser:             5,
		MaxQueryLimit:                 1000,
		MaxExportSize:                 1024 * 1024,
		MaxConcurrentQueries:          5,
		RateLimitPerSecond:            100,
		BackpressureThreshold:         80,
		DegradedModeTimeout:           time.Minute,
	}

	service := NewReliableLogService(cfg, logger)
	require.NotNil(t, service)

	ctx := context.Background()
	err := service.Start(ctx)
	require.NoError(t, err)

	// Test ingestion
	entry := LogEntry{
		TS:        time.Now(),
		Level:     "info",
		Cluster:   "test-cluster",
		Namespace: "default",
		Workload:  "test-app",
		Pod:       "test-pod-1",
		Container: "main",
		Node:      "node-1",
		Msg:       "Test log message",
	}

	service.Ingest(entry)

	// Test replay
	filter := LogFilter{
		Namespace: "default",
		Limit:     10,
		Direction: "backward",
	}

	entries := service.Replay(filter)
	assert.Len(t, entries, 1)
	assert.Equal(t, "Test log message", entries[0].Msg)

	// Test streaming
	streamCh, cancel := service.Stream(filter)
	defer cancel()

	// Ingest another entry
	entry2 := entry
	entry2.Msg = "Second test message"
	service.Ingest(entry2)

	// Should receive the new entry on the stream
	select {
	case receivedEntry := <-streamCh:
		assert.Equal(t, "Second test message", receivedEntry.Msg)
	case <-time.After(time.Second):
		t.Fatal("Did not receive entry on stream")
	}

	// Test health
	health := service.Health()
	assert.Equal(t, "healthy", health.Status)
	assert.True(t, health.Started)

	// Test stats
	stats := service.Stats()
	assert.Greater(t, stats.GlobalRingSize, 0)

	service.Stop()
}

func TestReliableLogServiceCollectorConfig(t *testing.T) {
	logger := zaptest.NewLogger(t)

	cfg := config.LogsServiceConfig{
		GlobalMaxEntries:              1000,
		GlobalMaxAge:                  time.Hour,
		ScopeMaxEntries:               100,
		ScopeMaxAge:                   time.Hour,
		MaxSubscribers:                10,
		BufferSize:                    100,
		EvictionInterval:              time.Minute,
		CleanupInterval:               time.Minute,
		BackgroundCollectionEnabled:   true, // Enable for this test
		BackgroundCollectionRetention: "2h",
		MaxStreamsPerUser:             5,
		MaxQueryLimit:                 1000,
		MaxExportSize:                 1024 * 1024,
		MaxConcurrentQueries:          5,
		RateLimitPerSecond:            100,
		BackpressureThreshold:         80,
		DegradedModeTimeout:           time.Minute,
	}

	service := NewReliableLogService(cfg, logger)
	require.NotNil(t, service)

	// Note: We can't fully test the collector without a Kubernetes client
	// But we can verify the service handles collector setup gracefully

	// This should not fail even without a k8s client when background collection is enabled
	ctx := context.Background()
	err := service.Start(ctx)
	require.NoError(t, err)

	service.Stop()
}

func TestCollectorConfig(t *testing.T) {
	config := CollectorConfig{
		Enabled:                true,
		TailLines:              0, // Should get default
		MaxConcurrentStreams:   0, // Should get default
		LogRetention:           0, // Should get default
		StreamBufferSize:       0, // Should get default
		RestartBackoffInterval: 0, // Should get default
		RestartMaxInterval:     0, // Should get default
		ExcludeSystemPods:      true,
	}

	logger := zaptest.NewLogger(t)
	service := &MockLogService{}

	collector := NewLogCollector(logger, nil, service, "test-cluster", config)
	require.NotNil(t, collector)

	// Verify defaults were set
	assert.Equal(t, int64(100), collector.config.TailLines)
	assert.Equal(t, 50, collector.config.MaxConcurrentStreams)
	assert.Equal(t, 1000, collector.config.StreamBufferSize)
	assert.Equal(t, 5*time.Second, collector.config.RestartBackoffInterval)
	assert.Equal(t, 2*time.Minute, collector.config.RestartMaxInterval)
	assert.Equal(t, 1*time.Hour, collector.config.LogRetention)
}

// MockLogService for testing
type MockLogService struct {
	entries []LogEntry
}

func (m *MockLogService) Start(ctx context.Context) error    { return nil }
func (m *MockLogService) Ingest(entry LogEntry)              { m.entries = append(m.entries, entry) }
func (m *MockLogService) Replay(filter LogFilter) []LogEntry { return m.entries }
func (m *MockLogService) Stream(filter LogFilter) (<-chan LogEntry, func()) {
	ch := make(chan LogEntry, 10)
	return ch, func() { close(ch) }
}
func (m *MockLogService) RecordExport(format string, bytesExported int64, durationMs int64) {}
func (m *MockLogService) Stop()                                                             {}
func (m *MockLogService) Stats() ServiceStats                                               { return ServiceStats{} }
func (m *MockLogService) Health() HealthStatus                                              { return HealthStatus{Status: "healthy"} }
func (m *MockLogService) AdminClearRings() error                                            { m.entries = nil; return nil }
func (m *MockLogService) AdminGetDetailedStats() AdminStats                                 { return AdminStats{} }
func (m *MockLogService) AdminListActiveStreams() []StreamInfo                              { return nil }
func (m *MockLogService) AdminUpdateLimits(limits AdminLimits) error                        { return nil }
func (m *MockLogService) AdminGetCurrentLimits() AdminLimits                                { return AdminLimits{} }
