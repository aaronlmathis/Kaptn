package logs

import (
	"fmt"
	"sort"
	"testing"
	"time"
)

func TestLogIndex(t *testing.T) {
	idx := NewLogIndex(100)

	// Test basic indexing
	entries := []LogEntry{
		{
			TS:        time.Now().Add(-5 * time.Minute),
			Level:     "ERROR",
			Namespace: "default",
			Workload:  "nginx",
			Pod:       "nginx-123",
			Msg:       "connection failed",
			TraceID:   "trace-123",
		},
		{
			TS:        time.Now().Add(-4 * time.Minute),
			Level:     "WARN",
			Namespace: "default",
			Workload:  "nginx",
			Pod:       "nginx-456",
			Msg:       "slow request",
			TraceID:   "trace-456",
		},
		{
			TS:        time.Now().Add(-3 * time.Minute),
			Level:     "INFO",
			Namespace: "kube-system",
			Workload:  "coredns",
			Pod:       "coredns-789",
			Msg:       "DNS query",
		},
	}

	// Add entries to index
	for i, entry := range entries {
		idx.AddEntry(entry, i)
	}

	// Test stats
	stats := idx.Stats()
	if stats.TotalEntries != 3 {
		t.Errorf("Expected 3 total entries, got %d", stats.TotalEntries)
	}
	if stats.LevelTerms != 3 {
		t.Errorf("Expected 3 level terms, got %d", stats.LevelTerms)
	}
	if stats.NamespaceTerms != 2 {
		t.Errorf("Expected 2 namespace terms, got %d", stats.NamespaceTerms)
	}

	// Test query planning
	filter := LogFilter{
		Levels:    []string{"ERROR"},
		Namespace: "default",
		Since:     time.Now().Add(-10 * time.Minute),
		Until:     time.Now(),
	}

	plan := idx.BuildQueryPlan(filter)
	if len(plan.IndexLookups) == 0 {
		t.Error("Expected index lookups in query plan")
	}

	// Test plan execution
	candidateIndices := idx.ExecutePlan(plan, filter)
	if len(candidateIndices) != 1 {
		t.Errorf("Expected 1 candidate index, got %d", len(candidateIndices))
	}
	if candidateIndices[0] != 0 {
		t.Errorf("Expected candidate index 0, got %d", candidateIndices[0])
	}

	// Test time range filtering
	filterTime := LogFilter{
		Since: time.Now().Add(-4*time.Minute - 30*time.Second),
		Until: time.Now().Add(-3*time.Minute + 30*time.Second),
	}
	planTime := idx.BuildQueryPlan(filterTime)
	candidatesTime := idx.ExecutePlan(planTime, filterTime)
	if len(candidatesTime) < 1 {
		t.Error("Expected at least 1 candidate for time range query")
	}

	// Test trace ID lookup
	traceIndices := idx.traceIndex.Get("trace-123")
	if len(traceIndices) != 1 {
		t.Errorf("Expected 1 index for trace-123, got %d", len(traceIndices))
	}
}

