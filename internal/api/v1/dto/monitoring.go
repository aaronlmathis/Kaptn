package dto

import "time"

// TimeSeriesResponse represents the API response for time series data
type TimeSeriesResponse struct {
	Series       map[string][]TimeSeriesPoint `json:"series"`
	Capabilities map[string]bool              `json:"capabilities"`
	Metadata     *TimeSeriesMetadata          `json:"metadata,omitempty"`
}

// TimeSeriesMetadata provides additional context about the response
type TimeSeriesMetadata struct {
	Resolution string `json:"resolution"`
	TimeSpan   string `json:"timespan"`
	Query      string `json:"query,omitempty"`
	StartTime  string `json:"startTime,omitempty"`
	EndTime    string `json:"endTime,omitempty"`
}

// TimeSeriesPoint represents a single data point in a time series
type TimeSeriesPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

// MetricsRequest represents a request for metrics data
type MetricsRequest struct {
	Query     string            `json:"query"`
	StartTime *time.Time        `json:"startTime,omitempty"`
	EndTime   *time.Time        `json:"endTime,omitempty"`
	Step      string            `json:"step,omitempty"`
	Namespace string            `json:"namespace,omitempty"`
	Resource  string            `json:"resource,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// MetricsResponse represents a response containing metrics data
type MetricsResponse struct {
	Status string              `json:"status"`
	Data   MetricsResponseData `json:"data"`
}

// MetricsResponseData contains the actual metrics data
type MetricsResponseData struct {
	ResultType string         `json:"resultType"`
	Result     []MetricResult `json:"result"`
}

// MetricResult represents a single metric result
type MetricResult struct {
	Metric map[string]string `json:"metric"`
	Values [][]interface{}   `json:"values,omitempty"`
	Value  []interface{}     `json:"value,omitempty"`
}

// HealthCheckResponse represents the response for health checks
type HealthCheckResponse struct {
	Status    string            `json:"status"`
	Timestamp time.Time         `json:"timestamp"`
	Checks    map[string]Health `json:"checks"`
	Version   string            `json:"version,omitempty"`
	Uptime    string            `json:"uptime,omitempty"`
}

// Health represents the health status of a component
type Health struct {
	Status      string    `json:"status"`
	Message     string    `json:"message,omitempty"`
	LastChecked time.Time `json:"lastChecked"`
	Duration    string    `json:"duration,omitempty"`
}

// AnalyticsRequest represents a request for analytics data
type AnalyticsRequest struct {
	Type      string            `json:"type"`
	TimeRange string            `json:"timeRange"`
	Filters   map[string]string `json:"filters,omitempty"`
	GroupBy   []string          `json:"groupBy,omitempty"`
}

// AnalyticsResponse represents a response containing analytics data
type AnalyticsResponse struct {
	Type         string                 `json:"type"`
	TimeRange    string                 `json:"timeRange"`
	Data         []AnalyticsDataPoint   `json:"data"`
	Summary      AnalyticsSummary       `json:"summary"`
	Aggregations map[string]interface{} `json:"aggregations,omitempty"`
}

// AnalyticsDataPoint represents a single analytics data point
type AnalyticsDataPoint struct {
	Timestamp  time.Time              `json:"timestamp"`
	Dimensions map[string]string      `json:"dimensions"`
	Metrics    map[string]interface{} `json:"metrics"`
}

// AnalyticsSummary provides summary statistics for analytics data
type AnalyticsSummary struct {
	TotalPoints int                    `json:"totalPoints"`
	StartTime   time.Time              `json:"startTime"`
	EndTime     time.Time              `json:"endTime"`
	Totals      map[string]interface{} `json:"totals,omitempty"`
	Averages    map[string]interface{} `json:"averages,omitempty"`
}
