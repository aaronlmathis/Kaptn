# API Middleware Package Documentation

## Overview

The `internal/api/middleware` package provides centralized HTTP middleware components for the Kaptn API layer. This package emerged from a backend refactor effort to eliminate code duplication across handlers and provide consistent request processing, security, and authorization patterns throughout the application.

## Package Architecture

```
internal/api/middleware/
├── auth.go             # Authentication extraction utilities
├── auth_test.go        # Authentication middleware tests
├── doc.go              # Package documentation
├── impersonation.go    # Kubernetes impersonation middleware
├── logging.go          # Enhanced request logging and audit trails
├── permissions.go      # RBAC permission checking middleware
├── permissions_test.go # Permission middleware tests
├── security.go         # Security headers and CORS handling
└── README.md           # Implementation status and usage guide
```

## Core Components

### 1. AuthExtractor (`auth.go`)

Centralizes user extraction from request context, replacing scattered `auth.UserFromContext` calls throughout the codebase.

#### Key Features:
- **Centralized user extraction** from HTTP request context
- **Type-safe user retrieval** with proper error handling
- **Consistent error responses** for authentication failures
- **Request-scoped user context** management

#### Methods:
```go
func (a *AuthExtractor) GetUser(ctx context.Context) (*auth.User, bool)
func (a *AuthExtractor) GetUserFromRequest(r *http.Request) (*auth.User, bool)
func (a *AuthExtractor) RequireUser(ctx context.Context) (*auth.User, error)
```

### 2. PermissionMiddleware (`permissions.go`)

Provides reusable permission checking middleware using Kubernetes SubjectAccessReview (SSAR) for fine-grained RBAC enforcement.

#### Key Features:
- **Kubernetes RBAC integration** via SubjectAccessReview
- **Configurable permission requirements** per route
- **Development mode bypass** when `auth_mode = "none"`
- **Structured error responses** with appropriate HTTP status codes
- **Audit logging** for permission checks and denials

#### Permission Checking Interface:
```go
type PermissionChecker interface {
    Can(ctx context.Context, user *auth.User, verb, resource, namespace, name string) error
}
```

#### Usage Example:
```go
// Require list permissions for pods
r.Use(permissionMiddleware.RequirePermission(middleware.ResourcePermission{
    Verb:     "list",
    Resource: "pods",
    Namespace: "", // Cluster-scoped
}))
```

### 3. ImpersonationMiddleware (`impersonation.go`)

Manages Kubernetes client impersonation, moving complex impersonation logic from individual handlers to reusable middleware.

#### Key Features:
- **Automatic client impersonation** based on authenticated user
- **Group resolution** from OIDC claims or ConfigMap bindings
- **Context injection** of impersonated Kubernetes clients
- **Fallback group resolution** when OIDC groups are missing
- **Username formatting** support for various identity providers

#### Impersonation Flow:
1. Extract authenticated user from context
2. Format username according to configuration
3. Resolve effective groups (OIDC claims + ConfigMap fallback)
4. Build impersonated Kubernetes clients
5. Inject clients into request context

### 4. RequestLogger (`logging.go`)

Enhanced request logging with security context, audit trails, and compliance support.

#### Key Features:
- **Structured logging** with zap integration
- **Security context** inclusion (user ID, email, groups)
- **Request correlation** via trace IDs
- **Response time tracking** and performance monitoring
- **Audit event logging** for compliance requirements
- **Permission check logging** for security analysis

#### Logging Levels:
- **Info**: Successful requests (2xx status)
- **Warn**: Client errors (4xx status)
- **Error**: Server errors (5xx status)

### 5. SecurityMiddleware (`security.go`)

Centralized security headers and CORS handling for consistent security policies.

#### Security Headers Applied:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Permissions-Policy`: Restricts dangerous browser features
- `Cache-Control: no-cache, no-store, must-revalidate, private`

#### CORS Policy:
- **Same-origin deployment** focus
- **Credential support** for cookie-based authentication
- **Preflight request handling** with origin validation
- **Cross-origin request rejection** for security

## Data Models

### Core Types

```go
// Authentication error structure
type AuthError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
    Status  int    `json:"-"`
}

// Permission error structure
type PermissionError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
    Status  int    `json:"-"`
}

// Resource permission specification
type ResourcePermission struct {
    Verb      string  // Kubernetes verb (get, list, create, update, delete)
    Resource  string  // Kubernetes resource type (pods, services, etc.)
    Namespace string  // Target namespace (empty for cluster-scoped)
    Name      string  // Specific resource name (optional)
}
```