func TestRingWithIndexing(t *testing.T) {
	ring := NewRing(100, 10*time.Minute)

	// Add test entries
	entries := []LogEntry{
		{
			TS:        time.Now().Add(-2 * time.Minute),
			Level:     "ERROR",
			Namespace: "default",
			Workload:  "web",
			Pod:       "web-abc",
			Msg:       "database connection failed",
		},
		{
			TS:        time.Now().Add(-1 * time.Minute),
			Level:     "INFO",
			Namespace: "default",
			Workload:  "web",
			Pod:       "web-def",
			Msg:       "request processed successfully",
		},
		{
			TS:        time.Now(),
			Level:     "WARN",
			Namespace: "monitoring",
			Workload:  "prometheus",
			Pod:       "prometheus-xyz",
			Msg:       "scrape timeout",
		},
	}

	for _, entry := range entries {
		ring.Append(entry)
	}

	// Test query with indexing
	filter := LogFilter{
		Namespace: "default",
		Levels:    []string{"ERROR", "INFO"},
		Limit:     10,
		Direction: "backward",
	}

	results := ring.Query(filter)
	if len(results) != 2 {
		t.Errorf("Expected 2 results, got %d", len(results))
	}

	// Verify ordering (backward = newest first)
	if results[0].Level != "INFO" {
		t.Errorf("Expected first result to be INFO, got %s", results[0].Level)
	}
	if results[1].Level != "ERROR" {
		t.Errorf("Expected second result to be ERROR, got %s", results[1].Level)
	}

	// Test workload filtering
	workloadFilter := LogFilter{
		Workload:  "web",
		Direction: "forward",
	}

	workloadResults := ring.Query(workloadFilter)
	if len(workloadResults) != 2 {
		t.Errorf("Expected 2 workload results, got %d", len(workloadResults))
	}

	// Test text search (should still work with indexing)
	textFilter := LogFilter{
		Text:      "connection",
		Direction: "backward",
	}

	textResults := ring.Query(textFilter)
	if len(textResults) != 1 {
		t.Errorf("Expected 1 text result, got %d", len(textResults))
	}
	if textResults[0].Level != "ERROR" {
		t.Errorf("Expected text result to be ERROR, got %s", textResults[0].Level)
	}

	// Test index statistics
	stats := ring.GetIndexStats()
	if stats.TotalEntries != 3 {
		t.Errorf("Expected 3 total entries in index, got %d", stats.TotalEntries)
	}
	if stats.NamespaceTerms != 2 {
		t.Errorf("Expected 2 namespace terms, got %d", stats.NamespaceTerms)
	}
}

func TestDebugRingWithIndexing(t *testing.T) {
	ring := NewRing(100, 10*time.Minute)

	// Add test entries
	entries := []LogEntry{
		{
			TS:        time.Now().Add(-2 * time.Minute),
			Level:     "ERROR",
			Namespace: "default",
			Workload:  "web",
			Pod:       "web-abc",
			Msg:       "database connection failed",
		},
		{
			TS:        time.Now().Add(-1 * time.Minute),
			Level:     "INFO",
			Namespace: "default",
			Workload:  "web",
			Pod:       "web-def",
			Msg:       "request processed successfully",
		},
		{
			TS:        time.Now(),
			Level:     "WARN",
			Namespace: "monitoring",
			Workload:  "prometheus",
			Pod:       "prometheus-xyz",
			Msg:       "scrape timeout",
		},
	}

	for _, entry := range entries {
		ring.Append(entry)
		t.Logf("Added entry: %+v", entry)
	}

	// Check ring size
	t.Logf("Ring size: %d", ring.Size())

	// Check index stats
	stats := ring.GetIndexStats()
	t.Logf("Index stats: %+v", stats)

	// Test query with indexing
	filter := LogFilter{
		Namespace: "default",
		Levels:    []string{"ERROR", "INFO"},
		Limit:     10,
		Direction: "backward",
	}

	t.Logf("Filter: %+v", filter)

	// Test the index query plan
	ring.mu.RLock()
	plan := ring.index.BuildQueryPlan(filter)
	t.Logf("Query plan: %+v", plan)

	candidates := ring.index.ExecutePlan(plan, filter)
	t.Logf("Candidate indices: %v", candidates)
	ring.mu.RUnlock()

	results := ring.Query(filter)
	t.Logf("Results count: %d", len(results))
	for i, result := range results {
		t.Logf("Result %d: %+v", i, result)
	}
}

