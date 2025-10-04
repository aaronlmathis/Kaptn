# Cache Package Documentation

## Overview

The `internal/cache` package provides a high-performance, in-memory caching system for Kubernetes resources to enable fast search functionality in the Kaptn dashboard. It implements intelligent resource caching with automatic refresh, configurable TTL, and comprehensive search capabilities across multiple Kubernetes resource types.

## Package Architecture

```
internal/cache/
├── README.md           # Package overview and configuration
├── resource_cache.go   # Core resource cache implementation
└── search_service.go   # Search service and URL generation
```

## Core Components

### 1. Resource Cache (`resource_cache.go`)

High-performance in-memory cache for Kubernetes resources with automatic refresh and intelligent lifecycle management.

#### Cache Item Structure:
```go
type ResourceCacheItem struct {
    ID             string                 // Unique resource identifier
    Name           string                 // Resource name
    Namespace      string                 // Resource namespace (if applicable)
    ResourceType   string                 // Kubernetes resource type
    Kind           string                 // Kubernetes kind
    Labels         map[string]string      // Resource labels
    Annotations    map[string]string      // Resource annotations
    Age            string                 // Human-readable age
    CreationTime   time.Time              // Resource creation timestamp
    LastUpdated    time.Time              // Cache update timestamp
    SearchableText string                 // Combined searchable content
    RawData        map[string]interface{} // Additional raw data
}
```

#### Cache Configuration:
```go
type CacheConfig struct {
    RefreshInterval time.Duration  // Cache refresh frequency
    MaxSize         int           // Maximum cached resources
    EnabledTypes    []string      // Resource types to cache
}
```

### 2. Resource Cache Implementation

#### Key Features:
- **Automatic Refresh**: Background goroutine refreshes cache at configurable intervals
- **Resource Type Coverage**: Supports 20+ Kubernetes resource types
- **Intelligent Indexing**: Optimized searchable text generation
- **Thread Safety**: Concurrent read access with atomic updates
- **Memory Management**: Configurable size limits and cleanup
- **Graceful Lifecycle**: Proper startup and shutdown handling

#### Supported Resource Types:
```go
DefaultResourceTypes := []string{
    "pods", "deployments", "services", "configmaps", "secrets",
    "nodes", "namespaces", "statefulsets", "daemonsets", 
    "replicasets", "jobs", "cronjobs", "ingresses", "endpoints",
    "persistentvolumes", "persistentvolumeclaims", "storageClasses",
    "networkpolicies", "roles", "rolebindings", "clusterroles",
    "clusterrolebindings", "serviceaccounts"
}
```

### 3. Search Service (`search_service.go`)

Sophisticated search service providing fast full-text search across cached resources with URL generation and result formatting.

#### Search Features:
- **Full-Text Search**: Search across names, namespaces, labels, and annotations
- **Resource Type Filtering**: Filter results by specific resource types
- **Namespace Scoping**: Limit search to specific namespaces
- **Result Limiting**: Configurable result pagination
- **URL Generation**: Automatic frontend URL generation for resources

#### Search Result Structure:
```go
type SearchResult struct {
    ID           string            // Resource identifier
    Name         string            // Resource name
    Namespace    string            // Resource namespace
    ResourceType string            // Resource type
    Kind         string            // Kubernetes kind
    URL          string            // Frontend URL
    Labels       map[string]string // Resource labels
    CreationTime string            // ISO8601 creation time
    Age          string            // Human-readable age
}
```

## Cache Architecture

### Refresh Process Flow
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Ticker        │    │  Resource Cache  │    │ Kubernetes API  │
│  (Background)   │───▶│   refresh()      │───▶│   List APIs     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                         │
                                ▼                         ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Resource Items   │    │  Raw Resources  │
                       │ (Structured)     │◄───│   (K8s API)     │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Searchable Text  │
                       │   Generation     │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Cache Update    │
                       │   (Atomic)       │
                       └──────────────────┘
