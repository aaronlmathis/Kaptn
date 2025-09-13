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

// ServiceV3 implements LogService with improved reliability and stability
// This is the third iteration, designed to be rock solid and handle 50+ pods
type ServiceV3 struct {
	config            config.LogsServiceConfig
	logger            *zap.Logger
	metrics           *Metrics
	prometheusMetrics *PrometheusMetrics
	opLogger          *OperationalLogger

	// Storage
	globalRing  LogRing
	scopedRings map[string]LogRing // keyed by scope (e.g., "ns:default", "workload:nginx")
	ringsMu     sync.RWMutex

	// Pub/sub
	bus LogBus

	// New informer-based collector
	collector *LogCollector

	// Lifecycle
	stopCh    chan struct{}
	stopOnce  sync.Once
	started   bool
	startTime time.Time
	mu        sync.RWMutex

	// Admin functionality
	adminLimits   AdminLimits
	activeStreams map[string]*StreamInfo // keyed by stream ID
	streamMu      sync.RWMutex

	// Worker tracking
	lastEvictionRun time.Time
	lastCleanupRun  time.Time
	lastMetricsRun  time.Time
	workerMu        sync.RWMutex
}

// NewServiceV3 creates a new reliable log service
func NewServiceV3(cfg config.LogsServiceConfig, logger *zap.Logger) *ServiceV3 {
	if logger == nil {
		logger = zap.NewNop()
	}

	s := &ServiceV3{
		config:            cfg,
		logger:            logger.Named("logs-service-v3"),
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
			MaxStreamsPerUser:     cfg.MaxStreamsPerUser,
			MaxBufferSize:         cfg.BufferSize,
			MaxQueryLimit:         cfg.MaxQueryLimit,
			MaxExportSize:         cfg.MaxExportSize,
			MaxConcurrentQueries:  cfg.MaxConcurrentQueries,
			RateLimitPerSecond:    cfg.RateLimitPerSecond,
			BackpressureThreshold: cfg.BackpressureThreshold,
			DegradedModeTimeout:   cfg.DegradedModeTimeout,
		},
		activeStreams: make(map[string]*StreamInfo),
	}

	s.logger.Info("ServiceV3 created",
		zap.Int("global_max_entries", cfg.GlobalMaxEntries),
		zap.Duration("global_max_age", cfg.GlobalMaxAge),
		zap.Bool("background_collection_enabled", cfg.BackgroundCollectionEnabled))

	return s
}

// SetupLogCollector initializes the log collector
func (s *ServiceV3) SetupLogCollector(kubeClient kubernetes.Interface, clusterName string) error {
	if !s.config.BackgroundCollectionEnabled {
		s.logger.Info("Background collection disabled, skipping collector setup")
		return nil
	}

	// Parse retention duration
	retention, err := time.ParseDuration(s.config.BackgroundCollectionRetention)
	if err != nil {
		s.logger.Error("Failed to parse background collection retention",
			zap.String("retention", s.config.BackgroundCollectionRetention),
			zap.Error(err))
		return fmt.Errorf("invalid background collection retention: %w", err)
	}

    // Create collector config
    collectorConfig := CollectorConfig{
        Enabled:                  s.config.BackgroundCollectionEnabled,
        TailLines:                int64(s.config.BackgroundCollectionTailLines),
        MaxConcurrentStreams:     50,
        LogRetention:             retention,
        StreamBufferSize:         1000,
        RestartBackoffInterval:   5 * time.Second,
        RestartMaxInterval:       2 * time.Minute,
        ExcludeSystemPods:        true, // Skip system pods by default
        Mode:                     s.config.BackgroundCollectionMode,
        PollInterval:             s.config.BackgroundCollectionPollInterval,
        MaxLogLineBytes:          s.config.MaxLogLineBytes,
        InformerResync:           s.config.InformerResync,
    }

	// Create the collector
    s.collector = NewLogCollector(s.logger, kubeClient, s, clusterName, collectorConfig)

	s.logger.Info("Log collector configured",
		zap.String("cluster", clusterName),
		zap.Duration("retention", retention),
		zap.Int("max_concurrent_streams", collectorConfig.MaxConcurrentStreams))

	return nil
}