func TestQuerySelectivity(t *testing.T) {
	idx := NewLogIndex(100)

	// Add many entries to test selectivity estimation
	baseTime := time.Now().Add(-10 * time.Minute)

	// Add many entries for namespace "default" but few for "kube-system"
	for i := 0; i < 100; i++ {
		entry := LogEntry{
			TS:        baseTime.Add(time.Duration(i) * time.Second),
			Level:     "INFO",
			Namespace: "default",
			Workload:  "web",
			Pod:       "web-" + string(rune('a'+i%26)),
			Msg:       "test message",
		}
		idx.AddEntry(entry, i)
	}

	// Add a few entries for kube-system (more selective)
	for i := 100; i < 105; i++ {
		entry := LogEntry{
			TS:        baseTime.Add(time.Duration(i) * time.Second),
			Level:     "WARN",
			Namespace: "kube-system",
			Workload:  "coredns",
			Pod:       "coredns-" + string(rune('a'+(i-100))),
			Msg:       "dns warning",
		}
		idx.AddEntry(entry, i)
	}

	// Test that kube-system filter is more selective
	filter := LogFilter{
		Namespace: "kube-system",
		Levels:    []string{"WARN"},
	}

	selectivity := idx.estimateSelectivity(filter)
	if len(selectivity) == 0 {
		t.Fatal("Expected selectivity estimates")
	}

	// Should have both namespace and level estimates
	foundNamespace := false
	foundLevel := false
	for _, est := range selectivity {
		if est.Term.Field == "namespace" && est.Term.Value == "kube-system" {
			foundNamespace = true
			if est.Count != 5 {
				t.Errorf("Expected 5 kube-system entries, got %d", est.Count)
			}
		}
		if est.Term.Field == "levels" && est.Term.Value == "WARN" {
			foundLevel = true
			if est.Count != 5 {
				t.Errorf("Expected 5 WARN entries, got %d", est.Count)
			}
		}
	}

	if !foundNamespace {
		t.Error("Expected namespace selectivity estimate")
	}
	if !foundLevel {
		t.Error("Expected level selectivity estimate")
	}
}

func TestTraceIndexLRU(t *testing.T) {
	lru := NewTraceIndexLRU(3) // Small capacity for testing

	// Add some traces
	lru.Add("trace-1", 10)
	lru.Add("trace-2", 20)
	lru.Add("trace-3", 30)

	// Verify size
	if lru.Size() != 3 {
		t.Errorf("Expected size 3, got %d", lru.Size())
	}

	// Access trace-1 (should move to front)
	indices1 := lru.Get("trace-1")
	if len(indices1) != 1 || indices1[0] != 10 {
		t.Errorf("Expected [10], got %v", indices1)
	}

	// Add another trace (should evict least recently used, which is trace-2)
	lru.Add("trace-4", 40)

	// trace-2 should be evicted
	indices2 := lru.Get("trace-2")
	if indices2 != nil {
		t.Errorf("Expected trace-2 to be evicted, but got %v", indices2)
	}

	// trace-1 should still be there (was accessed recently)
	indices1Again := lru.Get("trace-1")
	if len(indices1Again) != 1 || indices1Again[0] != 10 {
		t.Errorf("Expected trace-1 to still be present, got %v", indices1Again)
	}

	// Add multiple indices to same trace
	lru.Add("trace-1", 11)
	lru.Add("trace-1", 12)

	indices1Multi := lru.Get("trace-1")
	if len(indices1Multi) != 3 {
		t.Errorf("Expected 3 indices for trace-1, got %d", len(indices1Multi))
	}
}

func TestIndexEviction(t *testing.T) {
	idx := NewLogIndex(10)

	// Add entries with different timestamps
	baseTime := time.Now().Add(-20 * time.Minute)
	for i := 0; i < 10; i++ {
		entry := LogEntry{
			TS:        baseTime.Add(time.Duration(i) * time.Minute),
			Level:     "INFO",
			Namespace: "test",
			Pod:       "pod-" + string(rune('a'+i)),
			Msg:       "test message",
		}
		idx.AddEntry(entry, i)
	}

	// Verify initial state
	stats := idx.Stats()
	if stats.TotalEntries != 10 {
		t.Errorf("Expected 10 entries before eviction, got %d", stats.TotalEntries)
	}

	// Evict entries older than 10 minutes
	cutoff := time.Now().Add(-10 * time.Minute)
	validIndices := make(map[int]bool)

	// Indices 6-9 should be valid (entries 6-9 have timestamps within 10 minutes)
	for i := 6; i < 10; i++ {
		validIndices[i] = true
	}

	idx.EvictByTime(cutoff, validIndices)

	// Verify eviction
	statsAfter := idx.Stats()
	if statsAfter.TotalEntries != 4 {
		t.Errorf("Expected 4 entries after eviction, got %d", statsAfter.TotalEntries)
	}

	// Verify namespace index was cleaned up
	if statsAfter.NamespaceTerms != 1 {
		t.Errorf("Expected 1 namespace term after eviction, got %d", statsAfter.NamespaceTerms)
	}
}

