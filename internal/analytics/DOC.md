# Analytics Package Documentation

## Overview

The `internal/analytics` package provides comprehensive analytics capabilities for the Kaptn Kubernetes admin dashboard. It serves as a data aggregation layer that collects, processes, and caches metrics data from Prometheus to provide actionable insights about cluster usage and visitor patterns.

## Package Architecture

```
internal/analytics/
├── prometheus_client.go    # Prometheus client implementation
├── service.go             # Analytics service with caching
└── service_test.go        # Comprehensive test suite
```

## Core Components

### 1. PrometheusClient

The `PrometheusClient` is responsible for querying Prometheus instances to retrieve metrics data.

#### Key Features:
- **Configurable timeout and connection settings**
- **Range queries** for time-series data retrieval
- **Auto-detection of ingress controller metrics** (NGINX, Traefik, HAProxy, Istio, Envoy)
- **Connection health checking**
- **Graceful degradation** when Prometheus is unavailable

#### Configuration:
```go
type PrometheusConfig struct {
    URL     string  // Prometheus server URL
    Timeout string  // Query timeout duration
    Enabled bool    // Enable/disable Prometheus integration
}
```

#### Supported Ingress Controllers:
- **NGINX Ingress Controller**: `nginx_ingress_controller_requests`
- **Traefik**: `traefik_service_requests_total`  
- **HAProxy Ingress**: `haproxy_frontend_http_requests_rate_max`
- **Istio Gateway**: `istio_requests_total`
- **Envoy**: `envoy_http_downstream_rq_total`

### 2. AnalyticsService

The main service that orchestrates data collection, processing, and caching.

#### Key Features:
- **Intelligent caching** with configurable TTL
- **Mock data fallback** when Prometheus is unavailable
- **Visitor approximation** from ingress metrics
- **Time window and step parsing** (7d, 30d, 90d with 1h, 1d steps)
- **Concurrent-safe operations**

#### Cache Implementation:
- **Thread-safe** using RWMutex
- **Automatic cleanup** of expired items
- **Configurable TTL** per cache entry
- **Background cleanup goroutine**

## API Reference

### PrometheusClient Methods

#### `NewPrometheusClient(logger *zap.Logger, config PrometheusConfig) (*PrometheusClient, error)`
Creates a new Prometheus client with the specified configuration.

#### `QueryRange(ctx context.Context, query string, start, end time.Time, step time.Duration) ([]PrometheusResult, error)`
Executes a range query against Prometheus and returns time-series results.

#### `BuildIngressRequestsQuery() string`
Constructs a Prometheus query for ingress controller request metrics.

#### `AggregateToVisitors(results []PrometheusResult, step time.Duration) ([]TimeSeriesPoint, error)`
Converts raw ingress metrics into approximate visitor counts using heuristics.

#### `TestConnection(ctx context.Context) error`
Tests connectivity to the Prometheus server.

### AnalyticsService Methods

#### `NewAnalyticsService(logger *zap.Logger, prometheusClient *PrometheusClient, cacheTTL time.Duration) *AnalyticsService`
Creates a new analytics service with the specified cache TTL.

#### `GetVisitors(ctx context.Context, window, step string) (*VisitorsResponse, error)`
Retrieves visitor analytics for the specified time window and aggregation step.

**Supported Windows:**
- `7d` - 7 days
- `30d` - 30 days  
- `90d` - 90 days

**Supported Steps:**
- `1h` - 1 hour aggregation
- `1d` - 1 day aggregation
- Any valid Go duration string

## Data Models

### Core Types

```go
// Response format for visitor analytics
type VisitorsResponse struct {
    Series []TimeSeriesPoint `json:"series"`
    Window string            `json:"window"`
    Step   string            `json:"step"`
}

// Individual time-series data point
type TimeSeriesPoint struct {
    Timestamp time.Time `json:"t"`
    Value     float64   `json:"v"`
}

// Prometheus query result structure
type PrometheusResult struct {
    Metric map[string]string `json:"metric"`
    Values [][]interface{}   `json:"values"`
    Value  []interface{}     `json:"value"`
}
```

### Cache Types

```go
// Cache key for analytics queries
type CacheKey struct {
    Window string
    Step   string
}

// Individual cache entry
type CacheItem struct {
    Data      interface{}
    ExpiresAt time.Time
}
```

## Usage Examples

### Basic Setup

```go
// Create Prometheus client
prometheusConfig := PrometheusConfig{
    URL:     "http://prometheus:9090",
    Timeout: "30s",
    Enabled: true,
}

prometheusClient, err := NewPrometheusClient(logger, prometheusConfig)
if err != nil {
    return fmt.Errorf("failed to create prometheus client: %w", err)
}

// Create analytics service with 5-minute cache
service := NewAnalyticsService(logger, prometheusClient, 5*time.Minute)
```

### Retrieving Visitor Data

```go
// Get 7-day visitor data with hourly aggregation
ctx := context.Background()
visitors, err := service.GetVisitors(ctx, "7d", "1h")
if err != nil {
    return fmt.Errorf("failed to get visitors: %w", err)
}

// Process the time series data
for _, point := range visitors.Series {
    fmt.Printf("Time: %s, Visitors: %.2f\n", 
        point.Timestamp.Format(time.RFC3339), 
        point.Value)
}
```

### Direct Prometheus Queries

