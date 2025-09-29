# Logs Package Documentation

## Overview

The `internal/logs` package provides a sophisticated, high-performance in-memory log management system for the Kaptn Kubernetes admin dashboard. It implements real-time log ingestion, intelligent caching, advanced querying, and live streaming capabilities with enterprise-grade performance optimizations and operational safeguards.

## Package Architecture

```
internal/logs/
├── README.md                      # Comprehensive developer guide
├── interfaces.go                  # Core types and service interfaces
├── service_v3.go                 # Primary LogService implementation
├── reliable_service.go           # Production wrapper with reliability features
├── collector.go                  # Kubernetes informer-driven log collector
├── ring.go                       # Bounded TTL-evicted ring buffer storage
├── index.go                      # Lightweight in-memory indexing system
├── pubsub.go                     # In-process pub/sub for live streaming
├── filters.go                    # Log normalization and filtering utilities
├── metrics.go                    # Internal performance metrics
├── prometheus.go                 # Prometheus metrics integration
├── operational_logger.go         # Structured operational logging
├── test_config.go                # Testing configuration utilities
├── [multiple test files]         # Comprehensive test suite
└── race_condition.md             # Race condition documentation
```

## Core Components

### 1. Log Service Architecture (`service_v3.go`)

The third-generation log service implementation designed for enterprise reliability and scalability.

#### Service Structure:
```go
type ServiceV3 struct {
    config            config.LogsServiceConfig
    logger            *zap.Logger
    metrics           *Metrics
    prometheusMetrics *PrometheusMetrics
    opLogger          *OperationalLogger
    
    // Storage layers
    globalRing  LogRing                 // Global log buffer
    scopedRings map[string]LogRing      // Namespace/workload/pod-scoped rings
    
    // Real-time streaming
    bus LogBus                          // In-process pub/sub system
    
    // Log collection
    collector *LogCollector             // Kubernetes informer-driven collector
    
    // Administration
    adminLimits   AdminLimits           // Operational guardrails
    activeStreams map[string]*StreamInfo // Stream tracking
}
```

#### Key Features:
- **Multi-Tier Storage**: Global and scoped ring buffers for optimized queries
- **Real-Time Ingestion**: Kubernetes informer-driven log collection
- **Live Streaming**: WebSocket-compatible pub/sub system
- **Intelligent Indexing**: Time buckets and posting lists for fast queries
- **Operational Safeguards**: Rate limiting, backpressure protection, and health monitoring

### 2. Log Entry Model (`interfaces.go`)

Comprehensive log entry structure with rich metadata and normalization.

```go
type LogEntry struct {
    TS        time.Time         // Timestamp (normalized)
    Level     string            // Log level (FATAL/ERROR/WARN/INFO/DEBUG)
    Cluster   string            // Kubernetes cluster identifier
    Namespace string            // Kubernetes namespace
    Workload  string            // Workload name (derived from pod)
    Pod       string            // Pod name
    Container string            // Container name
    Node      string            // Node name
    Msg       string            // Log message content
    TraceID   string            // Distributed tracing ID (optional)
    SpanID    string            // Span ID (optional)
    Labels    map[string]string // Additional metadata (optional)
}

type LogFilter struct {
    Since     time.Time // Start time for query
    Until     time.Time // End time for query
    Levels    []string  // Log levels to include
    Cluster   string    // Cluster filter
    Namespace string    // Namespace filter
    Workload  string    // Workload filter
    Pod       string    // Pod filter
    Text      string    // Substring search in message
    Limit     int       // Maximum results to return
    Direction string    // "forward" or "backward"
}
```

### 3. Ring Buffer Storage (`ring.go`)

High-performance bounded ring buffer with TTL-based eviction and intelligent indexing.

#### Ring Features:
- **Bounded Capacity**: Configurable maximum entries with automatic eviction
- **TTL-Based Eviction**: Automatic cleanup of expired entries
- **Concurrent Safety**: Thread-safe operations with optimized locking
- **Index Integration**: Seamless integration with indexing system
- **Query Optimization**: Efficient query execution with fallback strategies

