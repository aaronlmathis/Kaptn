package timeseries

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/aaronlmathis/kaptn/internal/metrics"
)

// HealthMetrics tracks health and performance metrics for the timeseries system
type HealthMetrics struct {
	mu sync.RWMutex

	// Counters
	seriesCount       int64 // Current number of active series
	totalPointsAdded  int64 // Total points added (lifetime)
	pointsAddedPerSec int64 // Points added in the last second
	wsClientCount     int64 // Current WebSocket client count
	wsMessagesPerSec  int64 // WebSocket messages sent per second

	// Performance tracking
	lastResetTime        time.Time // Last time per-second counters were reset
	pointsThisSecond     int64     // Points added in current second
	wsMessagesThisSecond int64     // WS messages sent in current second

	// Error tracking
	errorCount        int64 // Total errors encountered
	droppedPoints     int64 // Points dropped due to limits
	droppedWSMessages int64 // WebSocket messages dropped

	// Resource limits
	maxSeriesCount     int // Maximum allowed series
	maxPointsPerSeries int // Maximum points per series (guard)
	maxWSClients       int // Maximum WebSocket clients
}

// NewHealthMetrics creates a new health metrics tracker
func NewHealthMetrics() *HealthMetrics {
	return &HealthMetrics{
		lastResetTime:      time.Now(),
		maxSeriesCount:     1000,  // Default: max 1000 series
		maxPointsPerSeries: 10000, // Default: max 10k points per series
		maxWSClients:       500,   // Default: max 500 WS clients
	}
}

// SetLimits configures resource limits
func (h *HealthMetrics) SetLimits(maxSeries, maxPointsPerSeries, maxWSClients int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.maxSeriesCount = maxSeries
	h.maxPointsPerSeries = maxPointsPerSeries
	h.maxWSClients = maxWSClients
}

// IncrementSeriesCount increments the active series count
func (h *HealthMetrics) IncrementSeriesCount() {
	atomic.AddInt64(&h.seriesCount, 1)
}

// DecrementSeriesCount decrements the active series count
func (h *HealthMetrics) DecrementSeriesCount() {
	atomic.AddInt64(&h.seriesCount, -1)
}

// RecordPointAdded records that a point was added to a series
func (h *HealthMetrics) RecordPointAdded() {
	atomic.AddInt64(&h.totalPointsAdded, 1)
	atomic.AddInt64(&h.pointsThisSecond, 1)
	h.updatePerSecondCounters()

	// Also update Prometheus metrics
	metrics.RecordRingBufferPoint()
}

// RecordWSMessage records that a WebSocket message was sent
func (h *HealthMetrics) RecordWSMessage() {
	atomic.AddInt64(&h.wsMessagesThisSecond, 1)
	h.updatePerSecondCounters()
}

// SetWSClientCount sets the current WebSocket client count
func (h *HealthMetrics) SetWSClientCount(count int64) {
	atomic.StoreInt64(&h.wsClientCount, count)
}

// RecordError records an error
func (h *HealthMetrics) RecordError() {
	atomic.AddInt64(&h.errorCount, 1)
}

// RecordDroppedPoint records a point that was dropped due to limits
func (h *HealthMetrics) RecordDroppedPoint() {
	atomic.AddInt64(&h.droppedPoints, 1)
}

// RecordDroppedWSMessage records a WebSocket message that was dropped
func (h *HealthMetrics) RecordDroppedWSMessage() {
	atomic.AddInt64(&h.droppedWSMessages, 1)
}

// updatePerSecondCounters updates the per-second rate counters
func (h *HealthMetrics) updatePerSecondCounters() {
	now := time.Now()

	h.mu.Lock()
	defer h.mu.Unlock()

	// Reset counters every second
	if now.Sub(h.lastResetTime) >= time.Second {
		atomic.StoreInt64(&h.pointsAddedPerSec, atomic.LoadInt64(&h.pointsThisSecond))
		atomic.StoreInt64(&h.wsMessagesPerSec, atomic.LoadInt64(&h.wsMessagesThisSecond))

		atomic.StoreInt64(&h.pointsThisSecond, 0)
		atomic.StoreInt64(&h.wsMessagesThisSecond, 0)

		h.lastResetTime = now
	}
}

