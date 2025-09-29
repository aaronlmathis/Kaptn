# API Routes Package Documentation

## Overview

The `internal/api/routes` package defines the URL structure and route mounting logic for the Kaptn Kubernetes admin dashboard API. This package implements a **Tiers Pattern** that organizes routes by functional responsibility and security requirements, providing a clean separation between URL structure definition and handler implementation.

## Package Architecture

```
internal/api/routes/
├── api.go        # Top-level route mounting and tier coordination
├── contracts.go  # Handler interfaces for all tiers (dependency inversion)
├── admin.go      # Admin tier routes (auth required, admin operations)
├── apply.go      # Apply tier routes (write permissions, YAML application)
├── public.go     # Public tier routes (no auth required)
├── read.go       # Read tier routes (auth required, read operations)
├── static.go     # Static file serving routes (SPA catch-all)
├── system.go     # System routes (health, metrics, version)
├── write.go      # Write tier routes (write permissions required)
└── README.md     # Implementation scope and guardrails
```

## Design Principles

### 1. Separation of Concerns
- **Routes package**: Defines URL structure and applies middleware
- **Server package**: Implements handler logic and business rules
- **Middleware package**: Provides reusable security and auth components

### 2. Dependency Inversion
- Routes depend on **interfaces** (contracts), not concrete implementations
- Server implements interfaces and provides concrete handlers
- Enables testing, mocking, and modular development

### 3. Tiers Pattern
Routes are organized into functional tiers with increasing security requirements:

```
Public → Admin → Read → Write → Apply
  ↓       ↓       ↓      ↓       ↓
 No     Auth   + Read + Write + Higher
Auth   Required Perms  Perms   Limits
```

## Route Tiers

### 1. Public Tier (`public.go`)
**Access Level**: No authentication required  
**Purpose**: Authentication flows and public configuration

#### Routes:
```
POST /api/v1/auth/login          # OIDC login initiation
GET  /api/v1/auth/callback       # OIDC callback handler
POST /api/v1/auth/logout         # Session termination
POST /api/v1/auth/refresh        # Token refresh
GET  /api/v1/auth/me             # Current user information
GET  /api/v1/auth/jwks           # JSON Web Key Set
GET  /api/v1/auth/debug          # Authentication debug info
GET  /api/v1/config              # Public configuration
```

### 2. Admin Tier (`admin.go`)
**Access Level**: Authentication required  
**Purpose**: Administrative operations and system management

#### Routes:
```
GET  /api/v1/admin/authz/preview        # Authorization preview
GET  /api/v1/admin/authz/permissions-check # Permission verification
POST /api/v1/auth/revoke-user-sessions  # Session revocation
POST /api/v1/admin/authz/reload         # Reload authorization config
GET  /api/v1/admin/authz/sar            # SubjectAccessReview operations
POST /api/v1/admin/logs/clear-rings     # Clear log cache rings
GET  /api/v1/admin/logs/stats           # Log cache statistics
GET  /api/v1/admin/logs/streams         # Active log streams
POST /api/v1/admin/logs/limits          # Configure log limits
```

### 3. Read Tier (`read.go`)
**Access Level**: Authentication + read permissions  
**Purpose**: Read-only access to Kubernetes resources and metrics

#### Major Route Groups:

##### Permissions & Capabilities
```
GET  /api/v1/permissions/check          # Permission check
GET  /api/v1/permissions/actions        # Available actions
POST /api/v1/authz/capabilities         # Authorization capabilities
GET  /api/v1/capabilities               # System capabilities
```

##### Core Kubernetes Resources
```
GET  /api/v1/nodes                      # List nodes
GET  /api/v1/nodes/{name}               # Get specific node
GET  /api/v1/pods                       # List pods
GET  /api/v1/pods/{namespace}/{name}    # Get specific pod
GET  /api/v1/deployments                # List deployments
GET  /api/v1/services                   # List services
GET  /api/v1/namespaces                 # List namespaces
```

##### Advanced Resources
```
GET  /api/v1/secrets                    # List secrets (metadata only)
GET  /api/v1/secrets/{namespace}/{name} # Get secret details
GET  /api/v1/config-maps                # List ConfigMaps
GET  /api/v1/ingresses                  # List ingresses
GET  /api/v1/network-policies           # List network policies
```

