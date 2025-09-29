# Metrics Package Documentation

## Overview

The `internal/metrics` package provides Prometheus metrics instrumentation for the Kaptn Kubernetes admin dashboard. It implements comprehensive telemetry collection covering HTTP requests, Kubernetes API interactions, WebSocket connections, authentication, job execution, cluster health, and internal system performance. This package serves as the central metrics registry for monitoring Kaptn's operational health and performance.

## Package Architecture

```
internal/metrics/
└── prometheus.go              # Prometheus metrics definitions and recording functions
```

## Core Components

### 1. Metrics Categories

The package organizes metrics into logical categories for different aspects of the system:

#### HTTP Request Metrics
```go
// Request counting and latency tracking
httpRequestsTotal = promauto.NewCounterVec(
    prometheus.CounterOpts{
        Name: "kaptn_http_requests_total",
        Help: "Total number of HTTP requests",
    },
    []string{"method", "path", "status_code"},
)

httpRequestDuration = promauto.NewHistogramVec(
    prometheus.HistogramOpts{
        Name:    "kaptn_http_request_duration_seconds",
        Help:    "HTTP request duration in seconds",
        Buckets: prometheus.DefBuckets,
    },
    []string{"method", "path", "status_code"},
)
```

#### Kubernetes API Metrics
```go
// Kubernetes client performance tracking
kubernetesRequestsTotal = promauto.NewCounterVec(
    prometheus.CounterOpts{
        Name: "kaptn_kubernetes_requests_total",
        Help: "Total number of requests to Kubernetes API",
    },
    []string{"resource", "verb", "status_code"},
)

kubernetesRequestDuration = promauto.NewHistogramVec(
    prometheus.HistogramOpts{
        Name:    "kaptn_kubernetes_request_duration_seconds",
        Help:    "Kubernetes API request duration in seconds",
        Buckets: prometheus.DefBuckets,
    },
    []string{"resource", "verb", "status_code"},
)
```

#### WebSocket Connection Metrics
```go
// Real-time connection tracking
websocketConnectionsTotal = promauto.NewCounterVec(
    prometheus.CounterOpts{
        Name: "kaptn_websocket_connections_total",
        Help: "Total number of WebSocket connections",
    },
    []string{"stream_type"},
)

websocketConnectionsActive = promauto.NewGaugeVec(
    prometheus.GaugeOpts{
        Name: "kaptn_websocket_connections_active",
        Help: "Number of active WebSocket connections",
    },
    []string{"stream_type"},
)
```

#### Authentication Metrics
```go
// Authentication performance and security tracking
authRequestsTotal = promauto.NewCounterVec(
    prometheus.CounterOpts{
        Name: "kaptn_auth_requests_total",
        Help: "Total number of authentication requests",
    },
    []string{"auth_mode", "status"},
)

rateLimitedRequestsTotal = promauto.NewCounterVec(
    prometheus.CounterOpts{
        Name: "kaptn_rate_limited_requests_total",
        Help: "Total number of rate limited requests",
    },
    []string{"user_id", "endpoint"},
)
```

#### Job Execution Metrics
```go
// Background job performance tracking
jobsTotal = promauto.NewCounterVec(
    prometheus.CounterOpts{
        Name: "kaptn_jobs_total",
        Help: "Total number of background jobs",
    },
    []string{"job_type", "status"},
)

jobDuration = promauto.NewHistogramVec(
    prometheus.HistogramOpts{
        Name:    "kaptn_job_duration_seconds",
        Help:    "Job execution duration in seconds",
        Buckets: []float64{1, 5, 10, 30, 60, 300, 600, 1800}, // 1s to 30m
    },
    []string{"job_type", "status"},
)
```

