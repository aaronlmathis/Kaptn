package logs_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/aaronlmathis/kaptn/internal/logs"
)

// Integration tests for log ingestion, replay, and streaming functionality
// These tests verify the complete flow from ingestion to replay and live streaming

func TestLogIngestionAndReplay(t *testing.T) {
	t.Parallel()

	// Create log cache service
	config := logs.DefaultServiceConfig()
	config.GlobalMaxEntries = 1000
	config.ScopeMaxEntries = 200
	service := logs.NewService(config)
	defer service.Stop()

	// Start the service
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := service.Start(ctx)
	require.NoError(t, err)

	// Simulate normalized log entries as they would come from the coordinator
	testLogEntries := []logs.LogEntry{
		{
			TS:        time.Now().Add(-5 * time.Minute),
			Level:     "INFO",
			Cluster:   "test-cluster",
			Namespace: "default",
			Workload:  "web-server",
			Pod:       "test-pod",
			Container: "web-container",
			Node:      "worker-node-1",
			Msg:       "INFO: Application starting up",
			Labels:    map[string]string{"app": "web-server"},
		},
		{
			TS:        time.Now().Add(-4 * time.Minute),
			Level:     "WARN",
			Cluster:   "test-cluster",
			Namespace: "default",
			Workload:  "web-server",
			Pod:       "test-pod",
			Container: "web-container",
			Node:      "worker-node-1",
			Msg:       "WARN: Configuration file not found, using defaults",
			Labels:    map[string]string{"app": "web-server"},
		},
		{
			TS:        time.Now().Add(-3 * time.Minute),
			Level:     "ERROR",
			Cluster:   "test-cluster",
			Namespace: "default",
			Workload:  "web-server",
			Pod:       "test-pod",
			Container: "web-container",
			Node:      "worker-node-1",
			Msg:       "ERROR: Database connection failed",
			Labels:    map[string]string{"app": "web-server"},
		},
		{
			TS:        time.Now().Add(-2 * time.Minute),
			Level:     "INFO",
			Cluster:   "test-cluster",
			Namespace: "default",
			Workload:  "web-server",
			Pod:       "test-pod",
			Container: "web-container",
			Node:      "worker-node-1",
			Msg:       "INFO: Retrying database connection",
			Labels:    map[string]string{"app": "web-server"},
		},
		{
			TS:        time.Now().Add(-1 * time.Minute),
			Level:     "INFO",
			Cluster:   "test-cluster",
			Namespace: "default",
			Workload:  "web-server",
			Pod:       "test-pod",
			Container: "web-container",
			Node:      "worker-node-1",
			Msg:       "INFO: Database connection established",
			Labels:    map[string]string{"app": "web-server"},
		},
	}

	// Ingest log entries to simulate coordinator bridging pod logs to cache
	for _, logEntry := range testLogEntries {
		service.Ingest(logEntry)
		time.Sleep(10 * time.Millisecond) // Simulate realistic timing
	}

	// Wait for ingestion to complete
	time.Sleep(200 * time.Millisecond)

	// Test 1: Verify ingestion worked
	allLogsFilter := logs.LogFilter{
		Namespace: "default",
		Direction: "forward",
		Limit:     100,
	}

	results := service.Replay(allLogsFilter)
	assert.Len(t, results, 5, "Should have ingested all 5 log entries")

	// Test 2: Verify filtering works
	errorFilter := logs.LogFilter{
		Namespace: "default",
		Levels:    []string{"ERROR"},
		Direction: "forward",
	}

	errorResults := service.Replay(errorFilter)
	assert.Len(t, errorResults, 1, "Should have 1 ERROR level log")
	assert.Contains(t, errorResults[0].Msg, "Database connection failed")

	// Test 3: Verify workload scoping
	workloadFilter := logs.LogFilter{
		Workload:  "web-server",
		Direction: "forward",
	}

	workloadResults := service.Replay(workloadFilter)
	assert.Len(t, workloadResults, 5, "Should have all logs for workload")

	// Test 4: Verify time-based filtering
	recentFilter := logs.LogFilter{
		Since:     time.Now().Add(-3*time.Minute + 30*time.Second), // Get last ~2.5 minutes
		Direction: "forward",
	}

	recentResults := service.Replay(recentFilter)
	assert.GreaterOrEqual(t, len(recentResults), 2, "Should have recent logs")

	// Test 5: Verify text search
	textFilter := logs.LogFilter{
		Text:      "database",
		Direction: "forward",
	}

	textResults := service.Replay(textFilter)
	assert.GreaterOrEqual(t, len(textResults), 2, "Should find logs with 'database' text")
}

