# Timeseries Package Documentation

## Overview

The `internal/timeseries` package provides an in-memory time series storage system designed for high-performance collection, storage, and real-time streaming of Kubernetes metrics. It implements a dual-resolution ring buffer architecture with health monitoring, resource limits, and optimized memory usage for the Kaptn dashboard's metrics pipeline.

## Package Architecture

```
internal/timeseries/
├── store.go                       # In-memory time series store interface and implementation
├── series.go                      # Dual-resolution ring buffer series implementation
├── point.go                       # Time series data point structure
├── config.go                      # Configuration and resolution definitions
├── health.go                      # Health monitoring and resource limits
├── keys.go                        # Series key generation utilities
└── aggregator/
    └── aggregator.go             # Cluster metrics aggregation engine
```

## Core Components

### 1. Store Interface (`store.go`)

Central storage interface for managing time series collections.

```go
type Store interface {
    Upsert(key string) *Series          // Create or retrieve series
    Get(key string) (*Series, bool)     // Retrieve existing series
    Delete(key string) bool             // Remove series
    Keys() []string                     // List all series keys
    Prune()                             // Remove old data
}

type MemStore struct {
    mu     sync.RWMutex               // Concurrent access protection
    series map[string]*Series        // Series storage
    config Config                    // Store configuration
    health *HealthMetrics           // Health monitoring
}
```

#### Key Features:
- **Thread-Safe Operations**: RWMutex for concurrent read/write access
- **Health Integration**: Resource limit enforcement and monitoring
- **Automatic Pruning**: Configurable data retention policies
- **Graceful Degradation**: Series creation rejection when limits exceeded

### 2. Dual-Resolution Series (`series.go`)

Advanced ring buffer implementation with high and low resolution storage.

```go
type Series struct {
    mu     sync.RWMutex
    config Config
    health *HealthMetrics
    
    // High resolution ring buffer (1-second data)
    hi     []Point
    headHi int
    fullHi bool
    
    // Low resolution ring buffer (5-second downsampled data)
    lo     []Point
    headLo int
    fullLo bool
    
    // Downsampling state
    lastBin  time.Time
    binSum   float64
    binCount int
}
```

#### Ring Buffer Design:
```
High Resolution (Hi):
┌─────┬─────┬─────┬─────┬─────┬─────┐
│ P₁  │ P₂  │ P₃  │ P₄  │ P₅  │ P₆  │ → 1s intervals
└─────┴─────┴─────┴─────┴─────┴─────┘
         ↑ head                      ↑ oldest when full

Low Resolution (Lo):
┌─────┬─────┬─────┬─────┐
│ B₁  │ B₂  │ B₃  │ B₄  │ → 5s averaged bins
└─────┴─────┴─────┴─────┘
   ↑ head            ↑ oldest when full
```

#### Resolution Types:
```go
type Resolution int

const (
    Hi Resolution = iota    // High resolution (1 second)
    Lo                     // Low resolution (5 second bins)
)
```

### 3. Data Points (`point.go`)

Time series data point structure with entity metadata.

```go
type Point struct {
    T      time.Time         `json:"t"`                // Timestamp
    V      float64           `json:"v"`                // Value
    Entity map[string]string `json:"entity,omitempty"` // Entity metadata
}
```

#### Entity Metadata Examples:
```go
// Node-level metrics
nodeEntity := map[string]string{
    "node": "worker-node-1",
}

// Pod-level metrics
podEntity := map[string]string{
    "namespace": "default",
    "pod":       "web-server-abc123",
}

// Container-level metrics
containerEntity := map[string]string{
    "namespace": "default",
    "pod":       "web-server-abc123",
    "container": "nginx",
}
```

### 4. Configuration (`config.go`)

Comprehensive configuration for time series behavior.

```go
type Config struct {
    // Data retention
    MaxWindow time.Duration        // Maximum time window (60 minutes)
    
    // High resolution settings
    HiResStep   time.Duration      // Step size (1 second)
    HiResPoints int               // Maximum points (3600)
    
    // Low resolution settings  
    LoResStep   time.Duration      // Step size (5 seconds)
    LoResPoints int               // Maximum points (720)
    
    // Resource limits
    MaxSeries          int         // Maximum series (1000)
    MaxPointsPerSeries int         // Maximum points per series (10000)
    MaxWSClients       int         // Maximum WebSocket clients (500)
}
```

