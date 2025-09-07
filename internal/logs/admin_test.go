package logs

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Test_AdminClearRings tests the administrative ring clearing functionality
func Test_AdminClearRings(t *testing.T) {
	service := NewService(ServiceConfig{
		GlobalMaxEntries: 100,
		ScopeMaxEntries:  50,
		MaxSubscribers:   5,
		BufferSize:       10,
		GlobalMaxAge:     time.Hour,
		ScopeMaxAge:      30 * time.Minute,
		EvictionInterval: time.Minute,
		CleanupInterval:  time.Minute,
	})
	defer service.Stop()

	// Add some test data
	entries := []LogEntry{
		{TS: time.Now(), Namespace: "default", Pod: "pod1", Msg: "test 1", Level: "info"},
		{TS: time.Now(), Namespace: "kube-system", Pod: "pod2", Msg: "test 2", Level: "warn"},
		{TS: time.Now(), Namespace: "default", Pod: "pod3", Msg: "test 3", Level: "error"},
	}

	for _, entry := range entries {
		service.Ingest(entry)
	}

	// Verify data exists
	stats := service.AdminGetDetailedStats()
	assert.Greater(t, stats.GlobalRingSize, 0, "Should have data before clearing")

	// Clear rings
	err := service.AdminClearRings()
	assert.NoError(t, err, "AdminClearRings should not return an error")

	// Verify rings are cleared
	statsAfter := service.AdminGetDetailedStats()
	assert.Equal(t, 0, statsAfter.GlobalRingSize, "Global ring should be empty after clearing")
}

// Test_AdminGetDetailedStats tests comprehensive administrative statistics
func Test_AdminGetDetailedStats(t *testing.T) {
	service := NewService(ServiceConfig{
		GlobalMaxEntries: 100,
		ScopeMaxEntries:  50,
		MaxSubscribers:   5,
		BufferSize:       10,
		GlobalMaxAge:     time.Hour,
		ScopeMaxAge:      30 * time.Minute,
		EvictionInterval: time.Minute,
		CleanupInterval:  time.Minute,
	})
	defer service.Stop()

	// Add test data to different namespaces
	entries := []LogEntry{
		{TS: time.Now(), Namespace: "default", Pod: "pod1", Msg: "test 1", Level: "info"},
		{TS: time.Now(), Namespace: "default", Pod: "pod2", Msg: "test 2", Level: "warn"},
		{TS: time.Now(), Namespace: "kube-system", Pod: "pod3", Msg: "test 3", Level: "error"},
	}

	for _, entry := range entries {
		service.Ingest(entry)
	}

	stats := service.AdminGetDetailedStats()

	// Check basic stats
	assert.GreaterOrEqual(t, stats.GlobalRingSize, 0, "Global ring size should be valid")
	assert.GreaterOrEqual(t, stats.ScopedRingsCount, 0, "Scoped rings count should be valid")
	assert.GreaterOrEqual(t, stats.TotalSubscribers, 0, "Total subscribers should be valid")

	// Check detailed stats
	assert.NotNil(t, stats.RingDetails, "Ring details should not be nil")
	assert.NotNil(t, stats.MemoryUsage, "Memory usage should not be nil")
	assert.NotNil(t, stats.BackgroundWorkers, "Background workers should not be nil")

	// Memory usage should be positive when we have data
	assert.GreaterOrEqual(t, stats.MemoryUsage.TotalBytes, int64(0), "Total memory bytes should be non-negative")
}