```go
type LogRing interface {
    Append(e LogEntry)              // Add new log entry
    Query(f LogFilter) []LogEntry   // Query with filtering
    EvictByTime(now time.Time)      // Remove expired entries
    Size() int                      // Current entry count
    Clear()                         // Remove all entries
    Bounds() (time.Time, time.Time) // Oldest and newest timestamps
}
```

### 4. Indexing System (`index.go`)

Lightweight in-memory indexing for fast log queries with intelligent query planning.

#### Index Types:
- **Time Buckets**: Minute-granularity time-based indexing
- **Posting Lists**: Field-based indexes (level, namespace, workload, pod)
- **LRU Cache**: Trace ID lookup optimization
- **Query Planning**: Selectivity-based query optimization

```go
type LogIndex struct {
    timeBuckets   map[int64][]int      // minute -> ring indices
    levelIndex    map[string][]int     // level -> ring indices
    namespaceIndex map[string][]int    // namespace -> ring indices
    workloadIndex map[string][]int     // workload -> ring indices
    podIndex      map[string][]int     // pod -> ring indices
    traceIndex    *TraceIndexLRU       // trace_id -> ring indices (LRU)
}
```

### 5. Log Collector (`collector.go`)

Kubernetes informer-driven log collection with resilient streaming and intelligent backoff.

#### Collection Modes:
- **Stream Mode**: Real-time log following with `Follow: true`
- **Poll Mode**: Periodic polling with timestamp-based deduplication

#### Collector Features:
```go
type LogCollector struct {
    config         LogCollectorConfig
    logger         *zap.Logger
    kubeClient     kubernetes.Interface
    service        LogService
    
    // Pod management
    podStreams     map[string]*PodLogStream  // pod -> stream management
    
    // Background workers
    cleanupWorker   *BackgroundWorker         // Cleanup dead streams
    reconcileWorker *BackgroundWorker         // Ensure all pods have streams
    statsWorker     *BackgroundWorker         // Periodic statistics logging
}
```

#### Stream Management:
- **Per-Pod Streams**: Individual log streams per pod container
- **Exponential Backoff**: Resilient restart behavior on stream failures
- **Lifecycle Management**: Automatic cleanup for terminated pods
- **Namespace Filtering**: Configurable inclusion/exclusion patterns

### 6. Pub/Sub System (`pubsub.go`)

High-performance in-process pub/sub for real-time log streaming to WebSocket clients.

```go
type Bus interface {
    Publish(e LogEntry)                                    // Broadcast to subscribers
    Subscribe(f LogFilter) (<-chan LogEntry, func())      // Create subscription
    SubscriberCount() int                                  // Active subscriber count
    CleanupStaleSubscriptions(maxAge time.Duration) int   // Remove idle subscriptions
}
```

#### Pub/Sub Features:
- **Non-Blocking Publishing**: Prevents slow subscribers from affecting ingestion
- **Buffer Management**: Configurable per-subscriber buffer sizes
- **Backpressure Protection**: Automatic dropping of messages for slow consumers
- **Subscription Cleanup**: Automatic removal of stale subscriptions

## Data Flow Architecture

### Ingestion Pipeline
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Kubernetes API  │    │  Log Collector   │    │ ServiceV3.Ingest│
│   (Pod Logs)    │───▶│   (Informer)     │───▶│   (Normalize)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Pub/Sub Bus   │◄───│   Ring Storage   │◄───│   Index Update  │
│  (Live Stream)  │    │ Global + Scoped  │    │  (Time/Fields)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Query Pipeline
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  HTTP Request   │    │  LogFilter       │    │  Query Planning │
│ (with filters)  │───▶│  (Normalized)    │───▶│ (Index Strategy)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  JSON Response  │◄───│ Result Filtering │◄───│ Ring.Query      │
│ (Log Entries)   │    │  (Text Search)   │    │(Index + Scan)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Streaming Pipeline
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ WebSocket Conn  │    │   Subscription   │    │   Filter Match  │
│  (Live Stream)  │◄───│  (Pub/Sub Bus)   │◄───│ (Real-time Log) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                                               ▲
         ▼                                               │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Backfill      │    │   Replay Query   │    │  New Log Entry  │
