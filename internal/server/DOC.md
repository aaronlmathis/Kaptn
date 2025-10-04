# Server Package Documentation

## Overview

The `internal/server` package serves as the central orchestration layer for Kaptn's Kubernetes admin dashboard, implementing a comprehensive HTTP server with contract-based routing, extensive handler implementations, and sophisticated security patterns. This package integrates all backend components into a cohesive API server with real-time capabilities, enterprise authentication, and comprehensive resource management.

## Package Architecture

```
internal/server/
├── server.go                          # Main server orchestration and initialization
├── interfaces.go                      # Contract implementations verification
├── static.go                          # Static file serving with session injection
├── client_helpers.go                  # Kubernetes client management utilities
├── utils.go                           # General utility functions
├── helpers.go                         # Server-specific helper functions
├── permissions.go                     # Advanced permission checking and RBAC
├── response_formatters.go             # Centralized response formatting
├── k8s_error_utils.go                 # Kubernetes error handling utilities
├── logs_types.go                      # Log-related type definitions
│
├── handlers_common.go                 # Common handler patterns and utilities
├── handlers_auth.go                   # Authentication and authorization handlers
├── handlers_actions.go                # Resource action handlers (cordon, drain, etc.)
├── handlers_actions_generic.go        # Generic action handlers
├── handlers_admin.go                  # Administrative operations handlers
├── handlers_admin_logs.go             # Admin log management handlers
├── handlers_analytics.go              # Analytics and metrics handlers
├── handlers_authz_capabilities.go     # Authorization capabilities handlers
├── handlers_cluster.go                # Cluster-wide resource handlers
├── handlers_cluster_roles.go          # RBAC cluster role handlers
├── handlers_crds.go                   # Custom Resource Definition handlers
├── handlers_csrf.go                   # CSRF protection handlers
├── handlers_debug.go                  # Debugging and diagnostics handlers
├── handlers_events.go                 # Kubernetes events handlers
├── handlers_hpa.go                    # Horizontal Pod Autoscaler handlers
├── handlers_hpa_timeseries.go         # HPA timeseries data handlers
├── handlers_impersonation.go          # User impersonation handlers
├── handlers_istio.go                  # Istio service mesh handlers
├── handlers_logs.go                   # Log streaming and management handlers
├── handlers_metrics.go                # Metrics collection and exposure handlers
├── handlers_permissions.go            # Permission validation handlers
├── handlers_rbac_builder.go           # RBAC rule building handlers
├── handlers_rbac_identities.go        # RBAC identity management handlers
├── handlers_roles.go                  # RBAC role handlers
├── handlers_search.go                 # Resource search handlers
├── handlers_secrets.go                # Secret management handlers
├── handlers_services.go               # Service resource handlers
├── handlers_storage.go                # Storage resource handlers
├── handlers_summaries.go              # Resource summary handlers
├── handlers_system.go                 # System status and health handlers
├── handlers_timeseries.go             # Timeseries data and WebSocket handlers
├── handlers_timeseries_health.go      # Timeseries health monitoring handlers
├── handlers_websocket.go              # WebSocket connection management handlers
├── handlers_workloads.go              # Workload resource handlers
│
├── future_do_not_use/                 # Deprecated/future code
└── DOC.md                             # This documentation file
```

## Core Components

### 1. Server Orchestration (`server.go`)

The main server struct that coordinates all backend services and implements the contract interfaces.

#### Server Structure
```go
type Server struct {
    logger               *zap.Logger
    config               *config.Config
    router               chi.Router
    kubeClient           kubernetes.Interface
    dynamicClient        dynamic.Interface
    informerManager      *informers.Manager
    wsHub                *ws.Hub
    actionsService       *actions.NodeActionsService
    applyService         *actions.ApplyService
    actionCoordinator    *actions.ActionCoordinator
    logsService          *k8slogs.StreamManager
    logsCacheService     logs.LogService
    logsCoordinator      *k8slogs.StreamCoordinator
    execService          *exec.ExecManager
    metricsService       *metrics.MetricsService
    overviewService      *overview.OverviewService
    resourceManager      *resources.ResourceManager
    analyticsService     *analytics.AnalyticsService
    summaryService       *summaries.SummaryService
    resourceCache        *cache.ResourceCache
    searchService        *cache.SearchService
    authMiddleware       *auth.Middleware
    oidcClient           *auth.OIDCClient
    oidcStateStore       *auth.OIDCStateStore
    loginNextStore       *auth.LoginNextStore
    sessionManager       *auth.SessionManager
    impersonationMgr     *k8s.ImpersonationManager
    clientFactory        *client.Factory
    timeSeriesStore      *timeseries.MemStore
    timeSeriesAggregator *aggregator.Aggregator
    timeSeriesWSManager  *TimeSeriesWSManager
    capabilityService    *authz.CapabilityService
    permissionMiddleware    *middleware.PermissionMiddleware
    impersonationMiddleware *middleware.ImpersonationMiddleware
}
```

