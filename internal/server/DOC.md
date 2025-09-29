# Server Package Documentation

## Overview

The `internal/server` package serves as the central HTTP server and dependency injection container for the Kaptn Kubernetes admin dashboard. It orchestrates all HTTP concerns including routing, middleware, authentication, static asset serving, and WebSocket management while providing comprehensive integration of all internal services.

## Package Architecture

```
internal/server/
├── README.md                       # Package scope and patterns
├── server.go                      # Main server construction and DI
├── static.go                      # Static SPA serving with session injection
├── interfaces.go                  # Server interfaces and contracts
├── helpers.go                     # Common helper functions
├── utils.go                       # Utility functions for handlers
├── client_helpers.go              # Kubernetes client helper functions
├── k8s_error_utils.go            # Kubernetes error handling utilities
├── response_formatters.go        # HTTP response formatting
├── permissions.go                 # Permission checking helpers
├── logs_types.go                 # Log-related type definitions
├── handlers_*.go                 # Handler implementations (30+ files)
├── handlers_*_test.go            # Handler testing
└── future_do_not_use/            # Deprecated functionality
```

## Core Components

### 1. Server Structure (`server.go`)

Central server structure that manages all dependencies and service integration.

```go
type Server struct {
    logger               *zap.Logger
    config               *config.Config
    router               chi.Router
    
    // Kubernetes clients and services
    kubeClient           kubernetes.Interface
    dynamicClient        dynamic.Interface
    informerManager      *informers.Manager
    clientFactory        *client.Factory
    
    // Core services
    wsHub                *ws.Hub                    // WebSocket hub
    actionsService       *actions.NodeActionsService
    applyService         *actions.ApplyService
    actionCoordinator    *actions.ActionCoordinator
    
    // Logging services
    logsService          *k8slogs.StreamManager     // Legacy streaming
    logsCacheService     logs.LogService            // Modern cache service
    logsCoordinator      *k8slogs.StreamCoordinator // Multi-pod coordination
    
    // Resource management
    execService          *exec.ExecManager
    metricsService       *metrics.MetricsService
    overviewService      *overview.OverviewService
    resourceManager      *resources.ResourceManager
    analyticsService     *analytics.AnalyticsService
    summaryService       *summaries.SummaryService
    resourceCache        *cache.ResourceCache
    searchService        *cache.SearchService
    
    // Authentication and authorization
    authMiddleware       *auth.Middleware
    oidcClient           *auth.OIDCClient
    oidcStateStore       *auth.OIDCStateStore
    sessionManager       *auth.SessionManager
    impersonationMgr     *k8s.ImpersonationManager
    capabilityService    *authz.CapabilityService
    
    // Time series and monitoring
    timeSeriesStore      *timeseries.MemStore
    timeSeriesAggregator *aggregator.Aggregator
    timeSeriesWSManager  *TimeSeriesWSManager
    
    // Middleware components
    permissionMiddleware    *middleware.PermissionMiddleware
    impersonationMiddleware *middleware.ImpersonationMiddleware
}
```

### 2. Server Lifecycle

#### Initialization Process:
1. **Client Setup**: Kubernetes client initialization with rate limiting
2. **Informer Setup**: Resource informer initialization for real-time updates
3. **Service Integration**: All internal services wired with dependencies
4. **Middleware Configuration**: Authentication, authorization, and security middleware
5. **Route Registration**: API routes mounted via `internal/api/routes`
6. **Static Asset Setup**: Frontend SPA serving with session injection

#### Service Dependencies Flow:
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Config        │    │  Kubernetes      │    │  Authentication │
│ (Configuration) │───▶│   Clients        │───▶│   Middleware    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                         │
                                ▼                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Services      │◄───│   Informers      │    │   Router        │
│ (All Internal)  │    │   (Real-time)    │    │ (Chi + Routes)  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                                               │
         ▼                                               ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Handlers      │    │   WebSocket      │    │  Static Assets  │
│ (HTTP/REST API) │◄───│     Hub          │    │   (Frontend)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 3. Handler Organization

The server package contains 30+ handler files organized by functional domain:

#### Core Handlers:
- `handlers_auth.go` - Authentication and session management
- `handlers_authz_capabilities.go` - Authorization capability checks
- `handlers_cluster.go` - Cluster-level resource operations
- `handlers_workloads.go` - Workload resource management
- `handlers_services.go` - Service and networking resources
- `handlers_storage.go` - Storage resource management

