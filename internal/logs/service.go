package logs

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/aaronlmathis/kaptn/internal/config"
	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
)

// Service implements LogService and coordinates rings, bus, and metrics
type Service struct {
	config            config.LogsServiceConfig
	metrics           *Metrics
	prometheusMetrics *PrometheusMetrics
	opLogger          *OperationalLogger

	// Storage
	globalRing  LogRing
	scopedRings map[string]LogRing // keyed by scope (e.g., "ns:default", "workload:nginx")

	// Pub/sub
	bus LogBus

	// Background collection
	backgroundCollector *BackgroundCollector

	// Lifecycle
	stopCh    chan struct{}
	stopOnce  sync.Once
	started   bool
	startTime time.Time
	mu        sync.RWMutex

	adminLimits     AdminLimits
	activeStreams   map[string]*StreamInfo // keyed by stream ID
	streamMu        sync.RWMutex
	lastEvictionRun time.Time
	lastCleanupRun  time.Time
	lastMetricsRun  time.Time
	workerMu        sync.RWMutex
}

// NewService creates a new log service
func NewService(cfg config.LogsServiceConfig) *Service {
	s := &Service{
		config:            cfg,
		metrics:           NewMetrics(),
		prometheusMetrics: NewPrometheusMetrics(),
		opLogger:          NewOperationalLogger(),
		globalRing:        NewRing(cfg.GlobalMaxEntries, cfg.GlobalMaxAge),
		scopedRings:       make(map[string]LogRing),
		bus:               NewBus(cfg.BufferSize),
		stopCh:            make(chan struct{}),
		started:           false,

		adminLimits: AdminLimits{
			MaxSubscribers:        cfg.MaxSubscribers,
			MaxStreamsPerUser:     50, // Default limit per user
			MaxBufferSize:         1000,
			MaxQueryLimit:         10000,
			MaxExportSize:         100 * 1024 * 1024, // 100MB
			MaxConcurrentQueries:  20,
			RateLimitPerSecond:    1000,
			BackpressureThreshold: 80, // Percentage
			DegradedModeTimeout:   5 * time.Minute,
		},
		activeStreams: make(map[string]*StreamInfo),
	}

	return s
}

// SetBackgroundCollector sets up the background log collector
func (s *Service) SetBackgroundCollector(kubeClient kubernetes.Interface, clusterName string) error {
	s.opLogger.logger.Info("🔧 SetBackgroundCollector called",
		zap.Bool("enabled", s.config.BackgroundCollectionEnabled),
		zap.String("cluster", clusterName))

	if !s.config.BackgroundCollectionEnabled {
		s.opLogger.LogServiceState("background_collection", "disabled", map[string]interface{}{
			"reason": "background_collection_enabled is false",
		})
		s.opLogger.logger.Info("❌ Background collection disabled in config")
		return nil
	}

	// Parse retention duration
	retention, err := time.ParseDuration(s.config.BackgroundCollectionRetention)
	if err != nil {
		s.opLogger.logger.Error("❌ Failed to parse background collection retention",
			zap.String("retention", s.config.BackgroundCollectionRetention),
			zap.Error(err))
		return fmt.Errorf("invalid background collection retention: %w", err)
	}

	// Parse interval duration
	interval, err := time.ParseDuration(s.config.BackgroundCollectionInterval)
	if err != nil {
		s.opLogger.logger.Error("❌ Failed to parse background collection interval",
			zap.String("interval", s.config.BackgroundCollectionInterval),
			zap.Error(err))
		return fmt.Errorf("invalid background collection interval: %w", err)
	}

	s.opLogger.logger.Info("⏱️ Parsed background collection config",
		zap.Duration("retention", retention),
		zap.Duration("interval", interval))

	// Create background collector config
	collectorConfig := BackgroundCollectorConfig{
		Enabled:   true,
		Retention: retention,
		Interval:  interval,
		TailLines: 100, // Start with last 100 lines per container
	}

	s.opLogger.logger.Info("📋 Created background collector config",
		zap.Bool("enabled", collectorConfig.Enabled),
		zap.Int64("tail_lines", collectorConfig.TailLines))

	// Create the background collector
	s.backgroundCollector = NewBackgroundCollector(
		s.opLogger.logger, // Use the operational logger's underlying zap logger
		kubeClient,
		s,
		clusterName,
		collectorConfig,
	)

	s.opLogger.logger.Info("✅ Background collector created successfully")

	s.opLogger.LogServiceState("background_collection", "configured", map[string]interface{}{
		"retention":  retention.String(),
		"interval":   interval.String(),
		"tail_lines": collectorConfig.TailLines,
		"cluster":    clusterName,
	})

	return nil
}