// Start starts the service and background workers
func (s *ServiceV3) Start(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.started {
		s.logger.Info("Service already started")
		return nil
	}

	s.logger.Info("Starting logs service v3")

	// Start background workers with error handling
	s.startBackgroundWorkers()

	// Start log collector if configured
	if s.collector != nil {
		if err := s.collector.Start(ctx); err != nil {
			s.logger.Error("Failed to start log collector", zap.Error(err))
			return fmt.Errorf("failed to start log collector: %w", err)
		}
		s.logger.Info("Log collector started successfully")
	} else {
		s.logger.Info("No log collector configured (background collection disabled)")
	}

	s.started = true
	s.startTime = time.Now()

	s.logger.Info("Logs service v3 started successfully")
	return nil
}

// startBackgroundWorkers starts the background maintenance workers
func (s *ServiceV3) startBackgroundWorkers() {
	// Start eviction worker
	go func() {
		defer func() {
			if r := recover(); r != nil {
				s.logger.Error("Eviction worker panic recovered", zap.Any("panic", r))
			}
		}()
		s.evictionWorker()
	}()

	// Start cleanup worker
	go func() {
		defer func() {
			if r := recover(); r != nil {
				s.logger.Error("Cleanup worker panic recovered", zap.Any("panic", r))
			}
		}()
		s.cleanupWorker()
	}()

	// Start metrics worker
	go func() {
		defer func() {
			if r := recover(); r != nil {
				s.logger.Error("Metrics worker panic recovered", zap.Any("panic", r))
			}
		}()
		s.metricsWorker()
	}()

	s.logger.Info("Background workers started")
}

// Ingest accepts a log entry and processes it
func (s *ServiceV3) Ingest(entry LogEntry) {
	// Validate entry
	if entry.Msg == "" {
		return // Skip empty messages
	}

	// Add to global ring (thread-safe)
	s.globalRing.Append(entry)

	// Add to appropriate scoped rings
	s.addToScopedRings(entry)

	// Publish to subscribers
	s.bus.Publish(entry)

	// Update metrics
	s.metrics.RecordIngest(len(entry.Msg))
}

// addToScopedRings adds entry to relevant scoped rings
func (s *ServiceV3) addToScopedRings(entry LogEntry) {
	s.ringsMu.Lock()
	defer s.ringsMu.Unlock()

	// Namespace scope
	if entry.Namespace != "" {
		nsScope := fmt.Sprintf("ns:%s", entry.Namespace)
		ring, exists := s.scopedRings[nsScope]
		if !exists {
			ring = NewRing(s.config.ScopeMaxEntries, s.config.ScopeMaxAge)
			s.scopedRings[nsScope] = ring
		}
		ring.Append(entry)
	}

	// Workload scope
	if entry.Workload != "" {
		workloadScope := fmt.Sprintf("workload:%s", entry.Workload)
		ring, exists := s.scopedRings[workloadScope]
		if !exists {
			ring = NewRing(s.config.ScopeMaxEntries, s.config.ScopeMaxAge)
			s.scopedRings[workloadScope] = ring
		}
		ring.Append(entry)
	}

	// Pod scope
	if entry.Pod != "" {
		podScope := fmt.Sprintf("pod:%s", entry.Pod)
		ring, exists := s.scopedRings[podScope]
		if !exists {
			ring = NewRing(s.config.ScopeMaxEntries, s.config.ScopeMaxAge)
			s.scopedRings[podScope] = ring
		}
		ring.Append(entry)
	}
}

// Replay returns historical log entries matching the filter
func (s *ServiceV3) Replay(filter LogFilter) []LogEntry {
	// Use global ring for general queries
	results := s.globalRing.Query(filter)

	// Check if we can use scoped rings for better performance
	if filter.Namespace != "" {
		nsScope := fmt.Sprintf("ns:%s", filter.Namespace)
		s.ringsMu.RLock()
		if ring, exists := s.scopedRings[nsScope]; exists {
			scopedResults := ring.Query(filter)
			s.ringsMu.RUnlock()
			// Use scoped results if they're more specific
			if len(scopedResults) < len(results) && len(scopedResults) > 0 {
				results = scopedResults
			}
		} else {
			s.ringsMu.RUnlock()
		}
	}

	s.metrics.RecordQuery(0) // TODO: measure actual query time
	return results
}

// Stream creates a live stream of log entries matching the filter
func (s *ServiceV3) Stream(filter LogFilter) (<-chan LogEntry, func()) {
	ch, cancel := s.bus.Subscribe(filter)

	// Track the stream
	streamID := fmt.Sprintf("stream-%d", time.Now().UnixNano())
	streamInfo := &StreamInfo{
		StreamID:      streamID,
		Filter:        filter,
		CreatedAt:     time.Now(),
		LastActivity:  time.Now(),
		MessagesCount: 0,
		BufferSize:    s.config.BufferSize,
		BufferUsage:   0,
		IsDegraded:    false,
	}

	s.streamMu.Lock()
	s.activeStreams[streamID] = streamInfo
	s.streamMu.Unlock()

	// Wrap cancel function to clean up tracking
	wrappedCancel := func() {
		cancel()
		s.streamMu.Lock()
		delete(s.activeStreams, streamID)
		s.streamMu.Unlock()
	}

	return ch, wrappedCancel
}

