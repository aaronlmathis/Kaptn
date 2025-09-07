package logs

import (
	"context"
	"testing"
	"time"
)

func TestServiceLifecycle(t *testing.T) {
	// Create service with default config
	config := DefaultServiceConfig()
	config.EvictionInterval = 100 * time.Millisecond
	config.CleanupInterval = 100 * time.Millisecond

	service := NewService(config)

	// Test initial state
	if service.started {
		t.Error("Service should not be started initially")
	}

	health := service.Health()
	if health.Status != "unhealthy" {
		t.Errorf("Expected unhealthy status, got %s", health.Status)
	}
	if health.Started {
		t.Error("Health should show service as not started")
	}

	// Start the service
	ctx := context.Background()
	if err := service.Start(ctx); err != nil {
		t.Fatalf("Failed to start service: %v", err)
	}

	// Test started state
	if !service.started {
		t.Error("Service should be started after Start()")
	}

	health = service.Health()
	if health.Status != "healthy" {
		t.Errorf("Expected healthy status after start, got %s", health.Status)
	}
	if !health.Started {
		t.Error("Health should show service as started")
	}

	// Test double start (should not error)
	if err := service.Start(ctx); err != nil {
		t.Errorf("Double start should not error: %v", err)
	}

	// Ingest some data
	entry := LogEntry{
		TS:        time.Now(),
		Level:     "info",
		Namespace: "test-ns",
		Pod:       "test-pod",
		Msg:       "test message",
	}

	service.Ingest(entry)

	// Wait a moment for metrics to update
	time.Sleep(50 * time.Millisecond)

	// Check stats
	stats := service.Stats()
	if stats.GlobalRingSize != 1 {
		t.Errorf("Expected 1 entry in global ring, got %d", stats.GlobalRingSize)
	}

	// Test replay
	filter := LogFilter{
		Since: time.Now().Add(-1 * time.Minute),
		Limit: 10,
	}
	entries := service.Replay(filter)
	if len(entries) != 1 {
		t.Errorf("Expected 1 entry from replay, got %d", len(entries))
	}

	// Test stream subscription
	ch, cancel := service.Stream(filter)
	defer cancel()

	// Ingest another entry
	entry2 := LogEntry{
		TS:        time.Now(),
		Level:     "error",
		Namespace: "test-ns",
		Pod:       "test-pod",
		Msg:       "error message",
	}
	service.Ingest(entry2)

	// Should receive the new entry on the stream
	select {
	case received := <-ch:
		if received.Level != "ERROR" { // Level gets normalized to uppercase
			t.Errorf("Expected ERROR level, got %s", received.Level)
		}
	case <-time.After(1 * time.Second):
		t.Error("Timeout waiting for streamed entry")
	}

	// Stop the service
	service.Stop()

	// Test stopped state
	health = service.Health()
	if health.Started {
		t.Error("Health should show service as stopped")
	}

	// Wait for workers to stop
	time.Sleep(150 * time.Millisecond)
}

func TestServiceMetrics(t *testing.T) {
	config := DefaultServiceConfig()
	service := NewService(config)

	ctx := context.Background()
	if err := service.Start(ctx); err != nil {
		t.Fatalf("Failed to start service: %v", err)
	}
	defer service.Stop()

	// Test initial metrics
	stats := service.Stats()
	if stats.GlobalRingSize != 0 {
		t.Errorf("Expected 0 initial entries, got %d", stats.GlobalRingSize)
	}

	// Ingest multiple entries
	for i := 0; i < 5; i++ {
		entry := LogEntry{
			TS:        time.Now(),
			Level:     "info",
			Namespace: "test-ns",
			Pod:       "test-pod",
			Msg:       "test message",
		}
		service.Ingest(entry)
	}

	// Check updated metrics
	stats = service.Stats()
	if stats.GlobalRingSize != 5 {
		t.Errorf("Expected 5 entries, got %d", stats.GlobalRingSize)
	}

	// Test Prometheus metrics (basic smoke test)
	if service.prometheusMetrics == nil {
		t.Error("Prometheus metrics should be initialized")
	}
}

func TestServiceHealthChecks(t *testing.T) {
	config := DefaultServiceConfig()
	service := NewService(config)

	// Test unhealthy (not started)
	health := service.Health()
	if health.Status != "unhealthy" {
		t.Errorf("Expected unhealthy status, got %s", health.Status)
	}
	if health.Checks["service"] != "not started" {
		t.Errorf("Expected 'not started' check, got %s", health.Checks["service"])
	}

	// Start service
	ctx := context.Background()
	if err := service.Start(ctx); err != nil {
		t.Fatalf("Failed to start service: %v", err)
	}
	defer service.Stop()

	// Test healthy
	health = service.Health()
	if health.Status != "healthy" {
		t.Errorf("Expected healthy status, got %s", health.Status)
	}
	if health.Checks["service"] != "running" {
		t.Errorf("Expected 'running' check, got %s", health.Checks["service"])
	}
	if health.Uptime <= 0 {
		t.Error("Expected positive uptime")
	}

	// Test that metrics are included
	if health.Metrics == nil {
		t.Error("Expected metrics in health response")
	}
}