#### Administrative Handlers:
- `handlers_admin.go` - Administrative functions
- `handlers_admin_logs.go` - Log administration and debugging
- `handlers_analytics.go` - Analytics and metrics
- `handlers_system.go` - System information and health

#### Specialized Handlers:
- `handlers_websocket.go` - WebSocket upgrade and management
- `handlers_logs.go` - Log querying and streaming
- `handlers_timeseries.go` - Time series data and metrics
- `handlers_actions.go` - Action execution and coordination
- `handlers_search.go` - Resource search functionality

### 4. Static Asset Serving (`static.go`)

Sophisticated static asset serving with session injection for the frontend SPA.

#### Features:
- **Session Injection**: Server-side session data injection into HTML
- **SPA Fallback**: Proper routing for single-page application
- **Security Headers**: Comprehensive security header management
- **Cache Control**: Intelligent caching strategies for static assets

```go
type SessionData struct {
    User        *auth.User              // Authenticated user information
    Cluster     string                  // Current cluster context
    Permissions map[string]bool         // User permissions cache
    Features    map[string]bool         // Enabled features
    CSRFToken   string                  // CSRF protection token
    Config      map[string]interface{}  // Client-side configuration
}
```

## HTTP Architecture

### 1. Routing Structure

The server uses Chi router with tiered routing from `internal/api/routes`:

```go
func (s *Server) SetupRoutes() {
    // Global middleware
    s.router.Use(chimiddleware.RequestID)
    s.router.Use(chimiddleware.RealIP)
    s.router.Use(chimiddleware.Logger)
    s.router.Use(chimiddleware.Recoverer)
    s.router.Use(apimiddleware.CORS(s.config.Server.CORS))
    s.router.Use(apimiddleware.SecurityHeaders())
    
    // Authentication middleware
    if s.config.Security.AuthMode != "none" {
        s.router.Use(s.authMiddleware.Middleware())
    }
    
    // API routes with tiers
    s.router.Route("/api", func(r chi.Router) {
        routes.MountPublicRoutes(r, s)      // Public tier
        routes.MountAdminRoutes(r, s)       // Admin tier  
        routes.MountReadRoutes(r, s)        // Read tier
        routes.MountWriteRoutes(r, s)       // Write tier
        routes.MountApplyRoutes(r, s)       // Apply tier
    })
    
    // WebSocket endpoints
    s.router.Handle("/ws/*", s.handleWebSocket())
    
    // Prometheus metrics
    s.router.Handle("/metrics", promhttp.Handler())
    
    // Static assets and SPA
    s.router.Handle("/*", s.GetStaticHandler())
}
```

### 2. Middleware Stack

Comprehensive middleware stack for security, authentication, and request processing:

#### Global Middleware (All Requests):
```go
// Chi built-in middleware
chimiddleware.RequestID        // Request ID generation
chimiddleware.RealIP          // Real IP extraction
chimiddleware.Logger          // Request logging
chimiddleware.Recoverer       // Panic recovery

// Custom security middleware
apimiddleware.CORS            // Cross-origin resource sharing
apimiddleware.SecurityHeaders // Security headers (CSP, HSTS, etc.)
apimiddleware.RateLimiting    // Rate limiting protection
```

#### Authentication Middleware (Protected Routes):
```go
authMiddleware.Middleware()    // User authentication and session
permissionMiddleware          // Permission checking
impersonationMiddleware       // Kubernetes impersonation
```

#### Route-Specific Middleware:
```go
// Applied per tier based on requirements
middleware.RequireAuth()         // Require authenticated user
middleware.RequireImpersonation() // Require Kubernetes access
middleware.RequirePermission()    // Require specific permissions
middleware.RequireCSRF()         // CSRF protection for mutations
```

### 3. Request Processing Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  HTTP Request   │    │   Global         │    │  Authentication │
│  (Client)       │───▶│  Middleware      │───▶│   Middleware    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  HTTP Response  │◄───│   Handler        │◄───│  Impersonation  │
│  (JSON/HTML)    │    │  (Business)      │    │   Middleware    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         ▲                       │                       │
         │                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│Response Formatter│◄───│   Kubernetes     │◄───│   Permission    │
│ (JSON/Error)    │    │    Services      │    │   Checking      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Usage Examples