│ (Historical)    │◄───│ (Ring Storage)   │    │   (Ingested)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Usage Examples

### Basic Service Setup
```go
package main

import (
    "context"
    "github.com/example/kaptn/internal/logs"
    "github.com/example/kaptn/internal/config"
    "go.uber.org/zap"
)

func main() {
    logger := zap.NewProduction()
    
    // Create logs service configuration
    logsConfig := config.LogsServiceConfig{
        GlobalMaxEntries:             250000,
        GlobalMaxAge:                 time.Hour,
        ScopeMaxEntries:             20000,
        ScopeMaxAge:                 time.Hour,
        MaxSubscribers:              200,
        BufferSize:                  100,
        EvictionInterval:            30 * time.Second,
        CleanupInterval:             5 * time.Minute,
        BackgroundCollectionEnabled: true,
        BackgroundCollectionRetention: "1h",
    }
    
    // Create log service
    logService := logs.NewReliableService(logsConfig, logger)
    
    // Setup Kubernetes log collector
    if err := logService.SetupLogCollector(kubeClient, "production"); err != nil {
        log.Fatal("Failed to setup log collector:", err)
    }
    
    // Start the service
    ctx := context.Background()
    if err := logService.Start(ctx); err != nil {
        log.Fatal("Failed to start log service:", err)
    }
    
    // Graceful shutdown
    defer logService.Stop()
}
```

### Manual Log Ingestion
```go
// Ingest logs manually (e.g., from external sources)
func ingestLogs(logService logs.LogService) {
    entry := logs.LogEntry{
        TS:        time.Now(),
        Level:     "INFO",
        Cluster:   "production",
        Namespace: "default",
        Workload:  "nginx",
        Pod:       "nginx-deployment-abc123",
        Container: "nginx",
        Node:      "worker-node-1",
        Msg:       "Server started successfully",
        TraceID:   "trace-abc123",
        Labels: map[string]string{
            "version": "1.0",
            "env":     "production",
        },
    }
    
    logService.Ingest(entry)
}
```

### Log Querying
```go
// Query historical logs
func queryLogs(logService logs.LogService) {
    filter := logs.LogFilter{
        Since:     time.Now().Add(-time.Hour),
        Until:     time.Now(),
        Levels:    []string{"ERROR", "WARN"},
        Namespace: "production",
        Workload:  "api-server",
        Text:      "database",
        Limit:     1000,
        Direction: "backward",
    }
    
    entries := logService.Replay(filter)
    
    fmt.Printf("Found %d log entries\n", len(entries))
    for _, entry := range entries {
        fmt.Printf("[%s] %s: %s\n", 
            entry.TS.Format(time.RFC3339), 
            entry.Level, 
            entry.Msg)
    }
}
```

### Live Log Streaming
```go
// Stream live logs
func streamLogs(logService logs.LogService) {
    filter := logs.LogFilter{
        Namespace: "default",
        Pod:       "nginx-deployment-abc123",
        Levels:    []string{"ERROR", "WARN", "INFO"},
    }
    
    // Create subscription
    streamCh, cancelFn := logService.Stream(filter)
    defer cancelFn()
    
    // Process streaming logs
    go func() {
        for entry := range streamCh {
            fmt.Printf("LIVE [%s] %s/%s: %s\n",
                entry.TS.Format("15:04:05"),
                entry.Level,
                entry.Pod,
                entry.Msg)
        }
    }()
    
    // Keep streaming for 5 minutes
    time.Sleep(5 * time.Minute)
}
```

### HTTP Handler Integration
```go
// HTTP handler for log queries
func handleLogQuery(logService logs.LogService) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Parse query parameters
        since, _ := time.Parse(time.RFC3339, r.URL.Query().Get("since"))
        until, _ := time.Parse(time.RFC3339, r.URL.Query().Get("until"))
        namespace := r.URL.Query().Get("namespace")
        pod := r.URL.Query().Get("pod")
        level := r.URL.Query().Get("level")
        text := r.URL.Query().Get("text")
        limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
        
        if limit <= 0 {
            limit = 1000
        }
        
        // Build filter
        filter := logs.LogFilter{
            Since:     since,
            Until:     until,
            Namespace: namespace,
            Pod:       pod,
            Text:      text,
            Limit:     limit,
            Direction: "backward",
        }
        
        if level != "" {
            filter.Levels = []string{level}
        }
        
        // Query logs
        entries := logService.Replay(filter)
        
        // Return JSON response
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{
            "entries": entries,
            "count":   len(entries),
            "filter":  filter,
        })
    }
}
```