### 5. Health Monitoring (`health.go`)

Comprehensive health tracking and resource management.

```go
type HealthMetrics struct {
    // Current state
    seriesCount       int64    // Active series count
    totalPointsAdded  int64    // Lifetime points added
    pointsAddedPerSec int64    // Current rate
    wsClientCount     int64    // Connected WebSocket clients
    
    // Error tracking
    errorCount        int64    // Total errors
    droppedPoints     int64    // Points dropped due to limits
    droppedWSMessages int64    // WebSocket messages dropped
    
    // Resource limits
    maxSeriesCount     int     // Series limit
    maxPointsPerSeries int     // Points per series limit
    maxWSClients       int     // WebSocket client limit
}
```

#### Health Status Determination:
```go
func (s HealthSnapshot) IsHealthy() bool {
    // Approaching series limit (>90%)
    if float64(s.SeriesCount)/float64(s.MaxSeriesCount) > 0.9 {
        return false
    }
    
    // Approaching WebSocket limit (>90%)
    if float64(s.WSClientCount)/float64(s.MaxWSClients) > 0.9 {
        return false
    }
    
    // High drop rate (>10%)
    if s.ErrorCount > 0 && float64(s.DroppedPoints)/float64(s.TotalPointsAdded) > 0.1 {
        return false
    }
    
    return true
}
```

## Aggregator Engine (`aggregator/aggregator.go`)

Sophisticated metrics collection engine that aggregates Kubernetes cluster metrics into time series.

### Architecture Overview

```go
type Aggregator struct {
    logger     *zap.Logger
    store      timeseries.Store
    kubeClient kubernetes.Interface
    
    // Specialized adapters
    nodesAdapter      *kubemetrics.NodesAdapter       // Node capacity/info
    apiMetricsAdapter *kubemetrics.APIMetricsAdapter  // metrics.k8s.io API
    summaryAdapter    *kubemetrics.SummaryStatsAdapter // Summary API
    componentAdapter  *kubemetrics.ComponentMetricsAdapter // Prometheus
    
    // State tracking
    hostSnapshots       map[string]*hostSnap          // Node state snapshots
    nsRestartsState     map[string]*nsRestartState    // Namespace restart tracking
    
    // Polling intervals for performance optimization
    lastResourcePoll    time.Time    // Rate-limited resource collection
    lastSummaryPoll     time.Time    // Rate-limited summary API calls
    lastStateRecon      time.Time    // Rate-limited state reconciliation
    lastComponentPoll   time.Time    // Rate-limited component metrics
}
```

### Collection Strategy

#### 1. Multi-Tier Collection:
```go
// Different collection frequencies for different metric types
ResourcePollInterval:    5 seconds   // CPU, memory, requests/limits
SummaryPollInterval:     10 seconds  // Network, filesystem
StateReconcileInterval:  10 seconds  // Pod/node counts, conditions
ComponentPollInterval:   15 seconds  // API server, scheduler metrics
```

#### 2. Rate-Limited Collection:
```go
func (a *Aggregator) tick(ctx context.Context) {
    now := time.Now()
    
    // Gate expensive operations based on intervals
    if now.Sub(a.lastResourcePoll) >= a.config.ResourcePollInterval {
        a.collectCPUMetrics(ctx, now)
        a.collectMemoryUsageMetrics(ctx, now)
        a.collectResourceRequests(ctx, now)
        a.lastResourcePoll = now
    }
    
    if now.Sub(a.lastSummaryPoll) >= a.config.SummaryPollInterval {
        a.collectNetworkMetrics(ctx, now)
        a.collectNodeFilesystemMetrics(ctx, now)
        a.lastSummaryPoll = now
    }
}
```

#### 3. Capability Detection:
```go
// Check API availability at startup
hasMetricsAPI := a.apiMetricsAdapter.HasMetricsAPI(ctx)
hasSummaryAPI := a.summaryAdapter.HasSummaryAPI(ctx)

// Graceful degradation when APIs unavailable
if !hasMetricsAPI {
    // Use placeholder values or skip collection
    return
}
```

### Metrics Categories