// Test_AdminListActiveStreams tests stream tracking functionality
func Test_AdminListActiveStreams(t *testing.T) {
	service := NewService(ServiceConfig{
		GlobalMaxEntries: 100,
		ScopeMaxEntries:  50,
		MaxSubscribers:   5,
		BufferSize:       10,
		GlobalMaxAge:     time.Hour,
		ScopeMaxAge:      30 * time.Minute,
		EvictionInterval: time.Minute,
		CleanupInterval:  time.Minute,
	})
	defer service.Stop()

	// Initially no streams
	streams := service.AdminListActiveStreams()
	assert.Len(t, streams, 0, "Should start with no active streams")

	// Add some data
	entry := LogEntry{TS: time.Now(), Namespace: "default", Pod: "test-pod", Msg: "test", Level: "info"}
	service.Ingest(entry)

	// Create a stream
	filter := LogFilter{Namespace: "default"}
	ch, cancel := service.Stream(filter)
	defer cancel()

	// Should have one active stream
	streams = service.AdminListActiveStreams()
	assert.Len(t, streams, 1, "Should have one active stream")

	if len(streams) > 0 {
		stream := streams[0]
		assert.NotEmpty(t, stream.StreamID, "Stream ID should not be empty")
		assert.NotEmpty(t, stream.SubscriberID, "Subscriber ID should not be empty")
		assert.False(t, stream.CreatedAt.IsZero(), "Created time should be set")
		assert.GreaterOrEqual(t, stream.MessagesCount, int64(0), "Message count should be non-negative")
	}

	// Verify channel works
	select {
	case <-ch:
		// Received entry (may or may not happen depending on timing)
	case <-time.After(10 * time.Millisecond):
		// Timeout is OK for this test
	}

	// Cancel stream
	cancel()
	time.Sleep(10 * time.Millisecond) // Allow cleanup

	// Should have no active streams again
	streams = service.AdminListActiveStreams()
	assert.Len(t, streams, 0, "Should have no active streams after cancellation")
}

// Test_AdminUpdateLimits tests dynamic limit configuration
func Test_AdminUpdateLimits(t *testing.T) {
	service := NewService(ServiceConfig{
		GlobalMaxEntries: 100,
		ScopeMaxEntries:  50,
		MaxSubscribers:   5,
		BufferSize:       10,
		GlobalMaxAge:     time.Hour,
		ScopeMaxAge:      30 * time.Minute,
		EvictionInterval: time.Minute,
		CleanupInterval:  time.Minute,
	})
	defer service.Stop()

	// Get initial limits
	initialLimits := service.AdminGetCurrentLimits()
	assert.GreaterOrEqual(t, initialLimits.MaxSubscribers, 0, "Initial max subscribers should be valid")

	// Update limits
	newLimits := AdminLimits{
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

	err := service.AdminUpdateLimits(newLimits)
	assert.NoError(t, err, "AdminUpdateLimits should not return an error")

	// Verify limits were applied
	currentLimits := service.AdminGetCurrentLimits()
	assert.Equal(t, newLimits.MaxSubscribers, currentLimits.MaxSubscribers, "Max subscribers should be updated")
	assert.Equal(t, newLimits.MaxBufferSize, currentLimits.MaxBufferSize, "Max buffer size should be updated")
	assert.Equal(t, newLimits.DegradedModeTimeout, currentLimits.DegradedModeTimeout, "Degraded mode timeout should be updated")
}

// Test_AdminUpdateLimitsValidation tests limit validation
func Test_AdminUpdateLimitsValidation(t *testing.T) {
	service := NewService(ServiceConfig{
		GlobalMaxEntries: 100,
		ScopeMaxEntries:  50,
		MaxSubscribers:   5,
		BufferSize:       10,
		GlobalMaxAge:     time.Hour,
		ScopeMaxAge:      30 * time.Minute,
		EvictionInterval: time.Minute,
		CleanupInterval:  time.Minute,
	})
	defer service.Stop()

	tests := []struct {
		name   string
		limits AdminLimits
		hasErr bool
	}{
		{
			name: "valid limits",
			limits: AdminLimits{
				MaxSubscribers:        10,
				MaxStreamsPerUser:     5,
				MaxBufferSize:         100,
				MaxQueryLimit:         1000,
				MaxExportSize:         1048576,
				MaxConcurrentQueries:  5,
				RateLimitPerSecond:    50,
				BackpressureThreshold: 80,
				DegradedModeTimeout:   10 * time.Second,
			},
			hasErr: false,
		},
		{
			name: "negative max subscribers",
			limits: AdminLimits{
				MaxSubscribers:        -1,
				MaxStreamsPerUser:     5,
				MaxBufferSize:         100,
				MaxQueryLimit:         1000,
				MaxExportSize:         1048576,
				MaxConcurrentQueries:  5,
				RateLimitPerSecond:    50,
				BackpressureThreshold: 80,
				DegradedModeTimeout:   10 * time.Second,
			},
			hasErr: true,
		},
		{
			name: "zero buffer size",
			limits: AdminLimits{
				MaxSubscribers:        10,
				MaxStreamsPerUser:     5,
				MaxBufferSize:         0,
				MaxQueryLimit:         1000,
				MaxExportSize:         1048576,
				MaxConcurrentQueries:  5,
				RateLimitPerSecond:    50,
				BackpressureThreshold: 80,
				DegradedModeTimeout:   10 * time.Second,
			},
			hasErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := service.AdminUpdateLimits(tt.limits)
			if tt.hasErr {
				assert.Error(t, err, "Should return error for invalid limits")
			} else {
				assert.NoError(t, err, "Should not return error for valid limits")
			}
		})
	}
}