### WebSocket Streaming Handler
```go
// WebSocket handler for live log streaming
func handleLogStream(logService logs.LogService) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Upgrade to WebSocket
        conn, err := upgrader.Upgrade(w, r, nil)
        if err != nil {
            http.Error(w, "Failed to upgrade connection", http.StatusBadRequest)
            return
        }
        defer conn.Close()
        
        // Parse filter from query parameters
        filter := parseLogFilterFromQuery(r.URL.Query())
        
        // Create log stream
        streamCh, cancelFn := logService.Stream(filter)
        defer cancelFn()
        
        // Handle client disconnection
        ctx, cancel := context.WithCancel(r.Context())
        defer cancel()
        
        // Stream logs to WebSocket
        for {
            select {
            case entry, ok := <-streamCh:
                if !ok {
                    return
                }
                
                // Send log entry to client
                if err := conn.WriteJSON(entry); err != nil {
                    log.Printf("Failed to write to WebSocket: %v", err)
                    return
                }
                
            case <-ctx.Done():
                return
            }
        }
    }
}
```

## Advanced Features

### 1. Scoped Ring Optimization
```go
// Scoped rings provide optimized queries for specific contexts
func demonstrateScopedQueries() {
    // Namespace-scoped query (uses namespace ring)
    namespaceFilter := logs.LogFilter{
        Namespace: "production",
        Since:     time.Now().Add(-time.Hour),
        Until:     time.Now(),
    }
    
    // Workload-scoped query (uses workload ring)
    workloadFilter := logs.LogFilter{
        Namespace: "production",
        Workload:  "api-server",
        Since:     time.Now().Add(-30 * time.Minute),
        Until:     time.Now(),
    }
    
    // Pod-scoped query (uses pod ring)
    podFilter := logs.LogFilter{
        Namespace: "production",
        Workload:  "api-server",
        Pod:       "api-server-abc123",
        Since:     time.Now().Add(-15 * time.Minute),
        Until:     time.Now(),
    }
    
    // Service automatically selects the most efficient ring
}
```

### 2. Index-Driven Query Optimization
```go
// Query planning automatically optimizes based on selectivity
func demonstrateQueryOptimization() {
    // High selectivity query (uses index)
    specificFilter := logs.LogFilter{
        Levels:    []string{"ERROR"},           // Low cardinality
        Namespace: "production",                // Medium cardinality
        Pod:       "specific-pod-name",         // High cardinality
        Since:     time.Now().Add(-time.Hour),
        Until:     time.Now(),
    }
    
    // Low selectivity query (falls back to scan)
    broadFilter := logs.LogFilter{
        Text:  "database",                      // Requires full-text search
        Since: time.Now().Add(-24 * time.Hour),
        Until: time.Now(),
        Limit: 10000,
    }
    
    // Index system automatically chooses optimal strategy
}
```

### 3. Operational Monitoring
```go
// Monitor service health and performance
func monitorLogService(logService logs.LogService) {
    // Get service statistics
    stats := logService.Stats()
    
    fmt.Printf("Service Statistics:\n")
    fmt.Printf("- Uptime: %v\n", stats.Uptime)
    fmt.Printf("- Total Ingested: %d\n", stats.TotalIngested)
    fmt.Printf("- Current Ring Size: %d\n", stats.CurrentRingSize)
    fmt.Printf("- Active Subscribers: %d\n", stats.ActiveSubscribers)
    fmt.Printf("- Query Rate: %.2f/sec\n", stats.QueryRate)
    fmt.Printf("- Ingest Rate: %.2f/sec\n", stats.IngestRate)
    
    // Check health status
    health := logService.Health()
    fmt.Printf("Health Status: %s\n", health.Status)
    if health.Status != "healthy" {
        fmt.Printf("Health Issues: %v\n", health.Issues)
    }
    
    // Export metrics to Prometheus
    promMetrics := logService.PrometheusMetrics()
    // Register with Prometheus registry
}
```