func BenchmarkIndexedQuery(b *testing.B) {
	ring := NewRing(10000, 30*time.Minute)

	// Fill ring with test data
	baseTime := time.Now().Add(-30 * time.Minute)
	namespaces := []string{"default", "kube-system", "monitoring", "logging"}
	levels := []string{"ERROR", "WARN", "INFO", "DEBUG"}

	for i := 0; i < 5000; i++ {
		entry := LogEntry{
			TS:        baseTime.Add(time.Duration(i) * time.Second),
			Level:     levels[i%len(levels)],
			Namespace: namespaces[i%len(namespaces)],
			Workload:  "workload-" + string(rune('a'+i%10)),
			Pod:       "pod-" + string(rune('a'+i%26)),
			Msg:       "test message " + string(rune('0'+i%10)),
		}
		ring.Append(entry)
	}

	filter := LogFilter{
		Namespace: "default",
		Levels:    []string{"ERROR"},
		Since:     baseTime,
		Until:     time.Now(),
		Limit:     100,
		Direction: "backward",
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		results := ring.Query(filter)
		if len(results) == 0 {
			b.Error("Expected some results")
		}
	}
}

func BenchmarkNonIndexedQuery(b *testing.B) {
	// Create a ring without indexing (simulate old behavior)
	ring := &Ring{
		entries:    make([]ringEntry, 10000),
		maxEntries: 10000,
		maxAge:     30 * time.Minute,
		index:      NewLogIndex(0), // Empty index for comparison
	}

	// Fill ring with test data (bypass indexing)
	baseTime := time.Now().Add(-30 * time.Minute)
	namespaces := []string{"default", "kube-system", "monitoring", "logging"}
	levels := []string{"ERROR", "WARN", "INFO", "DEBUG"}

	for i := 0; i < 5000; i++ {
		entry := LogEntry{
			TS:        baseTime.Add(time.Duration(i) * time.Second),
			Level:     levels[i%len(levels)],
			Namespace: namespaces[i%len(namespaces)],
			Workload:  "workload-" + string(rune('a'+i%10)),
			Pod:       "pod-" + string(rune('a'+i%26)),
			Msg:       "test message " + string(rune('0'+i%10)),
		}

		ring.entries[i%ring.maxEntries] = ringEntry{
			entry: entry,
			index: i,
		}
		ring.size = min(ring.size+1, ring.maxEntries)
	}

	filter := LogFilter{
		Namespace: "default",
		Levels:    []string{"ERROR"},
		Since:     baseTime,
		Until:     time.Now(),
		Limit:     100,
		Direction: "backward",
	}

	b.ResetTimer()

	// Use the old linear scan approach
	for i := 0; i < b.N; i++ {
		var matches []ringEntry
		entries := ring.getAllEntriesLocked()

		for _, re := range entries {
			if ring.matchesFilter(re.entry, filter) {
				matches = append(matches, re)
			}
		}

		if len(matches) == 0 {
			b.Error("Expected some results")
		}
	}
}