#### Server Lifecycle
```go
func New(logger *zap.Logger, cfg *config.Config) (*Server, error)
func (s *Server) Start(ctx context.Context) error
func (s *Server) Stop()
func (s *Server) Handler() http.Handler
func (s *Server) SetupRoutes()
```

**Initialization Sequence:**
1. **Kubernetes Client Setup** - Initialize client factory with impersonation support
2. **Informers Initialization** - Set up resource informers with event handlers
3. **Service Initialization** - Initialize all backend services (metrics, logs, analytics, etc.)
4. **Authentication Setup** - Configure OIDC, session management, and authorization
5. **Middleware Setup** - Configure security, CORS, metrics, and request processing
6. **Route Setup** - Mount all API routes using contract-based architecture

**Start Process:**
1. **WebSocket Hub** - Start real-time communication hub
2. **Overview Streaming** - Start cluster overview data streaming
3. **Background Services** - Start summary processing, resource cache, timeseries aggregation
4. **Log Services** - Start reliable log collection and caching
5. **Informers** - Start Kubernetes resource watching

### 2. Contract-Based Route Implementation (`interfaces.go`)

The server implements all route contracts defined in the `internal/api/routes` package:

```go
var _ routes.PublicHandlers = (*Server)(nil)
var _ routes.AdminHandlers = (*Server)(nil)
var _ routes.ReadHandlers = (*Server)(nil)
var _ routes.WriteHandlers = (*Server)(nil)
var _ routes.ApplyHandlers = (*Server)(nil)
var _ routes.SystemHandlers = (*Server)(nil)
var _ routes.StaticHandlers = (*Server)(nil)
```

This ensures compile-time verification that all required handlers are implemented.

### 3. Static File Serving with Session Injection (`static.go`)

Provides sophisticated static file serving with real-time session data injection.

#### SessionInjectionHandler
```go
type SessionInjectionHandler struct {
    logger         *zap.Logger
    filesDir       http.Dir
    authMode       string
    sessionManager *auth.SessionManager
    authMiddleware *auth.Middleware
}

func (h *SessionInjectionHandler) ServeHTTP(w http.ResponseWriter, r *http.Request)
func (h *SessionInjectionHandler) serveWithSessionInjection(w http.ResponseWriter, r *http.Request, filePath string)
func (h *SessionInjectionHandler) getSessionData(r *http.Request) *auth.MinimalUser
func (h *SessionInjectionHandler) injectSessionData(content string, sessionData *auth.MinimalUser, nonce string) string
```

**Key Features:**
- **Path Traversal Protection** - Validates file paths against base directory
- **Session Data Injection** - Injects current user session into HTML
- **CSP Nonce Integration** - Supports Content Security Policy with nonces
- **SPA Routing Support** - Handles client-side routing by serving index.html
- **Security Headers** - Applies appropriate caching and security headers

**Session Injection Process:**
```javascript
// Injected into HTML <head> or <body>
<script nonce="CSP_NONCE">
    window.__KAPTN_SESSION__ = {
        "id": "user@example.com",
        "email": "user@example.com", 
        "name": "User Name",
        "picture": "https://avatar.url",
        "isAuthenticated": true,
        "authMode": "oidc"
    };
</script>
```

### 4. Client Management (`client_helpers.go`)

Provides utilities for managing Kubernetes clients with impersonation support.

#### Client Helper Functions
```go
func (s *Server) GetImpersonatedClient(r *http.Request) (kubernetes.Interface, error)
func (s *Server) GetImpersonatedDynamicClient(r *http.Request) (dynamic.Interface, error)
func (s *Server) GetImpersonatedClients(r *http.Request) (*k8s.ImpersonatedClients, error)
func (s *Server) HasImpersonatedClients(r *http.Request) bool
func (s *Server) GetClientWithFallback(r *http.Request) kubernetes.Interface
```

