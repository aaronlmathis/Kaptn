package logs

import (
	"testing"
	"time"

	"github.com/aaronlmathis/kaptn/internal/config"
)

func TestRingBasicOperations(t *testing.T) {
	ring := NewRing(3, time.Minute)

	// Test empty ring
	if ring.Size() != 0 {
		t.Errorf("Expected empty ring size 0, got %d", ring.Size())
	}

	// Add entries
	entry1 := LogEntry{TS: time.Now(), Msg: "first", Level: "INFO"}
	entry2 := LogEntry{TS: time.Now().Add(time.Second), Msg: "second", Level: "ERROR"}
	entry3 := LogEntry{TS: time.Now().Add(2 * time.Second), Msg: "third", Level: "DEBUG"}

	ring.Append(entry1)
	ring.Append(entry2)
	ring.Append(entry3)

	if ring.Size() != 3 {
		t.Errorf("Expected ring size 3, got %d", ring.Size())
	}

	// Test query all
	filter := LogFilter{Direction: "forward"}
	results := ring.Query(filter)

	if len(results) != 3 {
		t.Errorf("Expected 3 results, got %d", len(results))
	}

	if results[0].Msg != "first" || results[1].Msg != "second" || results[2].Msg != "third" {
		t.Errorf("Results not in expected order")
	}
}

func TestRingOverflow(t *testing.T) {
	ring := NewRing(2, time.Minute) // Small ring for testing overflow

	entry1 := LogEntry{TS: time.Now(), Msg: "first", Level: "INFO"}
	entry2 := LogEntry{TS: time.Now().Add(time.Second), Msg: "second", Level: "INFO"}
	entry3 := LogEntry{TS: time.Now().Add(2 * time.Second), Msg: "third", Level: "INFO"}

	ring.Append(entry1)
	ring.Append(entry2)
	ring.Append(entry3) // Should overflow

	if ring.Size() != 2 {
		t.Errorf("Expected ring size 2 after overflow, got %d", ring.Size())
	}

	// Should contain only the last 2 entries
	filter := LogFilter{Direction: "forward"}
	results := ring.Query(filter)

	if len(results) != 2 {
		t.Errorf("Expected 2 results after overflow, got %d", len(results))
	}

	if results[0].Msg != "second" || results[1].Msg != "third" {
		t.Errorf("Overflow didn't maintain correct entries")
	}
}

func TestRingTimeEviction(t *testing.T) {
	ring := NewRing(10, time.Minute)

	oldTime := time.Now().Add(-2 * time.Minute) // Older than TTL
	newTime := time.Now()

	oldEntry := LogEntry{TS: oldTime, Msg: "old", Level: "INFO"}
	newEntry := LogEntry{TS: newTime, Msg: "new", Level: "INFO"}

	ring.Append(oldEntry)
	ring.Append(newEntry)

	if ring.Size() != 2 {
		t.Errorf("Expected 2 entries before eviction, got %d", ring.Size())
	}

	// Evict entries older than 1 minute
	cutoff := time.Now().Add(-time.Minute)
	ring.EvictByTime(cutoff)

	if ring.Size() != 1 {
		t.Errorf("Expected 1 entry after eviction, got %d", ring.Size())
	}

	filter := LogFilter{}
	results := ring.Query(filter)

	if len(results) != 1 || results[0].Msg != "new" {
		t.Errorf("Eviction didn't preserve correct entry")
	}
}

func TestRingFiltering(t *testing.T) {
	ring := NewRing(10, time.Minute)

	entries := []LogEntry{
		{TS: time.Now(), Msg: "info message", Level: "INFO", Namespace: "default"},
		{TS: time.Now(), Msg: "error message", Level: "ERROR", Namespace: "default"},
		{TS: time.Now(), Msg: "debug message", Level: "DEBUG", Namespace: "kube-system"},
	}

	for _, entry := range entries {
		ring.Append(entry)
	}

	// Test level filtering
	filter := LogFilter{Levels: []string{"ERROR"}}
	results := ring.Query(filter)

	if len(results) != 1 || results[0].Level != "ERROR" {
		t.Errorf("Level filtering failed")
	}

	// Test namespace filtering
	filter = LogFilter{Namespace: "default"}
	results = ring.Query(filter)

	if len(results) != 2 {
		t.Errorf("Namespace filtering failed, expected 2 results, got %d", len(results))
	}

	// Test text search
	filter = LogFilter{Text: "error"}
	results = ring.Query(filter)

	if len(results) != 1 || results[0].Msg != "error message" {
		t.Errorf("Text search failed")
	}

	// Test limit
	filter = LogFilter{Limit: 2}
	results = ring.Query(filter)

	if len(results) != 2 {
		t.Errorf("Limit filtering failed, expected 2 results, got %d", len(results))
	}
}