## Configuration

### Service Configuration
```go
type LogsServiceConfig struct {
    // Global ring configuration
    GlobalMaxEntries int           // Maximum entries in global ring
    GlobalMaxAge     time.Duration // TTL for global ring entries
    
    // Scoped ring configuration
    ScopeMaxEntries int           // Maximum entries per scoped ring
    ScopeMaxAge     time.Duration // TTL for scoped ring entries
    
    // Pub/sub configuration
    MaxSubscribers int // Maximum WebSocket subscribers
    BufferSize     int // Buffer size per subscriber
    
    // Cleanup intervals
    EvictionInterval time.Duration // How often to evict expired entries
    CleanupInterval  time.Duration // How often to cleanup empty rings
    
    // Background collection
    BackgroundCollectionEnabled   bool          // Enable Kubernetes log collection
    BackgroundCollectionRetention string        // Collection retention period
    BackgroundCollectionMode      string        // "stream" or "poll"
    BackgroundCollectionPollInterval time.Duration // Poll interval for poll mode
    BackgroundCollectionTailLines    int        // Tail lines for initial collection
    MaxLogLineBytes                  int        // Maximum bytes per log line
    InformerResync                   time.Duration // Informer resync period
    
    // Operational limits
    MaxStreamsPerUser     int           // Maximum streams per user
    MaxQueryLimit         int           // Maximum results per query
    MaxExportSize         int64         // Maximum export size in bytes
    MaxConcurrentQueries  int           // Maximum concurrent queries
    RateLimitPerSecond    int           // Rate limit per second
    BackpressureThreshold int           // Backpressure threshold percentage
    DegradedModeTimeout   time.Duration // Timeout for degraded mode
}
```

### Environment Variables
```bash
# Basic configuration
KAPTN_LOGS_TTL=1h                              # Log entry TTL
KAPTN_LOGS_MAX_GLOBAL=250000                   # Global ring capacity
KAPTN_LOGS_MAX_PER_SCOPE=20000                 # Scoped ring capacity
KAPTN_LOGS_MAX_SUBSCRIBERS=200                 # Max WebSocket subscribers
KAPTN_LOGS_BUFFER_SIZE=100                     # Per-subscriber buffer size

# Background collection
KAPTN_LOGS_BACKGROUND_COLLECTION_ENABLED=true
KAPTN_LOGS_BACKGROUND_COLLECTION_RETENTION=1h
KAPTN_LOGS_BACKGROUND_COLLECTION_MODE=stream   # "stream" or "poll"
KAPTN_LOGS_BACKGROUND_COLLECTION_POLL_INTERVAL=10s
KAPTN_LOGS_BACKGROUND_COLLECTION_TAIL_LINES=100

# Performance limits
KAPTN_LOGS_MAX_STREAMS_PER_USER=50
KAPTN_LOGS_MAX_QUERY_LIMIT=10000
KAPTN_LOGS_MAX_EXPORT_SIZE=104857600           # 100MB
KAPTN_LOGS_MAX_CONCURRENT_QUERIES=20
KAPTN_LOGS_RATE_LIMIT_PER_SECOND=1000
KAPTN_LOGS_BACKPRESSURE_THRESHOLD=80
KAPTN_LOGS_DEGRADED_MODE_TIMEOUT=5m

# Operational settings
KAPTN_LOGS_EVICTION_INTERVAL=30s
KAPTN_LOGS_CLEANUP_INTERVAL=5m
KAPTN_LOGS_MAX_LOG_LINE_BYTES=262144           # 256KB
```

## Performance Characteristics

### Memory Usage
- **Global Ring**: ~250K entries × ~200 bytes = ~50MB typical
- **Scoped Rings**: ~20K entries × 10 scopes × ~200 bytes = ~40MB typical
- **Index Overhead**: ~10-20% of ring size for indexes
- **Total Memory**: ~100-150MB for typical workload