**Impersonation Flow:**
1. **Authentication Middleware** - Validates user credentials and extracts groups
2. **Impersonation Middleware** - Creates impersonated Kubernetes clients based on user identity
3. **Context Storage** - Stores impersonated clients in request context
4. **Handler Access** - Handlers retrieve appropriate client for user's permissions

### 5. Advanced Permissions (`permissions.go`)

Implements comprehensive permission checking using Kubernetes RBAC.

#### Permission Structures
```go
type NamespacePermissions struct {
    UserEmail          string                         `json:"user_email"`
    Permissions        map[string]ResourcePermissions `json:"permissions"`
    ClusterPermissions ClusterPermissions             `json:"cluster_permissions"`
    Summary            PermissionsSummary             `json:"summary"`
}

type ResourcePermissions struct {
    Pods        []string `json:"pods"`
    Deployments []string `json:"deployments"`
    Services    []string `json:"services"`
    Secrets     []string `json:"secrets"`
}

type ClusterPermissions struct {
    Nodes               []string `json:"nodes"`
    Namespaces          []string `json:"namespaces"`
    ClusterRoles        []string `json:"cluster_roles"`
    ClusterRoleBindings []string `json:"cluster_role_bindings"`
    PersistentVolumes   []string `json:"persistent_volumes"`
    StorageClasses      []string `json:"storage_classes"`
    CustomResourceDefs  []string `json:"custom_resource_defs"`
}
```

**Permission Discovery Process:**
1. **Namespace Enumeration** - List accessible namespaces (limited for performance)
2. **Resource Verification** - Use SubjectAccessReview to check specific permissions
3. **Cluster Permissions** - Check cluster-scoped resource access
4. **Permission Aggregation** - Compile comprehensive permission matrix
5. **Summary Generation** - Create user permission summary and admin detection

### 6. Security Context and Audit Logging (`handlers_common.go`)

Implements sophisticated security patterns with audit logging.

#### Security Context
```go
type SecurityContext struct {
    User           *auth.User
    Client         kubernetes.Interface
    SSARHelper     *k8s.SSARHelper
    Logger         *zap.Logger
    RequestContext string
}

type SecurityError struct {
    Code    string
    Message string
    Status  int
}
```

**Security Flow:**
1. **Context Extraction** - Get user and impersonated clients from request
2. **Permission Verification** - Use SubjectAccessReview to validate action
3. **Audit Logging** - Log all permission checks and decisions
4. **Error Handling** - Provide structured security error responses

**Audit Event Structure:**
```json
{
  "event_type": "audit",
  "request_id": "req_123",
  "user_sub": "user@example.com",
  "user_email": "user@example.com",
  "user_groups": ["developers", "users"],
  "verb": "get",
  "resource": "pods",
  "namespace": "default",
  "name": "my-pod",
  "decision": "ALLOWED",
  "path": "/api/v1/namespaces/default/pods/my-pod",
  "method": "GET",
  "remote_addr": "192.168.1.100",
  "user_agent": "kaptn-frontend/1.0"
}
```

## Handler Categories

### 1. Authentication Handlers (`handlers_auth.go`)

Implements OIDC authentication flow with PKCE support.

#### Key Handlers
```go
func (s *Server) HandleLogin(w http.ResponseWriter, r *http.Request)
func (s *Server) HandleCallback(w http.ResponseWriter, r *http.Request)
func (s *Server) HandleLogout(w http.ResponseWriter, r *http.Request)
func (s *Server) HandleUserInfo(w http.ResponseWriter, r *http.Request)
func (s *Server) HandleRefreshToken(w http.ResponseWriter, r *http.Request)
```

**Login Flow:**
1. **State Generation** - Create OIDC state with PKCE parameters
2. **Authorization URL** - Generate provider authorization URL
3. **State Storage** - Store state securely in encrypted cookie
4. **Redirect Handling** - Handle provider callback with token exchange
5. **Session Creation** - Create secure session with JWT tokens

### 2. Resource Action Handlers (`handlers_actions.go`)

Implements Kubernetes resource operations with safety guards.