#### Cluster-Level Metrics:
- **CPU**: `cluster.cpu.capacity.cores`, `cluster.cpu.used.cores`, `cluster.cpu.requested.cores`
- **Memory**: `cluster.mem.capacity.bytes`, `cluster.mem.used.bytes`, `cluster.mem.requested.bytes`
- **Network**: `cluster.net.rx.bps`, `cluster.net.tx.bps`
- **Pods**: `cluster.pods.running`, `cluster.pods.pending`, `cluster.pods.failed`
- **Nodes**: `cluster.nodes.count`, `cluster.nodes.ready`, `cluster.nodes.not_ready`

#### Node-Level Metrics:
- **CPU**: `node.cpu.usage.<node>`, `node.cpu.capacity.<node>`
- **Memory**: `node.mem.usage.<node>`, `node.mem.capacity.<node>`
- **Network**: `node.net.rx.<node>`, `node.net.tx.<node>`, `node.net.rx.pps.<node>`
- **Filesystem**: `node.fs.capacity.<node>`, `node.fs.used.<node>`, `node.fs.used.percent.<node>`
- **Conditions**: `node.condition.ready.<node>`, `node.condition.disk_pressure.<node>`

#### Pod-Level Metrics:
- **Resources**: `pod.cpu.usage.<ns>.<pod>`, `pod.mem.usage.<ns>.<pod>`
- **Requests/Limits**: `pod.cpu.request.<ns>.<pod>`, `pod.cpu.limit.<ns>.<pod>`
- **Network**: `pod.net.rx.<ns>.<pod>`, `pod.net.tx.<ns>.<pod>`
- **Restarts**: `pod.restarts.total.<ns>.<pod>`, `pod.restarts.rate.<ns>.<pod>`

#### Container-Level Metrics:
- **Resources**: `container.cpu.usage.<ns>.<pod>.<container>`
- **Filesystem**: `container.rootfs.used.<ns>.<pod>.<container>`

### State Management

#### Host Snapshots:
```go
type hostSnap struct {
    Cores        float64   // CPU capacity
    CPUUsedCores float64   // Current CPU usage
    
    // Network counters (monotonic)
    LastRx        uint64    // Previous received bytes
    LastTx        uint64    // Previous transmitted bytes
    LastRxPackets uint64    // Previous received packets
    LastTxPackets uint64    // Previous transmitted packets
    LastTs        time.Time // Last measurement timestamp
}
```

#### Rate Calculation:
```go
// Calculate network rate from monotonic counters
if stat.RxBytes >= snap.LastRx {
    rxRate := float64(stat.RxBytes-snap.LastRx) / dt
    totalRxRate += rxRate
    
    nodeRxSeries := a.store.Upsert(generateNodeSeriesKey("node.net.rx", nodeName))
    nodeRxSeries.Add(NewPointWithEntity(now, rxRate, nodeEntity))
}
```

## Usage Examples

### Basic Store Operations
```go
package main

import (
    "time"
    "github.com/example/kaptn/internal/timeseries"
)

func main() {
    // Create store with default configuration
    config := timeseries.DefaultConfig()
    store := timeseries.NewMemStore(config)
    
    // Create or retrieve a series
    series := store.Upsert("cluster.cpu.used.cores")
    if series != nil {
        // Add data points
        now := time.Now()
        series.Add(timeseries.NewPoint(now, 2.5))
        series.Add(timeseries.NewPoint(now.Add(time.Second), 2.7))
    }
    
    // Retrieve data
    if series, exists := store.Get("cluster.cpu.used.cores"); exists {
        // Get all high-resolution data
        points := series.GetAll(timeseries.Hi)
        for _, point := range points {
            fmt.Printf("Time: %v, Value: %.2f\n", point.T, point.V)
        }
        
        // Get data since specific time
        since := time.Now().Add(-5 * time.Minute)
        recentPoints := series.GetSince(since, timeseries.Hi)
    }
    
    // Background pruning
    store.Prune()
}
```

### Aggregator Setup
```go
func setupAggregator() *aggregator.Aggregator {
    logger := zap.NewProduction()
    
    // Create time series store
    config := timeseries.DefaultConfig()
    store := timeseries.NewMemStore(config)
    
    // Create Kubernetes clients
    kubeClient := kubernetes.NewForConfigOrDie(restConfig)
    metricsClient := metricsv1beta1.NewForConfigOrDie(restConfig)
    
    // Create aggregator
    aggConfig := aggregator.DefaultConfig()
    agg := aggregator.NewAggregator(
        logger,
        store,
        kubeClient,
        metricsClient,
        restConfig,
        prometheusClient,
        aggConfig,
    )
    
    // Start collection
    ctx := context.Background()
    agg.Start(ctx)
    
    return agg
}
```