```

### Search Flow
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Search Request │    │  Search Service  │    │ Resource Cache  │
│ (Query + Filters│───▶│   Search()       │───▶│  Search()       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                         │
                                ▼                         ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ URL Generation   │    │ Text Matching   │
                       │ & Formatting     │◄───│ & Filtering     │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Search Response  │
                       │  (Formatted)     │
                       └──────────────────┘
```

## Usage Examples

### Basic Cache Setup
```go
// Create cache configuration
config := cache.DefaultCacheConfig()
config.RefreshInterval = 45 * time.Second
config.MaxSize = 15000
config.EnabledTypes = []string{
    "pods", "deployments", "services", "configmaps",
}

// Create resource cache
logger := zap.NewProduction()
resourceCache := cache.NewResourceCache(logger, kubeClient, config)

// Start background refresh
ctx := context.Background()
if err := resourceCache.Start(ctx); err != nil {
    log.Fatal("Failed to start cache:", err)
}

// Graceful shutdown
defer resourceCache.Stop()
```

### Search Service Integration
```go
// Create search service
searchService := cache.NewSearchService(logger, resourceCache)

// Perform search
searchResponse, err := searchService.Search(
    ctx,
    "nginx",                    // query
    []string{"pods", "deployments"}, // resource types
    "production",               // namespace
    50,                        // limit
)

if err != nil {
    log.Printf("Search failed: %v", err)
    return
}

// Process results
for _, result := range searchResponse.Results {
    fmt.Printf("Found %s: %s/%s (URL: %s)\n", 
        result.Kind, result.Namespace, result.Name, result.URL)
}
```

### Advanced Search Examples
```go
// Search all resources
allResults, err := searchService.Search(ctx, "app=frontend", nil, "", 100)

// Search specific namespace
prodResults, err := searchService.Search(ctx, "database", nil, "production", 25)

// Search specific resource types
deployResults, err := searchService.Search(
    ctx, 
    "web", 
    []string{"deployments", "statefulsets"}, 
    "", 
    10,
)
```

### HTTP Handler Integration
```go
func handleSearch(w http.ResponseWriter, r *http.Request) {
    // Parse query parameters
    query := r.URL.Query().Get("q")
    if query == "" {
        http.Error(w, "Query parameter 'q' is required", http.StatusBadRequest)
        return
    }
    
    namespace := r.URL.Query().Get("namespace")
    resourceTypes := strings.Split(r.URL.Query().Get("types"), ",")
    
    limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
    if limit <= 0 {
        limit = 100
    }
    
    // Perform search
    results, err := searchService.Search(
        r.Context(), 
        query, 
        resourceTypes, 
        namespace, 
        limit,
    )
    if err != nil {
        http.Error(w, "Search failed", http.StatusInternalServerError)
        return
    }
    
    // Return JSON response
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(results)
}
```

### Cache Statistics Monitoring
```go
// Get cache statistics
stats := searchService.GetCacheStats()

// Example stats structure:
{
    "totalResources": 1250,
    "lastRefresh": "2025-09-29T10:30:00Z",
    "refreshInterval": "30s",
    "maxSize": 10000,
    "resourcesByType": {
        "pods": 450,
        "deployments": 125,
        "services": 200,
        "configmaps": 89,
        "secrets": 156,
        "nodes": 12,
        "namespaces": 8
    }
}
```

## Search Functionality

### Searchable Text Generation

The cache builds comprehensive searchable text from multiple sources:

```go
func buildSearchableText(name, namespace string, labels, annotations map[string]string) string {
    var parts []string
    
    // Basic identifiers
    parts = append(parts, strings.ToLower(name))
    if namespace != "" {
        parts = append(parts, strings.ToLower(namespace))
    }
    
    // Labels (key:value, key, value)
    for key, value := range labels {
        parts = append(parts, strings.ToLower(fmt.Sprintf("%s:%s", key, value)))
        parts = append(parts, strings.ToLower(key))
        parts = append(parts, strings.ToLower(value))
    }
    
    // Annotations (key:value, key, value)
    for key, value := range annotations {
        parts = append(parts, strings.ToLower(fmt.Sprintf("%s:%s", key, value)))
        parts = append(parts, strings.ToLower(key))
        parts = append(parts, strings.ToLower(value))
    }
    
    return strings.Join(parts, " ")
}
```

