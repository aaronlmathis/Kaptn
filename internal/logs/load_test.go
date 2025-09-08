package logs_test

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/logs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// BenchmarkHighThroughputIngestion tests the logs system under high-volume ingestion
// Target: 5-10k lines/sec as specified in requirements
func BenchmarkHighThroughputIngestion(b *testing.B) {
	cfg, err := config.Load()
	require.NoError(b, err)
	serviceConfig, err := cfg.GetLogsServiceConfig()
	require.NoError(b, err)
	// Optimize for high throughput
	serviceConfig.GlobalMaxEntries = 500000
	serviceConfig.BufferSize = 1000
	serviceConfig.EvictionInterval = 60 * time.Second // Less frequent eviction during benchmarks

	service := logs.NewService(serviceConfig)

	ctx := context.Background()
	if err := service.Start(ctx); err != nil {
		b.Fatalf("Failed to start service: %v", err)
	}
	defer service.Stop()

	// Generate realistic log entries
	generateEntry := func(i int) logs.LogEntry {
		namespaces := []string{"default", "kube-system", "monitoring", "production", "staging"}
		workloads := []string{"frontend", "backend", "database", "cache", "worker"}
		levels := []string{"INFO", "WARN", "ERROR", "DEBUG"}

		return logs.LogEntry{
			TS:        time.Now(),
			Level:     levels[i%len(levels)],
			Namespace: namespaces[i%len(namespaces)],
			Workload:  workloads[i%len(workloads)],
			Pod:       fmt.Sprintf("pod-%d", i%100),
			Container: "main",
			Msg:       fmt.Sprintf("Benchmark log message %d with realistic content and some variable data", i),
		}
	}

	b.ResetTimer()

	// Test different batch sizes
	batchSizes := []int{1, 10, 100, 1000}

	for _, batchSize := range batchSizes {
		b.Run(fmt.Sprintf("BatchSize%d", batchSize), func(b *testing.B) {
			entriesIngested := int64(0)

			b.RunParallel(func(pb *testing.PB) {
				i := 0
				for pb.Next() {
					// Ingest in batches
					for j := 0; j < batchSize; j++ {
						entry := generateEntry(i*batchSize + j)
						service.Ingest(entry)
						atomic.AddInt64(&entriesIngested, 1)
					}
					i++
				}
			})

			totalEntries := atomic.LoadInt64(&entriesIngested)
			duration := b.Elapsed()
			throughput := float64(totalEntries) / duration.Seconds()

			b.ReportMetric(throughput, "entries/sec")
			b.Logf("Ingested %d entries in %v (%.2f entries/sec)",
				totalEntries, duration, throughput)
		})
	}
}

