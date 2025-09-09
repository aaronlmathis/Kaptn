package logs_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/logs"
)

// Tests for backpressure handling, memory bounds, and performance characteristics

func TestSlowClientBackpressure(t *testing.T) {
	t.Parallel()

	// Create log cache service with small buffer for testing backpressure
	cfg, err := config.Load()
	require.NoError(t, err)
	serviceConfig, err := cfg.GetLogsServiceConfig()
	require.NoError(t, err)
	serviceConfig.BufferSize = 5 // Small buffer to trigger backpressure quickly
	service := logs.NewService(serviceConfig)
	defer service.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := service.Start(ctx); err != nil {
		t.Fatalf("Failed to start service: %v", err)
	}

	// Create stream subscription
	streamFilter := logs.LogFilter{
		Namespace: "test-namespace",
		Direction: "forward",
	}

	streamCh, cancelStream := service.Stream(streamFilter)
	defer cancelStream()

	// Simulate slow client by not reading from channel immediately
	var receivedEntries []logs.LogEntry
	var mu sync.Mutex

	// Start slow reader after delay
	go func() {
		time.Sleep(500 * time.Millisecond) // Delay to build up backpressure

		for entry := range streamCh {
			mu.Lock()
			receivedEntries = append(receivedEntries, entry)
			mu.Unlock()

			time.Sleep(100 * time.Millisecond) // Slow processing
		}
	}()

	// Rapidly ingest many entries to trigger backpressure
	for i := 0; i < 50; i++ {
		entry := logs.LogEntry{
			TS:        time.Now().Add(time.Duration(i) * time.Millisecond),
			Level:     "INFO",
			Cluster:   "test-cluster",
			Namespace: "test-namespace",
			Workload:  "load-test",
			Pod:       fmt.Sprintf("pod-%d", i),
			Container: "container",
			Msg:       fmt.Sprintf("Rapid message %d", i),
		}

		service.Ingest(entry)

		if i%10 == 0 {
			time.Sleep(10 * time.Millisecond) // Brief pause every 10 entries
		}
	}

	// Wait for processing to stabilize
	time.Sleep(2 * time.Second)

	mu.Lock()
	receivedCount := len(receivedEntries)
	mu.Unlock()

	// With backpressure, we might not receive all 50 entries
	// But we should receive a reasonable number
	assert.GreaterOrEqual(t, receivedCount, 5, "Should receive some entries despite backpressure")
	assert.LessOrEqual(t, receivedCount, 50, "Should not receive more entries than sent")

	// Verify the bus handled backpressure gracefully (no panics, clean shutdown)
	stats := service.Stats()
	assert.GreaterOrEqual(t, stats.GlobalRingSize, 0, "Should have valid global ring size")
}

func TestMemoryBounds(t *testing.T) {
	t.Parallel()

	// Create log cache service with controlled limits
	cfg, err := config.Load()
	require.NoError(t, err)
	serviceConfig, err := cfg.GetLogsServiceConfig()
	require.NoError(t, err)
	serviceConfig.GlobalMaxEntries = 100
	serviceConfig.ScopeMaxEntries = 20
	service := logs.NewService(serviceConfig)
	defer service.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := service.Start(ctx); err != nil {
		t.Fatalf("Failed to start service: %v", err)
	}

	// Ingest more entries than the limit to test eviction
	numEntries := 200 // Double the global limit

	for i := 0; i < numEntries; i++ {
		entry := logs.LogEntry{
			TS:        time.Now().Add(time.Duration(i) * time.Millisecond),
			Level:     "INFO",
			Cluster:   "test-cluster",
			Namespace: "default",
			Workload:  "memory-test",
			Pod:       fmt.Sprintf("pod-%d", i),
			Container: "container",
			Msg:       fmt.Sprintf("Memory test message %d", i),
		}

		service.Ingest(entry)
	}

	// Wait for processing
	time.Sleep(100 * time.Millisecond)

	// Verify memory bounds are respected
	stats := service.Stats()
	assert.LessOrEqual(t, int(stats.GlobalRingSize), serviceConfig.GlobalMaxEntries,
		"Global ring size should not exceed configured limit")

	// Verify we can still query and get recent entries
	filter := logs.LogFilter{
		Namespace: "default",
		Direction: "backward", // Get most recent
		Limit:     50,
	}

	results := service.Replay(filter)
	assert.GreaterOrEqual(t, len(results), 50, "Should still be able to query recent entries")

	// Verify the most recent entries are preserved
	checkCount := len(results)
	if checkCount > 10 {
		checkCount = 10
	}
	for i, result := range results[:checkCount] { // Check first 10 (most recent)
		expectedMsg := fmt.Sprintf("Memory test message %d", numEntries-1-i)
		assert.Equal(t, expectedMsg, result.Msg, "Most recent entries should be preserved")
	}
}