#### Node Operations
```go
func (s *Server) HandleCordonNode(w http.ResponseWriter, r *http.Request)
func (s *Server) HandleUncordonNode(w http.ResponseWriter, r *http.Request)
func (s *Server) HandleDrainNode(w http.ResponseWriter, r *http.Request)
```

**Action Coordination Flow:**
1. **Permission Check** - Verify user can perform action
2. **Safety Validation** - Apply safety guards and policies
3. **Action Execution** - Execute operation with proper error handling
4. **Progress Tracking** - Stream progress via WebSocket
5. **Audit Logging** - Log action completion and results

### 3. Workload Handlers (`handlers_workloads.go`)

Manages Kubernetes workload resources with enhanced metrics.

**Enhanced Pod Response Example:**
```json
{
  "name": "my-app-pod",
  "namespace": "default",
  "phase": "Running",
  "ready": "1/1",
  "restartCount": 0,
  "age": "2h",
  "node": "worker-1",
  "cpu": {
    "milli": 250,
    "ofLimitPercent": 25.0
  },
  "memory": {
    "bytes": 134217728,
    "ofLimitPercent": 50.0
  },
  "statusReason": null,
  "podIP": "10.244.1.5",
  "labels": {
    "app": "my-app",
    "version": "v1.0"
  },
  "creationTimestamp": "2023-01-15T10:30:00Z"
}
```

### 4. TimeSeries and WebSocket Handlers (`handlers_timeseries.go`)

Implements sophisticated real-time data streaming with WebSocket support.

#### TimeSeries WebSocket Manager
```go
type TimeSeriesWSManager struct {
    clients map[string]*TimeSeriesWSClient
    mu      sync.RWMutex
}

type TimeSeriesWSClient struct {
    ID               string
    Conn             *websocket.Conn
    Send             chan []byte
    Subscriptions    map[string]TimeSeriesSubscription
    LastActivity     time.Time
    TotalSeriesCount int
    mu               sync.RWMutex
}
```

**WebSocket Flow:**
1. **Connection Handshake** - Send capabilities and limits
2. **Subscription Management** - Handle series subscriptions by group
3. **Data Broadcasting** - Stream real-time data points
4. **Client Management** - Track active connections and cleanup

### 5. Log Management Handlers (`handlers_logs.go`)

Provides comprehensive log management with caching and streaming.

**Log Streaming Features:**
- **Multi-Pod Coordination** - Stream logs from multiple pods simultaneously
- **Background Collection** - Continuous log collection with retention policies
- **Search Integration** - Full-text search across cached logs
- **Real-time Updates** - WebSocket-based live log streaming
- **Performance Optimization** - Efficient log caching and retrieval

### 6. Administrative Handlers (`handlers_admin.go`)

Provides administrative operations and system management.

**Admin Features:**
- **System Status** - Comprehensive server and component health
- **Configuration Management** - Runtime configuration viewing and updates
- **Metrics Collection** - Detailed performance and usage metrics
- **Health Monitoring** - Service health checks and diagnostics

## Middleware Stack

The server applies a comprehensive middleware stack for security and functionality:

```go
func (s *Server) setupMiddleware() {
    s.router.Use(chimiddleware.RequestID)
    s.router.Use(apimiddleware.RequestIDResponseMiddleware)
    s.router.Use(s.requestContextMiddleware)
    s.router.Use(chimiddleware.RealIP)
    s.router.Use(chimiddleware.Logger)
    s.router.Use(chimiddleware.Recoverer)
    s.router.Use(s.webSocketAwareTimeout(60 * time.Second))
    s.router.Use(apimiddleware.PrometheusMiddleware)
    s.router.Use(s.authMiddleware.SecureHeaders)
    s.router.Use(s.authMiddleware.Authenticate)
    s.router.Use(s.impersonationMiddleware.Middleware)
    s.router.Use(etagMiddleware.Middleware)
    s.router.Use(errorSanitizer.Middleware)
    s.router.Use(corsMiddleware)
}
```

### Middleware Components

1. **Request ID** - Generates unique request identifiers for tracing
2. **Request Context** - Adds HTTP request to context for audit logging
3. **Real IP** - Extracts real client IP from headers
4. **Logging** - Structured request logging
5. **Recovery** - Panic recovery with error logging
6. **Timeout** - Request timeout with WebSocket awareness
7. **Prometheus** - Metrics collection for monitoring
8. **Security Headers** - HSTS, CSRF, CSP, and other security headers
9. **Authentication** - User authentication and session validation
10. **Impersonation** - Kubernetes client impersonation based on user identity
11. **ETag** - Conditional request handling for caching
12. **Error Sanitization** - Sanitizes error responses for security
13. **CORS** - Same-origin policy enforcement