#### Cluster Health Metrics
```go
// Cluster-level health indicators
clusterCPUUsagePercent = promauto.NewGauge(
    prometheus.GaugeOpts{
        Name: "kaptn_cluster_cpu_usage_percent",
        Help: "Cluster CPU usage percentage",
    },
)

clusterMemoryUsagePercent = promauto.NewGauge(
    prometheus.GaugeOpts{
        Name: "kaptn_cluster_memory_usage_percent",
        Help: "Cluster memory usage percentage",
    },
)

clusterPodsRunning = promauto.NewGauge(
    prometheus.GaugeOpts{
        Name: "kaptn_cluster_pods_running",
        Help: "Number of running pods in cluster",
    },
)
```

#### Internal Telemetry Metrics
```go
// Internal system performance tracking
collectorScrapeDuration = promauto.NewHistogramVec(
    prometheus.HistogramOpts{
        Name:    "kaptn_collector_scrape_duration_seconds",
        Help:    "Duration of telemetry collector scrapes",
        Buckets: []float64{0.1, 0.5, 1.0, 2.5, 5.0, 10.0}, // 100ms to 10s
    },
    []string{"collector"},
)

ringBufferPointsTotal = promauto.NewCounter(
    prometheus.CounterOpts{
        Name: "kaptn_ringbuffer_points_total",
        Help: "Total number of points added to ring buffers",
    },
)

ringBufferSeriesTotal = promauto.NewGauge(
    prometheus.GaugeOpts{
        Name: "kaptn_ringbuffer_series_total",
        Help: "Current number of active ring buffer series",
    },
)
```

## Recording Functions

### 1. HTTP Request Recording

```go
func RecordHTTPRequest(method, path string, statusCode int, duration time.Duration) {
    labels := prometheus.Labels{
        "method":      method,
        "path":        path,
        "status_code": strconv.Itoa(statusCode),
    }

    httpRequestsTotal.With(labels).Inc()
    httpRequestDuration.With(labels).Observe(duration.Seconds())
}
```

**Labels:**
- `method`: HTTP method (GET, POST, PUT, DELETE, etc.)
- `path`: Request path or route pattern
- `status_code`: HTTP response status code

**Metrics Generated:**
- Request count by method, path, and status
- Request duration histogram for latency analysis

### 2. Kubernetes API Recording

```go
func RecordKubernetesRequest(resource, verb string, statusCode int, duration time.Duration) {
    labels := prometheus.Labels{
        "resource":    resource,
        "verb":        verb,
        "status_code": strconv.Itoa(statusCode),
    }

    kubernetesRequestsTotal.With(labels).Inc()
    kubernetesRequestDuration.With(labels).Observe(duration.Seconds())
}
```

**Labels:**
- `resource`: Kubernetes resource type (pods, services, deployments, etc.)
- `verb`: API verb (get, list, create, update, delete, patch)
- `status_code`: HTTP response status code from Kubernetes API

**Use Cases:**
- Monitor Kubernetes API performance
- Track rate limiting and throttling
- Identify slow resource operations
- Debug connectivity issues

### 3. WebSocket Connection Tracking

```go
func RecordWebSocketConnection(streamType string) {
    websocketConnectionsTotal.With(prometheus.Labels{"stream_type": streamType}).Inc()
    websocketConnectionsActive.With(prometheus.Labels{"stream_type": streamType}).Inc()
}

func RecordWebSocketDisconnection(streamType string) {
    websocketConnectionsActive.With(prometheus.Labels{"stream_type": streamType}).Dec()
}
```

**Stream Types:**
- `logs`: Log streaming connections
- `metrics`: Metrics streaming connections
- `events`: Event streaming connections
- `exec`: Container exec connections

**Metrics:**
- Total connections established over time
- Current active connections by type
- Connection lifecycle tracking

### 4. Authentication Tracking

```go
func RecordAuthRequest(authMode, status string) {
    authRequestsTotal.With(prometheus.Labels{
        "auth_mode": authMode,
        "status":    status,
    }).Inc()
}

func RecordRateLimitedRequest(userID, endpoint string) {
    rateLimitedRequestsTotal.With(prometheus.Labels{
        "user_id":  userID,
        "endpoint": endpoint,
    }).Inc()
}
```

