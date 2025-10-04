# AuthZ (Authorization) Package Documentation

## Overview

The `internal/authz` package provides comprehensive authorization capabilities for the Kaptn Kubernetes admin dashboard, implementing a sophisticated capability-based authorization system backed by Kubernetes RBAC. It offers UI gating, batch capability checks, performance optimization through caching, and dynamic capability discovery.

## Package Architecture

```
internal/authz/
├── README.md           # Package scope and guardrails
├── capabilities.go     # Core capability registry and definitions
├── capabilities_test.go # Capability testing
├── service.go          # Main authorization service with caching
├── service_test.go     # Service testing
├── ssar.go            # SelfSubjectAccessReview utilities
├── crd_discovery.go   # Dynamic capability discovery from CRDs
└── multi_cluster.go   # Multi-cluster authorization support
```

## Core Components

### 1. Capability Registry (`capabilities.go`)

Central registry mapping UI capabilities to Kubernetes RBAC checks with comprehensive resource coverage.

#### Capability Definition:
```go
type CapabilityCheck struct {
    Group       string // Kubernetes API group (empty for core)
    Resource    string // Kubernetes resource type
    Subresource string // Optional subresource (log, exec, scale)
    Verb        string // Kubernetes verb (get, list, create, update, delete)
    Namespaced  bool   // Whether resource is namespaced or cluster-scoped
}
```

#### Registry Coverage:
- **Core Resources**: Pods, Services, ConfigMaps, Secrets, Namespaces, Nodes
- **Workload Resources**: Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs
- **Storage Resources**: PersistentVolumes, PersistentVolumeClaims, StorageClasses, VolumeSnapshots
- **Network Resources**: Ingresses, NetworkPolicies, EndpointSlices
- **RBAC Resources**: Roles, RoleBindings, ClusterRoles, ClusterRoleBindings
- **Custom Resources**: Istio VirtualServices, Gateways
- **Advanced Operations**: Scaling, Pod exec/logs, Node management

### 2. Authorization Service (`service.go`)

High-performance authorization service with intelligent caching and batch processing capabilities.

#### Key Features:
- **Dual-Path Authorization**: SSRR (fast path) + SSAR (fallback) for optimal performance
- **Intelligent Caching**: Multi-level caching with configurable TTL
- **Worker Pool Processing**: Concurrent SSAR execution for large batches
- **Performance Metrics**: Comprehensive latency and cache statistics
- **Audit Logging**: Detailed audit trail for compliance
- **Context-Aware**: User, group, and namespace-specific capability resolution

#### Service Architecture:
```go
type CapabilityService struct {
    logger           *zap.Logger
    cache            map[string]*CacheEntry      // Capability results cache
    ssrrCache        map[string]*SSRRCacheEntry  // SSRR rules cache
    metrics          *PerformanceMetrics         // Performance tracking
    enableSSRR       bool                        // SSRR fast-path enabled
    maxConcurrency   int                         // Worker pool size
    auditLogger      *zap.Logger                 // Audit trail logging
}
```

### 3. SSAR Utilities (`ssar.go`)

Efficient SelfSubjectAccessReview construction and batch processing utilities.

#### SSAR Building:
- **Single SSAR**: Individual capability to SSAR conversion
- **Batch SSAR**: Multiple capabilities to SSAR array with indexing
- **Resource-Specific**: Support for named resource authorization
- **Namespace-Aware**: Proper namespace handling for namespaced resources

## Authorization Flow

