package logs

import (
	"github.com/aaronlmathis/kaptn/internal/config"
	"go.uber.org/zap"
)

// NewService creates a new log service for backward compatibility with tests
// This is a compatibility wrapper around the new ReliableLogService
func NewService(cfg config.LogsServiceConfig) LogService {
	// Create a no-op logger for tests
	logger := zap.NewNop()

	// Use the new reliable service implementation
	return NewReliableLogService(cfg, logger)
}