### Context Keys

The middleware package uses typed context keys for safe value storage:

```go
// Request context values
type contextKey string

const (
    httpRequestKey contextKey = "http_request"
    traceIDKey     contextKey = "trace_id"
)
```

## Usage Examples

### Basic Middleware Setup

```go
// Create core middleware components
authExtractor := middleware.NewAuthExtractor(logger)
securityMw := middleware.NewSecurityMiddleware(logger)
requestLogger := middleware.NewRequestLogger(logger)

// Create permission checker
permissionChecker := middleware.NewSSARPermissionChecker(logger, config, impersonationMgr)
permissionMw := middleware.NewPermissionMiddleware(logger, config, permissionChecker)

// Create impersonation middleware
impersonationMw := middleware.NewImpersonationMiddleware(logger, config, impersonationMgr, authMw)
```

### Route Group with Permissions

```go
// Protected route group requiring specific permissions
r.Group(func(r chi.Router) {
    // Apply security headers
    r.Use(securityMw.SecurityHeaders)
    
    // Apply request logging
    r.Use(requestLogger.Middleware)
    
    // Apply impersonation (adds K8s clients to context)
    r.Use(impersonationMw.Middleware)
    
    // Require specific permission
    r.Use(permissionMw.RequirePermission(middleware.ResourcePermission{
        Verb:     "get",
        Resource: "secrets",
        Namespace: "default",
    }))
    
    // Protected handlers
    r.Get("/secrets/{name}", secretHandler)
    r.Put("/secrets/{name}", updateSecretHandler)
})
```

### Custom Permission Checking

```go
// Manual permission check in handler
func myHandler(w http.ResponseWriter, r *http.Request) {
    user, err := authExtractor.RequireUser(r.Context())
    if err != nil {
        writeError(w, logger, err)
        return
    }
    
    if err := permissionChecker.Can(r.Context(), user, "list", "pods", "default", ""); err != nil {
        writeError(w, logger, err)
        return
    }
    
    // Proceed with authorized operation
}
```

### Audit Logging

```go
// Security event logging
auditLogger := middleware.NewAuditLogger(logger)

func sensitiveHandler(w http.ResponseWriter, r *http.Request) {
    user, _ := authExtractor.GetUserFromRequest(r)
    
    // Log security-sensitive operation
    auditLogger.LogSecurityEvent(r, "secret_access", map[string]interface{}{
        "secret_name": secretName,
        "operation":   "decrypt",
    })
    
    // Log permission check result
    auditLogger.LogPermissionCheck(r, user, "get", "secrets", "default", true)
}
```

## Error Handling

### Error Types

The middleware package defines structured error types for consistent error responses:

#### AuthError
Used for authentication-related failures:
- **UNAUTHORIZED**: Missing or invalid authentication
- **TOKEN_EXPIRED**: Expired authentication token
- **INVALID_USER**: User validation failure

#### PermissionError
Used for authorization-related failures:
- **FORBIDDEN**: Insufficient permissions for requested operation
- **PERMISSION_CHECK_FAILED**: Internal error during permission verification
- **UNAUTHORIZED**: Authentication required for permission check

### Error Response Format

All errors are returned in a consistent JSON format:
```json
{
    "error": "Human-readable error message",
    "code": "MACHINE_READABLE_ERROR_CODE"
}
```

### Error Handling Best Practices

```go
// Proper error handling in middleware
func (m *PermissionMiddleware) checkPermission(ctx context.Context, user *auth.User) error {
    if err := m.checker.Can(ctx, user, "get", "pods", "", ""); err != nil {
        // Log the error with context
        m.logger.Warn("Permission check failed",
            zap.String("user", user.Email),
            zap.Error(err))
        
        // Return structured error
        return &PermissionError{
            Code:    "FORBIDDEN",
            Message: "Access denied for pods",
            Status:  http.StatusForbidden,
        }
    }
    return nil
}
```

## Security Considerations

### Authentication Security
- **No credential storage** in middleware components
- **Context-based user propagation** for request isolation
- **Automatic session validation** via existing auth middleware
- **Secure error messages** preventing information disclosure