### Basic Server Setup
```go
package main

import (
    "context"
    "log"
    "github.com/example/kaptn/internal/server"
    "github.com/example/kaptn/internal/config"
    "go.uber.org/zap"
)

func main() {
    logger := zap.NewProduction()
    
    // Load configuration
    cfg, err := config.Load()
    if err != nil {
        log.Fatal("Failed to load config:", err)
    }
    
    // Create server
    srv, err := server.New(logger, cfg)
    if err != nil {
        log.Fatal("Failed to create server:", err)
    }
    
    // Start server
    ctx := context.Background()
    if err := srv.Start(ctx); err != nil {
        log.Fatal("Failed to start server:", err)
    }
    
    // Graceful shutdown
    defer srv.Stop()
    
    // Wait for termination signal
    // ... signal handling
}
```

### Handler Implementation Pattern
```go
// Example handler following the established pattern
func (s *Server) handleResourceOperation(w http.ResponseWriter, r *http.Request) {
    // Extract parameters
    namespace := chi.URLParam(r, "namespace")
    name := chi.URLParam(r, "name")
    
    // Get impersonated clients from context
    clients, ok := k8s.ImpersonatedClientsFromContext(r.Context())
    if !ok {
        http.Error(w, "No kubernetes access", http.StatusInternalServerError)
        return
    }
    
    // Perform operation with user's permissions
    resource, err := clients.Client().CoreV1().Pods(namespace).Get(
        r.Context(), name, metav1.GetOptions{})
    if err != nil {
        s.handleK8sError(w, r, err)
        return
    }
    
    // Format and return response
    s.writeJSONResponse(w, resource)
}
```

### WebSocket Handler Integration
```go
// WebSocket upgrade and management
func (s *Server) handleWebSocket() http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // Extract user from context
        user, ok := auth.UserFromContext(r.Context())
        if !ok {
            http.Error(w, "Unauthorized", http.StatusUnauthorized)
            return
        }
        
        // Upgrade to WebSocket
        conn, err := upgrader.Upgrade(w, r, nil)
        if err != nil {
            s.logger.Error("WebSocket upgrade failed", zap.Error(err))
            return
        }
        
        // Register with hub
        client := ws.NewClient(conn, user.ID, s.logger)
        s.wsHub.Register(client)
        
        // Handle client lifecycle
        go client.WritePump()
        go client.ReadPump()
    }
}
```

### Static Asset Serving with Session Injection
```go
// Static handler with session injection
func (s *Server) GetStaticHandler() http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Check if this is the main HTML request
        if r.URL.Path == "/" || r.URL.Path == "/index.html" {
            s.serveIndexWithSession(w, r)
            return
        }
        
        // Serve static assets normally
        s.staticFileHandler.ServeHTTP(w, r)
    })
}

func (s *Server) serveIndexWithSession(w http.ResponseWriter, r *http.Request) {
    // Extract user session
    user, _ := auth.UserFromContext(r.Context())
    
    // Build session data
    sessionData := SessionData{
        User:    user,
        Cluster: s.config.Kubernetes.ClusterName,
        Features: map[string]bool{
            "enableApply":     s.config.Features.EnableApply,
            "enableOverview":  s.config.Features.EnableOverview,
            "enableAnalytics": s.config.Features.EnablePrometheusAnalytics,
        },
    }
    
    // Inject session into HTML
    s.injectSessionIntoHTML(w, sessionData)
}
```

## Service Integration

### 1. Dependency Injection Pattern

The server acts as a comprehensive dependency injection container:

```go
func (s *Server) initServices() error {
    // Initialize services in dependency order
    
    // 1. Core Kubernetes services
    s.clientFactory = client.NewFactory(...)
    s.informerManager = informers.NewManager(...)
    
    // 2. Authentication services
    s.oidcClient = auth.NewOIDCClient(...)
    s.sessionManager = auth.NewSessionManager(...)
    s.authMiddleware = auth.NewMiddleware(...)
    
    // 3. Authorization services
    s.capabilityService = authz.NewCapabilityService(...)
    s.impersonationMgr = k8s.NewImpersonationManager(...)
    
    // 4. Resource services
    s.resourceManager = resources.NewResourceManager(...)
    s.metricsService = metrics.NewMetricsService(...)
    s.overviewService = overview.NewOverviewService(...)
    
    // 5. Logging services
    s.logsCacheService = logs.NewReliableLogService(...)
    s.logsCoordinator = k8slogs.NewStreamCoordinator(...)
    
    // 6. Action services
    s.actionsService = actions.NewNodeActionsService(...)
    s.actionCoordinator = actions.NewActionCoordinator(...)
    
    return nil
}
```

