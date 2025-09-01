# API Middleware Package

This package provides centralized HTTP middleware components for the Kaptn API layer, extracted during PR 2 of the backend refactor.

## Components

### AuthExtractor (`auth.go`)
- **Purpose**: Centralizes user extraction from request context
- **Key Functions**:
  - `GetUser(ctx)` - Extract user from context
  - `RequireUser(ctx)` - Extract user or return auth error
- **Usage**: Replaces scattered `auth.UserFromContext` calls

### PermissionMiddleware (`permissions.go`)
- **Purpose**: Provides reusable permission checking middleware using Kubernetes SSAR
- **Key Components**:
  - `PermissionChecker` interface - Defines permission checking contract
  - `SSARPermissionChecker` - Kubernetes SubjectAccessReview implementation
  - `RequirePermission()` - HTTP middleware for resource permissions
- **Usage**: Wrap route groups requiring specific Kubernetes permissions

### ImpersonationMiddleware (`impersonation.go`)
- **Purpose**: Moves impersonation logic from server.go to reusable middleware
- **Key Functions**:
  - `Middleware()` - Adds impersonated K8s clients to request context
  - `RequireImpersonation()` - Ensures impersonated clients are available
- **Usage**: Apply to routes needing Kubernetes client access

### RequestLogger (`logging.go`)
- **Purpose**: Enhanced request logging with security context
- **Key Functions**:
  - `Middleware()` - Logs requests with user info and audit trails
  - `AuditLogger.LogSecurityEvent()` - Security event logging
- **Usage**: Apply to routes requiring audit logging

### SecurityMiddleware (`security.go`)
- **Purpose**: Centralized security headers and CORS handling
- **Key Functions**:
  - `SecurityHeaders()` - Adds security headers to responses
  - `CORS()` - Handles same-origin CORS policies
- **Usage**: Apply globally or to specific route groups

## Implementation Status (PR 2)

### ✅ Completed
- [x] Created middleware package with core components
- [x] Extracted auth, permissions, impersonation, logging, and security middleware
- [x] Added comprehensive unit tests for auth and permissions middleware
- [x] Wired **one route group** (pods listing) to use new permissions middleware
- [x] Maintained backward compatibility - no breaking changes
- [x] All existing tests pass

### 🔄 Current Behavior
- **Pods listing** (`GET /api/pods`) now uses `PermissionMiddleware` with SSAR checking
- **All other routes** continue using existing inline security checks
- **Auth mode "none"** bypasses permission checks (development mode)
- **Identical HTTP responses** and status codes maintained

### 📋 Next Steps (Future PRs)
- Migrate additional route groups to use new middleware
- Extract CSRF and rate limiting middleware
- Add more comprehensive integration tests
- Implement router split by domain

## Usage Examples

### Permission Middleware
```go
// Require list permissions for pods
r.Use(permissionMiddleware.RequirePermission(middleware.ResourcePermission{
    Verb:     "list",
    Resource: "pods",
    Namespace: "", // Cluster-scoped
}))
```

### Route Group with Middleware
```go
r.Group(func(r chi.Router) {
    r.Use(permissionMiddleware.RequirePermission(middleware.ResourcePermission{
        Verb:     "get",
        Resource: "secrets",
    }))
    r.Get("/secrets", handler)
})
```

## Testing

Run middleware tests:
```bash
go test ./internal/api/middleware/... -v
```

Test specific middleware:
```bash
go test ./internal/api/middleware -run TestPermissionMiddleware
```

## Safety Notes

- **No route behavior changes** - All endpoints return identical responses
- **Graceful fallback** - Auth mode "none" bypasses all permission checks
- **Existing middleware preserved** - Original auth middleware still active
- **Incremental adoption** - Only one route group migrated in this PR