**Authentication Modes:**
- `oidc`: OpenID Connect authentication
- `basic`: Basic authentication (if enabled)
- `none`: No authentication mode

**Status Values:**
- `success`: Successful authentication
- `failure`: Failed authentication
- `expired`: Expired token/session
- `invalid`: Invalid credentials

### 5. Job Execution Monitoring

```go
func RecordJob(jobType, status string, duration time.Duration) {
    labels := prometheus.Labels{
        "job_type": jobType,
        "status":   status,
    }

    jobsTotal.With(labels).Inc()
    jobDuration.With(labels).Observe(duration.Seconds())
}
```

**Job Types:**
- `log_collection`: Log collection jobs
- `metrics_scrape`: Metrics scraping jobs
- `cache_refresh`: Cache refresh jobs
- `cleanup`: Cleanup and maintenance jobs

**Status Values:**
- `success`: Job completed successfully
- `failure`: Job failed with error
- `timeout`: Job exceeded timeout
- `cancelled`: Job was cancelled

### 6. Cluster Health Updates

```go
func UpdateClusterMetrics(cpuPercent, memoryPercent float64, podsRunning, podsTotal, nodesReady, nodesTotal int) {
    clusterCPUUsagePercent.Set(cpuPercent)
    clusterMemoryUsagePercent.Set(memoryPercent)
    clusterPodsRunning.Set(float64(podsRunning))
    clusterPodsTotal.Set(float64(podsTotal))
    clusterNodesReady.Set(float64(nodesReady))
    clusterNodesTotal.Set(float64(nodesTotal))
}
```

**Health Indicators:**
- CPU usage percentage across cluster
- Memory usage percentage across cluster
- Pod counts (running vs total)
- Node readiness (ready vs total)

### 7. Internal Telemetry

```go
func RecordCollectorScrape(collector string, duration time.Duration, hasError bool) {
    collectorScrapeDuration.With(prometheus.Labels{"collector": collector}).Observe(duration.Seconds())

    if hasError {
        collectorScrapeErrors.With(prometheus.Labels{"collector": collector}).Inc()
    }
}

func UpdateRingBufferMetrics(seriesCount int64, pointsPerSec int64, droppedPoints int64) {
    ringBufferSeriesTotal.Set(float64(seriesCount))
    ringBufferPointsPerSecond.Set(float64(pointsPerSec))

    if droppedPoints > 0 {
        ringBufferDroppedPointsTotal.Add(float64(droppedPoints))
    }
}
```

**Collector Types:**
- `resource`: Resource metrics collection
- `summary`: Summary API collection
- `node_conditions`: Node condition collection
- `pod_metrics`: Pod metrics collection

## Usage Examples

### Basic HTTP Request Tracking

```go
func httpMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        
        // Create response writer to capture status code
        recorder := &statusRecorder{ResponseWriter: w, statusCode: http.StatusOK}
        
        // Process request
        next.ServeHTTP(recorder, r)
        
        // Record metrics
        duration := time.Since(start)
        metrics.RecordHTTPRequest(r.Method, r.URL.Path, recorder.statusCode, duration)
    })
}

type statusRecorder struct {
    http.ResponseWriter
    statusCode int
}

func (r *statusRecorder) WriteHeader(statusCode int) {
    r.statusCode = statusCode
    r.ResponseWriter.WriteHeader(statusCode)
}
```

### Kubernetes API Client Instrumentation

```go
type instrumentedKubeClient struct {
    client kubernetes.Interface
}

func (c *instrumentedKubeClient) Pods(namespace string) corev1.PodInterface {
    return &instrumentedPodInterface{
        PodInterface: c.client.CoreV1().Pods(namespace),
        namespace:    namespace,
    }
}

type instrumentedPodInterface struct {
    corev1.PodInterface
    namespace string
}

func (p *instrumentedPodInterface) List(ctx context.Context, opts metav1.ListOptions) (*corev1.PodList, error) {
    start := time.Now()
    
    result, err := p.PodInterface.List(ctx, opts)
    
    duration := time.Since(start)
    statusCode := 200
    if err != nil {
        statusCode = 500 // Simplified error mapping
    }
    
    metrics.RecordKubernetesRequest("pods", "list", statusCode, duration)
    
    return result, err
}
```

