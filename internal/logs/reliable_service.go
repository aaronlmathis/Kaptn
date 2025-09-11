package logs

import (
	"context"

	"github.com/aaronlmathis/kaptn/internal/config"
	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
)

// ReliableLogService wraps the V3 service for production use
type ReliableLogService struct {
	serviceV3 *ServiceV3
	logger    *zap.Logger
}

// NewReliableLogService creates a new production-ready log service
func NewReliableLogService(cfg config.LogsServiceConfig, logger *zap.Logger) *ReliableLogService {
	if logger == nil {
		logger = zap.NewNop()
	}

	return &ReliableLogService{
		serviceV3: NewServiceV3(cfg, logger),
		logger:    logger.Named("reliable-log-service"),
	}
}

// SetupLogCollector initializes the log collector
func (s *ReliableLogService) SetupLogCollector(kubeClient kubernetes.Interface, clusterName string) error {
	s.logger.Info("Setting up log collector",
		zap.String("cluster", clusterName))

	return s.serviceV3.SetupLogCollector(kubeClient, clusterName)
}

// Start starts the service and background workers
func (s *ReliableLogService) Start(ctx context.Context) error {
	s.logger.Info("Starting reliable log service")
	return s.serviceV3.Start(ctx)
}

// Ingest accepts a log entry from collectors
func (s *ReliableLogService) Ingest(entry LogEntry) {
	s.serviceV3.Ingest(entry)
}

// Replay returns historical log entries matching the filter
func (s *ReliableLogService) Replay(filter LogFilter) []LogEntry {
	return s.serviceV3.Replay(filter)
}

// Stream creates a live stream of log entries matching the filter
func (s *ReliableLogService) Stream(filter LogFilter) (<-chan LogEntry, func()) {
	return s.serviceV3.Stream(filter)
}

// RecordExport records export metrics
func (s *ReliableLogService) RecordExport(format string, bytesExported int64, durationMs int64) {
	s.serviceV3.RecordExport(format, bytesExported, durationMs)
}

// Stop shuts down the service and cleans up resources
func (s *ReliableLogService) Stop() {
	s.logger.Info("Stopping reliable log service")
	s.serviceV3.Stop()
}

// Stats returns service statistics
func (s *ReliableLogService) Stats() ServiceStats {
	return s.serviceV3.Stats()
}

// Health returns health status of the service
func (s *ReliableLogService) Health() HealthStatus {
	return s.serviceV3.Health()
}

// Admin methods
func (s *ReliableLogService) AdminClearRings() error {
	return s.serviceV3.AdminClearRings()
}

func (s *ReliableLogService) AdminGetDetailedStats() AdminStats {
	return s.serviceV3.AdminGetDetailedStats()
}

func (s *ReliableLogService) AdminListActiveStreams() []StreamInfo {
	return s.serviceV3.AdminListActiveStreams()
}

func (s *ReliableLogService) AdminUpdateLimits(limits AdminLimits) error {
	return s.serviceV3.AdminUpdateLimits(limits)
}

func (s *ReliableLogService) AdminGetCurrentLimits() AdminLimits {
	return s.serviceV3.AdminGetCurrentLimits()
}