### 2. Service Cross-References

Services are interconnected through dependency injection:

```go
// Example: Logs coordinator depends on multiple services
s.logsCoordinator = k8slogs.NewStreamCoordinator(
    s.logger,                    // Logging
    s.kubeClient,               // Kubernetes access
    s.logsCacheService,         // Log storage
    s.wsHub,                    // WebSocket broadcasting
    s.config.Kubernetes.ClusterName, // Configuration
)

// Example: Action coordinator integrates safety and audit
s.actionCoordinator = actions.NewActionCoordinator(
    s.logger,                   // Logging
    safetyGuard,               // Safety checks
    auditLogger,               // Audit logging
    ssarHelper,                // Permission checking
    s.actionsService,          // Node actions
    s.applyService,            // YAML apply
    s.impersonationMgr,        // User impersonation
    coordinatorOptions,        // Configuration
)
```

### 3. Real-Time Integration

WebSocket hub integration for real-time updates:

```go
// Informer event handlers broadcast to WebSocket clients
s.informerManager.AddPodEventHandler(cache.ResourceEventHandlerFuncs{
    AddFunc: func(obj interface{}) {
        pod := obj.(*corev1.Pod)
        s.wsHub.BroadcastPodUpdate("create", pod)
    },
    UpdateFunc: func(oldObj, newObj interface{}) {
        pod := newObj.(*corev1.Pod)
        s.wsHub.BroadcastPodUpdate("update", pod)
    },
    DeleteFunc: func(obj interface{}) {
        pod := obj.(*corev1.Pod)
        s.wsHub.BroadcastPodUpdate("delete", pod)
    },
})
```

## Authentication & Authorization Integration

### 1. Authentication Flow

```go
func (s *Server) initAuthentication() error {
    if s.config.Security.AuthMode == "oidc" {
        // OIDC client setup
        s.oidcClient = auth.NewOIDCClient(
            s.config.Security.OIDC.Issuer,
            s.config.Security.OIDC.ClientID,
            s.config.Security.OIDC.ClientSecret,
            s.config.Security.OIDC.RedirectURL,
            s.logger,
        )
        
        // Session management
        s.sessionManager = auth.NewSessionManager(
            s.config.Server.CookieSecret,
            s.config.Security.SessionTTL,
            s.logger,
        )
        
        // Authentication middleware
        s.authMiddleware = auth.NewMiddleware(
            s.oidcClient,
            s.sessionManager,
            s.logger,
        )
    }
    
    return nil
}
```

### 2. Authorization Integration

```go
// Capability service for fine-grained permissions
s.capabilityService = authz.NewCapabilityService(
    s.logger,
    30*time.Second, // Cache TTL
)

// Impersonation manager for Kubernetes access
s.impersonationMgr = k8s.NewImpersonationManager(
    impersonationFactory,
    s.logger,
)

// Permission middleware
s.permissionMiddleware = middleware.NewPermissionMiddleware(
    s.capabilityService,
    s.logger,
)
```

### 3. Request Context Enhancement

```go
// Middleware adds user and clients to request context
func (s *Server) enhanceRequestContext() {
    s.router.Use(func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Extract user from session
            user, ok := auth.UserFromContext(r.Context())
            if !ok {
                next.ServeHTTP(w, r)
                return
            }
            
            // Create impersonated clients
            clients, err := s.impersonationMgr.BuildClientsFromUser(
                user, s.config.Security.UsernameFormat)
            if err != nil {
                s.logger.Error("Failed to create impersonated clients", zap.Error(err))
                http.Error(w, "Authentication error", http.StatusInternalServerError)
                return
            }
            
            // Add clients to context
            ctx := k8s.WithImpersonatedClients(r.Context(), clients)
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    })
}
```

## Error Handling

### 1. Kubernetes Error Handling (`k8s_error_utils.go`)

Comprehensive Kubernetes error handling with user-friendly messages:

