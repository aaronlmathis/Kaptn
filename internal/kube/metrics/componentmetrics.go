package metrics

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/aaronlmathis/kaptn/internal/analytics"
	"go.uber.org/zap"
)

// ComponentMetricsAdapter collects metrics from Kubernetes components (API server, scheduler, controller-manager)
// via Prometheus queries. This complements the existing APIMetricsAdapter and SummaryStatsAdapter.
type ComponentMetricsAdapter struct {
	logger           *zap.Logger
	prometheusClient *analytics.PrometheusClient
	enabled          bool
}

// ComponentMetrics holds the collected component metrics
type ComponentMetrics struct {
	APIServerErrorsRate   float64 // errors per second
	APIServerLatencyP50   float64 // milliseconds
	APIServerLatencyP95   float64 // milliseconds
	APIServerRequestsRate float64 // requests per second
	SchedulerQueueDepth   float64 // queue depth
	ControllerQueueDepth  float64 // queue depth
}

// NewComponentMetricsAdapter creates a new component metrics adapter
func NewComponentMetricsAdapter(logger *zap.Logger, prometheusClient *analytics.PrometheusClient) *ComponentMetricsAdapter {
	return &ComponentMetricsAdapter{
		logger:           logger,
		prometheusClient: prometheusClient,
		enabled:          prometheusClient != nil && prometheusClient.IsEnabled(),
	}
}

// IsEnabled returns whether component metrics collection is enabled
func (cma *ComponentMetricsAdapter) IsEnabled() bool {
	return cma.enabled
}

// CollectComponentMetrics collects all component metrics from Prometheus
func (cma *ComponentMetricsAdapter) CollectComponentMetrics(ctx context.Context) (*ComponentMetrics, error) {
	if !cma.enabled {
		cma.logger.Debug("Component metrics collection disabled")
		return &ComponentMetrics{}, nil
	}

	metrics := &ComponentMetrics{}

	// Collect metrics concurrently for better performance
	errChan := make(chan error, 6)

	// API Server Error Rate
	go func() {
		rate, err := cma.getAPIServerErrorRate(ctx)
		if err != nil {
			errChan <- fmt.Errorf("API server error rate: %w", err)
		} else {
			metrics.APIServerErrorsRate = rate
			errChan <- nil
		}
	}()

	// API Server Latency P50
	go func() {
		p50, err := cma.getAPIServerLatencyP50(ctx)
		if err != nil {
			errChan <- fmt.Errorf("API server latency P50: %w", err)
		} else {
			metrics.APIServerLatencyP50 = p50
			errChan <- nil
		}
	}()

	// API Server Latency P95
	go func() {
		p95, err := cma.getAPIServerLatencyP95(ctx)
		if err != nil {
			errChan <- fmt.Errorf("API server latency P95: %w", err)
		} else {
			metrics.APIServerLatencyP95 = p95
			errChan <- nil
		}
	}()

	// API Server Request Rate
	go func() {
		rate, err := cma.getAPIServerRequestRate(ctx)
		if err != nil {
			errChan <- fmt.Errorf("API server request rate: %w", err)
		} else {
			metrics.APIServerRequestsRate = rate
			errChan <- nil
		}
	}()

	// Scheduler Queue Depth
	go func() {
		depth, err := cma.getSchedulerQueueDepth(ctx)
		if err != nil {
			errChan <- fmt.Errorf("scheduler queue depth: %w", err)
		} else {
			metrics.SchedulerQueueDepth = depth
			errChan <- nil
		}
	}()

	// Controller Manager Queue Depth
	go func() {
		depth, err := cma.getControllerQueueDepth(ctx)
		if err != nil {
			errChan <- fmt.Errorf("controller manager queue depth: %w", err)
		} else {
			metrics.ControllerQueueDepth = depth
			errChan <- nil
		}
	}()

	// Wait for all goroutines to complete
	var errors []error
	for i := 0; i < 6; i++ {
		if err := <-errChan; err != nil {
			errors = append(errors, err)
		}
	}

	// Log any errors and return error if all metrics failed
	if len(errors) > 0 {
		for _, err := range errors {
			cma.logger.Warn("Component metric collection error", zap.Error(err))
		}

		// If all or most metrics failed, return error to trigger fallback
		if len(errors) >= 4 { // More than half the metrics failed
			return nil, fmt.Errorf("component metrics collection failed: %d out of 6 metrics failed", len(errors))
		}
	}

	cma.logger.Debug("Collected component metrics",
		zap.Float64("apiErrorRate", metrics.APIServerErrorsRate),
		zap.Float64("apiLatencyP50", metrics.APIServerLatencyP50),
		zap.Float64("apiLatencyP95", metrics.APIServerLatencyP95),
		zap.Float64("apiRequestRate", metrics.APIServerRequestsRate),
		zap.Float64("schedulerQueue", metrics.SchedulerQueueDepth),
		zap.Float64("controllerQueue", metrics.ControllerQueueDepth),
	)

	return metrics, nil
}