// Start starts the service and background workers
func (s *Service) Start(ctx context.Context) error {
	s.opLogger.logger.Info("🚀 Starting logs service",
		zap.Bool("has_background_collector", s.backgroundCollector != nil))

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.started {
		s.opLogger.logger.Info("⚠️ Service already started, skipping")
		return nil // Already started
	}

	// Start background goroutines
	s.opLogger.logger.Info("🔄 Starting background workers")
	go s.evictionWorker()
	go s.cleanupWorker()
	go s.metricsWorker()

	// Start background log collection if enabled
	if s.backgroundCollector != nil {
		s.opLogger.logger.Info("🎯 Starting background log collector")
		if err := s.backgroundCollector.Start(ctx); err != nil {
			s.opLogger.logger.Error("❌ Failed to start background collector", zap.Error(err))
			return fmt.Errorf("failed to start background log collector: %w", err)
		}
		s.opLogger.LogServiceState("background_collection", "started", map[string]interface{}{
			"enabled": true,
		})
		s.opLogger.logger.Info("✅ Background collector started successfully")
	} else {
		s.opLogger.logger.Warn("⚠️ No background collector to start (nil)")
	}

	s.started = true
	s.startTime = time.Now()

	// Log service startup
	s.opLogger.LogServiceState("start", "running", map[string]interface{}{
		"global_max_entries": s.config.GlobalMaxEntries,
		"scope_max_entries":  s.config.ScopeMaxEntries,
		"max_subscribers":    s.config.MaxSubscribers,
		"buffer_size":        s.config.BufferSize,
	})

	return nil
}

// Ingest accepts a log entry from collectors or mini-stern
func (s *Service) Ingest(e LogEntry) {
	// Normalize the entry
	normalized := NormalizeLogEntry(e)

	s.opLogger.logger.Debug("📥 Ingesting log entry",
		zap.String("pod", normalized.Pod),
		zap.String("namespace", normalized.Namespace),
		zap.String("level", normalized.Level),
		zap.String("message_preview", func() string {
			if len(normalized.Msg) > 50 {
				return normalized.Msg[:50] + "..."
			}
			return normalized.Msg
		}()))

	// Record metrics
	entrySize := estimateEntrySize(normalized)
	s.metrics.RecordIngest(entrySize)
	s.prometheusMetrics.RecordIngest(entrySize)

	// Add to global ring
	s.globalRing.Append(normalized)
	s.metrics.SetGlobalRingSize(s.globalRing.Size())

	// Add to scoped rings
	s.addToScopedRings(normalized)

	// Publish to subscribers
	s.bus.Publish(normalized)
}

// Replay returns historical log entries matching the filter
func (s *Service) Replay(f LogFilter) []LogEntry {
	start := time.Now()
	defer func() {
		duration := time.Since(start).Milliseconds()
		s.metrics.RecordQuery(duration)
		s.prometheusMetrics.RecordQuery()
	}()

	// For now, query the global ring
	// Later we can optimize by choosing the best ring based on filter
	return s.globalRing.Query(f)
}

// Stream creates a live stream of log entries matching the filter
func (s *Service) Stream(f LogFilter) (<-chan LogEntry, func()) {
	s.metrics.RecordSubscription()
	s.prometheusMetrics.RecordSubscription()

	ch, cancel := s.bus.Subscribe(f)

	// Generate unique stream ID for tracking
	streamID := fmt.Sprintf("stream-%d-%d", time.Now().UnixNano(), s.metrics.SubscriptionsTotal)
	subscriberID := fmt.Sprintf("sub-%d", time.Now().UnixNano())

	// Track the stream
	s.trackStream(streamID, subscriberID, f)

	// Wrap cancel to update metrics and remove tracking
	wrappedCancel := func() {
		s.metrics.RecordUnsubscription()
		s.untrackStream(streamID)
		cancel()
	}

	return ch, wrappedCancel
}