### Custom Series with Entity Metadata
```go
func collectPodMetrics(store timeseries.Store) {
    now := time.Now()
    
    // Pod CPU usage with metadata
    podEntity := map[string]string{
        "namespace": "default",
        "pod":       "web-server-abc123",
    }
    
    seriesKey := "pod.cpu.usage.default.web-server-abc123"
    series := store.Upsert(seriesKey)
    if series != nil {
        point := timeseries.NewPointWithEntity(now, 0.25, podEntity)
        series.Add(point)
    }
}
```

### Health Monitoring
```go
func monitorHealth(store *timeseries.MemStore) {
    health := store.GetHealth()
    snapshot := health.GetSnapshot()
    
    fmt.Printf("Series Count: %d/%d\n", 
        snapshot.SeriesCount, snapshot.MaxSeriesCount)
    fmt.Printf("Points/Second: %d\n", snapshot.PointsAddedPerSec)
    fmt.Printf("WebSocket Clients: %d/%d\n", 
        snapshot.WSClientCount, snapshot.MaxWSClients)
    fmt.Printf("Health Status: %s\n", snapshot.GetStatus())
    
    if !snapshot.IsHealthy() {
        // Take corrective action
        log.Warn("Time series system unhealthy")
    }
}
```

## Series Key Generation

### Key Patterns

The package uses consistent key generation patterns for different metric types:

#### Cluster Metrics:
```go
const (
    ClusterCPUUsedCores     = "cluster.cpu.used.cores"
    ClusterMemUsedBytes     = "cluster.mem.used.bytes"
    ClusterNetRxBps         = "cluster.net.rx.bps"
    ClusterPodsRunning      = "cluster.pods.running"
)
```

#### Node Metrics:
```go
func GenerateNodeSeriesKey(base, nodeName string) string {
    return fmt.Sprintf("%s.%s", base, nodeName)
}

// Examples:
// "node.cpu.usage.worker-1"
// "node.mem.usage.worker-1"
// "node.net.rx.worker-1"
```

#### Pod Metrics:
```go
func GeneratePodSeriesKey(base, namespace, podName string) string {
    return fmt.Sprintf("%s.%s.%s", base, namespace, podName)
}

// Examples:
// "pod.cpu.usage.default.web-server"
// "pod.mem.usage.kube-system.coredns"
```

#### Container Metrics:
```go
func GenerateContainerSeriesKey(base, namespace, podName, containerName string) string {
    return fmt.Sprintf("%s.%s.%s.%s", base, namespace, podName, containerName)
}

// Examples:
// "container.cpu.usage.default.web-server.nginx"
// "container.mem.usage.kube-system.coredns.coredns"
```

## Performance Optimization

### 1. Memory Management

#### Ring Buffer Efficiency:
```go
// Pre-allocated ring buffers minimize garbage collection
hi := make([]Point, config.HiResPoints)  // 3600 points pre-allocated
lo := make([]Point, config.LoResPoints)  // 720 points pre-allocated

// Circular buffer reuses memory
s.hi[s.headHi] = point
s.headHi = (s.headHi + 1) % len(s.hi)
```

#### Resource Limits:
```go
// Prevent memory exhaustion
if !h.CheckSeriesLimit() {
    h.RecordError()
    return nil  // Reject series creation
}

if !h.CheckPointsLimit(currentPoints) {
    h.RecordDroppedPoint()
    return  // Drop the point
}
```

### 2. Concurrent Access

#### Read-Write Locks:
```go
// Store-level RWMutex for series management
func (m *MemStore) Get(key string) (*Series, bool) {
    m.mu.RLock()
    defer m.mu.RUnlock()
    
    series, exists := m.series[key]
    return series, exists
}

// Series-level RWMutex for point operations
func (s *Series) Add(p Point) {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    s.addToHi(p)
    s.addToLo(p)
}
```

### 3. Collection Optimization