### Search Patterns

#### Name-Based Search:
```bash
# Search by exact name
curl "/api/v1/search?q=nginx-deployment"

# Search by partial name
curl "/api/v1/search?q=nginx"
```

#### Label-Based Search:
```bash
# Search by label key
curl "/api/v1/search?q=app"

# Search by label value
curl "/api/v1/search?q=frontend"

# Search by label key:value
curl "/api/v1/search?q=app:frontend"
```

#### Namespace-Based Search:
```bash
# Search within specific namespace
curl "/api/v1/search?q=database&namespace=production"

# Search by namespace name
curl "/api/v1/search?q=production"
```

#### Type-Filtered Search:
```bash
# Search specific resource types
curl "/api/v1/search?q=web&types=pods,deployments"

# Search single resource type
curl "/api/v1/search?q=redis&types=statefulsets"
```

### URL Generation

The search service automatically generates frontend URLs for resources:

```go
// Pod URLs
/pods/{namespace}/{name}

// Deployment URLs  
/deployments/{namespace}/{name}

// Service URLs
/services/{namespace}/{name}

// Node URLs (cluster-scoped)
/nodes/{name}

// Namespace URLs (cluster-scoped)
/namespaces/{name}

// Generic fallback
/{resourceType}/{namespace}/{name}  // namespaced
/{resourceType}/{name}              // cluster-scoped
```

## Resource Type Implementation

### Core Resources
```go
// Pods
func refreshPods(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
    pods, err := kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
    // Process pods and add to cache
}

// Services
func refreshServices(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
    services, err := kubeClient.CoreV1().Services("").List(ctx, metav1.ListOptions{})
    // Process services and add to cache
}
```

### Workload Resources
```go
// Deployments
func refreshDeployments(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
    deployments, err := kubeClient.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
    // Process deployments and add to cache
}

// StatefulSets
func refreshStatefulSets(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
    statefulSets, err := kubeClient.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{})
    // Process statefulsets and add to cache
}
```

### Cluster Resources
```go
// Nodes (cluster-scoped)
func refreshNodes(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
    nodes, err := kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
    // Process nodes with empty namespace
}

// Namespaces (cluster-scoped)
func refreshNamespaces(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
    namespaces, err := kubeClient.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
    // Process namespaces with empty namespace
}
```

## Performance Optimization

### Memory Management
```go
// Resource key format for efficient lookups
key := fmt.Sprintf("%s:%s:%s", resourceType, namespace, name)

// Atomic cache updates to prevent partial state
rc.mu.Lock()
rc.resources = newResources  // Complete replacement
rc.lastRefresh = time.Now()
rc.mu.Unlock()
```

### Concurrent Access
- **Read-Heavy Optimization**: Uses `sync.RWMutex` for concurrent reads
- **Atomic Updates**: Complete cache replacement prevents partial state
- **Background Refresh**: Non-blocking refresh in separate goroutine

### Search Performance
- **Pre-Computed Text**: Searchable text generated during cache refresh
- **String Contains**: Simple string matching for sub-second search
- **Early Termination**: Search stops when limit is reached

### Age Calculation
```go
func formatAge(t time.Time) string {
    duration := time.Since(t)
    
    if duration < time.Minute {
        return fmt.Sprintf("%ds", int(duration.Seconds()))
    } else if duration < time.Hour {
        return fmt.Sprintf("%dm", int(duration.Minutes()))
    } else if duration < 24*time.Hour {
        return fmt.Sprintf("%dh", int(duration.Hours()))
    } else {
        return fmt.Sprintf("%dd", int(duration.Hours()/24))
    }
}
```