### Authorization Security
- **Kubernetes RBAC enforcement** via impersonated clients
- **Principle of least privilege** with specific permission requirements
- **Development mode isolation** with explicit bypass controls
- **Audit logging** for all permission checks and denials

### Network Security
- **Comprehensive security headers** preventing common attacks
- **Same-origin CORS policy** for deployment security
- **HSTS enforcement** for transport security
- **Cache prevention** for authenticated content

### Information Security
- **Structured error responses** with sanitized messages
- **Request correlation** via trace IDs for debugging
- **Sensitive data protection** in logs and responses
- **User context isolation** between requests

## Performance Considerations

### Caching Strategy
- **Context-based caching** of user information
- **Client connection reuse** for Kubernetes API calls
- **Efficient permission checking** with SSAR batching
- **Memory-efficient logging** with structured fields

### Request Processing
- **Middleware chain optimization** for minimal overhead
- **Early authentication checks** to avoid unnecessary processing
- **Efficient context propagation** using typed keys
- **Goroutine-safe operations** for concurrent requests

### Resource Management
- **Connection pooling** for Kubernetes clients
- **Request timeout handling** to prevent resource leaks
- **Memory-efficient error handling** with reusable error types
- **Garbage collection friendly** object lifecycle

## Testing

### Unit Test Coverage

The package includes comprehensive unit tests covering:

#### AuthExtractor Tests (`auth_test.go`)
- User extraction from context
- Request-based user retrieval
- Required user validation
- Error handling scenarios

#### PermissionMiddleware Tests (`permissions_test.go`)
- Permission granting and denial
- Authentication requirement enforcement
- Development mode bypass
- Error response validation

### Test Utilities

```go
// Mock permission checker for testing
type MockPermissionChecker struct {
    allowMap map[string]bool
    err      error
}

func (m *MockPermissionChecker) Can(ctx context.Context, user *auth.User, verb, resource, namespace, name string) error {
    key := verb + ":" + resource + ":" + namespace
    if m.err != nil {
        return m.err
    }
    if m.allowMap[key] {
        return nil
    }
    return &PermissionError{Code: "FORBIDDEN", Message: "Access denied", Status: http.StatusForbidden}
}
```

### Integration Testing

```go
// End-to-end middleware chain testing
func TestMiddlewareChain(t *testing.T) {
    // Setup middleware stack
    handler := securityMw.SecurityHeaders(
        requestLogger.Middleware(
            impersonationMw.Middleware(
                permissionMw.RequirePermission(ResourcePermission{
                    Verb:     "get",
                    Resource: "pods",
                })(finalHandler))))
    
    // Test authenticated request
    req := httptest.NewRequest("GET", "/test", nil)
    rec := httptest.NewRecorder()
    handler.ServeHTTP(rec, req)
    
    // Verify security headers
    assert.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
    assert.Equal(t, "DENY", rec.Header().Get("X-Frame-Options"))
}
```

## Configuration

### Environment Variables

The middleware components respect configuration from:

```yaml
security:
  auth_mode: "oidc"          # Authentication mode (oidc, none)
  username_format: "{email}" # Username formatting template

authz:
  mode: "user_bindings"      # Authorization mode

logging:
  level: "info"              # Log level for middleware operations
  audit_enabled: true        # Enable audit logging
```

### Runtime Configuration

```go
type MiddlewareConfig struct {
    Auth struct {
        Mode           string `yaml:"mode"`
        UsernameFormat string `yaml:"username_format"`
    } `yaml:"auth"`
    
    Security struct {
        Headers map[string]string `yaml:"headers"`
        CORS    CORSConfig        `yaml:"cors"`
    } `yaml:"security"`
    
    Logging struct {
        AuditEnabled bool   `yaml:"audit_enabled"`
        Level        string `yaml:"level"`
    } `yaml:"logging"`
}
```

## Migration Guide

### From Inline Handlers

**Before** (inline permission checking):
```go
func podHandler(w http.ResponseWriter, r *http.Request) {
    user, ok := auth.UserFromContext(r.Context())
    if !ok {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }
    
    // Inline permission check
    clients, ok := k8s.ImpersonatedClientsFromContext(r.Context())
    if !ok {
        http.Error(w, "No clients", http.StatusInternalServerError)
        return
    }
    
    allowed, err := ssarHelper.CanPerformAction(ctx, clients.Client(), "list", "", "pods", "", "")
    if err != nil || !allowed {
        http.Error(w, "Forbidden", http.StatusForbidden)
        return
    }
    
    // Handler logic...
}
```