// Stop shuts down the service and cleans up resources
func (s *Service) Stop() {
	s.stopOnce.Do(func() {
		s.mu.Lock()
		s.started = false
		s.mu.Unlock()

		// Stop background collector if enabled
		if s.backgroundCollector != nil {
			s.backgroundCollector.Stop()
			s.opLogger.LogServiceState("background_collection", "stopped", map[string]interface{}{})
		}

		// Log service shutdown
		s.opLogger.LogServiceState("stop", "stopped", map[string]interface{}{
			"uptime_seconds": time.Since(s.startTime).Seconds(),
		})

		// Sync logger before closing
		s.opLogger.Sync()

		close(s.stopCh)
	})
}

// Stats returns service statistics
func (s *Service) Stats() ServiceStats {
	s.mu.RLock()
	scopedCount := len(s.scopedRings)
	s.mu.RUnlock()

	s.metrics.SetScopedRingsCount(scopedCount)
	stats := s.metrics.GetStats()

	// Add index statistics from global ring
	if ring, ok := s.globalRing.(*Ring); ok {
		stats.IndexStats = ring.GetIndexStats()
	}

	return stats
}

// Health returns the health status of the service
func (s *Service) Health() HealthStatus {
	s.mu.RLock()
	started := s.started
	startTime := s.startTime
	s.mu.RUnlock()

	status := "healthy"
	checks := make(map[string]string)

	// Check if service is started
	if !started {
		status = "unhealthy"
		checks["service"] = "not started"
	} else {
		checks["service"] = "running"
	}

	// Check memory usage
	stats := s.Stats()
	memoryUsageMB := float64(stats.GlobalRingSize) * 300 / 1024 / 1024 // rough estimate
	if memoryUsageMB > 100 {                                           // Over 100MB
		if status != "unhealthy" {
			status = "warning"
		}
		checks["memory"] = fmt.Sprintf("high usage: %.1fMB", memoryUsageMB)
	} else {
		checks["memory"] = fmt.Sprintf("normal: %.1fMB", memoryUsageMB)
	}

	// Check for high drop rate
	if stats.DroppedEntriesTotal > 1000 {
		if status != "unhealthy" {
			status = "warning"
		}
		checks["drops"] = fmt.Sprintf("high: %d", stats.DroppedEntriesTotal)
	} else {
		checks["drops"] = "normal"
	}

	// Calculate uptime
	var uptime time.Duration
	if started && !startTime.IsZero() {
		uptime = time.Since(startTime)
	}

	health := HealthStatus{
		Status:  status,
		Started: started,
		Uptime:  uptime,
		Checks:  checks,
		Metrics: &stats,
	}

	return health
}

// addToScopedRings adds entry to relevant scoped rings
func (s *Service) addToScopedRings(e LogEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Add to namespace ring
	if e.Namespace != "" {
		nsKey := "ns:" + e.Namespace
		ring := s.getOrCreateScopedRing(nsKey)
		ring.Append(e)
	}

	// Add to workload ring
	if e.Workload != "" && e.Namespace != "" {
		workloadKey := "workload:" + e.Namespace + ":" + e.Workload
		ring := s.getOrCreateScopedRing(workloadKey)
		ring.Append(e)
	}
}

// getOrCreateScopedRing gets or creates a scoped ring
func (s *Service) getOrCreateScopedRing(key string) LogRing {
	if ring, exists := s.scopedRings[key]; exists {
		return ring
	}

	// Create new scoped ring
	ring := NewRing(s.config.ScopeMaxEntries, s.config.ScopeMaxAge)
	s.scopedRings[key] = ring
	return ring
}

// evictionWorker periodically evicts old entries from rings
func (s *Service) evictionWorker() {
	ticker := time.NewTicker(s.config.EvictionInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.performEviction()
		case <-s.stopCh:
			return
		}
	}
}

// cleanupWorker periodically cleans up stale subscriptions and empty rings
func (s *Service) cleanupWorker() {
	ticker := time.NewTicker(s.config.CleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.performCleanup()
		case <-s.stopCh:
			return
		}
	}
}

// metricsWorker periodically updates Prometheus metrics
func (s *Service) metricsWorker() {
	ticker := time.NewTicker(10 * time.Second) // Update metrics every 10 seconds
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.workerMu.Lock()
			s.lastMetricsRun = time.Now()
			s.workerMu.Unlock()

			s.prometheusMetrics.UpdateFromMetrics(s.metrics)
		case <-s.stopCh:
			return
		}
	}
}

