package logs

import (
	"time"

	"github.com/aaronlmathis/kaptn/internal/config"
)

// ServiceConfigFromConfig creates a ServiceConfig from the application config
func ServiceConfigFromConfig(cfg *config.Config) (ServiceConfig, error) {
	serviceConfig := DefaultServiceConfig()

	logsCache := cfg.Caching.LogsCache

	// Parse TTL
	if logsCache.TTL != "" {
		if ttl, err := time.ParseDuration(logsCache.TTL); err == nil {
			serviceConfig.GlobalMaxAge = ttl
			serviceConfig.ScopeMaxAge = ttl
		}
	}

	// Parse intervals
	if logsCache.EvictionInterval != "" {
		if interval, err := time.ParseDuration(logsCache.EvictionInterval); err == nil {
			serviceConfig.EvictionInterval = interval
		}
	}

	if logsCache.CleanupInterval != "" {
		if interval, err := time.ParseDuration(logsCache.CleanupInterval); err == nil {
			serviceConfig.CleanupInterval = interval
		}
	}

	if logsCache.DegradedModeTimeout != "" {
		if timeout, err := time.ParseDuration(logsCache.DegradedModeTimeout); err == nil {
			serviceConfig.DegradedModeTimeout = timeout
		}
	}

	// Override basic limits if configured
	if logsCache.MaxGlobal > 0 {
		serviceConfig.GlobalMaxEntries = logsCache.MaxGlobal
	}

	if logsCache.MaxPerScope > 0 {
		serviceConfig.ScopeMaxEntries = logsCache.MaxPerScope
	}

	if logsCache.MaxSubscribers > 0 {
		serviceConfig.MaxSubscribers = logsCache.MaxSubscribers
	}

	if logsCache.BufferSize > 0 {
		serviceConfig.BufferSize = logsCache.BufferSize
	}

	if logsCache.MaxStreamsPerUser > 0 {
		serviceConfig.MaxStreamsPerUser = logsCache.MaxStreamsPerUser
	}

	if logsCache.MaxQueryLimit > 0 {
		serviceConfig.MaxQueryLimit = logsCache.MaxQueryLimit
	}

	if logsCache.MaxExportSize > 0 {
		serviceConfig.MaxExportSize = logsCache.MaxExportSize
	}

	if logsCache.MaxConcurrentQueries > 0 {
		serviceConfig.MaxConcurrentQueries = logsCache.MaxConcurrentQueries
	}

	if logsCache.RateLimitPerSecond > 0 {
		serviceConfig.RateLimitPerSecond = logsCache.RateLimitPerSecond
	}

	if logsCache.BackpressureThreshold > 0 {
		serviceConfig.BackpressureThreshold = logsCache.BackpressureThreshold
	}

	return serviceConfig, nil
}

// DefaultServiceConfigFromConfig creates a default service config using the config package approach
// This is primarily for testing purposes
func DefaultServiceConfigFromConfig() ServiceConfig {
	// Create a minimal config with default values
	cfg := &config.Config{
		Caching: config.CachingConfig{
			LogsCache: config.LogsCacheConfig{
				TTL:                   "10m",
				MaxGlobal:             250000,
				MaxPerScope:           20000,
				MaxSubscribers:        200,
				BufferSize:            100,
				EvictionInterval:      "30s",
				CleanupInterval:       "5m",
				MaxStreamsPerUser:     50,
				MaxQueryLimit:         10000,
				MaxExportSize:         100 * 1024 * 1024, // 100MB
				MaxConcurrentQueries:  20,
				RateLimitPerSecond:    1000,
				BackpressureThreshold: 80,
				DegradedModeTimeout:   "5m",
			},
		},
	}

	serviceConfig, _ := ServiceConfigFromConfig(cfg)
	return serviceConfig
}