func TestTimeBasedEviction(t *testing.T) {
	t.Parallel()

	// Create log cache service with short TTL for testing
	cfg, err := config.Load()
	require.NoError(t, err)
	serviceConfig, err := cfg.GetLogsServiceConfig()
	require.NoError(t, err)
	serviceConfig.GlobalMaxAge = 2 * time.Second            // Very short for testing
	serviceConfig.EvictionInterval = 500 * time.Millisecond // Fast eviction
	service := logs.NewService(serviceConfig)
	defer service.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := service.Start(ctx); err != nil {
		t.Fatalf("Failed to start service: %v", err)
	}

	// Ingest old entry
	oldEntry := logs.LogEntry{
		TS:        time.Now().Add(-5 * time.Second), // Much older than TTL
		Level:     "INFO",
		Cluster:   "test-cluster",
		Namespace: "default",
		Workload:  "eviction-test",
		Pod:       "old-pod",
		Container: "container",
		Msg:       "Old message that should be evicted",
	}
	service.Ingest(oldEntry)

	// Wait a bit then ingest new entry
	time.Sleep(100 * time.Millisecond)

	newEntry := logs.LogEntry{
		TS:        time.Now(),
		Level:     "INFO",
		Cluster:   "test-cluster",
		Namespace: "default",
		Workload:  "eviction-test",
		Pod:       "new-pod",
		Container: "container",
		Msg:       "New message that should be kept",
	}
	service.Ingest(newEntry)

	// Wait for eviction to run
	time.Sleep(1 * time.Second)

	// Query all entries
	filter := logs.LogFilter{
		Namespace: "default",
		Direction: "forward",
	}

	results := service.Replay(filter)

	// Should only have the new entry (old one evicted)
	assert.Len(t, results, 1, "Should only have 1 entry after time-based eviction")
	assert.Equal(t, "New message that should be kept", results[0].Msg,
		"Should retain the recent entry")
}