// performEviction evicts old entries from all rings
func (s *Service) performEviction() {
	s.workerMu.Lock()
	s.lastEvictionRun = time.Now()
	s.workerMu.Unlock()

	cutoff := time.Now().Add(-s.config.GlobalMaxAge)

	// Evict from global ring
	s.globalRing.EvictByTime(cutoff)
	s.metrics.SetGlobalRingSize(s.globalRing.Size())

	// Evict from scoped rings
	s.mu.Lock()
	scopeCutoff := time.Now().Add(-s.config.ScopeMaxAge)
	for _, ring := range s.scopedRings {
		ring.EvictByTime(scopeCutoff)
	}
	s.mu.Unlock()
}

// performCleanup cleans up stale subscriptions and empty rings
func (s *Service) performCleanup() {
	s.workerMu.Lock()
	s.lastCleanupRun = time.Now()
	s.workerMu.Unlock()

	// Cleanup stale subscriptions
	if bus, ok := s.bus.(*Bus); ok {
		bus.CleanupStaleSubscriptions(10 * time.Minute)
	}

	// Cleanup empty scoped rings
	s.mu.Lock()
	for key, ring := range s.scopedRings {
		if ring.Size() == 0 {
			delete(s.scopedRings, key)
		}
	}
	s.mu.Unlock()

	// Cleanup stale streams
	s.streamMu.Lock()
	staleThreshold := time.Now().Add(-1 * time.Hour)
	for streamID, stream := range s.activeStreams {
		if stream.LastActivity.Before(staleThreshold) {
			delete(s.activeStreams, streamID)
		}
	}
	s.streamMu.Unlock()
}

// estimateEntrySize estimates the memory footprint of a log entry
func estimateEntrySize(e LogEntry) int {
	size := 64 // base struct size
	size += len(e.Level)
	size += len(e.Cluster)
	size += len(e.Namespace)
	size += len(e.Workload)
	size += len(e.Pod)
	size += len(e.Container)
	size += len(e.Node)
	size += len(e.Msg)
	size += len(e.TraceID)
	size += len(e.SpanID)

	// Estimate labels map overhead
	for k, v := range e.Labels {
		size += len(k) + len(v) + 16 // map entry overhead
	}

	return size
}

// RecordExport records export metrics
func (s *Service) RecordExport(format string, bytesExported int64, durationMs int64) {
	if s.prometheusMetrics != nil {
		s.prometheusMetrics.RecordExport(format, bytesExported, durationMs)
	}
}

// AdminClearRings clears all ring buffers (global and scoped)
func (s *Service) AdminClearRings() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Clear global ring
	s.globalRing.Clear()

	// Clear all scoped rings
	for _, ring := range s.scopedRings {
		ring.Clear()
	}

	// Reset metrics
	s.metrics.Reset()

	// Update Prometheus metrics
	if s.prometheusMetrics != nil {
		s.prometheusMetrics.UpdateFromMetrics(s.metrics)
	}

	return nil
}