### Capability Check Process
```
1. Request Received
   ├── Extract user context (ID, groups)
   └── Parse capability request (features, namespace, resources)

2. Cache Lookup
   ├── Generate cache key (user + groups + request)
   ├── Check capability cache
   └── Return cached result if valid

3. Authorization Method Selection
   ├── Multiple capabilities (>3) + no resource names → SSRR Fast Path
   └── Otherwise → SSAR Batch Processing

4. SSRR Fast Path (when applicable)
   ├── Check SSRR rules cache
   ├── Execute SelfSubjectRulesReview if cache miss
   ├── Evaluate capabilities against cached rules
   └── Cache results for future use

5. SSAR Batch Processing (fallback)
   ├── Build SSAR requests for each capability
   ├── Execute with worker pool (concurrent) or sequential
   ├── Collect and aggregate results
   └── Cache final capability results

6. Result Processing
   ├── Build capability result map
   ├── Generate audit log entries
   ├── Update performance metrics
   └── Return capability matrix to client
```

### Capability Request Format
```go
type CapabilityRequest struct {
    Cluster       string            `json:"cluster"`         
    Namespace     string            `json:"namespace,omitempty"`    
    Features      []string          `json:"features"`               
    ResourceNames map[string]string `json:"resourceNames,omitempty"`
}

type CapabilityResult struct {
    Caps    map[string]bool   `json:"caps"`              
    Reasons map[string]string `json:"reasons,omitempty"` 
}
```

## Performance Optimization

### Dual-Path Authorization

#### SSRR Fast Path:
- **Use Case**: Multiple capabilities (>3) without specific resource names
- **Method**: Single SelfSubjectRulesReview to get all user permissions
- **Advantage**: One API call vs. multiple SSAR calls
- **Cache**: Rules cached for 60 seconds (longer than capability cache)

#### SSAR Batch Processing:
- **Use Case**: Specific resource names or small capability sets
- **Method**: Individual SelfSubjectAccessReview per capability
- **Optimization**: Worker pool for concurrent execution
- **Cache**: Individual capability results cached for 30 seconds

### Caching Strategy

#### Two-Level Caching:
```go
// Level 1: Capability Results Cache
type CacheEntry struct {
    Result    CapabilityResult
    ExpiresAt time.Time
}

// Level 2: SSRR Rules Cache
type SSRRCacheEntry struct {
    Rules     []rbacv1.PolicyRule
    ExpiresAt time.Time
}
```

#### Cache Key Design:
- **Deterministic**: SHA256 hash of user + groups + request parameters
- **Sorted Inputs**: Consistent ordering for cache hits across requests
- **Namespace-Aware**: Different cache entries for different namespaces
- **Group-Sensitive**: Changes in user groups invalidate cache

### Worker Pool Architecture

#### Concurrent SSAR Execution:
```go
type WorkerPool struct {
    size        int                     // Number of worker goroutines
    jobs        chan SSARJob           // Job queue
    results     chan SSARResult        // Result collection
    ctx         context.Context        // Cancellation context
    client      kubernetes.Interface   // Kubernetes client
}
```

#### Performance Benefits:
- **Reduced Latency**: Parallel execution of multiple SSAR requests
- **Resource Management**: Bounded concurrency prevents API server overload
- **Fault Tolerance**: Individual SSAR failures don't block entire batch
- **Scalability**: Worker pool size configurable based on cluster capacity

## Capability Registry

### Core Kubernetes Resources

#### Pod Operations:
```go
"pods.list":       {Group: "", Resource: "pods", Verb: "list", Namespaced: true}
"pods.get":        {Group: "", Resource: "pods", Verb: "get", Namespaced: true}
"pods.delete":     {Group: "", Resource: "pods", Verb: "delete", Namespaced: true}
"pods.logs":       {Group: "", Resource: "pods", Subresource: "log", Verb: "get", Namespaced: true}
"pods.exec":       {Group: "", Resource: "pods", Subresource: "exec", Verb: "create", Namespaced: true}
"pods.portforward": {Group: "", Resource: "pods", Subresource: "portforward", Verb: "create", Namespaced: true}
```

#### Workload Management:
```go
"deployments.restart": {Group: "apps", Resource: "deployments", Verb: "patch", Namespaced: true}
"deployments.scale.update": {Group: "apps", Resource: "deployments", Subresource: "scale", Verb: "update", Namespaced: true}
"statefulsets.delete": {Group: "apps", Resource: "statefulsets", Verb: "delete", Namespaced: true}
```