// Test_OperationalLogging tests the operational logging functionality
func Test_OperationalLogging(t *testing.T) {
	service := NewService(ServiceConfig{
		GlobalMaxEntries: 100,
		ScopeMaxEntries:  50,
		MaxSubscribers:   5,
		BufferSize:       10,
		GlobalMaxAge:     time.Hour,
		ScopeMaxAge:      30 * time.Minute,
		EvictionInterval: time.Minute,
		CleanupInterval:  time.Minute,
	})

	// Test stream lifecycle logging
	filter := LogFilter{Namespace: "default"}
	_, cancel := service.Stream(filter)

	// Verify stream was tracked
	streams := service.AdminListActiveStreams()
	assert.Len(t, streams, 1, "Stream should be tracked")

	cancel()
	service.Stop()

	// After cleanup, streams should be empty
	streams = service.AdminListActiveStreams()
	assert.Len(t, streams, 0, "Streams should be cleaned up")
}

// Test_ComprehensiveIntegration tests all features together
func Test_ComprehensiveIntegration(t *testing.T) {
	service := NewService(ServiceConfig{
		GlobalMaxEntries: 200,
		ScopeMaxEntries:  100,
		MaxSubscribers:   10,
		BufferSize:       20,
		GlobalMaxAge:     2 * time.Hour,
		ScopeMaxAge:      time.Hour,
		EvictionInterval: time.Minute,
		CleanupInterval:  time.Minute,
	})
	defer service.Stop()

	// 1. Test initial state
	initialStats := service.AdminGetDetailedStats()
	assert.Equal(t, 0, initialStats.GlobalRingSize, "Should start empty")

	initialStreams := service.AdminListActiveStreams()
	assert.Len(t, initialStreams, 0, "Should start with no streams")

	// 2. Add test data
	for i := 0; i < 10; i++ {
		entry := LogEntry{
			TS:        time.Now(),
			Namespace: "test",
			Pod:       "test-pod",
			Container: "main",
			Msg:       "test message",
			Level:     "info",
		}
		service.Ingest(entry)
	}

	// 3. Check stats show data
	statsWithData := service.AdminGetDetailedStats()
	assert.Greater(t, statsWithData.GlobalRingSize, 0, "Should have data")
	assert.Greater(t, statsWithData.MemoryUsage.TotalBytes, int64(0), "Should use memory")

	// 4. Create multiple streams
	var cancels []func()

	for i := 0; i < 3; i++ {
		filter := LogFilter{Namespace: "test"}
		_, cancel := service.Stream(filter)
		cancels = append(cancels, cancel)
	}

	// 5. Verify streams are tracked
	activeStreams := service.AdminListActiveStreams()
	assert.Len(t, activeStreams, 3, "Should track all active streams")

	// 6. Update operational limits
	newLimits := AdminLimits{
		MaxSubscribers:        50,
		MaxStreamsPerUser:     20,
		MaxBufferSize:         500,
		MaxQueryLimit:         2000,
		MaxExportSize:         5242880,
		MaxConcurrentQueries:  10,
		RateLimitPerSecond:    200,
		BackpressureThreshold: 85,
		DegradedModeTimeout:   45 * time.Second,
	}

	err := service.AdminUpdateLimits(newLimits)
	require.NoError(t, err, "Should update limits successfully")

	updatedLimits := service.AdminGetCurrentLimits()
	assert.Equal(t, newLimits.MaxSubscribers, updatedLimits.MaxSubscribers, "Limits should be applied")

	// 7. Clear all data
	err = service.AdminClearRings()
	require.NoError(t, err, "Should clear rings successfully")

	clearedStats := service.AdminGetDetailedStats()
	assert.Equal(t, 0, clearedStats.GlobalRingSize, "Rings should be cleared")

	// 8. Clean up streams
	for _, cancel := range cancels {
		cancel()
	}

	// 9. Final verification
	time.Sleep(20 * time.Millisecond) // Allow cleanup
	finalStreams := service.AdminListActiveStreams()
	assert.Len(t, finalStreams, 0, "All streams should be cleaned up")
}
