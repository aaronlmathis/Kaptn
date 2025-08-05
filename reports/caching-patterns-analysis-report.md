# Caching Patterns Analysis Report for Kaptn (k8s-admin-dash)

**Date**: August 5, 2025  
**Project**: Kaptn - Kubernetes Admin Dashboard  
**Backend**: Go with Kubernetes client-go  
**Frontend**: Astro + React + shadcn/ui  

---

## Executive Summary

This report analyzes the current implementation of caching patterns in the Kaptn codebase against the recommended patterns for optimal performance. The analysis covers backend informer-based caching, HTTP-level caching, frontend data fetching, and push-based invalidation.

## 1. Backend Caching: Cache-Aside with Kubernetes Informers

### ✅ **IMPLEMENTED** - Partial Implementation Found

**Evidence Found:**
- **Informer Manager**: `internal/k8s/informers/manager.go` implements a proper informer manager with SharedInformerFactory
- **Resource Informers**: Dedicated informers for nodes and pods with proper event handlers
- **Event Broadcasting**: Real-time event broadcasting via WebSocket hub

**Key Implementation Details:**
```go
// From internal/k8s/informers/manager.go
func NewManager(logger *zap.Logger, client kubernetes.Interface) *Manager {
    ctx, cancel := context.WithCancel(context.Background())
    
    // Create shared informer factory with default resync period
    factory := informers.NewSharedInformerFactory(client, 30*time.Second)
    
    return &Manager{
        logger:        logger,
        client:        client,
        factory:       factory,
        NodesInformer: factory.Core().V1().Nodes().Informer(),
        PodsInformer:  factory.Core().V1().Pods().Informer(),
        ctx:           ctx,
        cancel:        cancel,
    }
}
```

**Cache Store Access:**
- Proper listers available: `GetNodeLister()` and `GetPodLister()` return `cache.Indexer`
- Event handlers broadcast changes via WebSocket for real-time updates

**Gaps Identified:**
- ❌ Not all resources use informers (services, deployments, etc. still use direct API calls)
- ❌ Resource manager in `internal/k8s/resources/service.go` bypasses informer cache for most operations

---

## 2. HTTP-Level Caching: ETag & Cache-Control

### ❌ **NOT IMPLEMENTED** - No HTTP Caching Headers Found

**Evidence:**
- Searched through all API handlers in `internal/api/` directory
- No implementation of ETag generation from resourceVersion
- No If-None-Match header processing
- No Cache-Control headers set
- No 304 Not Modified responses

**Missing Implementation:**
```go
// RECOMMENDED but NOT FOUND:
etag := fmt.Sprintf(`W/"%s"`, list.ResourceVersion)
w.Header().Set("ETag", etag)
if match := r.Header.Get("If-None-Match"); match == etag {
    w.WriteHeader(http.StatusNotModified)
    return
}
w.Header().Set("Cache-Control", "public, max-age=30, stale-while-revalidate=60")
```

**Impact:**
- Full JSON payloads sent on every request even when data hasn't changed
- Missed bandwidth optimization opportunities
- No conditional request support

---

## 3. Frontend Caching: React Query or SWR

### ❌ **NOT IMPLEMENTED** - Basic fetch() with useState Pattern

**Current Implementation:**
The frontend uses a custom hook pattern with basic `fetch()` calls and `useState` for caching:

```typescript
// From frontend/src/hooks/use-k8s-data.ts
export function usePods(): UseK8sDataResult<DashboardPod> {
    const [data, setData] = useState<DashboardPod[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const fetchData = useCallback(async () => {
        // Direct fetch() call - no caching layer
        const pods = await k8sService.getPods(namespace);
        setData(transformPodsToUI(pods));
    }, [selectedNamespace]);
    
    useEffect(() => {
        fetchData();
    }, [fetchData]);
}
```

**Evidence of Basic Pattern:**
- ✅ Custom hooks for all resources (pods, nodes, services, deployments, etc.)
- ✅ Loading states and error handling
- ❌ No React Query or SWR installed (checked `package.json`)
- ❌ No staleTime configuration
- ❌ No cache invalidation strategies
- ❌ No background refetching
- ❌ Refetch on every component mount/namespace change

**Missing Benefits:**
- No cache persistence between navigation
- No optimistic updates
- No automatic background refetching
- No stale-while-revalidate pattern
- Redundant network requests

---

## 4. Push-Based Invalidation: Webhooks → SSE / WebSocket

### ✅ **IMPLEMENTED** - WebSocket Real-time Updates

