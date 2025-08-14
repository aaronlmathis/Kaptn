package analytics

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"go.uber.org/zap"
)

// PrometheusClient represents a client for querying Prometheus
type PrometheusClient struct {
	logger  *zap.Logger
	baseURL string
	timeout time.Duration
	client  *http.Client
	enabled bool
}

// PrometheusConfig represents Prometheus client configuration
type PrometheusConfig struct {
	URL     string
	Timeout string
	Enabled bool
}

// PrometheusResponse represents a response from Prometheus.
type PrometheusResponse struct {
	Status string         `json:"status"`
	Data   PrometheusData `json:"data"`
}

// PrometheusData represents the data section of a Prometheus response
type PrometheusData struct {
	ResultType string             `json:"resultType"`
	Result     []PrometheusResult `json:"result"`
}

// PrometheusResult represents a single result from Prometheus
type PrometheusResult struct {
	Metric map[string]string `json:"metric"`
	Values [][]interface{}   `json:"values"`
	Value  []interface{}     `json:"value"`
}

// TimeSeriesPoint represents a single point in a time series
type TimeSeriesPoint struct {
	Timestamp time.Time `json:"t"`
	Value     float64   `json:"v"`
}

// NewPrometheusClient creates a new Prometheus client
func NewPrometheusClient(logger *zap.Logger, config PrometheusConfig) (*PrometheusClient, error) {
	timeout, err := time.ParseDuration(config.Timeout)
	if err != nil {
		return nil, fmt.Errorf("invalid timeout duration: %w", err)
	}

	return &PrometheusClient{
		logger:  logger,
		baseURL: config.URL,
		timeout: timeout,
		enabled: config.Enabled,
		client: &http.Client{
			Timeout: timeout,
		},
	}, nil
}

// IsEnabled returns whether the Prometheus client is enabled
func (p *PrometheusClient) IsEnabled() bool {
	return p.enabled
}

// QueryRange performs a range query against Prometheus
func (p *PrometheusClient) QueryRange(ctx context.Context, query string, start, end time.Time, step time.Duration) ([]PrometheusResult, error) {
	if !p.enabled {
		return nil, fmt.Errorf("prometheus client is disabled")
	}

	u, err := url.Parse(p.baseURL + "/api/v1/query_range")
	if err != nil {
		return nil, fmt.Errorf("failed to parse prometheus URL: %w", err)
	}

	params := url.Values{}
	params.Set("query", query)
	params.Set("start", strconv.FormatInt(start.Unix(), 10))
	params.Set("end", strconv.FormatInt(end.Unix(), 10))
	params.Set("step", fmt.Sprintf("%.0fs", step.Seconds()))

	u.RawQuery = params.Encode()

	p.logger.Debug("Querying Prometheus",
		zap.String("url", u.String()),
		zap.String("query", query),
		zap.Time("start", start),
		zap.Time("end", end),
		zap.Duration("step", step))

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to query prometheus: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("prometheus query failed with status %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var promResp PrometheusResponse
	if err := json.Unmarshal(body, &promResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal prometheus response: %w", err)
	}

	if promResp.Status != "success" {
		return nil, fmt.Errorf("prometheus query failed: %s", promResp.Status)
	}

	return promResp.Data.Result, nil
}

// BuildIngressRequestsQuery builds a Prometheus query for ingress controller requests
func (p *PrometheusClient) BuildIngressRequestsQuery() string {
	// Try common ingress controller metrics in order of preference
	queries := []string{
		// NGINX Ingress Controller
		`rate(nginx_ingress_controller_requests[5m])`,
		// Traefik
		`rate(traefik_service_requests_total[5m])`,
		// HAProxy Ingress
		`rate(haproxy_frontend_http_requests_rate_max[5m])`,
		// Istio Gateway
		`rate(istio_requests_total{source_app="istio-proxy"}[5m])`,
		// Envoy (generic)
		`rate(envoy_http_downstream_rq_total[5m])`,
	}

	// For now, return the NGINX query as default
	// In a real implementation, you'd want to auto-detect which ingress controller is running
	return queries[0]
}

// AggregateToVisitors converts ingress metrics to visitor approximation
func (p *PrometheusClient) AggregateToVisitors(results []PrometheusResult, step time.Duration) ([]TimeSeriesPoint, error) {
	if len(results) == 0 {
		return []TimeSeriesPoint{}, nil
	}

	// Aggregate all series into a single time series
	timestampMap := make(map[int64]float64)

	for _, result := range results {
		for _, valueArray := range result.Values {
			if len(valueArray) != 2 {
				continue
			}

			timestamp, ok := valueArray[0].(float64)
			if !ok {
				continue
			}

			valueStr, ok := valueArray[1].(string)
			if !ok {
				continue
			}

			value, err := strconv.ParseFloat(valueStr, 64)
			if err != nil {
				continue
			}

			// Convert rate to approximate visitors per step
			// Rate is per second, so multiply by step duration to get total requests in the period
			approximateRequests := value * step.Seconds()

			// Simple heuristic: assume 1 visitor = 3-5 requests on average
			// This is a rough approximation and would need tuning based on actual usage patterns
			approximateVisitors := approximateRequests / 4.0

			ts := int64(timestamp)
			timestampMap[ts] += approximateVisitors
		}
	}

	// Convert map to sorted slice
	var points []TimeSeriesPoint
	for timestamp, value := range timestampMap {
		points = append(points, TimeSeriesPoint{
			Timestamp: time.Unix(timestamp, 0),
			Value:     value,
		})
	}

	// Sort by timestamp
	for i := 0; i < len(points)-1; i++ {
		for j := i + 1; j < len(points); j++ {
			if points[i].Timestamp.After(points[j].Timestamp) {
				points[i], points[j] = points[j], points[i]
			}
		}
	}

	return points, nil
}

// TestConnection tests the connection to Prometheus
func (p *PrometheusClient) TestConnection(ctx context.Context) error {
	if !p.enabled {
		return fmt.Errorf("prometheus client is disabled")
	}

	u, err := url.Parse(p.baseURL + "/api/v1/query")
	if err != nil {
		return fmt.Errorf("failed to parse prometheus URL: %w", err)
	}

	// Simple test query
	params := url.Values{}
	params.Set("query", "up")
	u.RawQuery = params.Encode()

	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return fmt.Errorf("failed to create test request: %w", err)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to connect to prometheus: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("prometheus health check failed with status %d", resp.StatusCode)
	}

	return nil
}