## Real-Time Communication

The server provides sophisticated real-time communication through multiple WebSocket endpoints:

### 1. Main WebSocket Hub (`internal/k8s/ws`)
- **Resource Updates** - Real-time Kubernetes resource changes
- **Event Broadcasting** - Cluster event notifications
- **System Alerts** - Critical system notifications

### 2. TimeSeries WebSocket (`handlers_timeseries.go`)
- **Metrics Streaming** - Real-time metrics data
- **Subscription Management** - Granular data subscriptions
- **Multi-Resolution Data** - High and low resolution data streams

### 3. Log Streaming WebSocket (`handlers_logs.go`)
- **Live Logs** - Real-time log streaming
- **Multi-Pod Logs** - Aggregated log streams
- **Search Updates** - Live search result updates

## Configuration Integration

The server integrates with the configuration system for runtime behavior:

### Server Configuration
```yaml
server:
  port: 8080
  cookie_secret: "secure-cookie-secret"
  request_timeout: "60s"
  max_request_size: "10MB"

security:
  auth_mode: "oidc"  # "oidc" or "none"
  session_ttl: "12h"
  refresh_token_ttl: "7d"
  username_format: "email"  # "email" or "sub"

kubernetes:
  mode: "incluster"  # "incluster", "kubeconfig", or "auto"
  qps: 100
  burst: 200
  logs_qps: 20
  logs_burst: 40

features:
  enable_prometheus_analytics: true
  enable_istio_integration: true
  enable_volume_snapshots: true
```

## Performance Optimization

### 1. Client Connection Pooling
- **Connection Reuse** - Efficient Kubernetes API client pooling
- **Rate Limiting** - Configurable QPS and burst limits
- **Load Balancing** - Distributed API calls across multiple clients

### 2. Caching Strategies
- **Resource Cache** - In-memory caching of frequently accessed resources
- **Permission Cache** - Cached permission checks with TTL
- **Response Cache** - ETag-based conditional responses

### 3. Concurrent Processing
- **Goroutine Pools** - Managed concurrency for resource operations
- **Background Processing** - Non-blocking background tasks
- **Stream Processing** - Efficient real-time data streaming

## Security Implementation

### 1. Authentication Security
- **OIDC Integration** - Secure OpenID Connect authentication
- **PKCE Support** - Proof Key for Code Exchange for SPAs
- **Session Management** - Secure JWT-based sessions with refresh tokens
- **State Protection** - Encrypted OIDC state cookies

### 2. Authorization Security
- **Kubernetes RBAC** - Native Kubernetes role-based access control
- **Impersonation** - Secure user impersonation for API calls
- **Permission Validation** - Real-time permission checks using SubjectAccessReview
- **Audit Logging** - Comprehensive audit trails

### 3. API Security
- **Input Validation** - Comprehensive input sanitization
- **Error Sanitization** - Prevents information disclosure
- **Rate Limiting** - Protection against abuse
- **CORS Policy** - Same-origin enforcement

### 4. WebSocket Security
- **Authentication Required** - All WebSocket connections require authentication
- **Subscription Limits** - Prevents resource exhaustion
- **Connection Tracking** - Monitor and limit concurrent connections

## Usage Examples

### Server Initialization

```go
func main() {
    logger, _ := zap.NewProduction()
    cfg, _ := config.Load()
    
    server, err := server.New(logger, cfg)
    if err != nil {
        logger.Fatal("Failed to create server", zap.Error(err))
    }
    
    server.SetupRoutes()
    
    ctx := context.Background()
    if err := server.Start(ctx); err != nil {
        logger.Fatal("Failed to start server", zap.Error(err))
    }
    
    http.ListenAndServe(":8080", server.Handler())
}
```

### Handler Implementation Pattern

