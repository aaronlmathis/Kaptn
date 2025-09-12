package logs

import (
	"context"
	"time"

	"github.com/aaronlmathis/kaptn/internal/config"
)

// LogEntry represents a single log line with normalized metadata
type LogEntry struct {
	TS        time.Time         `json:"ts"`
	Level     string            `json:"level"`
	Cluster   string            `json:"cluster"`
	Namespace string            `json:"namespace"`
	Workload  string            `json:"workload"`
	Pod       string            `json:"pod"`
	Container string            `json:"container"`
	Node      string            `json:"node"`
	Msg       string            `json:"msg"`
	TraceID   string            `json:"trace_id,omitempty"`
	SpanID    string            `json:"span_id,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// LogFilter represents filtering and query options for log queries
type LogFilter struct {
	Since     time.Time `json:"since"`
	Until     time.Time `json:"until"`
	Levels    []string  `json:"levels"`
	Cluster   string    `json:"cluster"`
	Namespace string    `json:"namespace"`
	Workload  string    `json:"workload"`
	Pod       string    `json:"pod"`
	Text      string    `json:"text"` // substring match
	Limit     int       `json:"limit"`
	Direction string    `json:"direction"` // "backward" or "forward"
}

// LogRing represents a bounded ring buffer with simple inverted index hooks
type LogRing interface {
	// Append adds a new log entry to the ring
	Append(e LogEntry)

	// Query returns log entries matching the filter
	Query(f LogFilter) []LogEntry

	// EvictByTime removes entries older than the given time
	EvictByTime(now time.Time)

	// Size returns the current number of entries in the ring
	Size() int

    // Clear removes all entries
    Clear()

    // Bounds returns the oldest and newest timestamps currently in the ring
    Bounds() (time.Time, time.Time)
}

// LogBus represents pub/sub for live log updates
type LogBus interface {
	// Publish broadcasts a log entry to all matching subscribers
	Publish(e LogEntry)

	// Subscribe creates a subscription for log entries matching the filter
	// Returns a channel to receive entries and a cancel function
	Subscribe(f LogFilter) (<-chan LogEntry, func())

	// SubscriberCount returns the number of active subscribers
	SubscriberCount() int
}

// LogService represents the high-level facade used by HTTP/WS handlers
type LogService interface {
	// Start starts the service and background workers
	Start(ctx context.Context) error

	// Ingest accepts a log entry from collectors or mini-stern
	Ingest(e LogEntry)

	// Replay returns historical log entries matching the filter
	Replay(f LogFilter) []LogEntry

	// Stream creates a live stream of log entries matching the filter
	// Returns a channel for entries and a cancel function
	Stream(f LogFilter) (<-chan LogEntry, func())

	// RecordExport records export metrics
	RecordExport(format string, bytesExported int64, durationMs int64)

	// Stop shuts down the service and cleans up resources
	Stop()

	// Stats returns service statistics
	Stats() ServiceStats

	// Health returns health status of the service
	Health() HealthStatus

	AdminClearRings() error
	AdminGetDetailedStats() AdminStats
	AdminListActiveStreams() []StreamInfo
	AdminUpdateLimits(limits AdminLimits) error
	AdminGetCurrentLimits() AdminLimits
}

// ServiceStats represents runtime statistics for the log service
type ServiceStats struct {
	GlobalRingSize      int       `json:"global_ring_size"`
	ScopedRingsCount    int       `json:"scoped_rings_count"`
	TotalSubscribers    int       `json:"total_subscribers"`
	IngestRate          int64     `json:"ingest_rate_per_sec"`
	LastIngestTime      time.Time `json:"last_ingest_time"`
	EvictionsTotal      int64     `json:"evictions_total"`
	DroppedEntriesTotal int64     `json:"dropped_entries_total"`

	// Index statistics
	IndexStats IndexStats `json:"index_stats"`
}

// HealthStatus represents the health status of the log service
type HealthStatus struct {
	Status  string            `json:"status"` // "healthy", "warning", "unhealthy"
	Started bool              `json:"started"`
	Uptime  time.Duration     `json:"uptime"`
	Checks  map[string]string `json:"checks"` // Individual health checks
	Metrics *ServiceStats     `json:"metrics,omitempty"`
}

// AdminStats represents detailed administrative statistics
type AdminStats struct {
	ServiceStats

	// Ring-specific details
	RingDetails map[string]RingStats `json:"ring_details"`

	// Memory usage breakdown
	MemoryUsage MemoryUsage `json:"memory_usage"`

	// Operational metrics
	BackgroundWorkers WorkerStats `json:"background_workers"`

	// Configuration snapshot
	Configuration config.LogsServiceConfig `json:"configuration"`
}

// RingStats represents statistics for individual rings
type RingStats struct {
	Name        string    `json:"name"`
	Type        string    `json:"type"` // "global" or "scoped"
	Size        int       `json:"size"`
	Capacity    int       `json:"capacity"`
	OldestEntry time.Time `json:"oldest_entry,omitempty"`
	NewestEntry time.Time `json:"newest_entry,omitempty"`
	MemoryBytes int64     `json:"memory_bytes"`
}

// MemoryUsage represents memory usage breakdown
type MemoryUsage struct {
	TotalBytes      int64 `json:"total_bytes"`
	GlobalRingBytes int64 `json:"global_ring_bytes"`
	ScopedRingBytes int64 `json:"scoped_ring_bytes"`
	IndexBytes      int64 `json:"index_bytes"`
	SubscriberBytes int64 `json:"subscriber_bytes"`
}

// WorkerStats represents background worker statistics
type WorkerStats struct {
	EvictionWorkerLastRun time.Time `json:"eviction_worker_last_run"`
	CleanupWorkerLastRun  time.Time `json:"cleanup_worker_last_run"`
	MetricsWorkerLastRun  time.Time `json:"metrics_worker_last_run"`
	WorkersRunning        int       `json:"workers_running"`
}

// StreamInfo represents information about an active stream
type StreamInfo struct {
	StreamID      string    `json:"stream_id"`
	Filter        LogFilter `json:"filter"`
	SubscriberID  string    `json:"subscriber_id"`
	CreatedAt     time.Time `json:"created_at"`
	LastActivity  time.Time `json:"last_activity"`
	MessagesCount int64     `json:"messages_count"`
	BufferSize    int       `json:"buffer_size"`
	BufferUsage   int       `json:"buffer_usage"`
	IsDegraded    bool      `json:"is_degraded"`
}

// AdminLimits represents configurable operational limits
type AdminLimits struct {
	MaxSubscribers        int           `json:"max_subscribers"`
	MaxStreamsPerUser     int           `json:"max_streams_per_user"`
	MaxBufferSize         int           `json:"max_buffer_size"`
	MaxQueryLimit         int           `json:"max_query_limit"`
	MaxExportSize         int64         `json:"max_export_size"`
	MaxConcurrentQueries  int           `json:"max_concurrent_queries"`
	RateLimitPerSecond    int           `json:"rate_limit_per_second"`
	BackpressureThreshold int           `json:"backpressure_threshold"`
	DegradedModeTimeout   time.Duration `json:"degraded_mode_timeout"`
}