// RecordExport records export metrics
func (s *ServiceV3) RecordExport(format string, bytesExported int64, durationMs int64) {
	// Basic metrics recording - extend as needed
	s.logger.Debug("Export recorded",
		zap.String("format", format),
		zap.Int64("bytes", bytesExported),
		zap.Int64("duration_ms", durationMs))
}

// Stop shuts down the service and cleans up resources
func (s *ServiceV3) Stop() {
	s.stopOnce.Do(func() {
		s.logger.Info("Stopping logs service v3")

		s.mu.Lock()
		s.started = false
		s.mu.Unlock()

		// Stop collector first
		if s.collector != nil {
			s.collector.Stop()
		}

		// Signal stop to workers
		close(s.stopCh)

		// Clean up active streams
		s.streamMu.Lock()
		for streamID := range s.activeStreams {
			// Streams will be cleaned up by their cancel functions
			delete(s.activeStreams, streamID)
		}
		s.streamMu.Unlock()

		// Clear rings
		s.globalRing.Clear()
		s.ringsMu.Lock()
		for _, ring := range s.scopedRings {
			ring.Clear()
		}
		s.scopedRings = make(map[string]LogRing)
		s.ringsMu.Unlock()

		s.logger.Info("Logs service v3 stopped")
	})
}

// Stats returns service statistics
func (s *ServiceV3) Stats() ServiceStats {
	s.mu.RLock()
	started := s.started
	s.mu.RUnlock()

	s.ringsMu.RLock()
	scopedRingsCount := len(s.scopedRings)
	s.ringsMu.RUnlock()

	s.streamMu.RLock()
	totalSubscribers := len(s.activeStreams)
	s.streamMu.RUnlock()

	// Use the metrics GetStats method
	metricsStats := s.metrics.GetStats()

	// Override with our current values
	metricsStats.GlobalRingSize = s.globalRing.Size()
	metricsStats.ScopedRingsCount = scopedRingsCount
	metricsStats.TotalSubscribers = totalSubscribers

	// Add collector stats if available
	if s.collector != nil && started {
		collectorStats := s.collector.GetStats()
		// Add collector-specific metrics to stats if needed
		s.logger.Debug("Collector stats",
			zap.Int("active_streams", collectorStats.ActiveStreams),
			zap.Int64("total_lines_read", collectorStats.TotalLinesRead))
	}

	return metricsStats
}

// Health returns health status of the service
func (s *ServiceV3) Health() HealthStatus {
	s.mu.RLock()
	started := s.started
	startTime := s.startTime
	s.mu.RUnlock()

	var uptime time.Duration
	if started {
		uptime = time.Since(startTime)
	}

	checks := make(map[string]string)
	status := "healthy"

	if !started {
		status = "unhealthy"
		checks["service"] = "not started"
	} else {
		checks["service"] = "running"
	}

	// Check collector health
	if s.collector != nil {
		collectorStats := s.collector.GetStats()
		if collectorStats.FailedConnections > collectorStats.TotalLinesRead/10 {
			status = "warning"
			checks["collector"] = "high failure rate"
		} else {
			checks["collector"] = "healthy"
		}
	} else {
		checks["collector"] = "disabled"
	}

	// Check ring health
	globalSize := s.globalRing.Size()
	if globalSize > s.config.GlobalMaxEntries*9/10 {
		status = "warning"
		checks["global_ring"] = "near capacity"
	} else {
		checks["global_ring"] = "healthy"
	}

	return HealthStatus{
		Status:  status,
		Started: started,
		Uptime:  uptime,
		Checks:  checks,
		Metrics: nil, // Remove invalid reference
	}
}

// Admin methods
func (s *ServiceV3) AdminClearRings() error {
	s.logger.Info("Admin: Clearing all rings")

	s.globalRing.Clear()

	s.ringsMu.Lock()
	for _, ring := range s.scopedRings {
		ring.Clear()
	}
	s.scopedRings = make(map[string]LogRing)
	s.ringsMu.Unlock()

	return nil
}

