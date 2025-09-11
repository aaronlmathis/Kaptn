package logs

import (
	"github.com/aaronlmathis/kaptn/internal/config"
	"go.uber.org/zap"
)

// NewService creates a new log service for backward compatibility with tests
// This delegates to the new ReliableLogService implementation
func NewService(cfg config.LogsServiceConfig) LogService {
	// Use no-op logger for tests unless specified
	logger := zap.NewNop()
	return NewReliableLogService(cfg, logger)
}