// CheckSeriesLimit checks if creating a new series would exceed limits
func (h *HealthMetrics) CheckSeriesLimit() bool {
	current := atomic.LoadInt64(&h.seriesCount)
	h.mu.RLock()
	limit := h.maxSeriesCount
	h.mu.RUnlock()

	return int(current) < limit
}

// CheckPointsLimit checks if a series has too many points
func (h *HealthMetrics) CheckPointsLimit(seriesPointCount int) bool {
	h.mu.RLock()
	limit := h.maxPointsPerSeries
	h.mu.RUnlock()

	return seriesPointCount < limit
}

// CheckWSClientLimit checks if adding a WebSocket client would exceed limits
func (h *HealthMetrics) CheckWSClientLimit() bool {
	current := atomic.LoadInt64(&h.wsClientCount)
	h.mu.RLock()
	limit := h.maxWSClients
	h.mu.RUnlock()

	return int(current) < limit
}

// GetSnapshot returns a snapshot of current health metrics
func (h *HealthMetrics) GetSnapshot() HealthSnapshot {
	h.updatePerSecondCounters() // Ensure counters are up to date

	h.mu.RLock()
	defer h.mu.RUnlock()

	snapshot := HealthSnapshot{
		SeriesCount:        atomic.LoadInt64(&h.seriesCount),
		TotalPointsAdded:   atomic.LoadInt64(&h.totalPointsAdded),
		PointsAddedPerSec:  atomic.LoadInt64(&h.pointsAddedPerSec),
		WSClientCount:      atomic.LoadInt64(&h.wsClientCount),
		WSMessagesPerSec:   atomic.LoadInt64(&h.wsMessagesPerSec),
		ErrorCount:         atomic.LoadInt64(&h.errorCount),
		DroppedPoints:      atomic.LoadInt64(&h.droppedPoints),
		DroppedWSMessages:  atomic.LoadInt64(&h.droppedWSMessages),
		MaxSeriesCount:     h.maxSeriesCount,
		MaxPointsPerSeries: h.maxPointsPerSeries,
		MaxWSClients:       h.maxWSClients,
		Timestamp:          time.Now(),
	}

	// Update Prometheus metrics with current snapshot
	metrics.UpdateRingBufferMetrics(
		snapshot.SeriesCount,
		snapshot.PointsAddedPerSec,
		0, // We don't track deltas for dropped points here
	)

	return snapshot
}

// HealthSnapshot represents a point-in-time snapshot of health metrics
type HealthSnapshot struct {
	SeriesCount        int64     `json:"series_count"`
	TotalPointsAdded   int64     `json:"total_points_added"`
	PointsAddedPerSec  int64     `json:"points_added_per_sec"`
	WSClientCount      int64     `json:"ws_client_count"`
	WSMessagesPerSec   int64     `json:"ws_messages_per_sec"`
	ErrorCount         int64     `json:"error_count"`
	DroppedPoints      int64     `json:"dropped_points"`
	DroppedWSMessages  int64     `json:"dropped_ws_messages"`
	MaxSeriesCount     int       `json:"max_series_count"`
	MaxPointsPerSeries int       `json:"max_points_per_series"`
	MaxWSClients       int       `json:"max_ws_clients"`
	Timestamp          time.Time `json:"timestamp"`
}

// IsHealthy returns true if the system is operating within healthy parameters
func (s HealthSnapshot) IsHealthy() bool {
	// Check if we're approaching limits
	if float64(s.SeriesCount)/float64(s.MaxSeriesCount) > 0.9 {
		return false
	}

	if float64(s.WSClientCount)/float64(s.MaxWSClients) > 0.9 {
		return false
	}

	// Check for high error rates
	if s.ErrorCount > 0 && float64(s.DroppedPoints)/float64(s.TotalPointsAdded) > 0.1 {
		return false
	}

	return true
}

// GetStatus returns a human-readable status string
func (s HealthSnapshot) GetStatus() string {
	if s.IsHealthy() {
		return "healthy"
	}

	// Determine specific issues
	if float64(s.SeriesCount)/float64(s.MaxSeriesCount) > 0.9 {
		return "warning: approaching series limit"
	}

	if float64(s.WSClientCount)/float64(s.MaxWSClients) > 0.9 {
		return "warning: approaching WebSocket client limit"
	}

	if s.ErrorCount > 0 && float64(s.DroppedPoints)/float64(s.TotalPointsAdded) > 0.1 {
		return "warning: high drop rate"
	}

	return "degraded"
}