#### Storage Operations:
```go
"persistentvolumes.list": {Group: "", Resource: "persistentvolumes", Verb: "list", Namespaced: false}
"storageclasses.get": {Group: "storage.k8s.io", Resource: "storageclasses", Verb: "get", Namespaced: false}
"volumesnapshots.create": {Group: "snapshot.storage.k8s.io", Resource: "volumesnapshots", Verb: "create", Namespaced: true}
```

#### RBAC Management:
```go
"roles.list": {Group: "rbac.authorization.k8s.io", Resource: "roles", Verb: "list", Namespaced: true}
"clusterroles.get": {Group: "rbac.authorization.k8s.io", Resource: "clusterroles", Verb: "get", Namespaced: false}
"rbac.roles.bind": {Group: "rbac.authorization.k8s.io", Resource: "roles", Verb: "bind", Namespaced: true}
```

### Extended Capabilities

#### Network Resources:
```go
"ingresses.get": {Group: "networking.k8s.io", Resource: "ingresses", Verb: "get", Namespaced: true}
"networkpolicies.create": {Group: "networking.k8s.io", Resource: "networkpolicies", Verb: "create", Namespaced: true}
"endpointslices.list": {Group: "discovery.k8s.io", Resource: "endpointslices", Verb: "list", Namespaced: true}
```

#### Istio Resources:
```go
"virtualservices.get": {Group: "networking.istio.io", Resource: "virtualservices", Verb: "get", Namespaced: true}
"gateways.list": {Group: "networking.istio.io", Resource: "gateways", Verb: "list", Namespaced: true}
```

#### Advanced Operations:
```go
"nodes.proxy.get": {Group: "", Resource: "nodes", Subresource: "proxy", Verb: "get", Namespaced: false}
"certificatesigningrequests.approval": {Group: "certificates.k8s.io", Resource: "certificatesigningrequests", Subresource: "approval", Verb: "update", Namespaced: false}
```

## Usage Examples

### Basic Capability Check
```go
// Create capability service
service := authz.NewCapabilityService(logger, 30*time.Second)

// Check capabilities
request := authz.CapabilityRequest{
    Namespace: "default",
    Features: []string{
        "pods.list",
        "pods.delete", 
        "deployments.restart",
        "secrets.read",
    },
}

result, err := service.CheckCapabilities(
    ctx, 
    k8sClient, 
    request, 
    userID, 
    userGroups,
)

// Process results
for capability, allowed := range result.Caps {
    if allowed {
        fmt.Printf("User can %s\n", capability)
    } else {
        fmt.Printf("User cannot %s: %s\n", capability, result.Reasons[capability])
    }
}
```

### Resource-Specific Authorization
```go
// Check permissions for specific resources
request := authz.CapabilityRequest{
    Namespace: "production",
    Features: []string{
        "pods.delete",
        "secrets.read",
    },
    ResourceNames: map[string]string{
        "pods.delete":  "critical-pod",
        "secrets.read": "database-credentials",
    },
}

result, err := service.CheckCapabilities(ctx, client, request, userID, groups)
```

### Namespace-Scoped Checks
```go
// Check capabilities across multiple namespaces
namespaces := []string{"development", "staging", "production"}
capabilities := []string{"pods.list", "deployments.restart", "secrets.read"}

for _, ns := range namespaces {
    request := authz.CapabilityRequest{
        Namespace: ns,
        Features:  capabilities,
    }
    
    result, err := service.CheckCapabilities(ctx, client, request, userID, groups)
    if err != nil {
        continue
    }
    
    fmt.Printf("Namespace %s capabilities: %+v\n", ns, result.Caps)
}
```