## Configuration

### Environment Variables
```bash
# Cache settings
KAD_SEARCH_REFRESH_TTL=30s       # Cache refresh interval
KAD_SEARCH_MAX_SIZE=10000        # Maximum cached resources

# Resource type filtering (comma-separated)
KAD_SEARCH_ENABLED_TYPES=pods,deployments,services,configmaps,secrets
```

### Programmatic Configuration
```go
config := &cache.CacheConfig{
    RefreshInterval: 45 * time.Second,
    MaxSize:         15000,
    EnabledTypes: []string{
        "pods", "deployments", "services", "configmaps", "secrets",
        "nodes", "namespaces", "statefulsets", "daemonsets",
    },
}

cache := cache.NewResourceCache(logger, kubeClient, config)
```

### Runtime Configuration
```yaml
cache:
  refresh_interval: "45s"
  max_size: 15000
  enabled_types:
    - pods
    - deployments
    - services
    - configmaps
    - secrets
    - nodes
    - namespaces
```

## API Endpoints

### Search Resources
```
GET /api/v1/search
```

**Query Parameters:**
- `q` (required): Search query string
- `types` (optional): Comma-separated resource types
- `namespace` (optional): Namespace filter
- `limit` (optional): Maximum results (default: 100)

**Response:**
```json
{
    "results": [
        {
            "id": "pods:default:nginx-deployment-abc123",
            "name": "nginx-deployment-abc123",
            "namespace": "default",
            "resourceType": "pods",
            "kind": "Pod",
            "url": "/pods/default/nginx-deployment-abc123",
            "labels": {
                "app": "nginx",
                "version": "1.0"
            },
            "creationTimestamp": "2025-09-29T10:00:00Z",
            "age": "2h"
        }
    ],
    "total": 1,
    "query": "nginx"
}
```

### Cache Statistics
```
GET /api/v1/search/stats
```

**Response:**
```json
{
    "totalResources": 1250,
    "lastRefresh": "2025-09-29T12:30:00Z",
    "refreshInterval": "30s",
    "maxSize": 10000,
    "resourcesByType": {
        "pods": 450,
        "deployments": 125,
        "services": 200,
        "configmaps": 89,
        "secrets": 156,
        "nodes": 12,
        "namespaces": 8,
        "statefulsets": 35,
        "daemonsets": 18,
        "replicasets": 95,
        "jobs": 42,
        "cronjobs": 15,
        "serviceaccounts": 85
    }
}
```

### Force Cache Refresh
```
POST /api/v1/search/refresh
```

Forces immediate cache refresh and returns updated statistics.

## Monitoring & Observability

### Cache Health Monitoring
```go
// Monitor cache freshness
stats := cache.GetStats()
lastRefresh := stats["lastRefresh"].(time.Time)
refreshAge := time.Since(lastRefresh)

if refreshAge > 2*cache.refreshTTL {
    logger.Warn("Cache refresh is overdue",
        zap.Duration("refreshAge", refreshAge),
        zap.Duration("expectedTTL", cache.refreshTTL))
}
```

### Performance Metrics
```go
// Track search performance
start := time.Now()
results, err := searchService.Search(ctx, query, types, namespace, limit)
duration := time.Since(start)

logger.Info("Search completed",
    zap.String("query", query),
    zap.Int("resultCount", len(results.Results)),
    zap.Duration("duration", duration))
```

### Memory Usage Monitoring
```go
// Monitor cache size
stats := cache.GetStats()
totalResources := stats["totalResources"].(int)
maxSize := stats["maxSize"].(int)

utilization := float64(totalResources) / float64(maxSize)
if utilization > 0.8 {
    logger.Warn("Cache utilization high",
        zap.Float64("utilization", utilization),
        zap.Int("totalResources", totalResources),
        zap.Int("maxSize", maxSize))
}
```