func BenchmarkIndexedQueryLarge(b *testing.B) {
	ring := NewRing(100000, 30*time.Minute)

	// Fill ring with larger test data
	baseTime := time.Now().Add(-30 * time.Minute)
	namespaces := []string{"default", "kube-system", "monitoring", "logging", "istio", "cert-manager", "ingress", "storage"}
	levels := []string{"ERROR", "WARN", "INFO", "DEBUG"}

	for i := 0; i < 50000; i++ {
		entry := LogEntry{
			TS:        baseTime.Add(time.Duration(i) * time.Second),
			Level:     levels[i%len(levels)],
			Namespace: namespaces[(i/len(levels))%len(namespaces)], // Different pattern for namespace
			Workload:  "workload-" + string(rune('a'+i%20)),
			Pod:       "pod-" + string(rune('a'+i%100)),
			Msg:       "test message " + string(rune('0'+i%10)),
		}
		ring.Append(entry)
	}

	// Test highly selective query (should benefit from indexing)
	filter := LogFilter{
		Namespace: "kube-system",     // Only 1/8 of entries
		Levels:    []string{"ERROR"}, // Only 1/4 of entries
		Since:     baseTime,
		Until:     time.Now(),
		Limit:     100,
		Direction: "backward",
	}

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		results := ring.Query(filter)
		if len(results) == 0 {
			b.Error("Expected some results")
		}
	}
}