**Evidence Found:**
- **WebSocket Hub**: `internal/k8s/ws/hub.go` implements a comprehensive WebSocket management system
- **Real-time Broadcasting**: Informer events are broadcast to connected clients
- **Frontend WebSocket Service**: `frontend/src/lib/websocket.ts` handles client-side connections

**Backend Implementation:**
```go
// From internal/k8s/informers/pods.go
func (h *PodEventHandler) OnUpdate(oldObj, newObj interface{}) {
    // Convert to summary and broadcast in Stage 2 format
    summary := h.podToSummary(newPod)
    h.hub.BroadcastToRoom("pods", "podUpdate", map[string]interface{}{
        "action": "modified",
        "data":   summary,
    })
}
```

**Frontend Integration:**
```typescript
// From frontend/src/hooks/use-k8s-data.ts
useEffect(() => {
    wsService.connect('/stream/overview');
    
    const handleOverviewUpdate = (message: any) => {
        if (message.type === 'overviewUpdate') {
            setData(message.data);
        }
    };
    
    wsService.on('overviewUpdate', handleOverviewUpdate);
    
    return () => {
        wsService.off('overviewUpdate', handleOverviewUpdate);
        wsService.disconnect();
    };
}, []);
```

**Features Implemented:**
- ✅ Connection management with reconnection logic
- ✅ Room-based broadcasting (nodes, pods, overview)
- ✅ Exponential backoff for reconnections
- ✅ Proper cleanup and event handler management
- ✅ Authentication support for WebSocket connections

---

## 5. Additional Caching Found

### ✅ Analytics Service Caching

**Implementation:**
The analytics service includes a proper in-memory cache with TTL:

```go
// From internal/analytics/service.go
type Cache struct {
    mutex sync.RWMutex
    items map[string]*CacheItem
}

func (c *Cache) Get(key string) (interface{}, bool) {
    if time.Now().After(item.ExpiresAt) {
        return nil, false
    }
    return item.Data, true
}
```

**Features:**
- ✅ TTL-based expiration
- ✅ Configurable cache duration via config
- ✅ Automatic cleanup of expired items
- ✅ Thread-safe with RWMutex

### ✅ Overview Service Caching

**Implementation:**
The overview service implements cache-aside pattern:

```go
// From internal/k8s/overview/service.go
func (os *OverviewService) GetOverview(ctx context.Context) (*OverviewData, error) {
    // Check cache first
    os.cache.mutex.RLock()
    if os.cache.Data != nil && time.Now().Before(os.cache.ExpiresAt) {
        data := os.cache.Data
        os.cache.mutex.RUnlock()
        return data, nil
    }
    os.cache.mutex.RUnlock()
    
    // Cache miss or expired, fetch fresh data
    data, err := os.fetchOverviewData(ctx)
    // Update cache...
}
```

---

## Configuration Support

### ✅ Cache Configuration Available

The system provides configurable caching TTLs:

```yaml
# From config files
caching:
  overview_ttl: "2s"
  analytics_ttl: "60s"
```

---

## Summary & Recommendations

### Current State:
| Pattern | Status | Implementation Quality |
|---------|--------|----------------------|
| Backend Informer Caching | ✅ Partial | Good - needs expansion to all resources |
| HTTP-Level Caching | ❌ Missing | None |
| Frontend Caching | ❌ Basic | Custom hooks but no sophisticated caching |
| Push-Based Updates | ✅ Complete | Excellent WebSocket implementation |
| Service-Level Caching | ✅ Partial | Good for analytics and overview |

### Priority Recommendations:

1. **HIGH PRIORITY**: Implement React Query/TanStack Query
   - Replace custom hooks with React Query
   - Add staleTime, cacheTime configuration
   - Enable background refetching and cache persistence

2. **HIGH PRIORITY**: Add HTTP-level caching
   - Implement ETag generation from Kubernetes resourceVersion
   - Add If-None-Match processing
   - Set appropriate Cache-Control headers

3. **MEDIUM PRIORITY**: Expand informer usage
   - Migrate all resource operations to use informer caches
   - Reduce direct API server calls

4. **LOW PRIORITY**: Enhanced analytics caching
   - Already well implemented, minor optimizations possible

### Hybrid Approach Status:
- ✅ **Push Events (WebSocket)**: Excellent implementation
- 🟡 **Informer-Based Cache**: Partial implementation 
- ❌ **HTTP Caching Headers**: Not implemented
- ❌ **React Query**: Not implemented

**Overall Assessment**: The project has excellent real-time capabilities via WebSocket but lacks client-side caching sophistication and HTTP-level optimization. Implementing React Query and HTTP caching would significantly improve performance and user experience.