##### RBAC Resources
```
GET  /api/v1/roles                      # List roles
GET  /api/v1/role-bindings              # List role bindings
GET  /api/v1/cluster-roles              # List cluster roles
GET  /api/v1/cluster-role-bindings      # List cluster role bindings
```

##### Storage Resources
```
GET  /api/v1/persistent-volumes         # List PVs
GET  /api/v1/persistent-volume-claims   # List PVCs
GET  /api/v1/storage-classes            # List storage classes
GET  /api/v1/volume-snapshots           # List volume snapshots
```

##### Monitoring & Analytics
```
GET  /api/v1/metrics                    # Cluster metrics
GET  /api/v1/timeseries/cluster         # Time series data
GET  /api/v1/analytics/visitors         # Visitor analytics
GET  /api/v1/logs                       # Log access (cached)
```

##### WebSocket Streams
```
GET  /api/v1/stream/nodes               # Real-time node updates
GET  /api/v1/stream/pods                # Real-time pod updates
GET  /api/v1/stream/overview            # Real-time overview
GET  /api/v1/timeseries/live            # Live metrics stream
```

### 4. Write Tier (`write.go`)
**Access Level**: Authentication + write permissions  
**Purpose**: Modification operations on Kubernetes resources

#### Routes:
```
POST   /api/v1/nodes/{name}/cordon      # Cordon node
POST   /api/v1/nodes/{name}/uncordon    # Uncordon node
POST   /api/v1/nodes/{name}/drain       # Drain node
POST   /api/v1/actions                  # Execute generic actions
POST   /api/v1/scale                    # Scale resources
DELETE /api/v1/resources                # Delete resources
POST   /api/v1/namespaces               # Create namespace
DELETE /api/v1/namespaces/{namespace}   # Delete namespace
POST   /api/v1/secrets                  # Create secret
PUT    /api/v1/secrets/{namespace}/{name} # Update secret
DELETE /api/v1/secrets/{namespace}/{name} # Delete secret
GET    /api/v1/exec/{sessionId}         # WebSocket exec session
POST   /api/v1/logs/stream              # Start log stream
DELETE /api/v1/logs/stream/{streamId}   # Stop log stream
```

### 5. Apply Tier (`apply.go`)
**Access Level**: Authentication + write permissions + higher rate limits  
**Purpose**: YAML application and configuration deployment

#### Routes:
```
POST /api/v1/apply                      # Apply configuration
POST /api/v1/namespaces/{namespace}/apply # Apply to specific namespace
```

### 6. System Tier (`system.go`)
**Access Level**: No authentication (internal/monitoring)  
**Purpose**: Health checks, metrics, and system information

#### Routes:
```
GET /healthz                            # Health check endpoint
GET /readyz                             # Readiness check endpoint
GET /version                            # Version information
GET /metrics                            # Prometheus metrics
```

### 7. Static Tier (`static.go`)
**Access Level**: Session-aware static serving  
**Purpose**: Single Page Application (SPA) hosting with session injection

#### Routes:
```
GET /*                                  # SPA catch-all with session injection
```

## Handler Contracts

The package defines handler interfaces that ensure loose coupling between routing and implementation:

### Core Interface Pattern
```go
// Example handler interface
type ReadHandlers interface {
    HandleListNodes(w http.ResponseWriter, r *http.Request)
    HandleGetNode(w http.ResponseWriter, r *http.Request)
    // ... additional methods
}

// Usage in route mounting
func MountRead(r chi.Router, h ReadHandlers) {
    r.Get("/nodes", h.HandleListNodes)
    r.Get("/nodes/{name}", h.HandleGetNode)
}
```

### Benefits:
- **Testability**: Easy to mock handlers for route testing
- **Modularity**: Routes can be developed independently of handler logic
- **Flexibility**: Multiple handler implementations (test, production, etc.)

## Middleware Integration

### Middleware Application Pattern
```go
// Authentication + impersonation for protected tiers
r.Group(func(r chi.Router) {
    if tiers.MW.RequireAuth != nil {
        r.Use(tiers.MW.RequireAuth)
    }
    if tiers.MW.RequireImpersonation != nil {
        r.Use(tiers.MW.RequireImpersonation)
    }
    MountRead(r, tiers.Read)
})
```