### WebSocket Connection Management

```go
type WebSocketHub struct {
    connections map[string]map[*websocket.Conn]bool
    mu          sync.RWMutex
}

func (h *WebSocketHub) AddConnection(streamType string, conn *websocket.Conn) {
    h.mu.Lock()
    defer h.mu.Unlock()
    
    if h.connections[streamType] == nil {
        h.connections[streamType] = make(map[*websocket.Conn]bool)
    }
    h.connections[streamType][conn] = true
    
    // Record connection
    metrics.RecordWebSocketConnection(streamType)
}

func (h *WebSocketHub) RemoveConnection(streamType string, conn *websocket.Conn) {
    h.mu.Lock()
    defer h.mu.Unlock()
    
    if h.connections[streamType] != nil {
        delete(h.connections[streamType], conn)
    }
    
    // Record disconnection
    metrics.RecordWebSocketDisconnection(streamType)
}
```

### Authentication Middleware

```go
func authMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        
        // Perform authentication
        user, err := authenticateRequest(r)
        if err != nil {
            metrics.RecordAuthRequest("oidc", "failure")
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }
        
        metrics.RecordAuthRequest("oidc", "success")
        
        // Add user to context and continue
        ctx := context.WithValue(r.Context(), "user", user)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### Background Job Instrumentation

```go
type JobRunner struct {
    logger *zap.Logger
}

func (j *JobRunner) RunJob(jobType string, fn func() error) {
    start := time.Now()
    
    err := fn()
    
    duration := time.Since(start)
    status := "success"
    if err != nil {
        status = "failure"
        j.logger.Error("Job failed", zap.String("type", jobType), zap.Error(err))
    }
    
    metrics.RecordJob(jobType, status, duration)
}

// Usage example
func (s *Service) CollectMetrics() {
    jobRunner.RunJob("metrics_scrape", func() error {
        return s.scrapeMetrics()
    })
}
```

### Cluster Health Monitoring

```go
type HealthMonitor struct {
    kubeClient kubernetes.Interface
    store      timeseries.Store
}

func (h *HealthMonitor) UpdateClusterHealth(ctx context.Context) error {
    // Gather cluster metrics
    cpuUsage, err := h.getCPUUsagePercent(ctx)
    if err != nil {
        return err
    }
    
    memUsage, err := h.getMemoryUsagePercent(ctx)
    if err != nil {
        return err
    }
    
    podsRunning, podsTotal, err := h.getPodCounts(ctx)
    if err != nil {
        return err
    }
    
    nodesReady, nodesTotal, err := h.getNodeCounts(ctx)
    if err != nil {
        return err
    }
    
    // Update Prometheus metrics
    metrics.UpdateClusterMetrics(
        cpuUsage, memUsage,
        podsRunning, podsTotal,
        nodesReady, nodesTotal,
    )
    
    return nil
}
```

### Internal Telemetry Collection

```go
type MetricsCollector struct {
    store  timeseries.Store
    logger *zap.Logger
}

func (c *MetricsCollector) CollectResourceMetrics(ctx context.Context) {
    start := time.Now()
    var hasError bool
    
    defer func() {
        duration := time.Since(start)
        metrics.RecordCollectorScrape("resource", duration, hasError)
    }()
    
    // Perform collection
    err := c.doResourceCollection(ctx)
    if err != nil {
        hasError = true
        c.logger.Error("Resource collection failed", zap.Error(err))
    }
}