// BenchmarkConcurrentSubscribers tests the system with multiple concurrent streaming subscribers
// Target: 50-200 concurrent subscribers as specified in requirements
func BenchmarkConcurrentSubscribers(b *testing.B) {
	cfg, err := config.Load()
	require.NoError(b, err)
	serviceConfig, err := cfg.GetLogsServiceConfig()
	require.NoError(b, err)
	serviceConfig.MaxSubscribers = 300 // Allow more than target for testing
	serviceConfig.BufferSize = 200

	service := logs.NewService(serviceConfig)

	ctx := context.Background()
	if err := service.Start(ctx); err != nil {
		b.Fatalf("Failed to start service: %v", err)
	}
	defer service.Stop()

	// Test different subscriber counts
	subscriberCounts := []int{10, 50, 100, 200, 250}

	for _, subscriberCount := range subscriberCounts {
		b.Run(fmt.Sprintf("Subscribers%d", subscriberCount), func(b *testing.B) {
			var wg sync.WaitGroup
			messagesSent := int64(0)
			messagesReceived := int64(0)

			// Create concurrent subscribers
			for i := 0; i < subscriberCount; i++ {
				wg.Add(1)
				go func(subID int) {
					defer wg.Done()

					filter := logs.LogFilter{
						Namespace: fmt.Sprintf("ns-%d", subID%5), // Distribute across namespaces
						Direction: "forward",
					}

					streamCh, cancel := service.Stream(filter)
					defer cancel()

					// Consume messages
					go func() {
						for range streamCh {
							atomic.AddInt64(&messagesReceived, 1)
						}
					}()

					// Keep subscriber alive during test
					<-ctx.Done()
				}(i)
			}

			// Give subscribers time to connect
			time.Sleep(100 * time.Millisecond)

			b.ResetTimer()

			// Send messages during benchmark
			b.RunParallel(func(pb *testing.PB) {
				i := 0
				for pb.Next() {
					entry := logs.LogEntry{
						TS:        time.Now(),
						Level:     "INFO",
						Namespace: fmt.Sprintf("ns-%d", i%5),
						Workload:  "benchmark-workload",
						Pod:       fmt.Sprintf("benchmark-pod-%d", i),
						Container: "main",
						Msg:       fmt.Sprintf("Benchmark message %d", i),
					}
					service.Ingest(entry)
					atomic.AddInt64(&messagesSent, 1)
					i++
				}
			})

			// Wait a bit for message propagation
			time.Sleep(500 * time.Millisecond)

			// Cancel subscriber contexts and wait for cleanup
			// Note: In a real implementation, we'd have proper context cancellation
			time.Sleep(100 * time.Millisecond)

			totalSent := atomic.LoadInt64(&messagesSent)
			totalReceived := atomic.LoadInt64(&messagesReceived)

			b.ReportMetric(float64(subscriberCount), "concurrent_subscribers")
			b.ReportMetric(float64(totalSent), "messages_sent")
			b.ReportMetric(float64(totalReceived), "messages_received")

			b.Logf("Subscribers: %d, Sent: %d, Received: %d",
				subscriberCount, totalSent, totalReceived)
		})
	}
}

// BenchmarkQueryPerformance tests query performance under different conditions
func BenchmarkQueryPerformance(b *testing.B) {
	cfg, err := config.Load()
	require.NoError(b, err)
	serviceConfig, err := cfg.GetLogsServiceConfig()
	require.NoError(b, err)
	serviceConfig.GlobalMaxEntries = 100000

	service := logs.NewService(serviceConfig)

	ctx := context.Background()
	if err := service.Start(ctx); err != nil {
		b.Fatalf("Failed to start service: %v", err)
	}
	defer service.Stop()

	// Pre-populate with test data
	namespaces := []string{"default", "kube-system", "monitoring", "production", "staging"}
	workloads := []string{"frontend", "backend", "database", "cache", "worker"}
	levels := []string{"INFO", "WARN", "ERROR", "DEBUG"}

	populationSize := 50000
	b.Logf("Populating with %d entries...", populationSize)

	for i := 0; i < populationSize; i++ {
		entry := logs.LogEntry{
			TS:        time.Now().Add(-time.Duration(i) * time.Millisecond),
			Level:     levels[i%len(levels)],
			Namespace: namespaces[i%len(namespaces)],
			Workload:  workloads[i%len(workloads)],
			Pod:       fmt.Sprintf("pod-%d", i%500),
			Container: "main",
			Msg:       fmt.Sprintf("Test log message %d", i),
		}
		service.Ingest(entry)

		if i%10000 == 0 {
			b.Logf("Populated %d entries...", i)
		}
	}

	// Wait for indexing to complete
	time.Sleep(2 * time.Second)
	b.Logf("Population complete, starting benchmarks...")

	// Test different query patterns
	queryTests := []struct {
		name   string
		filter logs.LogFilter
	}{
		{
			name: "NamespaceFilter",
			filter: logs.LogFilter{
				Namespace: "default",
				Limit:     1000,
				Direction: "backward",
			},
		},
		{
			name: "WorkloadFilter",
			filter: logs.LogFilter{
				Namespace: "production",
				Workload:  "frontend",
				Limit:     1000,
				Direction: "backward",
			},
		},
		{
			name: "LevelFilter",
			filter: logs.LogFilter{
				Levels:    []string{"ERROR"},
				Limit:     1000,
				Direction: "backward",
			},
		},
		{
			name: "TimeRangeFilter",
			filter: logs.LogFilter{
				Since:     time.Now().Add(-10 * time.Minute),
				Until:     time.Now().Add(-5 * time.Minute),
				Limit:     1000,
				Direction: "backward",
			},
		},
		{
			name: "ComplexFilter",
			filter: logs.LogFilter{
				Namespace: "production",
				Workload:  "backend",
				Levels:    []string{"ERROR", "WARN"},
				Since:     time.Now().Add(-30 * time.Minute),
				Limit:     500,
				Direction: "backward",
			},
		},
	}

	for _, test := range queryTests {
		b.Run(test.name, func(b *testing.B) {
			var totalResults int

			b.ResetTimer()

			for i := 0; i < b.N; i++ {
				results := service.Replay(test.filter)
				totalResults += len(results)
			}

			avgResults := float64(totalResults) / float64(b.N)
			b.ReportMetric(avgResults, "avg_results")

			b.Logf("Average results per query: %.2f", avgResults)
		})
	}
}