func BenchmarkNonIndexedQueryLarge(b *testing.B) {
	// Create a ring without effective indexing (simulate old behavior)
	ring := &Ring{
		entries:    make([]ringEntry, 100000),
		maxEntries: 100000,
		maxAge:     30 * time.Minute,
		index:      NewLogIndex(0), // Empty index
	}

	// Fill ring with test data (bypass indexing)
	baseTime := time.Now().Add(-30 * time.Minute)
	namespaces := []string{"default", "kube-system", "monitoring", "logging", "istio", "cert-manager", "ingress", "storage"}
	levels := []string{"ERROR", "WARN", "INFO", "DEBUG"}

	for i := 0; i < 50000; i++ {
		entry := LogEntry{
			TS:        baseTime.Add(time.Duration(i) * time.Second),
			Level:     levels[i%len(levels)],
			Namespace: namespaces[(i/len(levels))%len(namespaces)], // Different pattern for namespace
			Workload:  "workload-" + string(rune('a'+i%20)),
			Pod:       "pod-" + string(rune('a'+i%100)),
			Msg:       "test message " + string(rune('0'+i%10)),
		}

		ring.entries[i%ring.maxEntries] = ringEntry{
			entry: entry,
			index: i,
		}
		ring.size = min(ring.size+1, ring.maxEntries)
	}

	filter := LogFilter{
		Namespace: "kube-system",
		Levels:    []string{"ERROR"},
		Since:     baseTime,
		Until:     time.Now(),
		Limit:     100,
		Direction: "backward",
	}

	b.ResetTimer()

	// Use the old linear scan approach
	for i := 0; i < b.N; i++ {
		var matches []ringEntry
		entries := ring.getAllEntriesLocked()

		for _, re := range entries {
			if ring.matchesFilter(re.entry, filter) {
				matches = append(matches, re)
			}
		}

		if len(matches) == 0 {
			b.Error("Expected some results")
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func TestDebugRingTimeEviction(t *testing.T) {
	ring := NewRing(10, time.Minute)

	oldTime := time.Now().Add(-2 * time.Minute) // Older than TTL
	newTime := time.Now()

	oldEntry := LogEntry{TS: oldTime, Msg: "old", Level: "INFO"}
	newEntry := LogEntry{TS: newTime, Msg: "new", Level: "INFO"}

	ring.Append(oldEntry)
	ring.Append(newEntry)

	t.Logf("Before eviction - Ring size: %d", ring.Size())

	// Evict entries older than 1 minute
	cutoff := time.Now().Add(-time.Minute)
	t.Logf("Cutoff time: %v", cutoff)
	t.Logf("Old entry time: %v (should be evicted)", oldTime)
	t.Logf("New entry time: %v (should be kept)", newTime)

	ring.EvictByTime(cutoff)

	t.Logf("After eviction - Ring size: %d", ring.Size())

	filter := LogFilter{}
	results := ring.Query(filter)

	t.Logf("Query results count: %d", len(results))
	for i, result := range results {
		t.Logf("Result %d: msg=%s, ts=%v", i, result.Msg, result.TS)
	}

	// Debug the index state after eviction
	stats := ring.GetIndexStats()
	t.Logf("Index stats after eviction: %+v", stats)

	// Debug the query plan
	ring.mu.RLock()
	plan := ring.index.BuildQueryPlan(filter)
	t.Logf("Query plan: %+v", plan)
	candidates := ring.index.ExecutePlan(plan, filter)
	t.Logf("Candidate indices from index: %v", candidates)

	// Debug the entry map
	entryMap := ring.buildEntryMapLocked()
	t.Logf("Entry map keys: %v", getKeys(entryMap))
	ring.mu.RUnlock()
}

func getKeys(m map[int]ringEntry) []int {
	keys := make([]int, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Ints(keys)
	return keys
}

func TestLargeDatasetDebug(t *testing.T) {
	ring := NewRing(100000, 30*time.Minute)

	// Fill ring with test data
	baseTime := time.Now().Add(-30 * time.Minute)
	namespaces := []string{"default", "kube-system", "monitoring", "logging"}
	levels := []string{"ERROR", "WARN", "INFO", "DEBUG"}

	errorInKubeSystem := 0
	for i := 0; i < 1000; i++ { // Smaller test dataset
		entry := LogEntry{
			TS:        baseTime.Add(time.Duration(i) * time.Second),
			Level:     levels[i%len(levels)],
			Namespace: namespaces[(i/len(levels))%len(namespaces)], // Different pattern for namespace
			Workload:  "workload-" + string(rune('a'+i%20)),
			Pod:       "pod-" + string(rune('a'+i%100)),
			Msg:       "test message " + string(rune('0'+i%10)),
		}

		if entry.Namespace == "kube-system" && entry.Level == "ERROR" {
			errorInKubeSystem++
		}

		ring.Append(entry)
	}

	t.Logf("Total ERROR entries in kube-system: %d", errorInKubeSystem)

	// Test query
	filter := LogFilter{
		Namespace: "kube-system",
		Levels:    []string{"ERROR"},
		Since:     baseTime,
		Until:     time.Now(),
		Limit:     100,
		Direction: "backward",
	}

	results := ring.Query(filter)
	t.Logf("Query results: %d", len(results))

	if len(results) > 0 {
		t.Logf("First result: %+v", results[0])
	}
}

func TestTraceIndexLRUConcurrency(t *testing.T) {
	lru := NewTraceIndexLRU(100)

	// Number of goroutines to run
	const numGoroutines = 10
	const opsPerGoroutine = 100

	// Channel to synchronize start of all goroutines
	start := make(chan struct{})
	done := make(chan struct{}, numGoroutines*2)

	// Add operations
	for i := 0; i < numGoroutines; i++ {
		go func(id int) {
			<-start
			for j := 0; j < opsPerGoroutine; j++ {
				traceID := fmt.Sprintf("trace-%d-%d", id, j)
				entryIndex := id*1000 + j
				lru.Add(traceID, entryIndex)
			}
			done <- struct{}{}
		}(i)
	}

	// Get operations
	for i := 0; i < numGoroutines; i++ {
		go func(id int) {
			<-start
			for j := 0; j < opsPerGoroutine; j++ {
				traceID := fmt.Sprintf("trace-%d-%d", id, j/2) // Get some existing, some non-existing
				_ = lru.Get(traceID)
			}
			done <- struct{}{}
		}(i)
	}

	// Start all goroutines
	close(start)

	// Wait for all to complete
	for i := 0; i < numGoroutines*2; i++ {
		<-done
	}

	// Verify some data exists and can be retrieved safely
	// Add a known trace after all concurrent operations complete
	lru.Add("test-trace-final", 999)
	result := lru.Get("test-trace-final")
	if len(result) == 0 {
		t.Error("Expected to find test trace after concurrent operations")
	}
}