### Integration with HTTP Handlers
```go
func checkUserCapabilities(w http.ResponseWriter, r *http.Request) {
    // Extract user from context
    user, ok := auth.UserFromContext(r.Context())
    if !ok {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }
    
    // Parse request
    var req authz.CapabilityRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid request", http.StatusBadRequest)
        return
    }
    
    // Get impersonated client
    clients, ok := k8s.ImpersonatedClientsFromContext(r.Context())
    if !ok {
        http.Error(w, "No kubernetes access", http.StatusInternalServerError)
        return
    }
    
    // Check capabilities
    result, err := capabilityService.CheckCapabilities(
        r.Context(),
        clients.Client(),
        req,
        user.ID,
        user.Groups,
    )
    if err != nil {
        http.Error(w, "Capability check failed", http.StatusInternalServerError)
        return
    }
    
    // Return results
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(result)
}
```

## Monitoring & Observability

### Performance Metrics
```go
type PerformanceMetrics struct {
    TotalRequests   int64            // Total capability requests
    CacheHits       int64            // Capability cache hits
    CacheMisses     int64            // Capability cache misses
    SSRRCacheHits   int64            // SSRR cache hits
    SSRRCacheMisses int64            // SSRR cache misses
    TotalLatency    time.Duration    // Cumulative latency
    SSARCalls       int64            // SSAR API calls made
    SSRRCalls       int64            // SSRR API calls made
    ErrorCount      int64            // Total errors
    LatencyBuckets  map[string]int64 // Latency distribution
}
```

### Cache Statistics
```go
// Get comprehensive cache statistics
stats := service.GetCacheStats()

// Returns:
{
    "capability_cache": {
        "total_entries": 150,
        "valid_entries": 140,
        "expired_entries": 10,
        "ttl_seconds": 30
    },
    "ssrr_cache": {
        "total_entries": 25,
        "valid_entries": 23,
        "expired_entries": 2,
        "ttl_seconds": 60
    },
    "performance_metrics": {
        "total_requests": 1250,
        "cache_hits": 875,
        "cache_misses": 375,
        "ssar_calls": 450,
        "ssrr_calls": 85
    },
    "cache_hit_rate_percent": 70.0,
    "avg_latency_ms": 45.2,
    "worker_pool_size": 10,
    "ssrr_enabled": true
}
```

### Audit Logging
```go
// Structured audit entries for compliance
type AuditEntry struct {
    Timestamp   time.Time `json:"timestamp"`
    TraceID     string    `json:"trace_id"`
    UserID      string    `json:"user_id"`
    Groups      []string  `json:"groups"`
    GroupsHash  string    `json:"groups_hash"`
    Feature     string    `json:"feature"`
    Namespace   string    `json:"namespace"`
    Decision    bool      `json:"decision"`
    Reason      string    `json:"reason,omitempty"`
    Latency     int64     `json:"latency_ms"`
    CacheHit    bool      `json:"cache_hit"`
    Method      string    `json:"method"` // "SSAR" or "SSRR"
}
```

### Sample Audit Log
```json
{
    "level": "info",
    "timestamp": "2025-09-29T10:30:00Z",
    "message": "capability_decision",
    "trace_id": "trace-abc123",
    "user_id": "user@example.com",
    "groups": ["kaptn-developers", "namespace-viewers"],
    "groups_hash": "a1b2c3d4",
    "feature": "pods.delete",
    "namespace": "production",
    "decision": false,
    "reason": "insufficient permissions",
    "latency_ms": 45,
    "cache_hit": false,
    "method": "SSAR"
}
```

## Configuration

### Service Configuration
```go
// Create service with custom settings
service := authz.NewCapabilityService(logger, cacheTTL)

// Configure performance settings
service.EnableSSRR(true)                    // Enable SSRR fast path
service.SetMaxConcurrency(15)               // Worker pool size
service.SetSSRRCacheTTL(90 * time.Second)   // SSRR cache duration
```