// AdminGetDetailedStats returns comprehensive administrative statistics
func (s *Service) AdminGetDetailedStats() AdminStats {
	s.mu.RLock()
	scopedRings := make(map[string]LogRing)
	for k, v := range s.scopedRings {
		scopedRings[k] = v
	}
	s.mu.RUnlock()

	// Build ring details
	ringDetails := make(map[string]RingStats)

	// Global ring stats
	if ring, ok := s.globalRing.(*Ring); ok {
		ringDetails["global"] = RingStats{
			Name:        "global",
			Type:        "global",
			Size:        ring.Size(),
			Capacity:    s.config.GlobalMaxEntries,
			MemoryBytes: int64(ring.Size() * 300), // Rough estimate
		}
	}

	// Scoped ring stats
	totalScopedBytes := int64(0)
	for key, ring := range scopedRings {
		if r, ok := ring.(*Ring); ok {
			ringBytes := int64(r.Size() * 300)
			ringDetails[key] = RingStats{
				Name:        key,
				Type:        "scoped",
				Size:        r.Size(),
				Capacity:    s.config.ScopeMaxEntries,
				MemoryBytes: ringBytes,
			}
			totalScopedBytes += ringBytes
		}
	}

	// Memory usage breakdown
	globalBytes := int64(0)
	if globalStats, exists := ringDetails["global"]; exists {
		globalBytes = globalStats.MemoryBytes
	}

	memoryUsage := MemoryUsage{
		TotalBytes:      globalBytes + totalScopedBytes,
		GlobalRingBytes: globalBytes,
		ScopedRingBytes: totalScopedBytes,
		IndexBytes:      globalBytes / 10,                      // Rough estimate for index overhead
		SubscriberBytes: int64(s.bus.SubscriberCount() * 1024), // Rough estimate
	}

	// Worker stats
	s.workerMu.RLock()
	workerStats := WorkerStats{
		EvictionWorkerLastRun: s.lastEvictionRun,
		CleanupWorkerLastRun:  s.lastCleanupRun,
		MetricsWorkerLastRun:  s.lastMetricsRun,
		WorkersRunning:        3, // eviction, cleanup, metrics
	}
	s.workerMu.RUnlock()

	// Base service stats
	serviceStats := s.Stats()

	return AdminStats{
		ServiceStats:      serviceStats,
		RingDetails:       ringDetails,
		MemoryUsage:       memoryUsage,
		BackgroundWorkers: workerStats,
		Configuration:     s.config,
	}
}

// AdminListActiveStreams returns information about all active streams
func (s *Service) AdminListActiveStreams() []StreamInfo {
	s.streamMu.RLock()
	defer s.streamMu.RUnlock()

	streams := make([]StreamInfo, 0, len(s.activeStreams))
	for _, stream := range s.activeStreams {
		streams = append(streams, *stream)
	}

	return streams
}

// AdminUpdateLimits updates operational limits
func (s *Service) AdminUpdateLimits(limits AdminLimits) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Validate limits
	if limits.MaxSubscribers < 1 || limits.MaxSubscribers > 10000 {
		return fmt.Errorf("max_subscribers must be between 1 and 10000")
	}
	if limits.MaxBufferSize < 10 || limits.MaxBufferSize > 10000 {
		return fmt.Errorf("max_buffer_size must be between 10 and 10000")
	}
	if limits.MaxQueryLimit < 1 || limits.MaxQueryLimit > 100000 {
		return fmt.Errorf("max_query_limit must be between 1 and 100000")
	}
	if limits.BackpressureThreshold < 50 || limits.BackpressureThreshold > 99 {
		return fmt.Errorf("backpressure_threshold must be between 50 and 99")
	}

	s.adminLimits = limits
	return nil
}

// AdminGetCurrentLimits returns current operational limits
func (s *Service) AdminGetCurrentLimits() AdminLimits {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.adminLimits
}

// trackStream adds a stream to the active streams registry
func (s *Service) trackStream(streamID, subscriberID string, filter LogFilter) {
	s.streamMu.Lock()
	defer s.streamMu.Unlock()

	s.activeStreams[streamID] = &StreamInfo{
		StreamID:      streamID,
		Filter:        filter,
		SubscriberID:  subscriberID,
		CreatedAt:     time.Now(),
		LastActivity:  time.Now(),
		MessagesCount: 0,
		BufferSize:    s.config.BufferSize,
		BufferUsage:   0,
		IsDegraded:    false,
	}

	// Log stream creation
	s.opLogger.LogStreamLifecycle("created", streamID, subscriberID, filter)
}

// untrackStream removes a stream from the active streams registry
func (s *Service) untrackStream(streamID string) {
	s.streamMu.Lock()
	defer s.streamMu.Unlock()

	if stream, exists := s.activeStreams[streamID]; exists {
		// Log stream deletion
		s.opLogger.LogStreamLifecycle("deleted", streamID, stream.SubscriberID, stream.Filter)
		delete(s.activeStreams, streamID)
	}
}

// updateStreamActivity updates stream activity metrics
func (s *Service) updateStreamActivity(streamID string, messageCount int64, degraded bool) {
	s.streamMu.Lock()
	defer s.streamMu.Unlock()

	if stream, exists := s.activeStreams[streamID]; exists {
		stream.LastActivity = time.Now()
		stream.MessagesCount += messageCount
		stream.IsDegraded = degraded
	}
}