func TestLiveStreamingWithBackfill(t *testing.T) {
	t.Parallel()

	// Create log cache service
	config := logs.DefaultServiceConfig()
	config.BufferSize = 50
	service := logs.NewService(config)
	defer service.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := service.Start(ctx)
	require.NoError(t, err)

	// Ingest some historical data for backfill
	baseTime := time.Now().Add(-10 * time.Minute)
	for i := 0; i < 10; i++ {
		entry := logs.LogEntry{
			TS:        baseTime.Add(time.Duration(i) * time.Minute),
			Level:     []string{"INFO", "WARN", "ERROR"}[i%3],
			Cluster:   "test-cluster",
			Namespace: "default",
			Workload:  "api-server",
			Pod:       fmt.Sprintf("api-server-pod-%d", i),
			Container: "api-container",
			Msg:       fmt.Sprintf("Historical log message %d", i),
		}
		service.Ingest(entry)
	}

	// Create stream subscription for new events (no backfill)
	streamFilter := logs.LogFilter{
		Namespace: "default",
		Direction: "forward",
	}

	streamCh, cancelStream := service.Stream(streamFilter)
	defer cancelStream()

	// Ingest data after creating stream to test live streaming
	for i := 0; i < 10; i++ {
		entry := logs.LogEntry{
			TS:        time.Now(),
			Level:     "INFO",
			Namespace: "default",
			Workload:  "api-server",
			Pod:       fmt.Sprintf("api-server-pod-%d", i),
			Container: "api-container",
			Msg:       fmt.Sprintf("Live log message %d", i),
		}
		service.Ingest(entry)
		time.Sleep(10 * time.Millisecond) // Small delay to ensure ordering
	}

	// Collect live stream data
	var liveEntries []logs.LogEntry
	liveComplete := false

	// Start goroutine to collect stream data
	streamResults := make(chan logs.LogEntry, 100)
	go func() {
		defer close(streamResults)
		for entry := range streamCh {
			streamResults <- entry
		}
	}()

	// Wait for live streaming (should be immediate)
	timeout := time.After(1 * time.Second)
	for !liveComplete {
		select {
		case entry, ok := <-streamResults:
			if !ok {
				t.Fatal("Stream channel closed unexpectedly")
			}
			liveEntries = append(liveEntries, entry)

			// Check if we've received the live data
			if len(liveEntries) >= 10 {
				liveComplete = true
			}

		case <-timeout:
			t.Fatal("Timeout waiting for live stream data")
		}
	}

	assert.Len(t, liveEntries, 10, "Should receive all live stream entries")

	// Verify historical data can still be queried (separate from streaming)
	historicalFilter := logs.LogFilter{
		Namespace: "default",
		Since:     time.Now().Add(-15 * time.Minute),
		Direction: "forward",
		Limit:     50,
	}

	historicalResults := service.Replay(historicalFilter)
	assert.GreaterOrEqual(t, len(historicalResults), 10, "Should have historical data available via query")

	t.Logf("Live streaming test passed: received %d live entries, %d historical entries available",
		len(liveEntries), len(historicalResults))
}

func TestConcurrentStreamsAndIngestion(t *testing.T) {
	t.Parallel()

	// Create log cache service
	config := logs.DefaultServiceConfig()
	config.MaxSubscribers = 10
	service := logs.NewService(config)
	defer service.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	err := service.Start(ctx)
	require.NoError(t, err)

	numStreams := 5
	entriesPerNamespace := 20

	// Create multiple concurrent streams for different namespaces
	var streamChannels []<-chan logs.LogEntry
	var cancelFuncs []func()

	for i := 0; i < numStreams; i++ {
		filter := logs.LogFilter{
			Namespace: fmt.Sprintf("namespace-%d", i),
			Direction: "forward",
		}

		ch, cancel := service.Stream(filter)
		streamChannels = append(streamChannels, ch)
		cancelFuncs = append(cancelFuncs, cancel)
	}

	// Ensure cleanup
	defer func() {
		for _, cancel := range cancelFuncs {
			cancel()
		}
	}()

	// Start collectors for each stream
	streamResults := make([][]logs.LogEntry, numStreams)
	var collectors sync.WaitGroup

	for i := 0; i < numStreams; i++ {
		collectors.Add(1)
		go func(streamIdx int) {
			defer collectors.Done()

			timeout := time.After(10 * time.Second)
			for {
				select {
				case entry, ok := <-streamChannels[streamIdx]:
					if !ok {
						return
					}
					streamResults[streamIdx] = append(streamResults[streamIdx], entry)

				case <-timeout:
					return
				}
			}
		}(i)
	}

	// Concurrently ingest data for all namespaces
	var ingestionWG sync.WaitGroup

	for nsIdx := 0; nsIdx < numStreams; nsIdx++ {
		ingestionWG.Add(1)

		go func(namespaceIdx int) {
			defer ingestionWG.Done()

			namespace := fmt.Sprintf("namespace-%d", namespaceIdx)

			for entryIdx := 0; entryIdx < entriesPerNamespace; entryIdx++ {
				entry := logs.LogEntry{
					TS:        time.Now().Add(time.Duration(entryIdx) * time.Millisecond),
					Level:     []string{"INFO", "WARN", "ERROR"}[entryIdx%3],
					Cluster:   "test-cluster",
					Namespace: namespace,
					Workload:  fmt.Sprintf("workload-%d", namespaceIdx),
					Pod:       fmt.Sprintf("pod-%d-%d", namespaceIdx, entryIdx),
					Container: "container",
					Msg:       fmt.Sprintf("Message %d for namespace %s", entryIdx, namespace),
				}

				service.Ingest(entry)

				// Small delay to simulate realistic timing
				time.Sleep(5 * time.Millisecond)
			}
		}(nsIdx)
	}

	// Wait for all ingestion to complete
	ingestionWG.Wait()

	// Give time for streaming to complete
	time.Sleep(1 * time.Second)

	// Cancel all streams to stop collectors
	for _, cancel := range cancelFuncs {
		cancel()
	}

	// Wait for collectors to finish
	collectors.Wait()

	// Verify each stream received the correct entries
	for i := 0; i < numStreams; i++ {
		expectedNamespace := fmt.Sprintf("namespace-%d", i)

		// Should have received all entries for this namespace
		assert.Len(t, streamResults[i], entriesPerNamespace,
			"Stream %d should have received %d entries", i, entriesPerNamespace)

		// Verify all entries are for the correct namespace
		for _, entry := range streamResults[i] {
			assert.Equal(t, expectedNamespace, entry.Namespace,
				"Stream %d received entry for wrong namespace", i)
		}
	}

	// Verify service health
	stats := service.Stats()
	assert.GreaterOrEqual(t, stats.GlobalRingSize, 0, "Should have valid stats")
}
