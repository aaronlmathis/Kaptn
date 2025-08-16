package timeseries

import (
	"testing"
	"time"
)

func TestHealthMetrics_Counters(t *testing.T) {
	health := NewHealthMetrics()

	// Test series count increment/decrement
	health.IncrementSeriesCount()
	health.IncrementSeriesCount()
	if count := health.GetSnapshot().SeriesCount; count != 2 {
		t.Errorf("Expected series count 2, got %d", count)
	}

	health.DecrementSeriesCount()
	if count := health.GetSnapshot().SeriesCount; count != 1 {
		t.Errorf("Expected series count 1, got %d", count)
	}

	// Test point recording
	health.RecordPointAdded()
	health.RecordPointAdded()
	snapshot := health.GetSnapshot()
	if snapshot.TotalPointsAdded != 2 {
		t.Errorf("Expected total points 2, got %d", snapshot.TotalPointsAdded)
	}

	// Test error recording
	health.RecordError()
	snapshot = health.GetSnapshot()
	if snapshot.ErrorCount != 1 {
		t.Errorf("Expected error count 1, got %d", snapshot.ErrorCount)
	}

	// Test dropped points
	health.RecordDroppedPoint()
	snapshot = health.GetSnapshot()
	if snapshot.DroppedPoints != 1 {
		t.Errorf("Expected dropped points 1, got %d", snapshot.DroppedPoints)
	}
}

func TestHealthMetrics_Limits(t *testing.T) {
	health := NewHealthMetrics()
	health.SetLimits(2, 100, 10) // 2 series, 100 points per series, 10 WS clients

	// Test series limit check
	if !health.CheckSeriesLimit() {
		t.Error("Expected series limit check to pass when count is 0")
	}

	health.IncrementSeriesCount()
	health.IncrementSeriesCount()
	if health.CheckSeriesLimit() {
		t.Error("Expected series limit check to fail when at limit")
	}

	// Test points limit check
	if !health.CheckPointsLimit(50) {
		t.Error("Expected points limit check to pass for 50 points")
	}

	if health.CheckPointsLimit(150) {
		t.Error("Expected points limit check to fail for 150 points")
	}

	// Test WebSocket client limit
	if !health.CheckWSClientLimit() {
		t.Error("Expected WS client limit check to pass when count is 0")
	}

	health.SetWSClientCount(10)
	if health.CheckWSClientLimit() {
		t.Error("Expected WS client limit check to fail when at limit")
	}
}

func TestHealthMetrics_PerSecondCounters(t *testing.T) {
	health := NewHealthMetrics()

	// Record some points
	health.RecordPointAdded()
	health.RecordPointAdded()
	health.RecordWSMessage()

	// Wait for per-second counter update
	time.Sleep(1100 * time.Millisecond)

	// Force an update
	health.RecordPointAdded()

	snapshot := health.GetSnapshot()
	if snapshot.PointsAddedPerSec == 0 {
		t.Error("Expected points per second to be updated")
	}
	if snapshot.WSMessagesPerSec == 0 {
		t.Error("Expected WS messages per second to be updated")
	}
}