func TestHighThroughputIngestion(t *testing.T) {
	t.Parallel()

	// Create log cache service optimized for high throughput
	cfg, err := config.Load()
	require.NoError(t, err)
	serviceConfig, err := cfg.GetLogsServiceConfig()
	require.NoError(t, err)
	serviceConfig.GlobalMaxEntries = 10000
	serviceConfig.BufferSize = 100
	service := logs.NewService(serviceConfig)
	defer service.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := service.Start(ctx); err != nil {
		t.Fatalf("Failed to start service: %v", err)
	}

	// Test high-throughput ingestion
	numEntries := 5000
	startTime := time.Now()

	var wg sync.WaitGroup
	numWorkers := 10
	entriesPerWorker := numEntries / numWorkers

	for worker := 0; worker < numWorkers; worker++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()

			for i := 0; i < entriesPerWorker; i++ {
				entry := logs.LogEntry{
					TS:        time.Now().Add(time.Duration(i) * time.Microsecond),
					Level:     []string{"INFO", "WARN", "ERROR", "DEBUG"}[i%4],
					Cluster:   "perf-cluster",
					Namespace: fmt.Sprintf("namespace-%d", workerID%3),
					Workload:  fmt.Sprintf("workload-%d", workerID),
					Pod:       fmt.Sprintf("pod-%d-%d", workerID, i),
					Container: "container",
					Msg:       fmt.Sprintf("High throughput message %d from worker %d", i, workerID),
				}

				service.Ingest(entry)
			}
		}(worker)
	}

	wg.Wait()

	ingestionDuration := time.Since(startTime)

	// Wait for processing to complete
	time.Sleep(1 * time.Second)

	// Verify ingestion rate
	entriesPerSecond := float64(numEntries) / ingestionDuration.Seconds()
	t.Logf("Ingestion rate: %.2f entries/second", entriesPerSecond)

	// Should achieve at least 1000 entries/second
	assert.GreaterOrEqual(t, entriesPerSecond, 1000.0, "Should achieve reasonable ingestion rate")

	// Verify all entries were processed
	stats := service.Stats()
	assert.GreaterOrEqual(t, int(stats.GlobalRingSize), numEntries/2, "Should have processed most entries")

	// Test query performance on large dataset
	queryStartTime := time.Now()
	filter := logs.LogFilter{
		Levels:    []string{"ERROR"},
		Direction: "backward",
		Limit:     100,
	}

	results := service.Replay(filter)
	queryDuration := time.Since(queryStartTime)

	t.Logf("Query duration: %v for %d results", queryDuration, len(results))

	// Query should complete quickly even with large dataset
	assert.Less(t, queryDuration, 100*time.Millisecond, "Query should be fast even with large dataset")
	assert.GreaterOrEqual(t, len(results), 10, "Should find some ERROR level entries")
}

func TestScopedRingIsolation(t *testing.T) {
	t.Parallel()

	// Test that scoped rings properly isolate entries by namespace/workload
	cfg, err := config.Load()
	require.NoError(t, err)
	serviceConfig, err := cfg.GetLogsServiceConfig()
	require.NoError(t, err)
	serviceConfig.ScopeMaxEntries = 50
	service := logs.NewService(serviceConfig)
	defer service.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := service.Start(ctx); err != nil {
		t.Fatalf("Failed to start service: %v", err)
	}

	// Create entries for different namespaces
	namespaces := []string{"prod", "staging", "dev"}
	workloads := []string{"api", "worker", "db"}

	for _, ns := range namespaces {
		for _, workload := range workloads {
			for i := 0; i < 10; i++ {
				entry := logs.LogEntry{
					TS:        time.Now().Add(time.Duration(i) * time.Millisecond),
					Level:     "INFO",
					Cluster:   "test-cluster",
					Namespace: ns,
					Workload:  workload,
					Pod:       fmt.Sprintf("%s-pod-%d", workload, i),
					Container: "container",
					Msg:       fmt.Sprintf("Message %d for %s/%s", i, ns, workload),
				}
				service.Ingest(entry)
			}
		}
	}

	// Wait for processing
	time.Sleep(200 * time.Millisecond)

	// Test namespace isolation
	for _, ns := range namespaces {
		filter := logs.LogFilter{
			Namespace: ns,
			Direction: "forward",
		}

		results := service.Replay(filter)
		expectedCount := len(workloads) * 10 // 3 workloads * 10 entries each
		assert.Len(t, results, expectedCount, "Should get all entries for namespace %s", ns)

		// Verify all results are for the correct namespace
		for _, result := range results {
			assert.Equal(t, ns, result.Namespace, "All results should be for namespace %s", ns)
		}
	}

	// Test workload isolation
	for _, workload := range workloads {
		filter := logs.LogFilter{
			Workload:  workload,
			Direction: "forward",
		}

		results := service.Replay(filter)
		expectedCount := len(namespaces) * 10 // 3 namespaces * 10 entries each
		assert.Len(t, results, expectedCount, "Should get all entries for workload %s", workload)

		// Verify all results are for the correct workload
		for _, result := range results {
			assert.Equal(t, workload, result.Workload, "All results should be for workload %s", workload)
		}
	}
}

// End of test file