func (c *MetricsCollector) UpdateRingBufferHealth() {
    health := c.store.GetHealthSnapshot()
    
    metrics.UpdateRingBufferMetrics(
        health.SeriesCount,
        health.PointsAddedPerSec,
        health.DroppedPoints,
    )
}
```

## Metrics Hierarchy

### HTTP Layer Metrics
```
kaptn_http_requests_total{method="GET", path="/api/v1/pods", status_code="200"}
kaptn_http_request_duration_seconds{method="GET", path="/api/v1/pods", status_code="200"}
```

### Kubernetes Client Metrics
```
kaptn_kubernetes_requests_total{resource="pods", verb="list", status_code="200"}
kaptn_kubernetes_request_duration_seconds{resource="pods", verb="list", status_code="200"}
```

### WebSocket Metrics
```
kaptn_websocket_connections_total{stream_type="logs"}
kaptn_websocket_connections_active{stream_type="logs"}
```

### Authentication Metrics
```
kaptn_auth_requests_total{auth_mode="oidc", status="success"}
kaptn_rate_limited_requests_total{user_id="user123", endpoint="/api/v1/pods"}
```

### Job Metrics
```
kaptn_jobs_total{job_type="metrics_scrape", status="success"}
kaptn_job_duration_seconds{job_type="metrics_scrape", status="success"}
```

### Cluster Health Metrics
```
kaptn_cluster_cpu_usage_percent
kaptn_cluster_memory_usage_percent
kaptn_cluster_pods_running
kaptn_cluster_nodes_ready
```

### Internal Telemetry Metrics
```
kaptn_collector_scrape_duration_seconds{collector="resource"}
kaptn_ringbuffer_points_total
kaptn_ringbuffer_series_total
kaptn_ringbuffer_dropped_points_total
```

## Dashboard Integration

### Grafana Dashboard Queries

#### HTTP Request Rate
```promql
rate(kaptn_http_requests_total[5m])
```

#### HTTP Error Rate
```promql
rate(kaptn_http_requests_total{status_code=~"4..|5.."}[5m]) / 
rate(kaptn_http_requests_total[5m])
```

#### HTTP Latency Percentiles
```promql
histogram_quantile(0.95, rate(kaptn_http_request_duration_seconds_bucket[5m]))
histogram_quantile(0.50, rate(kaptn_http_request_duration_seconds_bucket[5m]))
```

#### Kubernetes API Performance
```promql
rate(kaptn_kubernetes_requests_total[5m])
rate(kaptn_kubernetes_requests_total{status_code=~"4..|5.."}[5m])
histogram_quantile(0.95, rate(kaptn_kubernetes_request_duration_seconds_bucket[5m]))
```

#### WebSocket Connection Health
```promql
kaptn_websocket_connections_active
rate(kaptn_websocket_connections_total[5m])
```

#### Authentication Success Rate
```promql
rate(kaptn_auth_requests_total{status="success"}[5m]) /
rate(kaptn_auth_requests_total[5m])
```

#### Job Execution Health
```promql
rate(kaptn_jobs_total{status="success"}[5m])
rate(kaptn_jobs_total{status="failure"}[5m])
histogram_quantile(0.95, rate(kaptn_job_duration_seconds_bucket[5m]))
```

#### Cluster Health Overview
```promql
kaptn_cluster_cpu_usage_percent
kaptn_cluster_memory_usage_percent
kaptn_cluster_pods_running / kaptn_cluster_pods_total * 100
kaptn_cluster_nodes_ready / kaptn_cluster_nodes_total * 100
```

#### Internal System Health
```promql
rate(kaptn_collector_scrape_errors_total[5m])
kaptn_ringbuffer_points_per_second
kaptn_ringbuffer_series_total
rate(kaptn_ringbuffer_dropped_points_total[5m])
```

## Alerting Rules

### HTTP Service Health
```yaml
groups:
- name: kaptn_http
  rules:
  - alert: KaptnHTTPHighErrorRate
    expr: rate(kaptn_http_requests_total{status_code=~"5.."}[5m]) / rate(kaptn_http_requests_total[5m]) > 0.05
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "High HTTP error rate detected"

  - alert: KaptnHTTPHighLatency
    expr: histogram_quantile(0.95, rate(kaptn_http_request_duration_seconds_bucket[5m])) > 2.0
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High HTTP latency detected"
```

### Kubernetes API Health
```yaml
- name: kaptn_kubernetes
  rules:
  - alert: KaptnKubernetesAPIErrors
    expr: rate(kaptn_kubernetes_requests_total{status_code=~"5.."}[5m]) > 0.1
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Kubernetes API errors detected"

  - alert: KaptnKubernetesAPISlowRequests
    expr: histogram_quantile(0.95, rate(kaptn_kubernetes_request_duration_seconds_bucket[5m])) > 5.0
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Slow Kubernetes API requests"
```

### Authentication Health
```yaml
- name: kaptn_auth
  rules:
  - alert: KaptnAuthFailureRate
    expr: rate(kaptn_auth_requests_total{status="failure"}[5m]) / rate(kaptn_auth_requests_total[5m]) > 0.1
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "High authentication failure rate"
```

### Internal System Health
```yaml
- name: kaptn_internal
  rules:
  - alert: KaptnCollectorErrors
    expr: rate(kaptn_collector_scrape_errors_total[5m]) > 0.1
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "High collector error rate"

  - alert: KaptnRingBufferDropping
    expr: rate(kaptn_ringbuffer_dropped_points_total[5m]) > 10
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Ring buffer dropping points"
```

## Performance Considerations

### Label Cardinality
- **HTTP Metrics**: Be careful with path labels to avoid high cardinality
- **User Metrics**: Consider aggregating by groups rather than individual users
- **Resource Metrics**: Namespace and resource type provide good balance

### Metric Collection Frequency
- **HTTP Metrics**: Recorded on every request (low overhead)
- **Kubernetes Metrics**: Batched collection to reduce overhead
- **Cluster Health**: Updated periodically (every 30-60 seconds)
- **Internal Telemetry**: Collected during operation (no additional overhead)

### Memory Usage
- **Histogram Buckets**: Default buckets suitable for most use cases
- **Time Series**: Automatic cleanup of stale metrics
- **Label Management**: Consistent label naming to avoid duplication

## Configuration

### Prometheus Integration
```yaml
# prometheus.yml
scrape_configs:
- job_name: 'kaptn'
  static_configs:
  - targets: ['kaptn-server:8080']
  metrics_path: '/metrics'
  scrape_interval: 30s