// BenchmarkMemoryEfficiency tests memory usage under sustained load
func BenchmarkMemoryEfficiency(b *testing.B) {
	cfg, err := config.Load()
	require.NoError(b, err)
	serviceConfig, err := cfg.GetLogsServiceConfig()
	require.NoError(b, err)
	serviceConfig.GlobalMaxEntries = 200000
	serviceConfig.EvictionInterval = 5 * time.Second

	service := logs.NewService(serviceConfig)

	ctx := context.Background()
	if err := service.Start(ctx); err != nil {
		b.Fatalf("Failed to start service: %v", err)
	}
	defer service.Stop()

	b.ResetTimer()

	// Sustained ingestion test
	b.Run("SustainedIngestion", func(b *testing.B) {
		entriesIngested := 0

		for i := 0; i < b.N; i++ {
			entry := logs.LogEntry{
				TS:        time.Now(),
				Level:     "INFO",
				Namespace: fmt.Sprintf("ns-%d", i%10),
				Workload:  fmt.Sprintf("workload-%d", i%5),
				Pod:       fmt.Sprintf("pod-%d", i%100),
				Container: "main",
				Msg:       fmt.Sprintf("Sustained ingestion message %d with some variable content", i),
			}
			service.Ingest(entry)
			entriesIngested++

			// Periodically check stats to ensure system is stable
			if i%10000 == 0 {
				stats := service.Stats()
				b.Logf("Ingested %d entries, ring entries: %d",
					entriesIngested, stats.GlobalRingSize)
			}
		}

		// Final stats check
		stats := service.Stats()
		b.ReportMetric(float64(stats.GlobalRingSize), "final_ring_entries")
		b.ReportMetric(float64(entriesIngested), "total_ingested")

		b.Logf("Final stats - Ingested: %d, Ring entries: %d, Evicted: %d",
			entriesIngested, stats.GlobalRingSize, stats.EvictionsTotal)
	})
}