**After** (middleware-based):
```go
// Route setup with middleware
r.Use(permissionMw.RequirePermission(middleware.ResourcePermission{
    Verb:     "list",
    Resource: "pods",
}))
r.Get("/pods", podHandler)

// Simplified handler
func podHandler(w http.ResponseWriter, r *http.Request) {
    // Permission already checked by middleware
    // User and clients available in context
    
    user, _ := authExtractor.GetUserFromRequest(r)
    clients, _ := k8s.ImpersonatedClientsFromContext(r.Context())
    
    // Handler logic...
}
```

### Migration Benefits

1. **Code Reduction**: 50-70% reduction in handler code
2. **Consistency**: Uniform error handling and responses
3. **Testability**: Isolated middleware components
4. **Maintainability**: Centralized security logic
5. **Audit Trail**: Comprehensive logging and monitoring

## Monitoring & Observability

### Metrics Integration

The middleware components integrate with Prometheus metrics:

```go
// Custom metrics for middleware performance
var (
    permissionChecksTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "kaptn_permission_checks_total",
            Help: "Total number of permission checks performed",
        },
        []string{"verb", "resource", "allowed"},
    )
    
    authFailuresTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "kaptn_auth_failures_total",
            Help: "Total number of authentication failures",
        },
        []string{"reason"},
    )
)
```

### Logging Integration

Structured logging with correlation:

```json
{
  "level": "info",
  "timestamp": "2025-09-28T10:30:00Z",
  "message": "Permission check",
  "user_id": "user@example.com",
  "verb": "get",
  "resource": "pods",
  "namespace": "default",
  "allowed": true,
  "request_id": "req-123",
  "trace_id": "trace-456"
}
```

## Future Enhancements

### Planned Features
- **Rate limiting middleware** for API protection
- **CSRF protection middleware** for form-based operations  
- **Request validation middleware** with schema enforcement
- **Response caching middleware** for read-heavy operations
- **Distributed tracing integration** with OpenTelemetry

### Extensibility Points
- **Custom permission checkers** beyond Kubernetes RBAC
- **Pluggable authentication extractors** for different auth methods
- **Configurable security headers** per route group
- **Custom audit event handlers** for external systems
- **Dynamic permission loading** from external sources

## Dependencies

### External Dependencies
- `go.uber.org/zap` - Structured logging
- `github.com/go-chi/chi/v5` - HTTP router and middleware support
- Kubernetes client libraries for RBAC integration

### Internal Dependencies
- `internal/auth` - Authentication and user context management
- `internal/config` - Configuration management
- `internal/k8s` - Kubernetes client and impersonation
- Standard library (`net/http`, `context`, etc.)

## Troubleshooting

### Common Issues

#### Permission Check Failures
```
Error: Permission check failed - no impersonated clients found
```
**Solution**: Ensure impersonation middleware is applied before permission middleware

#### Authentication Context Missing
```
Error: Authentication required - no user in context
```
**Solution**: Verify auth middleware is applied before protected routes

#### CORS Preflight Failures
```
Error: CORS preflight request blocked
```
**Solution**: Check origin headers and same-origin deployment configuration

### Debug Mode

Enable debug logging for middleware troubleshooting:

```go
logger := zap.NewDevelopment()
middleware := NewPermissionMiddleware(logger, config, checker)
```

Debug output includes:
- User context validation
- Permission check details
- Impersonation client creation
- Security header application

## Best Practices

### Middleware Ordering
Apply middleware in this recommended order:
1. **Security headers** (first)
2. **Request logging** (early for correlation)
3. **Authentication** (validate user)
4. **Impersonation** (create K8s clients)
5. **Permissions** (check access)
6. **Business logic** (handlers)

### Error Handling
- Use structured error types for consistent responses
- Log security events for audit compliance
- Sanitize error messages to prevent information disclosure
- Return appropriate HTTP status codes

### Performance
- Apply impersonation middleware only to routes needing K8s access
- Use specific permission requirements (avoid overly broad permissions)
- Implement request timeout handling for external calls
- Monitor middleware performance with metrics

### Security
- Always validate user context before business logic
- Use principle of least privilege for permission requirements
- Enable audit logging for compliance requirements
- Regularly review and update security headers

This documentation provides comprehensive coverage of the API middleware package, serving as both a developer guide and operational reference for Kaptn administrators.