```go
// Query Prometheus directly
start := time.Now().Add(-24 * time.Hour)
end := time.Now()
step := time.Hour

results, err := prometheusClient.QueryRange(
    ctx, 
    "rate(nginx_ingress_controller_requests[5m])",
    start, 
    end, 
    step,
)
```

## Error Handling & Resilience

### Graceful Degradation
The analytics service implements multiple layers of fallback:

1. **Primary**: Query live Prometheus data
2. **Cache Fallback**: Return cached data if available
3. **Mock Data Fallback**: Generate realistic mock data when Prometheus is unavailable

### Mock Data Generation
When Prometheus is unavailable, the service generates realistic visitor patterns:
- **Daily traffic patterns** (higher during business hours)
- **Realistic variance** and fluctuations
- **Consistent time-series structure**

### Error Categories
- **Configuration errors**: Invalid URLs, timeouts, or parameters
- **Network errors**: Prometheus connectivity issues
- **Data parsing errors**: Invalid Prometheus responses
- **Cache errors**: Memory or concurrency issues

## Performance Considerations

### Caching Strategy
- **Configurable TTL** to balance freshness vs. performance
- **Background cleanup** to prevent memory leaks
- **Thread-safe operations** for concurrent access
- **Cache key optimization** for efficient lookups

### Query Optimization
- **Rate-based queries** for accurate traffic measurement
- **Configurable step sizes** to balance resolution vs. performance
- **Timeout controls** to prevent hanging requests

### Memory Management
- **Automatic cache cleanup** prevents unbounded growth
- **Efficient data structures** for time-series storage
- **Garbage collection friendly** object lifecycle

## Testing

The package includes comprehensive tests covering:

### Unit Tests
- **Service functionality** with mock data
- **Cache behavior** and TTL expiration
- **Prometheus client queries**
- **Error handling scenarios**

### Integration Tests
- **End-to-end visitor data retrieval**
- **Cache performance verification**
- **Prometheus connectivity testing**

### Test Utilities
- **Mock data generation** for consistent testing
- **Cache timing verification**
- **Query validation helpers**

## Configuration

### Environment Variables
The analytics service can be configured via:
- `PROMETHEUS_URL` - Prometheus server endpoint
- `PROMETHEUS_TIMEOUT` - Query timeout duration
- `ANALYTICS_CACHE_TTL` - Cache retention period
- `PROMETHEUS_ENABLED` - Enable/disable Prometheus integration

### Runtime Configuration
```go
type PrometheusConfig struct {
    URL     string `yaml:"url"`
    Timeout string `yaml:"timeout"`
    Enabled bool   `yaml:"enabled"`
}
```

## Security Considerations

### Data Privacy
- **No persistent storage** of metrics data
- **Configurable data retention** via cache TTL
- **Aggregated data only** (no individual request tracking)

### Network Security
- **Timeout controls** prevent resource exhaustion
- **Connection pooling** for efficient resource usage
- **Error sanitization** prevents information disclosure

## Monitoring & Observability

### Logging
The service provides structured logging for:
- **Query performance** and timing
- **Cache hit/miss ratios**
- **Prometheus connectivity status**
- **Error conditions** and fallback scenarios

### Metrics Integration
- Compatible with Prometheus metrics collection
- Exposes service health and performance indicators
- Tracks cache efficiency and query patterns

## Future Enhancements

### Planned Features
- **Multi-cluster analytics** aggregation
- **Custom metric definitions** beyond visitor tracking
- **Real-time streaming** analytics via WebSocket
- **Advanced visitor attribution** algorithms
- **Dashboard template integration**

### Extensibility Points
- **Pluggable metric sources** beyond Prometheus
- **Custom aggregation functions**
- **Configurable cache backends**
- **External analytics integrations**

## Dependencies

### External Dependencies
- `go.uber.org/zap` - Structured logging
- `context` - Request context management
- `net/http` - HTTP client operations
- `encoding/json` - JSON serialization
- `sync` - Concurrency primitives

### Internal Dependencies
- Integrates with Kaptn's auth system for access control
- Uses shared logging configuration
- Compatible with cluster impersonation features

## Troubleshooting

### Common Issues

#### Prometheus Connection Failures
```
Error: failed to connect to prometheus: dial tcp: connection refused
```
**Solution**: Verify Prometheus URL and network connectivity

#### Cache Performance Issues
```
Warning: Cache hit ratio below 50%
```
**Solution**: Increase cache TTL or review query patterns

#### Mock Data Fallback
```
Warning: Prometheus is disabled, returning mock data
```
**Solution**: Enable Prometheus integration and verify configuration

### Debug Mode
Enable debug logging to troubleshoot:
```go
logger := zap.NewDevelopment()
service := NewAnalyticsService(logger, prometheusClient, cacheTTL)
```

## Best Practices

### Configuration
- Use reasonable cache TTL values (5-15 minutes for most use cases)
- Configure appropriate Prometheus timeouts (10-30 seconds)
- Enable Prometheus when available for accurate data

### Performance
- Choose appropriate time windows and steps for your use case
- Monitor cache hit ratios and adjust TTL accordingly
- Use background queries for non-critical analytics

### Reliability
- Always handle the case where Prometheus is unavailable
- Implement proper timeout and retry logic
- Monitor service health and connectivity

This documentation provides a comprehensive guide to the analytics package, covering architecture, usage, and operational considerations for Kaptn administrators and developers.