### Structured Logging
```json
{
    "level": "info",
    "timestamp": "2025-09-29T12:30:00Z",
    "message": "Cache refresh completed",
    "duration": "2.5s",
    "totalResources": 1250,
    "newResources": 45,
    "removedResources": 12,
    "resourceTypes": {
        "pods": 450,
        "deployments": 125
    }
}
```

## Advanced Features

### Custom Resource Type Support
```go
// Add custom refresh function
func (rc *ResourceCache) refreshCustomResource(ctx context.Context, newResources map[string]*ResourceCacheItem) error {
    // Implement custom resource listing
    customResources, err := customClient.List(ctx, metav1.ListOptions{})
    if err != nil {
        return err
    }
    
    for _, cr := range customResources.Items {
        key := fmt.Sprintf("customresources:%s:%s", cr.Namespace, cr.Name)
        item := &ResourceCacheItem{
            ID:           key,
            Name:         cr.Name,
            Namespace:    cr.Namespace,
            ResourceType: "customresources",
            Kind:         "CustomResource",
            // ... populate other fields
        }
        newResources[key] = item
    }
    
    return nil
}
```

### Selective Refresh
```go
// Refresh only specific resource types
func (rc *ResourceCache) RefreshResourceTypes(ctx context.Context, resourceTypes []string) error {
    rc.mu.Lock()
    defer rc.mu.Unlock()
    
    for _, resourceType := range resourceTypes {
        if err := rc.refreshResourceType(ctx, resourceType, rc.resources); err != nil {
            return err
        }
    }
    
    rc.lastRefresh = time.Now()
    return nil
}
```

### Cache Warming
```go
// Pre-warm cache with specific resources
func (rc *ResourceCache) WarmCache(ctx context.Context, namespace string) error {
    // Perform targeted refresh for specific namespace
    tempResources := make(map[string]*ResourceCacheItem)
    
    for resourceType := range rc.enabledTypes {
        if err := rc.refreshResourceTypeInNamespace(ctx, resourceType, namespace, tempResources); err != nil {
            return err
        }
    }
    
    rc.mu.Lock()
    for key, item := range tempResources {
        rc.resources[key] = item
    }
    rc.mu.Unlock()
    
    return nil
}
```

## Testing

### Unit Testing
```go
func TestResourceCache(t *testing.T) {
    logger := zaptest.NewLogger(t)
    client := fake.NewSimpleClientset()
    
    // Create test pod
    pod := &corev1.Pod{
        ObjectMeta: metav1.ObjectMeta{
            Name:      "test-pod",
            Namespace: "default",
            Labels: map[string]string{
                "app": "test",
            },
        },
    }
    client.CoreV1().Pods("default").Create(context.Background(), pod, metav1.CreateOptions{})
    
    // Test cache
    config := cache.DefaultCacheConfig()
    config.RefreshInterval = time.Minute
    
    cache := cache.NewResourceCache(logger, client, config)
    err := cache.Start(context.Background())
    assert.NoError(t, err)
    defer cache.Stop()
    
    // Test search
    results, err := cache.Search("test", nil, "", 10)
    assert.NoError(t, err)
    assert.Len(t, results, 1)
    assert.Equal(t, "test-pod", results[0].Name)
}
```

### Integration Testing
```go
func TestSearchService(t *testing.T) {
    logger := zaptest.NewLogger(t)
    client := fake.NewSimpleClientset()
    
    // Setup cache and search service
    cache := cache.NewResourceCache(logger, client, nil)
    searchService := cache.NewSearchService(logger, cache)
    
    // Start cache
    ctx := context.Background()
    err := cache.Start(ctx)
    require.NoError(t, err)
    defer cache.Stop()
    
    // Test search
    response, err := searchService.Search(ctx, "test", nil, "", 10)
    assert.NoError(t, err)
    assert.NotNil(t, response)
}
```