#### Rate-Limited Polling:
```go
// Avoid expensive API calls on every tick
type Config struct {
    ResourcePollInterval   time.Duration  // 5s - CPU, memory
    SummaryPollInterval    time.Duration  // 10s - Network, filesystem
    StateReconcileInterval time.Duration  // 10s - Pod counts
    ComponentPollInterval  time.Duration  // 15s - Prometheus metrics
}
```

#### Capability Detection:
```go
// Check API availability once at startup
hasMetricsAPI := a.apiMetricsAdapter.HasMetricsAPI(ctx)
hasSummaryAPI := a.summaryAdapter.HasSummaryAPI(ctx)

// Skip collection if APIs unavailable
if !hasMetricsAPI {
    return  // Graceful degradation
}
```

## Data Flow Architecture

### 1. Collection Pipeline

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Kubernetes    │    │    Aggregator    │    │   Time Series   │
│      APIs       │───▶│    Collection    │───▶│     Store       │
│ (metrics.k8s.io)│    │     Engine       │    │  (Ring Buffers) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Summary API   │    │   Rate Limiting  │    │   WebSocket     │
│ (/stats/summary)│    │  & Performance   │    │   Broadcasting  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Prometheus    │    │  Health & Error  │    │   Frontend      │
│   (Components)  │    │    Tracking      │    │   Dashboard     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 2. Data Transformation

```go
// Raw Kubernetes metrics → Time series points
kubePodMetrics := metricsClient.ListPodMetrics()
for _, podMetric := range kubePodMetrics {
    // Extract CPU usage
    cpuUsage := extractCPUFromPodMetric(podMetric)
    
    // Create time series point with entity metadata
    point := timeseries.NewPointWithEntity(
        time.Now(),
        cpuUsage,
        map[string]string{
            "namespace": podMetric.Namespace,
            "pod":       podMetric.Name,
        },
    )
    
    // Store in appropriate series
    seriesKey := fmt.Sprintf("pod.cpu.usage.%s.%s", 
        podMetric.Namespace, podMetric.Name)
    series := store.Upsert(seriesKey)
    series.Add(point)
}
```

### 3. Downsampling Algorithm

```go
// Automatic downsampling from high to low resolution
func (s *Series) addToLo(p Point) {
    binStart := p.T.Truncate(s.config.LoResStep)  // 5-second bins
    
    if binStart.Equal(s.lastBin) {
        // Same bin - accumulate
        s.binSum += p.V
        s.binCount++
    } else {
        // New bin - finalize previous
        if s.binCount > 0 {
            avgValue := s.binSum / float64(s.binCount)
            binPoint := Point{T: s.lastBin, V: avgValue}
            
            // Store averaged point in low-res buffer
            s.lo[s.headLo] = binPoint
            s.headLo = (s.headLo + 1) % len(s.lo)
        }
        
        // Start new bin
        s.lastBin = binStart
        s.binSum = p.V
        s.binCount = 1
    }
}
```

## Configuration

### Store Configuration
```go
// Environment variables
KAPTN_TIMESERIES_MAX_WINDOW=60m        // Data retention window
KAPTN_TIMESERIES_HI_RES_POINTS=3600    // High-res buffer size
KAPTN_TIMESERIES_LO_RES_POINTS=720     // Low-res buffer size
KAPTN_TIMESERIES_MAX_SERIES=1000       // Series limit
KAPTN_TIMESERIES_MAX_POINTS_PER_SERIES=10000  // Points per series limit
```

### Aggregator Configuration
```go
// Collection intervals
KAPTN_AGGREGATOR_TICK_INTERVAL=1s      // Main loop interval
KAPTN_AGGREGATOR_RESOURCE_POLL=5s      // Resource metrics
KAPTN_AGGREGATOR_SUMMARY_POLL=10s      // Summary API metrics
KAPTN_AGGREGATOR_STATE_RECONCILE=10s   // State reconciliation
KAPTN_AGGREGATOR_COMPONENT_POLL=15s    // Component metrics

// Feature toggles
KAPTN_AGGREGATOR_ENABLED=true          // Enable aggregation
KAPTN_AGGREGATOR_DISABLE_NETWORK_IF_UNAVAILABLE=true  // Graceful degradation
```

## Testing