// getAPIServerErrorRate calculates the rate of API server errors (4xx/5xx responses)
func (cma *ComponentMetricsAdapter) getAPIServerErrorRate(ctx context.Context) (float64, error) {
	// Query for 4xx and 5xx error rates over 5 minutes
	query := `rate(apiserver_request_total{code=~"4..|5.."}[5m])`

	end := time.Now()
	start := end.Add(-5 * time.Minute)
	step := 30 * time.Second

	results, err := cma.prometheusClient.QueryRange(ctx, query, start, end, step)
	if err != nil {
		return 0, fmt.Errorf("failed to query API server error rate: %w", err)
	}

	// Sum all error rates
	var totalErrorRate float64
	for _, result := range results {
		if len(result.Values) > 0 {
			// Get the latest value
			latestValue := result.Values[len(result.Values)-1]
			if len(latestValue) >= 2 {
				if valueStr, ok := latestValue[1].(string); ok {
					if value, err := strconv.ParseFloat(valueStr, 64); err == nil {
						totalErrorRate += value
					}
				}
			}
		}
	}

	return totalErrorRate, nil
}

// getAPIServerLatencyP50 gets the 50th percentile latency from API server
func (cma *ComponentMetricsAdapter) getAPIServerLatencyP50(ctx context.Context) (float64, error) {
	// Query for 50th percentile latency
	query := `histogram_quantile(0.50, rate(apiserver_request_duration_seconds_bucket[5m])) * 1000`

	end := time.Now()
	start := end.Add(-5 * time.Minute)
	step := 30 * time.Second

	results, err := cma.prometheusClient.QueryRange(ctx, query, start, end, step)
	if err != nil {
		return 0, fmt.Errorf("failed to query API server P50 latency: %w", err)
	}

	return cma.extractLatestValue(results)
}

// getAPIServerLatencyP95 gets the 95th percentile latency from API server
func (cma *ComponentMetricsAdapter) getAPIServerLatencyP95(ctx context.Context) (float64, error) {
	// Query for 95th percentile latency
	query := `histogram_quantile(0.95, rate(apiserver_request_duration_seconds_bucket[5m])) * 1000`

	end := time.Now()
	start := end.Add(-5 * time.Minute)
	step := 30 * time.Second

	results, err := cma.prometheusClient.QueryRange(ctx, query, start, end, step)
	if err != nil {
		return 0, fmt.Errorf("failed to query API server P95 latency: %w", err)
	}

	return cma.extractLatestValue(results)
}

// getAPIServerRequestRate gets the total request rate to API server
func (cma *ComponentMetricsAdapter) getAPIServerRequestRate(ctx context.Context) (float64, error) {
	// Query for total request rate over 5 minutes
	query := `sum(rate(apiserver_request_total[5m]))`

	end := time.Now()
	start := end.Add(-5 * time.Minute)
	step := 30 * time.Second

	results, err := cma.prometheusClient.QueryRange(ctx, query, start, end, step)
	if err != nil {
		return 0, fmt.Errorf("failed to query API server request rate: %w", err)
	}

	return cma.extractLatestValue(results)
}

// getSchedulerQueueDepth gets the current scheduler work queue depth
func (cma *ComponentMetricsAdapter) getSchedulerQueueDepth(ctx context.Context) (float64, error) {
	// Query for scheduler work queue depth
	query := `sum(workqueue_depth{name=~".*scheduler.*"})`

	end := time.Now()
	start := end.Add(-1 * time.Minute)
	step := 10 * time.Second

	results, err := cma.prometheusClient.QueryRange(ctx, query, start, end, step)
	if err != nil {
		return 0, fmt.Errorf("failed to query scheduler queue depth: %w", err)
	}

	return cma.extractLatestValue(results)
}

// getControllerQueueDepth gets the current controller manager work queue depth
func (cma *ComponentMetricsAdapter) getControllerQueueDepth(ctx context.Context) (float64, error) {
	// Query for controller manager work queue depth
	query := `sum(workqueue_depth{name=~".*controller.*"})`

	end := time.Now()
	start := end.Add(-1 * time.Minute)
	step := 10 * time.Second

	results, err := cma.prometheusClient.QueryRange(ctx, query, start, end, step)
	if err != nil {
		return 0, fmt.Errorf("failed to query controller manager queue depth: %w", err)
	}

	return cma.extractLatestValue(results)
}

// extractLatestValue extracts the most recent value from Prometheus query results
func (cma *ComponentMetricsAdapter) extractLatestValue(results []analytics.PrometheusResult) (float64, error) {
	if len(results) == 0 {
		return 0, nil
	}

	// Take the first result (should be only one for aggregated queries)
	result := results[0]

	if len(result.Values) == 0 {
		return 0, nil
	}

	// Get the latest value
	latestValue := result.Values[len(result.Values)-1]
	if len(latestValue) < 2 {
		return 0, nil
	}

	valueStr, ok := latestValue[1].(string)
	if !ok {
		return 0, fmt.Errorf("unexpected value type in Prometheus result")
	}

	value, err := strconv.ParseFloat(valueStr, 64)
	if err != nil {
		return 0, fmt.Errorf("failed to parse float value: %w", err)
	}

	return value, nil
}