```

### Environment Variables
```bash
# Metrics collection intervals
KAPTN_METRICS_SCRAPE_INTERVAL=30s
KAPTN_METRICS_COLLECTION_TIMEOUT=10s

# Feature toggles
KAPTN_METRICS_ENABLE_HTTP_METRICS=true
KAPTN_METRICS_ENABLE_K8S_METRICS=true
KAPTN_METRICS_ENABLE_INTERNAL_METRICS=true
```

## Best Practices

### Metric Design
- **Consistent Naming**: Use `kaptn_` prefix for all metrics
- **Appropriate Types**: Counters for totals, gauges for current values, histograms for distributions
- **Meaningful Labels**: Include essential dimensions without excessive cardinality
- **Documentation**: Clear help text for each metric

### Performance
- **Avoid High Cardinality**: Limit unique label combinations
- **Batch Updates**: Group related metric updates
- **Lazy Initialization**: Create metric instances only when needed
- **Error Handling**: Don't let metric recording failure affect business logic

### Monitoring
- **Health Checks**: Monitor metric collection system itself
- **Resource Usage**: Track memory and CPU usage of metrics collection
- **Error Rates**: Monitor failed metric collections
- **Data Quality**: Validate metric values and trends

## Dependencies

### External Dependencies
- `github.com/prometheus/client_golang` - Prometheus client library
- Standard library (`time`, `strconv`)

### Internal Dependencies
- Used by all other packages for instrumentation
- No dependencies on other internal packages (base layer)

This documentation provides comprehensive coverage of the metrics package, serving as both a developer guide for adding new metrics and an operational reference for monitoring Kaptn's health and performance.