```go
func (s *Server) handleK8sError(w http.ResponseWriter, r *http.Request, err error) {
    var statusCode int
    var message string
    
    switch {
    case errors.IsNotFound(err):
        statusCode = http.StatusNotFound
        message = "Resource not found"
    case errors.IsForbidden(err):
        statusCode = http.StatusForbidden
        message = "Access denied"
    case errors.IsUnauthorized(err):
        statusCode = http.StatusUnauthorized
        message = "Authentication required"
    case errors.IsConflict(err):
        statusCode = http.StatusConflict
        message = "Resource conflict"
    case errors.IsInvalid(err):
        statusCode = http.StatusBadRequest
        message = "Invalid resource"
    default:
        statusCode = http.StatusInternalServerError
        message = "Internal server error"
    }
    
    s.logger.Error("Kubernetes operation failed",
        zap.Error(err),
        zap.String("method", r.Method),
        zap.String("path", r.URL.Path),
        zap.Int("status", statusCode))
    
    s.writeErrorResponse(w, statusCode, message)
}
```

### 2. Response Formatting (`response_formatters.go`)

Consistent response formatting across all handlers:

```go
func (s *Server) writeJSONResponse(w http.ResponseWriter, data interface{}) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    
    if err := json.NewEncoder(w).Encode(data); err != nil {
        s.logger.Error("Failed to encode JSON response", zap.Error(err))
    }
}

func (s *Server) writeErrorResponse(w http.ResponseWriter, statusCode int, message string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(statusCode)
    
    response := map[string]interface{}{
        "error":   message,
        "status":  statusCode,
        "timestamp": time.Now().Unix(),
    }
    
    json.NewEncoder(w).Encode(response)
}
```

## Performance Optimization

### 1. Connection Pooling

Optimized Kubernetes client configuration:

```go
func (s *Server) initKubernetesClient() error {
    // Main client with standard limits
    factory, err := client.NewFactory(
        s.logger,
        client.ClientMode(s.config.Kubernetes.Mode),
        s.config.Kubernetes.KubeconfigPath,
        s.config.Kubernetes.QPS,
        s.config.Kubernetes.Burst,
    )
    
    // Separate client for logs collection with lower limits
    logsConfig := rest.CopyConfig(factory.RESTConfig())
    logsConfig.QPS = s.config.Kubernetes.LogsQPS
    logsConfig.Burst = s.config.Kubernetes.LogsBurst
    
    logsClient, err := kubernetes.NewForConfig(logsConfig)
    // Use logsClient for background log collection
    
    return nil
}
```

### 2. Caching Integration

Multiple levels of caching:

```go
// Resource cache for fast searches
s.resourceCache = cache.NewResourceCache(
    s.logger,
    s.kubeClient,
    cacheConfig,
)

// Search service over cached resources
s.searchService = cache.NewSearchService(
    s.logger,
    s.resourceCache,
)

// Capability caching in authz service
s.capabilityService = authz.NewCapabilityService(
    s.logger,
    30*time.Second, // Cache TTL
)
```

### 3. WebSocket Optimization

Efficient WebSocket management:

```go
// WebSocket hub with connection pooling
s.wsHub = ws.NewHub(s.logger)

// Time series WebSocket manager
s.timeSeriesWSManager = NewTimeSeriesWSManager(
    s.logger,
    s.timeSeriesStore,
    s.wsHub,
)
```

## Monitoring & Observability

### 1. Metrics Integration

Comprehensive metrics collection:

```go
// Prometheus metrics endpoint
s.router.Handle("/metrics", promhttp.Handler())

// Service-specific metrics
s.analyticsService.RegisterPrometheusMetrics()
s.logsCacheService.RegisterPrometheusMetrics()
s.actionCoordinator.RegisterPrometheusMetrics()
```

### 2. Structured Logging

Request-scoped logging with correlation:

```go
func (s *Server) logRequest(r *http.Request) *zap.Logger {
    requestID := middleware.GetReqID(r.Context())
    user, _ := auth.UserFromContext(r.Context())
    
    fields := []zap.Field{
        zap.String("request_id", requestID),
        zap.String("method", r.Method),
        zap.String("path", r.URL.Path),
    }
    
    if user != nil {
        fields = append(fields, zap.String("user_id", user.ID))
    }
    
    return s.logger.With(fields...)
}
```

### 3. Health Checks

Comprehensive health monitoring:

```go
func (s *Server) handleHealthCheck(w http.ResponseWriter, r *http.Request) {
    health := map[string]interface{}{
        "status": "healthy",
        "timestamp": time.Now().Unix(),
        "services": map[string]interface{}{
            "kubernetes":  s.checkKubernetesHealth(),
            "logs":        s.logsCacheService.Health(),
            "timeseries":  s.timeSeriesStore.Health(),
            "websocket":   s.wsHub.Health(),
        },
    }
    
    s.writeJSONResponse(w, health)
}
```

