package analytics

import (
	"context"
	"testing"
	"time"

	"go.uber.org/zap/zaptest"
)

func TestAnalyticsService_GetVisitors(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create a disabled Prometheus client for testing
	prometheusConfig := PrometheusConfig{
		URL:     "http://localhost:9090",
		Timeout: "5s",
		Enabled: false, // Disabled to force mock data
	}

	prometheusClient, err := NewPrometheusClient(logger, prometheusConfig)
	if err != nil {
		t.Fatalf("Failed to create Prometheus client: %v", err)
	}

	// Create analytics service
	service := NewAnalyticsService(logger, prometheusClient, time.Minute)

	tests := []struct {
		name   string
		window string
		step   string
	}{
		{
			name:   "7 days with 1 hour step",
			window: "7d",
			step:   "1h",
		},
		{
			name:   "30 days with 1 hour step",
			window: "30d",
			step:   "1h",
		},
		{
			name:   "90 days with 1 day step",
			window: "90d",
			step:   "1d",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()

			result, err := service.GetVisitors(ctx, tt.window, tt.step)
			if err != nil {
				t.Errorf("GetVisitors() error = %v", err)
				return
			}

			if result == nil {
				t.Error("GetVisitors() returned nil result")
				return
			}

			if result.Window != tt.window {
				t.Errorf("GetVisitors() window = %v, want %v", result.Window, tt.window)
			}

			if result.Step != tt.step {
				t.Errorf("GetVisitors() step = %v, want %v", result.Step, tt.step)
			}

			if len(result.Series) == 0 {
				t.Error("GetVisitors() returned empty series")
			}

			// Verify series data is reasonable
			for i, point := range result.Series {
				if point.Value < 0 {
					t.Errorf("GetVisitors() series[%d] has negative value: %f", i, point.Value)
				}

				if point.Timestamp.IsZero() {
					t.Errorf("GetVisitors() series[%d] has zero timestamp", i)
				}
			}
		})
	}
}

func TestAnalyticsService_Caching(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create a disabled Prometheus client for testing
	prometheusConfig := PrometheusConfig{
		URL:     "http://localhost:9090",
		Timeout: "5s",
		Enabled: false,
	}

	prometheusClient, err := NewPrometheusClient(logger, prometheusConfig)
	if err != nil {
		t.Fatalf("Failed to create Prometheus client: %v", err)
	}

	// Create analytics service with short cache TTL
	service := NewAnalyticsService(logger, prometheusClient, 100*time.Millisecond)

	ctx := context.Background()
	window := "7d"
	step := "1h"

	// First call should fetch fresh data
	start := time.Now()
	result1, err := service.GetVisitors(ctx, window, step)
	if err != nil {
		t.Fatalf("First GetVisitors() error = %v", err)
	}
	duration1 := time.Since(start)

	// Second call should use cache (should be faster)
	start = time.Now()
	result2, err := service.GetVisitors(ctx, window, step)
	if err != nil {
		t.Fatalf("Second GetVisitors() error = %v", err)
	}
	duration2 := time.Since(start)

	// Cache should make second call much faster
	if duration2 > duration1 {
		t.Errorf("Second call took longer than first (caching not working)")
	}

	// Results should be identical
	if len(result1.Series) != len(result2.Series) {
		t.Errorf("Cached result has different series length")
	}

	// Wait for cache to expire
	time.Sleep(150 * time.Millisecond)

	// Third call should fetch fresh data again
	_, err = service.GetVisitors(ctx, window, step)
	if err != nil {
		t.Fatalf("Third GetVisitors() error = %v", err)
	}
}

func TestPrometheusClient_BuildIngressRequestsQuery(t *testing.T) {
	logger := zaptest.NewLogger(t)

	prometheusConfig := PrometheusConfig{
		URL:     "http://localhost:9090",
		Timeout: "5s",
		Enabled: true,
	}

	client, err := NewPrometheusClient(logger, prometheusConfig)
	if err != nil {
		t.Fatalf("Failed to create Prometheus client: %v", err)
	}

	query := client.BuildIngressRequestsQuery()
	if query == "" {
		t.Error("BuildIngressRequestsQuery() returned empty query")
	}

	// Should contain rate function
	if !containsSubstring(query, "rate(") {
		t.Error("Query should contain rate() function")
	}
}

func containsSubstring(s, substr string) bool {
	return len(s) >= len(substr) && findSubstring(s, substr) != -1
}

func findSubstring(s, substr string) int {
	if len(substr) == 0 {
		return 0
	}
	if len(substr) > len(s) {
		return -1
	}

	for i := 0; i <= len(s)-len(substr); i++ {
		match := true
		for j := 0; j < len(substr); j++ {
			if s[i+j] != substr[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}
