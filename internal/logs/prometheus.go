package logs

import (
	"sync"
	"sync/atomic"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	prometheusMetricsOnce     sync.Once
	prometheusMetricsInstance *PrometheusMetrics
)

// PrometheusMetrics wraps our metrics with Prometheus collectors
type PrometheusMetrics struct {
	// Counters
	ingestTotal        prometheus.Counter
	ingestBytes        prometheus.Counter
	evictionsTotal     *prometheus.CounterVec // Enhanced with {reason} label
	droppedTotal       *prometheus.CounterVec // Enhanced with {reason} label
	queriesTotal       prometheus.Counter
	subscriptionsTotal prometheus.Counter
	exportsTotal       *prometheus.CounterVec // New: track exports with {format} label
	exportBytes        *prometheus.CounterVec // New: track export bytes with {format} label

	// Gauges
	globalRingSize   prometheus.Gauge
	scopedRingsCount prometheus.Gauge
	ringEntries      *prometheus.GaugeVec // Enhanced with {scope} label
	subscribers      *prometheus.GaugeVec // Enhanced with {stream} label
	queryDurationMs  prometheus.Gauge
	exportDurationMs *prometheus.GaugeVec // New: track export duration with {format} label
}

// NewPrometheusMetrics creates Prometheus collectors for logs metrics
func NewPrometheusMetrics() *PrometheusMetrics {
	prometheusMetricsOnce.Do(func() {
		prometheusMetricsInstance = &PrometheusMetrics{
			ingestTotal: promauto.NewCounter(prometheus.CounterOpts{
				Name: "kaptn_logs_ingest_total",
				Help: "The total number of log entries ingested",
			}),
			ingestBytes: promauto.NewCounter(prometheus.CounterOpts{
				Name: "kaptn_logs_ingest_bytes_total",
				Help: "The total bytes of log entries ingested",
			}),
			evictionsTotal: promauto.NewCounterVec(prometheus.CounterOpts{
				Name: "kaptn_logs_evictions_total",
				Help: "The total number of log entries evicted",
			}, []string{"reason"}),
			droppedTotal: promauto.NewCounterVec(prometheus.CounterOpts{
				Name: "kaptn_logs_dropped_total",
				Help: "The total number of log entries dropped",
			}, []string{"reason"}),
			queriesTotal: promauto.NewCounter(prometheus.CounterOpts{
				Name: "kaptn_logs_queries_total",
				Help: "The total number of log queries executed",
			}),
			subscriptionsTotal: promauto.NewCounter(prometheus.CounterOpts{
				Name: "kaptn_logs_subscriptions_total",
				Help: "The total number of log subscriptions created",
			}),
			exportsTotal: promauto.NewCounterVec(prometheus.CounterOpts{
				Name: "kaptn_logs_exports_total",
				Help: "The total number of log exports executed",
			}, []string{"format"}),
			exportBytes: promauto.NewCounterVec(prometheus.CounterOpts{
				Name: "kaptn_logs_export_bytes_total",
				Help: "The total bytes of log entries exported",
			}, []string{"format"}),
			globalRingSize: promauto.NewGauge(prometheus.GaugeOpts{
				Name: "kaptn_logs_global_ring_size",
				Help: "The current number of entries in the global log ring",
			}),
			scopedRingsCount: promauto.NewGauge(prometheus.GaugeOpts{
				Name: "kaptn_logs_scoped_rings_count",
				Help: "The current number of scoped log rings",
			}),
			ringEntries: promauto.NewGaugeVec(prometheus.GaugeOpts{
				Name: "kaptn_logs_ring_entries",
				Help: "The current number of entries per ring scope",
			}, []string{"scope"}),
			subscribers: promauto.NewGaugeVec(prometheus.GaugeOpts{
				Name: "kaptn_logs_subscribers",
				Help: "The current number of active subscribers per stream",
			}, []string{"stream"}),
			queryDurationMs: promauto.NewGauge(prometheus.GaugeOpts{
				Name: "kaptn_logs_query_duration_ms",
				Help: "The average query duration in milliseconds",
			}),
			exportDurationMs: promauto.NewGaugeVec(prometheus.GaugeOpts{
				Name: "kaptn_logs_export_duration_ms",
				Help: "The average export duration in milliseconds",
			}, []string{"format"}),
		}
	})
	return prometheusMetricsInstance
}

// UpdateFromMetrics updates Prometheus metrics from our internal metrics
func (pm *PrometheusMetrics) UpdateFromMetrics(m *Metrics) {
	stats := m.GetStats()

	// Update gauges directly
	pm.globalRingSize.Set(float64(stats.GlobalRingSize))
	pm.scopedRingsCount.Set(float64(stats.ScopedRingsCount))

	// Update labeled gauge for subscribers (use "total" as default stream label)
	pm.subscribers.WithLabelValues("total").Set(float64(stats.TotalSubscribers))

	// Access the raw QueryDurationMs from metrics
	queryDuration := atomic.LoadInt64(&m.QueryDurationMs)
	pm.queryDurationMs.Set(float64(queryDuration))
}

// RecordIngest records an ingestion event
func (pm *PrometheusMetrics) RecordIngest(bytes int) {
	pm.ingestTotal.Inc()
	pm.ingestBytes.Add(float64(bytes))
}

// RecordEviction records an eviction event with a reason
func (pm *PrometheusMetrics) RecordEviction(reason string) {
	if reason == "" {
		reason = "ttl" // default reason
	}
	pm.evictionsTotal.WithLabelValues(reason).Inc()
}

// RecordDrop records a dropped entry event with a reason
func (pm *PrometheusMetrics) RecordDrop(reason string) {
	if reason == "" {
		reason = "buffer_full" // default reason
	}
	pm.droppedTotal.WithLabelValues(reason).Inc()
}

// RecordQuery records a query event
func (pm *PrometheusMetrics) RecordQuery() {
	pm.queriesTotal.Inc()
}

// RecordSubscription records a subscription event
func (pm *PrometheusMetrics) RecordSubscription() {
	pm.subscriptionsTotal.Inc()
}

// RecordExport records an export operation
func (pm *PrometheusMetrics) RecordExport(format string, bytesExported int64, durationMs int64) {
	pm.exportsTotal.WithLabelValues(format).Inc()
	pm.exportBytes.WithLabelValues(format).Add(float64(bytesExported))
	pm.exportDurationMs.WithLabelValues(format).Set(float64(durationMs))
}

// UpdateRingEntries updates ring entries for a specific scope
func (pm *PrometheusMetrics) UpdateRingEntries(scope string, count int) {
	pm.ringEntries.WithLabelValues(scope).Set(float64(count))
}

// UpdateSubscribers updates subscriber count for a specific stream
func (pm *PrometheusMetrics) UpdateSubscribers(stream string, count int) {
	pm.subscribers.WithLabelValues(stream).Set(float64(count))
}