### Environment Variables
```bash
# Authorization service settings
KAPTN_AUTHZ_CACHE_TTL=30s           # Capability cache TTL
KAPTN_AUTHZ_SSRR_CACHE_TTL=60s      # SSRR cache TTL
KAPTN_AUTHZ_MAX_CONCURRENCY=10      # Worker pool size
KAPTN_AUTHZ_ENABLE_SSRR=true        # Enable SSRR fast path
KAPTN_AUTHZ_AUDIT_ENABLED=true      # Enable audit logging
```

### Runtime Configuration
```yaml
authz:
  cache_ttl: "30s"
  ssrr_cache_ttl: "60s" 
  max_concurrency: 10
  enable_ssrr: true
  audit_enabled: true
  performance_metrics: true
```

## Advanced Features

### Multi-Cluster Support (`multi_cluster.go`)
```go
type MultiClusterCapabilityService struct {
    clusters map[string]*CapabilityService
    logger   *zap.Logger
}

// Check capabilities across multiple clusters
func (mcs *MultiClusterCapabilityService) CheckCapabilities(
    ctx context.Context,
    clusterName string,
    request CapabilityRequest,
    userID string,
    groups []string,
) (CapabilityResult, error)
```

### Dynamic Capability Discovery (`crd_discovery.go`)
```go
// Discover capabilities from CRDs
type CRDDiscovery struct {
    client    kubernetes.Interface
    logger    *zap.Logger
    registry  map[string]CapabilityCheck
}

// Auto-register capabilities for custom resources
func (cd *CRDDiscovery) DiscoverCapabilities(ctx context.Context) error
```

### Custom Capability Registration
```go
// Register custom capabilities at runtime
func RegisterCustomCapability(name string, check CapabilityCheck) {
    Registry[name] = check
}

// Example: Register custom Istio capability
RegisterCustomCapability("destinationrules.get", CapabilityCheck{
    Group:      "networking.istio.io",
    Resource:   "destinationrules", 
    Verb:       "get",
    Namespaced: true,
})
```

## Security Considerations

### Authorization Security
- **Principle of Least Privilege**: Capabilities map to specific Kubernetes verbs/resources
- **No Privilege Escalation**: Cannot grant permissions beyond what user has in Kubernetes
- **Audit Trail**: Complete audit log of all authorization decisions
- **Cache Security**: User context included in cache keys prevents cross-user information disclosure

### Performance Security
- **Rate Limiting**: Worker pool bounds prevent API server overload
- **Cache Bounds**: Automatic cleanup prevents memory exhaustion  
- **Request Isolation**: Each request gets independent context and tracing
- **Error Sanitization**: Internal errors not exposed to prevent information disclosure

### RBAC Integration
- **Kubernetes Native**: Uses standard RBAC without custom authorization logic
- **Impersonation**: Works with Kubernetes impersonation for multi-user support
- **Group-Based**: Supports group-based permissions via Kubernetes groups
- **Namespace Isolation**: Proper namespace scoping for multi-tenant environments

## Testing

### Unit Testing
```go
func TestCapabilityService(t *testing.T) {
    logger := zaptest.NewLogger(t)
    service := authz.NewCapabilityService(logger, time.Minute)
    
    // Mock Kubernetes client
    client := fake.NewSimpleClientset()
    
    request := authz.CapabilityRequest{
        Features: []string{"pods.list", "pods.get"},
        Namespace: "default",
    }
    
    result, err := service.CheckCapabilities(
        context.Background(),
        client,
        request,
        "test-user",
        []string{"developers"},
    )
    
    assert.NoError(t, err)
    assert.Contains(t, result.Caps, "pods.list")
}
```

### Integration Testing
```go
func TestSSARIntegration(t *testing.T) {
    // Create real cluster connection
    config, err := rest.InClusterConfig()
    require.NoError(t, err)
    
    client, err := kubernetes.NewForConfig(config)
    require.NoError(t, err)
    
    // Test with real SSAR
    ssar := authz.BuildSSAR(authz.CapabilityCheck{
        Group:      "",
        Resource:   "pods",
        Verb:       "list",
        Namespaced: true,
    }, "default", "")
    
    result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(
        context.Background(),
        &ssar,
        metav1.CreateOptions{},
    )
    
    require.NoError(t, err)
    assert.NotNil(t, result.Status)
}
```

