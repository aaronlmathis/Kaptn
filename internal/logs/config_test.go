package logs

import (
	"testing"
	"time"

	"github.com/aaronlmathis/kaptn/internal/config"
)

func TestServiceConfigFromConfig(t *testing.T) {
	// Test with default config
	cfg := &config.Config{
		Caching: config.CachingConfig{
			LogsCache: config.LogsCacheConfig{
				TTL:                   "5m",
				MaxGlobal:             100000,
				MaxPerScope:           10000,
				MaxSubscribers:        100,
				BufferSize:            50,
				EvictionInterval:      "20s",
				CleanupInterval:       "3m",
				MaxStreamsPerUser:     25,
				MaxQueryLimit:         5000,
				MaxExportSize:         50 * 1024 * 1024, // 50MB
				MaxConcurrentQueries:  10,
				RateLimitPerSecond:    500,
				BackpressureThreshold: 75,
				DegradedModeTimeout:   "3m",
			},
		},
	}

	serviceConfig, err := cfg.GetLogsServiceConfig()
	if err != nil {
		t.Fatalf("Failed to create service config: %v", err)
	}

	if serviceConfig.GlobalMaxEntries != 100000 {
		t.Errorf("Expected GlobalMaxEntries 100000, got %d", serviceConfig.GlobalMaxEntries)
	}

	if serviceConfig.ScopeMaxEntries != 10000 {
		t.Errorf("Expected ScopeMaxEntries 10000, got %d", serviceConfig.ScopeMaxEntries)
	}

	if serviceConfig.MaxSubscribers != 100 {
		t.Errorf("Expected MaxSubscribers 100, got %d", serviceConfig.MaxSubscribers)
	}

	if serviceConfig.BufferSize != 50 {
		t.Errorf("Expected BufferSize 50, got %d", serviceConfig.BufferSize)
	}

	expectedTTL := 5 * time.Minute
	if serviceConfig.GlobalMaxAge != expectedTTL {
		t.Errorf("Expected GlobalMaxAge %v, got %v", expectedTTL, serviceConfig.GlobalMaxAge)
	}

	if serviceConfig.ScopeMaxAge != expectedTTL {
		t.Errorf("Expected ScopeMaxAge %v, got %v", expectedTTL, serviceConfig.ScopeMaxAge)
	}

	if serviceConfig.MaxStreamsPerUser != 25 {
		t.Errorf("Expected MaxStreamsPerUser 25, got %d", serviceConfig.MaxStreamsPerUser)
	}

	if serviceConfig.MaxQueryLimit != 5000 {
		t.Errorf("Expected MaxQueryLimit 5000, got %d", serviceConfig.MaxQueryLimit)
	}

	if serviceConfig.MaxExportSize != 50*1024*1024 {
		t.Errorf("Expected MaxExportSize 50MB, got %d", serviceConfig.MaxExportSize)
	}

	if serviceConfig.BackpressureThreshold != 75 {
		t.Errorf("Expected BackpressureThreshold 75, got %d", serviceConfig.BackpressureThreshold)
	}
}

func TestServiceConfigFromConfig_InvalidTTL(t *testing.T) {
	cfg := &config.Config{
		Caching: config.CachingConfig{
			LogsCache: config.LogsCacheConfig{
				TTL: "invalid",
			},
		},
	}

	// Should not fail, just ignore invalid TTL and use defaults
	_, err := cfg.GetLogsServiceConfig()
	if err == nil {
		t.Fatalf("Should fail with invalid TTL")
	}
}

func TestServiceConfigFromConfig_EmptyConfig(t *testing.T) {
	cfg := &config.Config{}

	serviceConfig, err := cfg.GetLogsServiceConfig()
	if err != nil {
		t.Fatalf("Failed with empty config: %v", err)
	}

	// Should get all defaults - check some basic values
	if serviceConfig.GlobalMaxEntries <= 0 {
		t.Errorf("Expected positive GlobalMaxEntries, got %d", serviceConfig.GlobalMaxEntries)
	}
}
