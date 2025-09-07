package logs

import (
	"sync/atomic"
	"time"
)

// Metrics holds counters and gauges for the log service
type Metrics struct {
	// Ingest metrics
	IngestTotal    int64     // Total number of entries ingested
	IngestBytes    int64     // Total bytes ingested
	LastIngestTime time.Time // Last time an entry was ingested

	// Ring metrics
	GlobalRingSize   int64 // Current size of global ring
	ScopedRingsCount int64 // Number of scoped rings
	EvictionsTotal   int64 // Total entries evicted
	DroppedTotal     int64 // Total entries dropped due to full buffers

	// Subscription metrics
	SubscribersTotal   int64 // Current number of subscribers
	SubscriptionsTotal int64 // Total subscriptions created (lifetime)

	// Query metrics
	QueriesTotal    int64 // Total queries executed
	QueryDurationMs int64 // Average query duration in milliseconds
}

// NewMetrics creates a new metrics collector
func NewMetrics() *Metrics {
	return &Metrics{}
}

// RecordIngest records an ingested log entry
func (m *Metrics) RecordIngest(entrySize int) {
	atomic.AddInt64(&m.IngestTotal, 1)
	atomic.AddInt64(&m.IngestBytes, int64(entrySize))
	m.LastIngestTime = time.Now()
}

// RecordEviction records an evicted entry
func (m *Metrics) RecordEviction() {
	atomic.AddInt64(&m.EvictionsTotal, 1)
}

// RecordDrop records a dropped entry
func (m *Metrics) RecordDrop() {
	atomic.AddInt64(&m.DroppedTotal, 1)
}

// SetGlobalRingSize updates the global ring size gauge
func (m *Metrics) SetGlobalRingSize(size int) {
	atomic.StoreInt64(&m.GlobalRingSize, int64(size))
}

// SetScopedRingsCount updates the scoped rings count gauge
func (m *Metrics) SetScopedRingsCount(count int) {
	atomic.StoreInt64(&m.ScopedRingsCount, int64(count))
}

// RecordSubscription records a new subscription
func (m *Metrics) RecordSubscription() {
	atomic.AddInt64(&m.SubscribersTotal, 1)
	atomic.AddInt64(&m.SubscriptionsTotal, 1)
}

// RecordUnsubscription records a removed subscription
func (m *Metrics) RecordUnsubscription() {
	atomic.AddInt64(&m.SubscribersTotal, -1)
}

// RecordQuery records a completed query
func (m *Metrics) RecordQuery(durationMs int64) {
	atomic.AddInt64(&m.QueriesTotal, 1)
	// Simple moving average approximation
	current := atomic.LoadInt64(&m.QueryDurationMs)
	newAvg := (current + durationMs) / 2
	atomic.StoreInt64(&m.QueryDurationMs, newAvg)
}

// GetStats returns current statistics
func (m *Metrics) GetStats() ServiceStats {
	return ServiceStats{
		GlobalRingSize:      int(atomic.LoadInt64(&m.GlobalRingSize)),
		ScopedRingsCount:    int(atomic.LoadInt64(&m.ScopedRingsCount)),
		TotalSubscribers:    int(atomic.LoadInt64(&m.SubscribersTotal)),
		IngestRate:          m.calculateIngestRate(),
		LastIngestTime:      m.LastIngestTime,
		EvictionsTotal:      atomic.LoadInt64(&m.EvictionsTotal),
		DroppedEntriesTotal: atomic.LoadInt64(&m.DroppedTotal),
	}
}

// calculateIngestRate calculates entries per second over the last minute
func (m *Metrics) calculateIngestRate() int64 {
	// This is a simplified calculation
	// In a real implementation, you'd want a sliding window
	if m.LastIngestTime.IsZero() {
		return 0
	}

	elapsed := time.Since(m.LastIngestTime)
	if elapsed > time.Minute {
		return 0 // No recent activity
	}

	// Very rough approximation - would need proper sliding window
	total := atomic.LoadInt64(&m.IngestTotal)
	if total == 0 {
		return 0
	}

	// Return the total divided by elapsed seconds (capped at reasonable values)
	seconds := int64(elapsed.Seconds())
	if seconds == 0 {
		seconds = 1
	}

	rate := total / seconds
	if rate > 10000 { // Cap at 10k/sec for sanity
		rate = 10000
	}

	return rate
}

// Reset clears all metrics (useful for testing)
func (m *Metrics) Reset() {
	atomic.StoreInt64(&m.IngestTotal, 0)
	atomic.StoreInt64(&m.IngestBytes, 0)
	atomic.StoreInt64(&m.GlobalRingSize, 0)
	atomic.StoreInt64(&m.ScopedRingsCount, 0)
	atomic.StoreInt64(&m.EvictionsTotal, 0)
	atomic.StoreInt64(&m.DroppedTotal, 0)
	atomic.StoreInt64(&m.SubscribersTotal, 0)
	atomic.StoreInt64(&m.SubscriptionsTotal, 0)
	atomic.StoreInt64(&m.QueriesTotal, 0)
	atomic.StoreInt64(&m.QueryDurationMs, 0)
	m.LastIngestTime = time.Time{}
}