### Unit Testing
```go
func TestSeriesAddAndRetrieve(t *testing.T) {
    config := DefaultConfig()
    series := NewSeries(config)
    
    now := time.Now()
    point := NewPoint(now, 42.0)
    series.Add(point)
    
    points := series.GetAll(Hi)
    assert.Len(t, points, 1)
    assert.Equal(t, 42.0, points[0].V)
}

func TestStoreResourceLimits(t *testing.T) {
    config := DefaultConfig()
    config.MaxSeries = 2
    
    store := NewMemStore(config)
    
    // Should succeed
    series1 := store.Upsert("test.series.1")
    assert.NotNil(t, series1)
    
    series2 := store.Upsert("test.series.2")
    assert.NotNil(t, series2)
    
    // Should fail due to limit
    series3 := store.Upsert("test.series.3")
    assert.Nil(t, series3)
}
```

### Integration Testing
```go
func TestAggregatorIntegration(t *testing.T) {
    // Setup test Kubernetes client
    kubeClient := fake.NewSimpleClientset()
    
    // Create nodes and pods
    node := &corev1.Node{
        ObjectMeta: metav1.ObjectMeta{Name: "test-node"},
        Status: corev1.NodeStatus{
            Capacity: corev1.ResourceList{
                corev1.ResourceCPU:    resource.MustParse("4"),
                corev1.ResourceMemory: resource.MustParse("8Gi"),
            },
        },
    }
    kubeClient.CoreV1().Nodes().Create(context.TODO(), node, metav1.CreateOptions{})
    
    // Create aggregator
    store := NewMemStore(DefaultConfig())
    agg := NewAggregator(logger, store, kubeClient, nil, nil, nil, DefaultConfig())
    
    // Run collection
    ctx := context.Background()
    agg.Start(ctx)
    defer agg.Stop()
    
    // Wait for collection
    time.Sleep(2 * time.Second)
    
    // Verify metrics were collected
    cpuSeries, exists := store.Get("cluster.cpu.capacity.cores")
    assert.True(t, exists)
    assert.NotNil(t, cpuSeries)
    
    points := cpuSeries.GetAll(Hi)
    assert.NotEmpty(t, points)
}
```

## Security Considerations

### Resource Protection
- **Memory Limits**: Configurable limits prevent memory exhaustion
- **Series Limits**: Maximum series count prevents unbounded growth
- **Point Limits**: Per-series point limits prevent individual series abuse
- **WebSocket Limits**: Client connection limits prevent connection exhaustion

### Data Isolation
- **Entity Metadata**: Proper namespace/resource identification
- **Access Control**: Integration with authorization system
- **Data Retention**: Automatic pruning prevents indefinite storage

## Best Practices

### Performance
- **Use Appropriate Resolution**: High-res for recent data, low-res for historical
- **Monitor Health Metrics**: Track resource usage and error rates
- **Configure Limits**: Set appropriate resource limits for your environment
- **Regular Pruning**: Ensure background pruning is enabled

### Development
- **Entity Consistency**: Use consistent entity metadata across related metrics
- **Key Naming**: Follow established key naming conventions
- **Error Handling**: Always check for nil series (rejected due to limits)
- **Testing**: Include resource limit testing in your test suites

## Future Enhancements

### Planned Features
- **Compression**: Point compression for better memory efficiency
- **Persistence**: Optional disk-based persistence layer
- **Clustering**: Multi-instance time series clustering
- **Custom Aggregations**: User-defined aggregation functions

### Extensibility Points
- **Custom Adapters**: Pluggable metric collection adapters
- **Storage Backends**: Alternative storage implementations
- **Resolution Strategies**: Configurable downsampling strategies
- **Export Formats**: Multiple data export formats

## Dependencies

### External Dependencies
- `k8s.io/client-go` - Kubernetes client libraries
- `k8s.io/metrics` - Kubernetes metrics APIs
- `go.uber.org/zap` - Structured logging
- Standard library (`sync`, `time`, `context`)

### Internal Dependencies
- `internal/analytics` - Prometheus client integration
- `internal/metrics` - Prometheus metrics recording
- `internal/kube/metrics` - Kubernetes metrics adapters

This documentation provides comprehensive coverage of the timeseries package, serving as both a developer guide for extending time series functionality and an operational reference for configuring and monitoring Kaptn's metrics infrastructure.