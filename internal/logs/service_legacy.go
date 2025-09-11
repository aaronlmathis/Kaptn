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
// DEPRECATED: Use ReliableLogService instead
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
	backgroundCollector *BackgroundCollector // Legacy collector (deprecated)

	// V3 service for reliable operation
	serviceV3 *ServiceV3

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

// NewService creates a new log service using the reliable V3 implementation
// DEPRECATED: Use NewReliableLogService instead
func NewService(cfg config.LogsServiceConfig) *Service {
	// For backward compatibility, create the V3 service and wrap it
	logger := zap.NewNop() // Will be replaced when SetBackgroundCollector is called

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

	// Initialize with a stable V3 implementation internally
	s.serviceV3 = NewServiceV3(cfg, logger.Named("service-v3"))

	return s
}

// SetBackgroundCollector sets up the background log collector
func (s *Service) SetBackgroundCollector(kubeClient kubernetes.Interface, clusterName string) error {
	// Set up logger properly now that we have one
	logger := s.opLogger.logger
	if logger == nil {
		logger = zap.NewNop()
	}

	// Replace serviceV3 with proper logger
	s.serviceV3 = NewServiceV3(s.config, logger)

	// Delegate to V3 service
	return s.serviceV3.SetupLogCollector(kubeClient, clusterName)
}

// Start starts the service and background workers
func (s *Service) Start(ctx context.Context) error {
	// Delegate to the reliable V3 service
	if s.serviceV3 != nil {
		return s.serviceV3.Start(ctx)
	}

	// Fallback to original implementation if V3 not available
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.started {
		return nil // Already started
	}

	s.started = true
	s.startTime = time.Now()
	return nil
}

// Ingest accepts a log entry from collectors or mini-stern
func (s *Service) Ingest(entry LogEntry) {
	// Delegate to V3 service if available
	if s.serviceV3 != nil {
		s.serviceV3.Ingest(entry)
		return
	}

	// Fallback implementation
	s.globalRing.Append(entry)
	s.bus.Publish(entry)
}

// Replay returns historical log entries matching the filter
func (s *Service) Replay(filter LogFilter) []LogEntry {
	// Delegate to V3 service if available
	if s.serviceV3 != nil {
		return s.serviceV3.Replay(filter)
	}

	// Fallback implementation
	return s.globalRing.Query(filter)
}

// Stream creates a live stream of log entries matching the filter
func (s *Service) Stream(filter LogFilter) (<-chan LogEntry, func()) {
	// Delegate to V3 service if available
	if s.serviceV3 != nil {
		return s.serviceV3.Stream(filter)
	}

	// Fallback implementation
	return s.bus.Subscribe(filter)
}

// RecordExport records export metrics
func (s *Service) RecordExport(format string, bytesExported int64, durationMs int64) {
	// Delegate to V3 service if available
	if s.serviceV3 != nil {
		s.serviceV3.RecordExport(format, bytesExported, durationMs)
		return
	}

	// Fallback - just log
	if s.opLogger != nil && s.opLogger.logger != nil {
		s.opLogger.logger.Debug("Export recorded",
			zap.String("format", format),
			zap.Int64("bytes", bytesExported),
			zap.Int64("duration_ms", durationMs))
	}
}

// Stop shuts down the service and cleans up resources
func (s *Service) Stop() {
	if s.serviceV3 != nil {
		s.serviceV3.Stop()
		return
	}

	s.stopOnce.Do(func() {
		s.mu.Lock()
		s.started = false
		s.mu.Unlock()

		// Signal stop to workers
		close(s.stopCh)

		// Clear rings
		s.globalRing.Clear()
		s.mu.Lock()
		for _, ring := range s.scopedRings {
			ring.Clear()
		}
		s.scopedRings = make(map[string]LogRing)
		s.mu.Unlock()
	})
}

// Stats returns service statistics
func (s *Service) Stats() ServiceStats {
	if s.serviceV3 != nil {
		return s.serviceV3.Stats()
	}

	// Fallback implementation
	return s.metrics.GetStats()
}

// Health returns health status of the service
func (s *Service) Health() HealthStatus {
	if s.serviceV3 != nil {
		return s.serviceV3.Health()
	}

	// Fallback implementation
	return HealthStatus{
		Status:  "unknown",
		Started: s.started,
		Uptime:  time.Since(s.startTime),
		Checks:  map[string]string{"service": "legacy_mode"},
	}
}

// Admin methods
func (s *Service) AdminClearRings() error {
	if s.serviceV3 != nil {
		return s.serviceV3.AdminClearRings()
	}

	s.globalRing.Clear()
	s.mu.Lock()
	for _, ring := range s.scopedRings {
		ring.Clear()
	}
	s.scopedRings = make(map[string]LogRing)
	s.mu.Unlock()
	return nil
}

func (s *Service) AdminGetDetailedStats() AdminStats {
	if s.serviceV3 != nil {
		return s.serviceV3.AdminGetDetailedStats()
	}

	// Fallback implementation
	return AdminStats{
		ServiceStats: s.Stats(),
		RingDetails:  make(map[string]RingStats),
		MemoryUsage:  MemoryUsage{},
		BackgroundWorkers: WorkerStats{
			WorkersRunning: 0,
		},
		Configuration: s.config,
	}
}

func (s *Service) AdminListActiveStreams() []StreamInfo {
	if s.serviceV3 != nil {
		return s.serviceV3.AdminListActiveStreams()
	}

	s.streamMu.RLock()
	defer s.streamMu.RUnlock()

	streams := make([]StreamInfo, 0, len(s.activeStreams))
	for _, stream := range s.activeStreams {
		streams = append(streams, *stream)
	}
	return streams
}

func (s *Service) AdminUpdateLimits(limits AdminLimits) error {
	if s.serviceV3 != nil {
		return s.serviceV3.AdminUpdateLimits(limits)
	}

	s.adminLimits = limits
	return nil
}

func (s *Service) AdminGetCurrentLimits() AdminLimits {
	if s.serviceV3 != nil {
		return s.serviceV3.AdminGetCurrentLimits()
	}

	return s.adminLimits
}

// Additional compatibility methods that may be called by legacy code
func (s *Service) addToScopedRings(entry LogEntry) {
	// Delegate to V3 if available
	if s.serviceV3 != nil {
		return // V3 handles this internally
	}

	// Fallback implementation - minimal
	s.mu.Lock()
	defer s.mu.Unlock()

	// Just add to namespace scope for compatibility
	if entry.Namespace != "" {
		nsScope := fmt.Sprintf("ns:%s", entry.Namespace)
		ring, exists := s.scopedRings[nsScope]
		if !exists {
			ring = NewRing(s.config.ScopeMaxEntries, s.config.ScopeMaxAge)
			s.scopedRings[nsScope] = ring
		}
		ring.Append(entry)
	}
}

// Worker stubs for compatibility
func (s *Service) evictionWorker() {
	// No-op in new implementation
}

func (s *Service) cleanupWorker() {
	// No-op in new implementation
}

func (s *Service) metricsWorker() {
	// No-op in new implementation
}