```go
func (s *Server) HandleGetPod(w http.ResponseWriter, r *http.Request) {
    namespace := chi.URLParam(r, "namespace")
    name := chi.URLParam(r, "name")
    
    // Get security context with user and impersonated client
    secCtx, err := s.getSecurityContext(r)
    if err != nil {
        s.writeSecurityError(w, err.(*SecurityError), nil)
        return
    }
    
    // Check permissions
    if err := s.checkResourcePermission(r.Context(), secCtx, "get", "pods", namespace, name); err != nil {
        s.writeSecurityError(w, err.(*SecurityError), secCtx.User)
        return
    }
    
    // Get resource using impersonated client
    pod, err := secCtx.Client.CoreV1().Pods(namespace).Get(r.Context(), name, metav1.GetOptions{})
    if err != nil {
        s.logger.Error("Failed to get pod", zap.Error(err))
        http.Error(w, "Internal server error", http.StatusInternalServerError)
        return
    }
    
    // Format response
    response := s.podToSummary(pod)
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}
```

## Testing Strategies

### Unit Testing
```go
func TestHandleGetPod(t *testing.T) {
    server := setupTestServer(t)
    
    req := httptest.NewRequest("GET", "/api/v1/namespaces/default/pods/test-pod", nil)
    req = req.WithContext(auth.WithUser(req.Context(), testUser))
    
    w := httptest.NewRecorder()
    server.HandleGetPod(w, req)
    
    assert.Equal(t, http.StatusOK, w.Code)
    
    var response map[string]interface{}
    err := json.Unmarshal(w.Body.Bytes(), &response)
    assert.NoError(t, err)
    assert.Equal(t, "test-pod", response["name"])
}
```

### Integration Testing
```go
func TestAuthenticationFlow(t *testing.T) {
    server := setupTestServerWithAuth(t)
    
    // Test login flow
    loginResp := testOIDCLogin(t, server)
    assert.NotEmpty(t, loginResp.AuthURL)
    
    // Test callback handling
    callbackResp := testOIDCCallback(t, server, loginResp.State)
    assert.True(t, callbackResp.Success)
    
    // Test authenticated request
    authReq := httptest.NewRequest("GET", "/api/v1/user", nil)
    authReq.AddCookie(callbackResp.SessionCookie)
    
    w := httptest.NewRecorder()
    server.HandleUserInfo(w, authReq)
    assert.Equal(t, http.StatusOK, w.Code)
}
```

## Deployment Considerations

### Container Configuration
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kaptn-server
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: kaptn-server
        image: kaptn:latest
        ports:
        - containerPort: 8080
        env:
        - name: KAPTN_LOG_LEVEL
          value: "info"
        - name: KAPTN_AUTH_MODE
          value: "oidc"
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Best Practices

### Security Best Practices
- **Least Privilege** - Grant minimal required permissions
- **Input Validation** - Validate all user inputs
- **Error Handling** - Don't leak sensitive information in errors
- **Audit Logging** - Log all security-relevant events
- **Regular Updates** - Keep dependencies updated

### Performance Best Practices
- **Connection Pooling** - Reuse Kubernetes API connections
- **Caching** - Cache expensive operations appropriately
- **Pagination** - Implement pagination for large result sets
- **Rate Limiting** - Protect against API abuse
- **Monitoring** - Monitor performance metrics

### Operational Best Practices
- **Health Checks** - Implement comprehensive health checks
- **Graceful Shutdown** - Handle shutdown signals properly
- **Resource Cleanup** - Clean up resources on shutdown
- **Configuration Management** - Use environment-specific configs
- **Logging** - Implement structured, searchable logging

## Dependencies

### External Dependencies
- `go-chi/chi/v5` - HTTP router and middleware
- `gorilla/websocket` - WebSocket implementation
- `k8s.io/client-go` - Kubernetes client library
- `k8s.io/api` - Kubernetes API types
- `go.uber.org/zap` - Structured logging

### Internal Dependencies
- `internal/auth` - Authentication and authorization
- `internal/config` - Configuration management
- `internal/k8s` - Kubernetes integration
- `internal/logs` - Log management
- `internal/metrics` - Metrics collection
- `internal/timeseries` - TimeSeries data management
- `internal/api/routes` - Route contracts
- `internal/api/v1` - API DTOs and formatters
- `internal/middleware` - HTTP middleware components

This documentation provides comprehensive coverage of the server package, serving as both a developer guide for understanding the sophisticated HTTP server architecture and a reference for extending functionality, implementing security best practices, and managing the complex integration of all backend services that power Kaptn's Kubernetes admin dashboard.

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