## Configuration

### Server Configuration
```go
// Environment variables
KAPTN_SERVER_ADDR=0.0.0.0:8080        # Server listen address
KAPTN_BASE_PATH=/                      # Base path for routes
KAPTN_COOKIE_SECRET=secret-key         # Session encryption key

// TLS configuration
KAPTN_TLS_ENABLED=true                 # Enable HTTPS
KAPTN_TLS_CERT_FILE=/path/to/cert.pem  # TLS certificate
KAPTN_TLS_KEY_FILE=/path/to/key.pem    # TLS private key

// CORS configuration
KAPTN_CORS_ORIGINS=https://kaptn.example.com
KAPTN_CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
```

### Feature Flags
```go
// Feature toggles
KAPTN_ENABLE_APPLY=true                # Enable YAML apply
KAPTN_ENABLE_NODE_ACTIONS=true         # Enable node actions
KAPTN_ENABLE_OVERVIEW=true             # Enable overview page
KAPTN_ENABLE_PROMETHEUS_ANALYTICS=true # Enable analytics
```

## Testing

### Handler Testing
```go
func TestHandler(t *testing.T) {
    logger := zaptest.NewLogger(t)
    cfg := &config.Config{
        // Test configuration
    }
    
    server, err := server.New(logger, cfg)
    require.NoError(t, err)
    
    // Create test request
    req := httptest.NewRequest("GET", "/api/v1/pods", nil)
    w := httptest.NewRecorder()
    
    // Execute handler
    server.router.ServeHTTP(w, req)
    
    // Assert response
    assert.Equal(t, http.StatusOK, w.Code)
}
```

### Integration Testing
```go
func TestServerIntegration(t *testing.T) {
    // Setup test server with real dependencies
    server := setupTestServer(t)
    
    // Start server
    go server.Start(context.Background())
    defer server.Stop()
    
    // Test endpoints
    resp, err := http.Get("http://localhost:8080/api/v1/health")
    assert.NoError(t, err)
    assert.Equal(t, http.StatusOK, resp.StatusCode)
}
```

## Security Considerations

### Request Security
- **CSRF Protection**: Token-based CSRF protection for mutations
- **Rate Limiting**: Request rate limiting per client
- **Input Validation**: Comprehensive input validation and sanitization
- **Security Headers**: CSP, HSTS, and other security headers

### Authentication Security
- **Session Management**: Secure session handling with encryption
- **Token Validation**: Comprehensive token validation and refresh
- **Impersonation Security**: Secure Kubernetes impersonation with RBAC
- **Audit Logging**: Complete audit trail of all operations

## Best Practices

### Handler Implementation
- **Context Propagation**: Always propagate request context
- **Error Handling**: Comprehensive error handling with logging
- **Response Formatting**: Consistent response format across handlers
- **Permission Checking**: Always check permissions before operations

### Service Integration
- **Dependency Injection**: Clear dependency management
- **Interface Usage**: Program to interfaces for testability
- **Lifecycle Management**: Proper service startup and shutdown
- **Resource Cleanup**: Ensure proper resource cleanup

## Future Enhancements

### Planned Features
- **HTTP/2 Support**: Enhanced protocol support
- **API Versioning**: Comprehensive API versioning strategy
- **Request Tracing**: Distributed tracing integration
- **Advanced Caching**: Multi-level caching strategies

### Extensibility Points
- **Handler Plugins**: Pluggable handler architecture
- **Middleware Extensions**: Custom middleware support
- **Service Providers**: Pluggable service provider architecture
- **Authentication Providers**: Multiple authentication backend support

## Dependencies

### External Dependencies
- `github.com/go-chi/chi/v5` - HTTP router and middleware
- `go.uber.org/zap` - Structured logging
- `k8s.io/client-go` - Kubernetes client libraries
- `net/http` - Standard HTTP library

### Internal Dependencies
- All internal packages (analytics, auth, authz, cache, config, k8s, logs, etc.)
- Serves as the integration point for the entire application

This documentation provides comprehensive coverage of the server package, serving as both a developer guide for extending HTTP functionality and an operational reference for deploying and maintaining Kaptn's web server infrastructure.