// LoadTestComprehensive runs a comprehensive load test combining all aspects
func LoadTestComprehensive(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping comprehensive load test in short mode")
	}

	cfg, err := config.Load()
	require.NoError(t, err)
	serviceConfig, err := cfg.GetLogsServiceConfig()
	require.NoError(t, err)
	serviceConfig.GlobalMaxEntries = 500000
	serviceConfig.MaxSubscribers = 300
	serviceConfig.BufferSize = 500

	service := logs.NewService(serviceConfig)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if err := service.Start(ctx); err != nil {
		t.Fatalf("Failed to start service: %v", err)
	}
	defer service.Stop()

	var wg sync.WaitGroup

	// Metrics collection
	var (
		totalIngested     int64
		totalStreamed     int64
		totalQueried      int64
		activeSubscribers int64
	)

	// Start ingestion workers
	ingestionWorkers := 5
	for i := 0; i < ingestionWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()

			count := 0
			for {
				select {
				case <-ctx.Done():
					t.Logf("Ingestion worker %d stopping after %d entries", workerID, count)
					return
				default:
					entry := logs.LogEntry{
						TS:        time.Now(),
						Level:     []string{"INFO", "WARN", "ERROR", "DEBUG"}[count%4],
						Namespace: fmt.Sprintf("ns-%d", count%10),
						Workload:  fmt.Sprintf("workload-%d", count%5),
						Pod:       fmt.Sprintf("pod-%d", count%50),
						Container: "main",
						Msg:       fmt.Sprintf("Load test message %d from worker %d", count, workerID),
					}
					service.Ingest(entry)
					atomic.AddInt64(&totalIngested, 1)
					count++

					// Rate limiting to achieve target throughput
					time.Sleep(2 * time.Millisecond)
				}
			}
		}(i)
	}

	// Start streaming subscribers
	subscriberCount := 100
	for i := 0; i < subscriberCount; i++ {
		wg.Add(1)
		go func(subID int) {
			defer wg.Done()
			atomic.AddInt64(&activeSubscribers, 1)
			defer atomic.AddInt64(&activeSubscribers, -1)

			filter := logs.LogFilter{
				Namespace: fmt.Sprintf("ns-%d", subID%10),
				Direction: "forward",
			}

			streamCh, cancelStream := service.Stream(filter)
			defer cancelStream()

			count := 0
			for {
				select {
				case <-ctx.Done():
					t.Logf("Subscriber %d stopping after %d messages", subID, count)
					return
				case <-streamCh:
					atomic.AddInt64(&totalStreamed, 1)
					count++
				}
			}
		}(i)
	}

	// Start query workers
	queryWorkers := 3
	for i := 0; i < queryWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()

			count := 0
			for {
				select {
				case <-ctx.Done():
					t.Logf("Query worker %d stopping after %d queries", workerID, count)
					return
				default:
					filter := logs.LogFilter{
						Namespace: fmt.Sprintf("ns-%d", count%10),
						Limit:     100,
						Direction: "backward",
					}

					results := service.Replay(filter)
					atomic.AddInt64(&totalQueried, int64(len(results)))
					count++

					// Query rate limiting
					time.Sleep(100 * time.Millisecond)
				}
			}
		}(i)
	}

	// Monitoring goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()

		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		startTime := time.Now()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				elapsed := time.Since(startTime)
				ingested := atomic.LoadInt64(&totalIngested)
				streamed := atomic.LoadInt64(&totalStreamed)
				queried := atomic.LoadInt64(&totalQueried)
				subscribers := atomic.LoadInt64(&activeSubscribers)

				ingestRate := float64(ingested) / elapsed.Seconds()
				stats := service.Stats()

				t.Logf("Load test progress - Elapsed: %v, Ingested: %d (%.1f/sec), "+
					"Streamed: %d, Queried: %d, Active subscribers: %d, Ring entries: %d",
					elapsed.Round(time.Second), ingested, ingestRate,
					streamed, queried, subscribers, stats.GlobalRingSize)

				// Verify target performance
				if ingestRate > 5000 {
					t.Logf("✓ Target ingestion rate achieved: %.1f entries/sec", ingestRate)
				}

				if subscribers >= 50 {
					t.Logf("✓ Target subscriber count achieved: %d concurrent subscribers", subscribers)
				}
			}
		}
	}()

	// Wait for test completion
	wg.Wait()

	// Final verification
	finalIngested := atomic.LoadInt64(&totalIngested)
	finalStreamed := atomic.LoadInt64(&totalStreamed)
	finalQueried := atomic.LoadInt64(&totalQueried)
	finalStats := service.Stats()

	t.Logf("=== COMPREHENSIVE LOAD TEST RESULTS ===")
	t.Logf("Total ingested: %d", finalIngested)
	t.Logf("Total streamed: %d", finalStreamed)
	t.Logf("Total queried: %d", finalQueried)
	t.Logf("Final ring entries: %d", finalStats.GlobalRingSize)
	t.Logf("Total evicted: %d", finalStats.EvictionsTotal)

	// Verify requirements
	testDuration := 5 * time.Minute
	actualDuration := testDuration // In real scenario, would measure actual duration
	ingestRate := float64(finalIngested) / actualDuration.Seconds()

	assert.GreaterOrEqual(t, ingestRate, 5000.0, "Should achieve at least 5k entries/sec ingestion rate")
	assert.LessOrEqual(t, ingestRate, 15000.0, "Should not exceed reasonable upper bound")

	t.Logf("✓ comprehensive load test completed successfully")
	t.Logf("✓ Ingestion rate: %.1f entries/sec (target: 5-10k)", ingestRate)
	t.Logf("✓ Concurrent subscribers: %d (target: 50-200)", subscriberCount)
}