### Middleware Types:
- **RequireAuth**: Validates user authentication
- **RequireImpersonation**: Ensures Kubernetes client impersonation
- **Custom middlewares**: Can be added per tier as needed

## URL Design Patterns

### RESTful Resource Patterns
```
# Collection operations
GET    /api/v1/{resource}                    # List resources
POST   /api/v1/{resource}                    # Create resource

# Member operations  
GET    /api/v1/{resource}/{name}             # Get resource
PUT    /api/v1/{resource}/{name}             # Update resource
DELETE /api/v1/{resource}/{name}             # Delete resource

# Namespaced resources
GET    /api/v1/{resource}/{namespace}        # List in namespace
GET    /api/v1/{resource}/{namespace}/{name} # Get namespaced resource
```

### Action Patterns
```
POST /api/v1/{resource}/{name}/{action}      # Resource actions
POST /api/v1/actions                         # Generic actions
```

### Stream Patterns
```
GET /api/v1/stream/{resource}                # WebSocket streams
GET /api/v1/timeseries/{resource}            # Time series data
```

## Configuration

### Environment Integration
The routes package respects configuration for:
- Authentication mode (enables/disables auth middleware)
- Permission checking (enables/disables RBAC enforcement)
- Rate limiting (applies different limits per tier)

### Runtime Configuration
```go
type RoutesConfig struct {
    Auth struct {
        Enabled bool `yaml:"enabled"`
        Mode    string `yaml:"mode"`
    } `yaml:"auth"`
    
    RateLimit struct {
        ReadTier  int `yaml:"read_tier"`
        WriteTier int `yaml:"write_tier"`
        ApplyTier int `yaml:"apply_tier"`
    } `yaml:"rate_limit"`
}
```

## Security Considerations

### Authentication Flow
1. **Public routes**: No authentication required
2. **Protected routes**: Authentication middleware validates session
3. **Impersonation**: Kubernetes client impersonation for RBAC
4. **Permission checks**: Resource-level permission validation

### Authorization Layers
```
Request → Auth Check → Impersonation → Permission Check → Handler
    ↓         ↓            ↓              ↓            ↓
  Public   Session    K8s Client    RBAC/SSAR    Business Logic
```

### Rate Limiting
- **Read tier**: Higher limits for dashboard operations
- **Write tier**: Moderate limits for safety
- **Apply tier**: Lower limits to prevent resource exhaustion

## Error Handling

### Consistent Error Responses
```json
{
    "error": "Human-readable error message",
    "code": "MACHINE_READABLE_ERROR_CODE",
    "details": {
        "resource": "pods",
        "namespace": "default",
        "action": "list"
    }
}
```

### HTTP Status Codes
- **200**: Successful operation
- **400**: Bad request (invalid parameters)
- **401**: Authentication required
- **403**: Permission denied
- **404**: Resource not found
- **500**: Internal server error

## Testing

### Route Testing Pattern
```go
func TestRouteMount(t *testing.T) {
    // Create mock handlers
    mockHandlers := &MockReadHandlers{}
    
    // Setup router
    r := chi.NewRouter()
    MountRead(r, mockHandlers)
    
    // Test route
    req := httptest.NewRequest("GET", "/nodes", nil)
    rec := httptest.NewRecorder()
    r.ServeHTTP(rec, req)
    
    // Verify response
    assert.Equal(t, http.StatusOK, rec.Code)
}
```

### Mock Handler Implementation
```go
type MockReadHandlers struct {
    ListNodesCalled bool
}

func (m *MockReadHandlers) HandleListNodes(w http.ResponseWriter, r *http.Request) {
    m.ListNodesCalled = true
    w.WriteHeader(http.StatusOK)
}
```

## Performance Considerations

### Route Optimization
- **Grouped middleware**: Applied at tier level, not per route
- **Efficient routing**: Chi router with optimized path matching
- **Minimal allocations**: Reuse of middleware functions

### Caching Strategy
- **Static routes**: Cached at CDN/proxy level
- **API routes**: Conditional caching based on resource type
- **Stream routes**: No caching for real-time data

## Monitoring & Observability

### Route Metrics
```go
// Metrics tracked per route
var (
    requestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "kaptn_api_requests_total",
        },
        []string{"method", "path", "status"},
    )
    
    requestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name: "kaptn_api_request_duration_seconds",
        },
        []string{"method", "path"},
    )
)
```