### Performance Testing
```go
func BenchmarkCapabilityCheck(b *testing.B) {
    service := authz.NewCapabilityService(logger, time.Minute)
    client := fake.NewSimpleClientset()
    
    request := authz.CapabilityRequest{
        Features: []string{"pods.list", "deployments.get", "secrets.read"},
    }
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, err := service.CheckCapabilities(
            context.Background(),
            client,
            request,
            "test-user",
            []string{"developers"},
        )
        if err != nil {
            b.Fatal(err)
        }
    }
}
```

## Best Practices

### Capability Design
- **Granular Capabilities**: Define specific capabilities rather than broad permissions
- **Meaningful Names**: Use descriptive capability names that map to UI features
- **Resource Alignment**: Ensure capabilities align with actual Kubernetes resources
- **Subresource Support**: Use subresources for operations like logs, exec, scale

### Performance Optimization
- **Batch Requests**: Group multiple capability checks into single requests
- **Appropriate Caching**: Use reasonable cache TTL based on permission change frequency
- **Worker Pool Sizing**: Size worker pools based on cluster API server capacity
- **SSRR When Possible**: Prefer SSRR for large capability sets without resource names

### Monitoring & Maintenance
- **Regular Cache Review**: Monitor cache hit rates and adjust TTL as needed
- **Audit Log Analysis**: Review audit logs for unusual permission patterns
- **Performance Monitoring**: Track latency and error rates for optimization
- **Capability Registry Updates**: Keep capability registry updated with new Kubernetes features

## Troubleshooting

### Common Issues

#### Low Cache Hit Rate
```
Problem: Cache hit rate below 50%
```
**Solution**: Increase cache TTL or review request patterns for consistency

#### High SSAR Latency
```
Problem: Individual SSAR requests taking >500ms
```
**Solution**: Check cluster API server load and network connectivity

#### Permission Denied Errors
```
Problem: Expected capabilities returning false
```
**Solution**: Verify user groups and Kubernetes RBAC bindings are correct

#### Worker Pool Exhaustion
```
Problem: SSAR requests timing out under load
```
**Solution**: Increase max concurrency or reduce batch sizes

### Debug Mode
Enable debug logging for detailed authorization flow:
```go
logger := zap.NewDevelopment()
service := authz.NewCapabilityService(logger, cacheTTL)
```

Debug output includes:
- Cache hit/miss details
- SSAR request/response details  
- SSRR rule evaluation
- Performance timing information
- Audit trail generation

## Future Enhancements

### Planned Features
- **Policy Engine Integration**: Support for Open Policy Agent (OPA) policies
- **Temporal Permissions**: Time-based capability grants and restrictions
- **Conditional Capabilities**: Context-aware permissions based on resource state
- **Capability Inheritance**: Hierarchical capability definitions
- **Advanced Analytics**: Permission usage analytics and optimization recommendations

### Extensibility Points
- **Custom Capability Resolvers**: Pluggable capability resolution backends
- **External Policy Sources**: Integration with external authorization systems
- **Custom Cache Backends**: Redis, Memcached integration for shared caching
- **Webhook Integration**: External authorization webhook support
- **Metrics Export**: Prometheus metrics for monitoring and alerting

## Dependencies

### External Dependencies
- `k8s.io/api/authorization/v1` - Kubernetes authorization API types
- `k8s.io/api/rbac/v1` - Kubernetes RBAC types
- `k8s.io/client-go/kubernetes` - Kubernetes client library
- `go.uber.org/zap` - Structured logging

### Internal Dependencies
- Kubernetes client interfaces for SSAR/SSRR execution
- User context from auth package
- Standard library crypto and time packages

This documentation provides comprehensive coverage of the authz package, serving as both a developer guide for extending authorization functionality and an operational reference for deploying and maintaining Kaptn's authorization system.