### Query Performance
- **Index Queries**: Sub-millisecond for specific filters
- **Time Range Queries**: Milliseconds for hour-long ranges
- **Full-Text Search**: Linear scan, scales with data size
- **Scoped Queries**: 10-100x faster than global queries

### Ingestion Performance
- **Peak Ingestion**: 10,000+ logs/second sustainable
- **Concurrent Pods**: Designed for 50+ active pods
- **Stream Management**: Automatic backoff and recovery
- **Memory Bounded**: Automatic eviction prevents memory growth

## Monitoring & Observability

### Prometheus Metrics
```go
// Core metrics exposed
logs_total_ingested_counter           // Total logs ingested
logs_current_ring_size_gauge          // Current entries in rings
logs_active_subscribers_gauge         // Active WebSocket subscribers
logs_query_duration_histogram         // Query execution time
logs_ingest_rate_gauge               // Current ingestion rate
logs_eviction_total_counter          // Total evictions performed
logs_collection_errors_counter       // Collection error count
logs_backpressure_drops_counter      // Messages dropped due to backpressure
```

### Health Monitoring
```go
type HealthStatus struct {
    Status     string    // "healthy", "warning", "unhealthy"
    Issues     []string  // List of health issues
    LastCheck  time.Time // Last health check time
    Collectors struct {
        Active      int     // Active collectors
        ErrorRate   float64 // Error rate percentage
        Throughput  float64 // Logs per second
    }
    Memory struct {
        GlobalRingSize int     // Current global ring size
        ScopedRings    int     // Number of scoped rings
        IndexSize      int     // Index memory usage
        Utilization    float64 // Memory utilization percentage
    }
}
```

### Operational Logging
```json
{
    "level": "info",
    "timestamp": "2025-09-29T10:30:00Z",
    "message": "log_collector_stream_started",
    "pod": "nginx-deployment-abc123",
    "namespace": "default",
    "container": "nginx",
    "stream_mode": "follow",
    "retry_count": 0
}

{
    "level": "warn",
    "timestamp": "2025-09-29T10:30:30Z",
    "message": "log_subscriber_backpressure_drop",
    "subscriber_id": "ws-client-456",
    "dropped_count": 15,
    "buffer_utilization": 0.95
}

{
    "level": "info",
    "timestamp": "2025-09-29T10:31:00Z",
    "message": "log_ring_eviction_completed",
    "evicted_count": 1250,
    "global_ring_size": 248750,
    "eviction_duration_ms": 45
}
```

## Testing

### Unit Testing
```go
func TestLogService(t *testing.T) {
    logger := zaptest.NewLogger(t)
    config := logs.DefaultTestConfig()
    
    service := logs.NewServiceV3(config, logger)
    
    // Test ingestion
    entry := logs.LogEntry{
        TS:        time.Now(),
        Level:     "INFO",
        Namespace: "default",
        Pod:       "test-pod",
        Msg:       "Test message",
    }
    
    service.Ingest(entry)
    
    // Test query
    filter := logs.LogFilter{
        Since:     time.Now().Add(-time.Minute),
        Until:     time.Now(),
        Namespace: "default",
    }
    
    results := service.Replay(filter)
    assert.Len(t, results, 1)
    assert.Equal(t, "Test message", results[0].Msg)
}
```

### Integration Testing
```go
func TestCollectorIntegration(t *testing.T) {
    // Create fake Kubernetes client with test pods
    client := fake.NewSimpleClientset()
    
    // Create test pod
    pod := &corev1.Pod{
        ObjectMeta: metav1.ObjectMeta{
            Name:      "test-pod",
            Namespace: "default",
        },
        Status: corev1.PodStatus{
            Phase: corev1.PodRunning,
        },
    }
    client.CoreV1().Pods("default").Create(context.Background(), pod, metav1.CreateOptions{})
    
    // Setup log service with collector
    config := logs.DefaultTestConfig()
    config.BackgroundCollectionEnabled = true
    
    service := logs.NewServiceV3(config, logger)
    err := service.SetupLogCollector(client, "test-cluster")
    assert.NoError(t, err)
    
    // Start service and test collection
    ctx := context.Background()
    err = service.Start(ctx)
    assert.NoError(t, err)
    defer service.Stop()
    
    // Wait for collection to begin
    time.Sleep(100 * time.Millisecond)
    
    stats := service.Stats()
    assert.True(t, stats.TotalIngested >= 0)
}
```