func (s *ServiceV3) AdminGetDetailedStats() AdminStats {
    baseStats := s.Stats()

    s.ringsMu.RLock()
    ringDetails := make(map[string]RingStats)
    // Compute bounds for global ring
    oldest, newest := s.globalRing.Bounds()
    ringDetails["global"] = RingStats{
        Name:        "global",
        Type:        "global",
        Size:        s.globalRing.Size(),
        Capacity:    s.config.GlobalMaxEntries,
        OldestEntry: oldest,
        NewestEntry: newest,
        MemoryBytes: int64(s.globalRing.Size() * 1024), // Rough estimate
    }

    for scope, ring := range s.scopedRings {
        o, n := ring.Bounds()
        ringDetails[scope] = RingStats{
            Name:        scope,
            Type:        "scoped",
            Size:        ring.Size(),
            Capacity:    s.config.ScopeMaxEntries,
            OldestEntry: o,
            NewestEntry: n,
            MemoryBytes: int64(ring.Size() * 1024), // Rough estimate
        }
    }
    s.ringsMu.RUnlock()

	s.workerMu.RLock()
	workerStats := WorkerStats{
		EvictionWorkerLastRun: s.lastEvictionRun,
		CleanupWorkerLastRun:  s.lastCleanupRun,
		MetricsWorkerLastRun:  s.lastMetricsRun,
		WorkersRunning:        3, // eviction, cleanup, metrics
	}
	s.workerMu.RUnlock()

	return AdminStats{
		ServiceStats:      baseStats,
		RingDetails:       ringDetails,
		MemoryUsage:       MemoryUsage{}, // TODO: Implement detailed memory tracking
		BackgroundWorkers: workerStats,
		Configuration:     s.config,
	}
}

func (s *ServiceV3) AdminListActiveStreams() []StreamInfo {
	s.streamMu.RLock()
	defer s.streamMu.RUnlock()

	streams := make([]StreamInfo, 0, len(s.activeStreams))
	for _, stream := range s.activeStreams {
		streams = append(streams, *stream)
	}

	return streams
}

func (s *ServiceV3) AdminUpdateLimits(limits AdminLimits) error {
	s.logger.Info("Admin: Updating limits", zap.Any("limits", limits))
	s.adminLimits = limits
	return nil
}

func (s *ServiceV3) AdminGetCurrentLimits() AdminLimits {
	return s.adminLimits
}

// Background workers
func (s *ServiceV3) evictionWorker() {
	ticker := time.NewTicker(s.config.EvictionInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.runEviction()
		}
	}
}

func (s *ServiceV3) cleanupWorker() {
	ticker := time.NewTicker(s.config.CleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.runCleanup()
		}
	}
}

func (s *ServiceV3) metricsWorker() {
	ticker := time.NewTicker(30 * time.Second) // Update metrics every 30 seconds
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.updateMetrics()
		}
	}
}

func (s *ServiceV3) runEviction() {
	defer func() {
		if r := recover(); r != nil {
			s.logger.Error("Eviction worker panic recovered", zap.Any("panic", r))
		}
	}()

	now := time.Now()

	// Evict from global ring
	s.globalRing.EvictByTime(now)

	// Evict from scoped rings
	s.ringsMu.Lock()
	for _, ring := range s.scopedRings {
		ring.EvictByTime(now)
	}
	s.ringsMu.Unlock()

	s.workerMu.Lock()
	s.lastEvictionRun = now
	s.workerMu.Unlock()
}

func (s *ServiceV3) runCleanup() {
	defer func() {
		if r := recover(); r != nil {
			s.logger.Error("Cleanup worker panic recovered", zap.Any("panic", r))
		}
	}()

	now := time.Now()

	// Clean up empty scoped rings
	s.ringsMu.Lock()
	for scope, ring := range s.scopedRings {
		if ring.Size() == 0 {
			delete(s.scopedRings, scope)
		}
	}
	s.ringsMu.Unlock()

	s.workerMu.Lock()
	s.lastCleanupRun = now
	s.workerMu.Unlock()
}

func (s *ServiceV3) updateMetrics() {
	defer func() {
		if r := recover(); r != nil {
			s.logger.Error("Metrics worker panic recovered", zap.Any("panic", r))
		}
	}()

	now := time.Now()

    // Update prometheus metrics if available
    if s.prometheusMetrics != nil {
        stats := s.Stats()
        // Report current subscribers
        s.prometheusMetrics.UpdateSubscribers("logs", stats.TotalSubscribers)
        s.logger.Debug("Updated metrics", zap.Any("stats", stats))
    }

	s.workerMu.Lock()
	s.lastMetricsRun = now
	s.workerMu.Unlock()
}
