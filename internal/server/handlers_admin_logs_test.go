package server

import (
	"testing"
	"time"

	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/logs"
	"github.com/stretchr/testify/assert"
)

// TestAdminMethodsIntegration tests the admin methods on a real service instance
func TestAdminMethodsIntegration(t *testing.T) {
	// Create a real service for integration testing
	cfg := config.LogsServiceConfig{
		GlobalMaxEntries: 1000,
		ScopeMaxEntries:  500,
		MaxSubscribers:   10,
		BufferSize:       100,
		GlobalMaxAge:     time.Hour,
		ScopeMaxAge:      30 * time.Minute,
		EvictionInterval: time.Minute,
		CleanupInterval:  time.Minute,
	}

	service := logs.NewService(cfg)
	defer service.Stop()

	t.Run("AdminClearRings", func(t *testing.T) {
		// This should work without error
		err := service.AdminClearRings()
		assert.NoError(t, err)
	})

	t.Run("AdminGetDetailedStats", func(t *testing.T) {
		stats := service.AdminGetDetailedStats()
		// Check that we got valid statistics
		assert.GreaterOrEqual(t, stats.GlobalRingSize, 0)
		assert.GreaterOrEqual(t, stats.ScopedRingsCount, 0)
		assert.NotNil(t, stats.RingDetails)
		assert.NotNil(t, stats.MemoryUsage)
		assert.NotNil(t, stats.BackgroundWorkers)
	})

	t.Run("AdminListActiveStreams", func(t *testing.T) {
		streams := service.AdminListActiveStreams()
		// Initially no streams should be active
		assert.NotNil(t, streams)
		assert.Len(t, streams, 0)
	})

	t.Run("AdminUpdateLimits", func(t *testing.T) {
		limits := logs.AdminLimits{
			MaxSubscribers:        100,
			MaxStreamsPerUser:     10,
			MaxBufferSize:         1000,
			MaxQueryLimit:         5000,
			MaxExportSize:         10485760,
			MaxConcurrentQueries:  20,
			RateLimitPerSecond:    100,
			BackpressureThreshold: 90,
			DegradedModeTimeout:   30 * time.Second,
		}

		err := service.AdminUpdateLimits(limits)
		assert.NoError(t, err)

		// Verify the limits were set
		currentLimits := service.AdminGetCurrentLimits()
		assert.Equal(t, limits.MaxSubscribers, currentLimits.MaxSubscribers)
		assert.Equal(t, limits.MaxBufferSize, currentLimits.MaxBufferSize)
		assert.Equal(t, limits.DegradedModeTimeout, currentLimits.DegradedModeTimeout)
	})

	t.Run("AdminGetCurrentLimits", func(t *testing.T) {
		limits := service.AdminGetCurrentLimits()
		// Should have some default or previously set limits
		assert.GreaterOrEqual(t, limits.MaxSubscribers, 0)
		assert.GreaterOrEqual(t, limits.MaxBufferSize, 0)
	})
}

// TestAdminOperationsWithData tests admin operations when service has some data
func TestAdminOperationsWithData(t *testing.T) {
	cfg := config.LogsServiceConfig{
		GlobalMaxEntries: 100,
		ScopeMaxEntries:  50,
		MaxSubscribers:   5,
		BufferSize:       10,
		GlobalMaxAge:     time.Hour,
		ScopeMaxAge:      30 * time.Minute,
		EvictionInterval: time.Minute,
		CleanupInterval:  time.Minute,
	}

	service := logs.NewService(cfg)
	defer service.Stop()

	// Add some test data
	testEntries := []logs.LogEntry{
		{
			TS:        time.Now(),
			Namespace: "default",
			Pod:       "test-pod-1",
			Container: "main",
			Msg:       "Test log message 1",
			Level:     "info",
		},
		{
			TS:        time.Now(),
			Namespace: "kube-system",
			Pod:       "test-pod-2",
			Container: "main",
			Msg:       "Test log message 2",
			Level:     "error",
		},
		{
			TS:        time.Now(),
			Namespace: "default",
			Pod:       "test-pod-3",
			Container: "sidecar",
			Msg:       "Test log message 3",
			Level:     "warn",
		},
	}

	for _, entry := range testEntries {
		service.Ingest(entry)
	}

	t.Run("StatsWithData", func(t *testing.T) {
		stats := service.AdminGetDetailedStats()

		// Should have some entries now
		assert.Greater(t, stats.GlobalRingSize, 0)

		// Should have ring details
		assert.NotEmpty(t, stats.RingDetails)

		// Memory usage should be positive
		assert.Greater(t, stats.MemoryUsage.TotalBytes, int64(0))
	})

	t.Run("ClearRingsWithData", func(t *testing.T) {
		// Clear all rings
		err := service.AdminClearRings()
		assert.NoError(t, err)

		// Stats should show rings are cleared
		stats := service.AdminGetDetailedStats()
		assert.Equal(t, 0, stats.GlobalRingSize)
	})
}

// TestAdminStreamsTracking tests stream lifecycle tracking
func TestAdminStreamsTracking(t *testing.T) {
	cfg := config.LogsServiceConfig{
		GlobalMaxEntries: 100,
		ScopeMaxEntries:  50,
		MaxSubscribers:   5,
		BufferSize:       10,
		GlobalMaxAge:     time.Hour,
		ScopeMaxAge:      30 * time.Minute,
		EvictionInterval: time.Minute,
		CleanupInterval:  time.Minute,
	}

	service := logs.NewService(cfg)
	defer service.Stop()

	// Add some test data
	entry := logs.LogEntry{
		TS:        time.Now(),
		Namespace: "default",
		Pod:       "test-pod",
		Container: "main",
		Msg:       "Test message",
		Level:     "info",
	}
	service.Ingest(entry)

	t.Run("StreamLifecycle", func(t *testing.T) {
		// Initially no active streams
		streams := service.AdminListActiveStreams()
		assert.Len(t, streams, 0)

		// Create a subscription (this creates a stream)
		filter := logs.LogFilter{
			Namespace: "default",
		}

		ch, cancel := service.Stream(filter)
		defer cancel()

		// Should have one active stream now
		streams = service.AdminListActiveStreams()
		assert.Len(t, streams, 1)

		if len(streams) > 0 {
			stream := streams[0]
			assert.NotEmpty(t, stream.StreamID)
			assert.NotEmpty(t, stream.SubscriberID)
			assert.False(t, stream.CreatedAt.IsZero())
		}

		// Verify we can read from the channel
		select {
		case entry := <-ch:
			assert.Equal(t, "default", entry.Namespace)
		case <-time.After(100 * time.Millisecond):
			t.Log("No entry received within timeout (may be expected)")
		}

		// Cancel the subscription
		cancel()

		// Give it a moment for cleanup
		time.Sleep(10 * time.Millisecond)

		// Should have no active streams again
		streams = service.AdminListActiveStreams()
		assert.Len(t, streams, 0)
	})

	t.Run("ReplayFunctionality", func(t *testing.T) {
		// Test replay (which is a query, not a stream)
		filter := logs.LogFilter{
			Namespace: "default",
		}

		entries := service.Replay(filter)
		assert.NotNil(t, entries)
		// Should have at least the entry we added
		assert.GreaterOrEqual(t, len(entries), 1)

		if len(entries) > 0 {
			found := false
			for _, e := range entries {
				if e.Namespace == "default" && e.Pod == "test-pod" {
					found = true
					break
				}
			}
			assert.True(t, found, "Should find the test entry we added")
		}
	})
}