### Logging Integration
```json
{
    "level": "info",
    "timestamp": "2025-09-29T10:30:00Z",
    "message": "API request",
    "method": "GET",
    "path": "/api/v1/pods",
    "status": 200,
    "duration": "45ms",
    "user_id": "user@example.com",
    "tier": "read"
}
```

## API Versioning

### Current Version: v1
All routes are currently under `/api/v1/` prefix for versioning support.

### Future Versioning Strategy
```
/api/v1/...    # Current stable API
/api/v2/...    # Future version (when needed)
/api/beta/...  # Beta features
```

### Backward Compatibility
- **Additive changes**: New optional fields/parameters
- **Deprecation process**: 90-day notice for breaking changes
- **Migration guides**: Documentation for version transitions

## Development Workflow

### Adding New Routes

1. **Define handler interface** in `contracts.go`:
```go
type NewHandlers interface {
    HandleNewOperation(w http.ResponseWriter, r *http.Request)
}
```

2. **Add route mounting** in appropriate tier file:
```go
func MountRead(r chi.Router, h ReadHandlers) {
    // existing routes...
    r.Get("/new-endpoint", h.HandleNewOperation)
}
```

3. **Implement handler** in server package:
```go
func (s *Server) HandleNewOperation(w http.ResponseWriter, r *http.Request) {
    // implementation
}
```

4. **Update interface conformance** in server:
```go
var _ routes.ReadHandlers = (*Server)(nil)
```

### Route Modification Guidelines
- **Never break existing routes** without versioning
- **Add optional parameters** rather than changing signatures
- **Use deprecation headers** for phase-out planning
- **Maintain RESTful conventions** for consistency

## Best Practices

### URL Design
- Use **kebab-case** for multi-word resources (`persistent-volumes`)
- Be **consistent** with plural forms for collections
- Use **descriptive names** that match Kubernetes resources
- Avoid **deep nesting** beyond 3 levels

### Middleware Usage
- Apply **minimal necessary middleware** per tier
- Use **conditional middleware** application
- **Group related routes** under common middleware
- **Order middleware** for optimal performance

### Error Handling
- Return **appropriate HTTP status codes**
- Provide **meaningful error messages**
- Include **request correlation IDs**
- **Log errors** with sufficient context

### Security
- **Validate all inputs** at route level
- **Sanitize path parameters** to prevent injection
- **Apply principle of least privilege** for permissions
- **Audit sensitive operations** via middleware

## Troubleshooting

### Common Issues

#### Route Not Found (404)
```
Error: 404 Not Found for /api/v1/missing-endpoint
```
**Solution**: Verify route is defined in appropriate tier file and mounted correctly

#### Middleware Not Applied
```
Error: Authentication required but middleware bypassed
```
**Solution**: Check middleware application in `api.go` tier grouping

#### Handler Interface Mismatch
```
Error: Type does not implement interface
```
**Solution**: Ensure server implements all required interface methods

### Debug Mode
Enable route debugging:
```go
r.Use(chimiddleware.Logger)  // Request logging
r.Use(chimiddleware.Recoverer)  // Panic recovery
```

### Route Inspection
List all registered routes:
```bash
go run cmd/server/main.go --debug-routes
```

## Future Enhancements

### Planned Features
- **GraphQL endpoint** for complex queries
- **Batch operations** for multiple resource actions
- **Streaming APIs** beyond WebSocket
- **API rate limiting** per user/group
- **Request/response compression**

### API Evolution
- **Standardized pagination** across all list endpoints
- **Consistent filtering** query parameters
- **Standardized sorting** capabilities
- **Field selection** for reduced payload sizes
- **ETag support** for conditional requests

## Dependencies

### External Dependencies
- `github.com/go-chi/chi/v5` - HTTP router and middleware
- `github.com/prometheus/client_golang` - Metrics collection
- Standard library (`net/http`, `encoding/json`)

### Internal Dependencies
- `internal/api/middleware` - Authentication and security middleware
- Handler implementations in server package
- Configuration management for routing behavior

This documentation provides comprehensive coverage of the API routes package, serving as both a developer guide for extending the API and an operational reference for understanding Kaptn's URL structure and security model.