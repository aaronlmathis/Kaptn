package logs

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// OperationalLogger provides structured logging for operator debugging
type OperationalLogger struct {
	logger *zap.Logger
}

// NewOperationalLogger creates a new operational logger
func NewOperationalLogger() *OperationalLogger {
	// Configure logger for operational events
	config := zap.NewProductionConfig()
	config.Level = zap.NewAtomicLevelAt(zapcore.InfoLevel)

	// Use stdout for now since log directories may not exist in test environments
	config.OutputPaths = []string{"stdout"}
	config.ErrorOutputPaths = []string{"stderr"}

	// Add structured fields for easier parsing
	config.InitialFields = map[string]interface{}{
		"component": "logs-cache",
		"version":   "1.0.0",
	}

	logger, err := config.Build()
	if err != nil {
		// Fallback to development logger if production config fails
		logger = zap.NewNop() // No-op logger to prevent panics
	}

	return &OperationalLogger{logger: logger}
}

// LogStreamLifecycle logs stream creation, updates, and deletion
func (ol *OperationalLogger) LogStreamLifecycle(event string, streamID string, subscriberID string, filter LogFilter) {
	ol.logger.Info("stream lifecycle event",
		zap.String("event", event),
		zap.String("stream_id", streamID),
		zap.String("subscriber_id", subscriberID),
		zap.String("namespace", filter.Namespace),
		zap.String("workload", filter.Workload),
		zap.String("pod", filter.Pod),
		zap.Strings("levels", filter.Levels),
		zap.String("direction", filter.Direction),
		zap.Int("limit", filter.Limit),
	)
}

// LogPodAttachment logs pod log attachment and detachment
func (ol *OperationalLogger) LogPodAttachment(event string, streamID string, pod string, namespace string, container string) {
	ol.logger.Info("pod attachment event",
		zap.String("event", event),
		zap.String("stream_id", streamID),
		zap.String("pod", pod),
		zap.String("namespace", namespace),
		zap.String("container", container),
	)
}

// LogBackpressureTransition logs backpressure state changes
func (ol *OperationalLogger) LogBackpressureTransition(streamID string, subscriberID string, from string, to string, reason string, bufferUsage int, bufferSize int) {
	ol.logger.Warn("backpressure transition",
		zap.String("stream_id", streamID),
		zap.String("subscriber_id", subscriberID),
		zap.String("from_state", from),
		zap.String("to_state", to),
		zap.String("reason", reason),
		zap.Int("buffer_usage", bufferUsage),
		zap.Int("buffer_size", bufferSize),
		zap.Float64("usage_percent", float64(bufferUsage)/float64(bufferSize)*100),
	)
}

// LogRingEviction logs ring buffer eviction events
func (ol *OperationalLogger) LogRingEviction(ringType string, ringName string, entriesEvicted int, reason string) {
	ol.logger.Info("ring eviction",
		zap.String("ring_type", ringType),
		zap.String("ring_name", ringName),
		zap.Int("entries_evicted", entriesEvicted),
		zap.String("reason", reason),
	)
}

// LogMemoryPressure logs memory usage warnings
func (ol *OperationalLogger) LogMemoryPressure(totalBytes int64, globalRingBytes int64, scopedRingBytes int64, threshold int64) {
	ol.logger.Warn("memory pressure detected",
		zap.Int64("total_bytes", totalBytes),
		zap.Int64("global_ring_bytes", globalRingBytes),
		zap.Int64("scoped_ring_bytes", scopedRingBytes),
		zap.Int64("threshold_bytes", threshold),
		zap.Float64("usage_percent", float64(totalBytes)/float64(threshold)*100),
	)
}

// LogPerformanceMetrics logs performance statistics
func (ol *OperationalLogger) LogPerformanceMetrics(ingestRate int64, queryRate int64, subscriberCount int, ringSize int) {
	ol.logger.Info("performance metrics",
		zap.Int64("ingest_rate_per_sec", ingestRate),
		zap.Int64("query_rate_per_sec", queryRate),
		zap.Int("active_subscribers", subscriberCount),
		zap.Int("global_ring_size", ringSize),
	)
}

// LogAdminAction logs administrative actions
func (ol *OperationalLogger) LogAdminAction(action string, user string, details map[string]interface{}) {
	ol.logger.Info("admin action",
		zap.String("action", action),
		zap.String("user", user),
		zap.Any("details", details),
	)
}

// LogServiceState logs service state changes
func (ol *OperationalLogger) LogServiceState(event string, state string, details map[string]interface{}) {
	ol.logger.Info("service state change",
		zap.String("event", event),
		zap.String("state", state),
		zap.Any("details", details),
	)
}

// LogError logs operational errors
func (ol *OperationalLogger) LogError(operation string, err error, context map[string]interface{}) {
	ol.logger.Error("operational error",
		zap.String("operation", operation),
		zap.Error(err),
		zap.Any("context", context),
	)
}

// Sync flushes any buffered log entries
func (ol *OperationalLogger) Sync() {
	ol.logger.Sync()
}