func TestBusBasicOperations(t *testing.T) {
	bus := NewBus(10)

	if bus.SubscriberCount() != 0 {
		t.Errorf("Expected 0 subscribers initially, got %d", bus.SubscriberCount())
	}

	// Create subscription
	filter := LogFilter{Levels: []string{"ERROR"}}
	ch, cancel := bus.Subscribe(filter)
	defer cancel()

	if bus.SubscriberCount() != 1 {
		t.Errorf("Expected 1 subscriber after subscription, got %d", bus.SubscriberCount())
	}

	// Publish matching entry
	entry := LogEntry{TS: time.Now(), Msg: "test error", Level: "ERROR"}
	bus.Publish(entry)

	// Check if entry was received
	select {
	case received := <-ch:
		if received.Msg != "test error" {
			t.Errorf("Received wrong message: %s", received.Msg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Errorf("Did not receive published entry")
	}

	// Publish non-matching entry
	infoEntry := LogEntry{TS: time.Now(), Msg: "test info", Level: "INFO"}
	bus.Publish(infoEntry)

	// Should not receive this entry
	select {
	case <-ch:
		t.Errorf("Received entry that should have been filtered")
	case <-time.After(50 * time.Millisecond):
		// Expected - no message should be received
	}

	// Cancel subscription
	cancel()

	// Wait a bit for cleanup
	time.Sleep(10 * time.Millisecond)

	if bus.SubscriberCount() != 0 {
		t.Errorf("Expected 0 subscribers after cancellation, got %d", bus.SubscriberCount())
	}
}

func TestServiceIntegration(t *testing.T) {
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}
	serviceConfig, err := cfg.GetLogsServiceConfig()
	if err != nil {
		t.Fatalf("Failed to get logs service config: %v", err)
	}
	serviceConfig.GlobalMaxEntries = 5                      // Small for testing
	serviceConfig.EvictionInterval = 100 * time.Millisecond // Fast for testing

	service := NewService(serviceConfig)
	defer service.Stop()

	// Test ingestion
	entry := LogEntry{
		TS:        time.Now(),
		Msg:       "test message",
		Level:     "INFO",
		Namespace: "default",
		Pod:       "test-pod-123",
	}

	service.Ingest(entry)

	// Test replay
	filter := LogFilter{Namespace: "default"}
	results := service.Replay(filter)

	if len(results) != 1 {
		t.Errorf("Expected 1 result from replay, got %d", len(results))
	}

	if results[0].Msg != "test message" {
		t.Errorf("Replay returned wrong message: %s", results[0].Msg)
	}

	// Test streaming
	streamFilter := LogFilter{Levels: []string{"ERROR"}}
	ch, cancel := service.Stream(streamFilter)
	defer cancel()

	// Ingest a matching entry
	errorEntry := LogEntry{
		TS:        time.Now(),
		Msg:       "error occurred",
		Level:     "ERROR",
		Namespace: "default",
	}

	service.Ingest(errorEntry)

	// Should receive the error entry
	select {
	case received := <-ch:
		if received.Msg != "error occurred" {
			t.Errorf("Stream received wrong message: %s", received.Msg)
		}
	case <-time.After(100 * time.Millisecond):
		t.Errorf("Did not receive streamed entry")
	}

	// Test stats
	stats := service.Stats()
	if stats.GlobalRingSize != 2 { // Should have 2 entries
		t.Errorf("Expected global ring size 2, got %d", stats.GlobalRingSize)
	}
}

func TestFilterCompilation(t *testing.T) {
	params := map[string]string{
		"since":     "5m",
		"levels":    "ERROR,WARN",
		"namespace": "kube-system",
		"limit":     "500",
		"direction": "forward",
		"q":         "failed",
	}

	opts := DefaultFilterOptions()
	filter := CompileFilter(params, opts)

	if filter.Namespace != "kube-system" {
		t.Errorf("Namespace not parsed correctly: %s", filter.Namespace)
	}

	if len(filter.Levels) != 2 || filter.Levels[0] != "ERROR" || filter.Levels[1] != "WARN" {
		t.Errorf("Levels not parsed correctly: %v", filter.Levels)
	}

	if filter.Limit != 500 {
		t.Errorf("Limit not parsed correctly: %d", filter.Limit)
	}

	if filter.Direction != "forward" {
		t.Errorf("Direction not parsed correctly: %s", filter.Direction)
	}

	if filter.Text != "failed" {
		t.Errorf("Text not parsed correctly: %s", filter.Text)
	}

	if filter.Since.IsZero() {
		t.Errorf("Since time not parsed correctly")
	}
}