func TestHealthSnapshot_IsHealthy(t *testing.T) {
	tests := []struct {
		name     string
		snapshot HealthSnapshot
		healthy  bool
	}{
		{
			name: "healthy system",
			snapshot: HealthSnapshot{
				SeriesCount:      50,
				MaxSeriesCount:   1000,
				WSClientCount:    25,
				MaxWSClients:     500,
				ErrorCount:       0,
				DroppedPoints:    0,
				TotalPointsAdded: 1000,
			},
			healthy: true,
		},
		{
			name: "approaching series limit",
			snapshot: HealthSnapshot{
				SeriesCount:      950, // >90% of 1000
				MaxSeriesCount:   1000,
				WSClientCount:    25,
				MaxWSClients:     500,
				ErrorCount:       0,
				DroppedPoints:    0,
				TotalPointsAdded: 1000,
			},
			healthy: false,
		},
		{
			name: "approaching WS client limit",
			snapshot: HealthSnapshot{
				SeriesCount:      50,
				MaxSeriesCount:   1000,
				WSClientCount:    460, // >90% of 500
				MaxWSClients:     500,
				ErrorCount:       0,
				DroppedPoints:    0,
				TotalPointsAdded: 1000,
			},
			healthy: false,
		},
		{
			name: "high drop rate",
			snapshot: HealthSnapshot{
				SeriesCount:      50,
				MaxSeriesCount:   1000,
				WSClientCount:    25,
				MaxWSClients:     500,
				ErrorCount:       5,
				DroppedPoints:    150, // 15% drop rate
				TotalPointsAdded: 1000,
			},
			healthy: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.snapshot.IsHealthy(); got != tt.healthy {
				t.Errorf("IsHealthy() = %v, want %v", got, tt.healthy)
			}
		})
	}
}

func TestHealthSnapshot_GetStatus(t *testing.T) {
	tests := []struct {
		name     string
		snapshot HealthSnapshot
		status   string
	}{
		{
			name: "healthy",
			snapshot: HealthSnapshot{
				SeriesCount:      50,
				MaxSeriesCount:   1000,
				WSClientCount:    25,
				MaxWSClients:     500,
				ErrorCount:       0,
				DroppedPoints:    0,
				TotalPointsAdded: 1000,
			},
			status: "healthy",
		},
		{
			name: "series limit warning",
			snapshot: HealthSnapshot{
				SeriesCount:      950,
				MaxSeriesCount:   1000,
				WSClientCount:    25,
				MaxWSClients:     500,
				ErrorCount:       0,
				DroppedPoints:    0,
				TotalPointsAdded: 1000,
			},
			status: "warning: approaching series limit",
		},
		{
			name: "ws client limit warning",
			snapshot: HealthSnapshot{
				SeriesCount:      50,
				MaxSeriesCount:   1000,
				WSClientCount:    460,
				MaxWSClients:     500,
				ErrorCount:       0,
				DroppedPoints:    0,
				TotalPointsAdded: 1000,
			},
			status: "warning: approaching WebSocket client limit",
		},
		{
			name: "high drop rate",
			snapshot: HealthSnapshot{
				SeriesCount:      50,
				MaxSeriesCount:   1000,
				WSClientCount:    25,
				MaxWSClients:     500,
				ErrorCount:       5,
				DroppedPoints:    150,
				TotalPointsAdded: 1000,
			},
			status: "warning: high drop rate",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.snapshot.GetStatus(); got != tt.status {
				t.Errorf("GetStatus() = %v, want %v", got, tt.status)
			}
		})
	}
}

func TestHealthMetrics_ConcurrentAccess(t *testing.T) {
	health := NewHealthMetrics()

	// Test concurrent access
	done := make(chan bool, 4)

	// Goroutine 1: increment series count
	go func() {
		for i := 0; i < 100; i++ {
			health.IncrementSeriesCount()
		}
		done <- true
	}()

	// Goroutine 2: record points
	go func() {
		for i := 0; i < 100; i++ {
			health.RecordPointAdded()
		}
		done <- true
	}()

	// Goroutine 3: record WS messages
	go func() {
		for i := 0; i < 100; i++ {
			health.RecordWSMessage()
		}
		done <- true
	}()

	// Goroutine 4: get snapshots
	go func() {
		for i := 0; i < 100; i++ {
			health.GetSnapshot()
		}
		done <- true
	}()

	// Wait for all goroutines to complete
	for i := 0; i < 4; i++ {
		<-done
	}

	snapshot := health.GetSnapshot()
	if snapshot.SeriesCount != 100 {
		t.Errorf("Expected series count 100, got %d", snapshot.SeriesCount)
	}
	if snapshot.TotalPointsAdded != 100 {
		t.Errorf("Expected total points 100, got %d", snapshot.TotalPointsAdded)
	}
}