### Performance Testing
```go
func BenchmarkSearch(b *testing.B) {
    logger := zaptest.NewLogger(b)
    client := fake.NewSimpleClientset()
    
    // Populate with test data
    for i := 0; i < 1000; i++ {
        pod := &corev1.Pod{
            ObjectMeta: metav1.ObjectMeta{
                Name:      fmt.Sprintf("pod-%d", i),
                Namespace: "default",
            },
        }
        client.CoreV1().Pods("default").Create(context.Background(), pod, metav1.CreateOptions{})
    }
    
    cache := cache.NewResourceCache(logger, client, nil)
    cache.Start(context.Background())
    defer cache.Stop()
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, err := cache.Search("pod", nil, "", 10)
        if err != nil {
            b.Fatal(err)
        }
    }
}
```

## Security Considerations

### Data Exposure
- **Metadata Only**: Cache stores only resource metadata, not sensitive data
- **Namespace Isolation**: Search respects namespace boundaries
- **No Secret Values**: Secret data values are not cached or searchable

### Access Control
- **RBAC Integration**: Search results respect user's Kubernetes RBAC permissions
- **Namespace Filtering**: Users can only search namespaces they have access to
- **Resource Type Filtering**: Configurable resource types prevent exposure

### Resource Limits
- **Memory Bounds**: Configurable max size prevents memory exhaustion
- **Search Limits**: Result limits prevent large response payloads
- **Refresh Throttling**: Configurable refresh intervals prevent API overload

## Best Practices

### Cache Configuration
- **Appropriate TTL**: Balance freshness with API load (30-60 seconds typical)
- **Resource Type Selection**: Only cache resource types needed for search
- **Size Limits**: Set reasonable max size based on cluster scale and memory

### Search Optimization
- **Specific Queries**: Encourage specific search terms over broad queries
- **Type Filtering**: Use resource type filters to reduce search scope
- **Namespace Scoping**: Scope searches to relevant namespaces when possible

### Monitoring & Maintenance
- **Cache Health**: Monitor cache refresh success and timing
- **Memory Usage**: Track cache memory consumption and growth
- **Search Performance**: Monitor search latency and result sizes

## Troubleshooting

### Common Issues

#### Cache Not Refreshing
```
Problem: Cache shows stale data
```
**Solution**: Check background refresh goroutine and Kubernetes connectivity

#### High Memory Usage
```
Problem: Cache consuming excessive memory
```
**Solution**: Reduce max size or enabled resource types

#### Slow Search Performance
```
Problem: Search queries taking >500ms
```
**Solution**: Optimize query specificity or reduce cache size

#### Missing Resources in Search
```
Problem: Known resources not appearing in search results
```
**Solution**: Verify resource type is enabled and refresh is successful

### Debug Mode
```go
// Enable debug logging
logger := zap.NewDevelopment()
cache := cache.NewResourceCache(logger, client, config)

// Debug output includes:
// - Cache refresh timing and resource counts
// - Search query processing details
// - Memory usage and cache statistics
```

## Future Enhancements

### Planned Features
- **Webhook-Based Updates**: Real-time cache updates via Kubernetes webhooks
- **Cache Persistence**: Optional disk persistence for faster startup
- **Advanced Search**: Fuzzy matching, ranking, and relevance scoring
- **Custom Resource Discovery**: Automatic CRD detection and indexing

### Extensibility Points
- **Custom Resource Types**: Pluggable resource type registration
- **External Search Engines**: Integration with Elasticsearch or similar
- **Cache Backends**: Redis/Memcached integration for multi-instance caching
- **Search Filters**: Advanced filtering capabilities and query syntax

## Dependencies

### External Dependencies
- `k8s.io/client-go/kubernetes` - Kubernetes client library
- `k8s.io/apimachinery/pkg/apis/meta/v1` - Kubernetes API types
- `go.uber.org/zap` - Structured logging

### Internal Dependencies
- Standard library packages: `context`, `sync`, `time`, `strings`, `fmt`
- No dependencies on other internal packages

This documentation provides comprehensive coverage of the cache package, serving as both a developer guide for extending caching functionality and an operational reference for deploying and maintaining Kaptn's search capabilities.