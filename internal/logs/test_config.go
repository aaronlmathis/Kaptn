package logs

import (
	"time"

	"github.com/aaronlmathis/kaptn/internal/config"
)

// DefaultTestConfig creates a default config for testing
func DefaultTestConfig() config.LogsServiceConfig {
	return config.LogsServiceConfig{
		GlobalMaxEntries: 250000,
		GlobalMaxAge:     10 * time.Minute,
		ScopeMaxEntries:  20000,
		ScopeMaxAge:      10 * time.Minute,
		MaxSubscribers:   200,
		BufferSize:       100,
		EvictionInterval: 30 * time.Second,
		CleanupInterval:  5 * time.Minute,

		// Background collection (enabled for testing)
		BackgroundCollectionEnabled:   true,
		BackgroundCollectionRetention: "1h",
		BackgroundCollectionInterval:  "30s",

		// Operational guardrails defaults
		MaxStreamsPerUser:     50,
		MaxQueryLimit:         10000,
		MaxExportSize:         100 * 1024 * 1024, // 100MB
		MaxConcurrentQueries:  20,
		RateLimitPerSecond:    1000,
		BackpressureThreshold: 80, // Percentage
		DegradedModeTimeout:   5 * time.Minute,
	}
}