### Performance Testing
```go
func BenchmarkLogIngestion(b *testing.B) {
    logger := zap.NewNop()
    config := logs.DefaultTestConfig()
    service := logs.NewServiceV3(config, logger)
    
    entry := logs.LogEntry{
        TS:        time.Now(),
        Level:     "INFO",
        Namespace: "default",
        Pod:       "bench-pod",
        Msg:       "Benchmark message",
    }
    
    b.ResetTimer()
    b.RunParallel(func(pb *testing.PB) {
        for pb.Next() {
            service.Ingest(entry)
        }
    })
}

func BenchmarkLogQuery(b *testing.B) {
    service := setupBenchmarkService(b)
    
    filter := logs.LogFilter{
        Since:     time.Now().Add(-time.Hour),
        Until:     time.Now(),
        Namespace: "default",
        Limit:     1000,
    }
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _ = service.Replay(filter)
    }
}
```

## Security Considerations

### Data Protection
- **In-Memory Only**: No persistent storage of sensitive log data
- **TTL-Based Eviction**: Automatic cleanup of aged data
- **Namespace Isolation**: Scoped rings provide natural tenant isolation
- **Memory Bounds**: Configured limits prevent memory exhaustion

### Access Control
- **WebSocket Security**: Integration with authentication middleware
- **Query Filtering**: Namespace and workload-based access control
- **Rate Limiting**: Per-user limits prevent abuse
- **Audit Logging**: Comprehensive operational audit trail

### Performance Security
- **Backpressure Protection**: Prevents slow clients from affecting service
- **Resource Limits**: Bounded memory and CPU usage
- **Graceful Degradation**: Service remains functional under load
- **Error Isolation**: Individual stream failures don't affect others

## Best Practices

### Configuration Best Practices
- **Ring Sizing**: Size rings based on expected log volume and retention needs
- **TTL Settings**: Balance between data availability and memory usage
- **Buffer Sizing**: Configure subscriber buffers based on client capabilities
- **Collection Mode**: Use "stream" for real-time, "poll" for reduced API load

### Performance Best Practices
- **Query Optimization**: Use specific filters to leverage indexes
- **Scoped Queries**: Query specific namespaces/workloads when possible
- **Stream Management**: Monitor and limit concurrent stream connections
- **Memory Monitoring**: Regular monitoring of ring utilization

### Operational Best Practices
- **Health Monitoring**: Regular health checks and alerting
- **Metrics Collection**: Comprehensive Prometheus metrics monitoring
- **Graceful Shutdown**: Proper service lifecycle management
- **Error Handling**: Robust error handling and recovery mechanisms

## Future Enhancements

### Planned Features
- **Multi-Cluster Support**: Aggregation across multiple Kubernetes clusters
- **Advanced Filtering**: More sophisticated query capabilities
- **Compression**: Log compression for improved memory efficiency
- **Sampling**: Intelligent log sampling for high-volume environments

### Extensibility Points
- **Custom Collectors**: Pluggable log collection sources
- **Storage Backends**: Optional persistent storage integration
- **Export Formats**: Additional export formats (Elasticsearch, S3)
- **Custom Indexing**: User-defined index fields and strategies

## Dependencies

### External Dependencies
- `k8s.io/client-go` - Kubernetes client library for log collection
- `go.uber.org/zap` - Structured logging
- Standard library packages: `context`, `sync`, `time`, `fmt`

### Internal Dependencies
- `internal/config` - Configuration management
- No other internal package dependencies (standalone package)

This documentation provides comprehensive coverage of the logs package, serving as both a developer guide for extending log functionality and an operational reference for deploying and maintaining Kaptn's log management system. The package represents a sophisticated, enterprise-grade logging solution designed for high-performance Kubernetes environments.