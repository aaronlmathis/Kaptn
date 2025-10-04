# Middleware Package Documentation

## Overview

The `internal/middleware` package provides HTTP middleware components for the Kaptn Kubernetes admin dashboard. It implements advanced middleware functionality including Prometheus metrics collection, error sanitization, ETag caching, and idempotency support. These middlewares enhance security, performance, and observability of HTTP requests across the application.

## Package Architecture

```
internal/middleware/
├── prometheus.go              # HTTP metrics collection middleware
├── error_sanitizer.go         # Error message sanitization and secure error handling
├── etag.go                   # ETag and HTTP caching middleware
└── idempotency.go            # Idempotency key handling for state-changing operations
```

## Core Components

### 1. Prometheus Middleware (`prometheus.go`)

HTTP request metrics collection and path sanitization for Prometheus monitoring.

#### Key Features:
```go
func PrometheusMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        
        // Wrap response writer to capture status code
        ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
        
        // Process request
        next.ServeHTTP(ww, r)
        
        // Record metrics with sanitized path
        duration := time.Since(start)
        path := sanitizePath(r.URL.Path)
        statusCode := ww.Status()
        
        metrics.RecordHTTPRequest(r.Method, path, statusCode, duration)
    })
}
```

#### Path Sanitization:
Prevents cardinality explosion by normalizing dynamic URL segments:

```go
// Input: /api/v1/pods/kube-system/coredns-abc123/logs
// Output: /api/v1/pods/:namespace/:pod/logs

// Input: /api/v1/nodes/worker-node-1/status
// Output: /api/v1/nodes/:node/status

// Input: /api/v1/namespaces/production/apply
// Output: /api/v1/namespaces/:namespace/apply
```

**Sanitization Rules:**
- Replace resource IDs with `:id` placeholder
- Replace namespace names with `:namespace` placeholder  
- Replace pod names with `:pod` placeholder
- Replace node names with `:node` placeholder
- Preserve action paths (logs, apply, status, etc.)
- Keep static paths unchanged

#### Request ID Response Middleware:
```go
func RequestIDResponseMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if reqID := middleware.GetReqID(r.Context()); reqID != "" {
            w.Header().Set("X-Request-ID", reqID)
        }
        next.ServeHTTP(w, r)
    })
}
```

### 2. Error Sanitizer (`error_sanitizer.go`)

Comprehensive error message sanitization to prevent information leakage.

#### Core Implementation:
```go
type ErrorSanitizer struct {
    logger *zap.Logger
}

func (es *ErrorSanitizer) SanitizeAndRespond(w http.ResponseWriter, r *http.Request, err error, statusCode int, userID string) {
    // Log full error details server-side
    es.logger.Error("Request error",
        zap.Error(err),
        zap.Int("status_code", statusCode),
        zap.String("path", r.URL.Path),
        zap.String("user_id", userID))
    
    // Send sanitized error to client
    clientMessage := es.sanitizeErrorMessage(err.Error(), statusCode)
    
    response := map[string]interface{}{
        "error":  clientMessage,
        "status": statusCode,
    }
    
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(statusCode)
    json.NewEncoder(w).Encode(response)
}
```

#### Sensitive Pattern Detection:
```go
sensitivePatterns := []string{
    "token", "jwt", "bearer", "authorization", "secret", "key",
    "credential", "password", "session", "refresh", "claim",
    "signature", "verify", "decode", "parse", "validate",
    "database", "sql", "query", "connection", "redis",
    "kubernetes", "api-server", "etcd", "rbac",
    "internal", "config", "env", "environment",
}
```

**Sanitization Process:**
1. **Sensitive Content Detection**: Check for security-related terms
2. **Generic Message Replacement**: Replace sensitive errors with generic alternatives
3. **Stack Trace Removal**: Strip stack traces and file paths
4. **Length Limiting**: Truncate overly long messages
5. **Status-Based Fallback**: Use HTTP status-appropriate generic messages

#### Generic Error Messages:
```go
func (es *ErrorSanitizer) getGenericErrorMessage(statusCode int) string {
    switch statusCode {
    case http.StatusBadRequest:
        return "Invalid request. Please check your input and try again."
    case http.StatusUnauthorized:
        return "Authentication required. Please log in."
    case http.StatusForbidden:
        return "You do not have permission to perform this action."
    case http.StatusNotFound:
        return "The requested resource was not found."
    case http.StatusInternalServerError:
        return "An internal server error occurred. Please try again later."
    // ... additional status codes
    }
}
```

### 3. ETag Middleware (`etag.go`)

HTTP caching implementation with ETag and Last-Modified support.

#### Core Functionality:
```go
type ETagMiddleware struct {
    logger *zap.Logger
}

func (em *ETagMiddleware) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Skip WebSocket upgrades and non-GET requests
        if r.Header.Get("Upgrade") == "websocket" || r.Method != "GET" {
            next.ServeHTTP(w, r)
            return
        }
        
        // Skip sensitive/dynamic endpoints
        if em.shouldSkipETag(r.URL.Path) {
            next.ServeHTTP(w, r)
            return
        }
        
        // Capture response for ETag calculation
        recorder := &ETagResponseRecorder{
            ResponseWriter: w,
            status:         200,
            lastModified:   time.Now(),
        }
        
        next.ServeHTTP(recorder, r)
        
        if recorder.status == 200 && len(recorder.body) > 0 {
            etag := em.calculateETag(recorder.body)
            
            // Set cache headers
            w.Header().Set("ETag", fmt.Sprintf(`"%s"`, etag))
            w.Header().Set("Last-Modified", recorder.lastModified.UTC().Format(http.TimeFormat))
            
            // Check client cache
            if em.clientHasValidCache(r, etag, recorder.lastModified) {
                w.WriteHeader(http.StatusNotModified)
                return
            }
            
            em.setCacheHeaders(w, r)
        }
    })
}
```

#### ETag Calculation:
```go
func (em *ETagMiddleware) calculateETag(content []byte) string {
    hasher := md5.New()
    hasher.Write(content)
    return fmt.Sprintf("%x", hasher.Sum(nil))[:16] // 16-char ETags
}
```

#### Cache Strategy by Endpoint:
```go
func (em *ETagMiddleware) setCacheHeaders(w http.ResponseWriter, r *http.Request) {
    path := r.URL.Path
    
    switch {
    case strings.HasPrefix(path, "/api/v1/capabilities"):
        w.Header().Set("Cache-Control", "public, max-age=300") // 5 minutes
    case strings.HasPrefix(path, "/api/v1/config"):
        w.Header().Set("Cache-Control", "public, max-age=1800") // 30 minutes
    case strings.HasPrefix(path, "/api/v1/nodes"):
        w.Header().Set("Cache-Control", "public, max-age=60") // 1 minute
    case strings.HasPrefix(path, "/api/v1/namespaces"):
        w.Header().Set("Cache-Control", "public, max-age=30") // 30 seconds
    default:
        w.Header().Set("Cache-Control", "public, max-age=30") // Conservative
    }
}
```

#### Skipped Endpoints:
```go
skipPaths := []string{
    "/api/v1/auth/",        // Authentication endpoints
    "/api/v1/me",           // User profile
    "/api/v1/stream/",      // WebSocket streams  
    "/api/v1/analytics/",   // Analytics data
    "/api/v1/metrics/",     // Live metrics
    "/api/v1/logs/",        // Log data
    "/ws/", "/websocket/",  // WebSocket paths
}
```

### 4. Idempotency Middleware (`idempotency.go`)

Idempotency key support for safe retries of state-changing operations.

#### Core Implementation:
```go
type IdempotencyMiddleware struct {
    logger *zap.Logger
    cache  map[string]*IdempotencyResult
    mutex  sync.RWMutex
    ttl    time.Duration
}

type IdempotencyResult struct {
    StatusCode int               `json:"status_code"`
    Headers    map[string]string `json:"headers"`
    Body       []byte            `json:"body"`
    Timestamp  time.Time         `json:"timestamp"`
}
```

#### Request Processing:
```go
func (im *IdempotencyMiddleware) Middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Only apply to state-changing methods
        if r.Method != "POST" && r.Method != "PUT" && 
           r.Method != "PATCH" && r.Method != "DELETE" {
            next.ServeHTTP(w, r)
            return
        }
        
        // Get idempotency key from header
        idempotencyKey := r.Header.Get("X-Idempotency-Key")
        if idempotencyKey == "" {
            next.ServeHTTP(w, r)
            return
        }
        
        // Generate unique cache key
        cacheKey := im.generateCacheKey(r, idempotencyKey)
        
        // Check for cached result
        if result := im.getCachedResult(cacheKey); result != nil {
            im.serveCachedResponse(w, result)
            return
        }
        
        // Process request and cache successful response
        responseRecorder := &ResponseRecorder{
            ResponseWriter: w,
            statusCode:     200,
            headers:        make(map[string]string),
            body:           bytes.NewBuffer(nil),
        }
        
        next.ServeHTTP(responseRecorder, r)
        
        // Cache successful responses (2xx status codes)
        if responseRecorder.statusCode >= 200 && responseRecorder.statusCode < 300 {
            result := &IdempotencyResult{
                StatusCode: responseRecorder.statusCode,
                Headers:    responseRecorder.headers,
                Body:       responseRecorder.body.Bytes(),
                Timestamp:  time.Now(),
            }
            
            im.cacheResult(cacheKey, result)
        }
    })
}
```

#### Cache Key Generation:
```go
func (im *IdempotencyMiddleware) generateCacheKey(r *http.Request, idempotencyKey string) string {
    userInfo := "anonymous"
    if user, ok := r.Context().Value("user").(string); ok {
        userInfo = user
    }
    
    // Hash: method + path + user + idempotency key
    hasher := sha256.New()
    hasher.Write([]byte(fmt.Sprintf("%s:%s:%s:%s", 
        r.Method, r.URL.Path, userInfo, idempotencyKey)))
    return hex.EncodeToString(hasher.Sum(nil))
}
```

#### Automatic Cleanup:
```go
func (im *IdempotencyMiddleware) cleanup() {
    ticker := time.NewTicker(5 * time.Minute)
    defer ticker.Stop()
    
    for range ticker.C {
        now := time.Now()
        im.mutex.Lock()
        
        for key, result := range im.cache {
            if now.Sub(result.Timestamp) > im.ttl {
                delete(im.cache, key)
            }
        }
        
        im.mutex.Unlock()
    }
}
```

## Usage Examples

### Complete Middleware Stack Setup

```go
package main

import (
    "net/http"
    "time"
    
    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
    "go.uber.org/zap"
    
    apimiddleware "github.com/example/kaptn/internal/middleware"
)

func setupMiddleware(logger *zap.Logger) http.Handler {
    r := chi.NewRouter()
    
    // Core middleware
    r.Use(middleware.RequestID)
    r.Use(middleware.RealIP)
    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)
    
    // Custom middleware
    r.Use(apimiddleware.PrometheusMiddleware)
    r.Use(apimiddleware.RequestIDResponseMiddleware)
    
    // Error sanitization
    errorSanitizer := apimiddleware.NewErrorSanitizer(logger)
    r.Use(errorSanitizer.Middleware)
    
    // ETag caching
    etagMiddleware := apimiddleware.NewETagMiddleware(logger)
    r.Use(etagMiddleware.Middleware)
    
    // Idempotency (30-minute TTL)
    idempotencyMiddleware := apimiddleware.NewIdempotencyMiddleware(logger, 30*time.Minute)
    r.Use(idempotencyMiddleware.Middleware)
    
    return r
}
```

### Error Sanitization Usage

```go
func (h *Handler) handleCreateResource(w http.ResponseWriter, r *http.Request) {
    userID := getUserIDFromContext(r.Context())
    
    // Perform operation
    err := h.service.CreateResource(r.Context(), resourceData)
    if err != nil {
        // Use sanitizer for secure error responses
        h.errorSanitizer.SanitizeAndRespond(w, r, err, http.StatusBadRequest, userID)
        return
    }
    
    // Success response
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(response)
}
```

### Idempotency Key Handling

```go
// Client sends idempotency key
func makeIdempotentRequest() {
    client := &http.Client{}
    
    req, _ := http.NewRequest("POST", "/api/v1/deployments", body)
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-Idempotency-Key", "create-deployment-123")
    
    resp, err := client.Do(req)
    
    // First request: normal processing
    // Retry with same key: cached response (with X-Idempotency-Cache: HIT header)
}
```

### Custom ETag for API Resources

```go
func (h *Handler) handleGetResource(w http.ResponseWriter, r *http.Request) {
    resource, err := h.service.GetResource(r.Context(), resourceID)
    if err != nil {
        h.errorSanitizer.SanitizeAndRespond(w, r, err, http.StatusNotFound, userID)
        return
    }
    
    // ETag middleware will automatically:
    // 1. Calculate ETag from response body
    // 2. Set Last-Modified header
    // 3. Check client cache headers
    // 4. Return 304 Not Modified if appropriate
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(resource)
}
```

## Advanced Configuration

### Path-Specific Middleware Application

```go
func setupConditionalMiddleware(r *chi.Mux, logger *zap.Logger) {
    // Apply ETag only to GET endpoints
    r.Route("/api/v1", func(r chi.Router) {
        // ETag for cacheable resources
        etagMiddleware := apimiddleware.NewETagMiddleware(logger)
        r.Group(func(r chi.Router) {
            r.Use(etagMiddleware.Middleware)
            r.Get("/nodes", handleGetNodes)
            r.Get("/namespaces", handleGetNamespaces)
            r.Get("/config", handleGetConfig)
        })
        
        // Idempotency for state-changing operations
        idempotencyMiddleware := apimiddleware.NewIdempotencyMiddleware(logger, 30*time.Minute)
        r.Group(func(r chi.Router) {
            r.Use(idempotencyMiddleware.Middleware)
            r.Post("/deployments", handleCreateDeployment)
            r.Put("/deployments/{id}", handleUpdateDeployment)
            r.Delete("/deployments/{id}", handleDeleteDeployment)
        })
    })
}
```

### Custom Error Handling

```go
type CustomErrorSanitizer struct {
    *apimiddleware.ErrorSanitizer
    rateLimiter *rate.Limiter
}

func (ces *CustomErrorSanitizer) SanitizeAndRespondWithRateLimit(w http.ResponseWriter, r *http.Request, err error, statusCode int, userID string) {
    // Check rate limit for error responses
    if !ces.rateLimiter.Allow() {
        http.Error(w, "Too many requests", http.StatusTooManyRequests)
        return
    }
    
    // Use base sanitizer
    ces.ErrorSanitizer.SanitizeAndRespond(w, r, err, statusCode, userID)
}
```

## Security Considerations

### Error Information Leakage Prevention

**What Gets Sanitized:**
- Authentication tokens and secrets
- Database connection strings and errors
- Internal service names and endpoints
- Kubernetes API server errors
- File paths and stack traces
- Configuration details

**What Gets Preserved:**
- HTTP status codes
- Basic validation errors
- User-facing error categories
- Request correlation IDs

### Cache Security

**ETag Security:**
- ETags are content-based (MD5 hash)
- No user-specific data in ETags
- Proper cache scope (public vs private)
- Bypass for sensitive endpoints

**Idempotency Security:**
- Cache keys include user identification
- TTL prevents indefinite storage
- Only successful responses cached
- Secure hash-based key generation

### WebSocket Handling

All middleware components properly handle WebSocket upgrade requests:

```go
// Early WebSocket detection and bypass
if r.Header.Get("Upgrade") == "websocket" ||
   strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade") {
    next.ServeHTTP(w, r)
    return
}
```

## Performance Monitoring

### Metrics Generated

**HTTP Request Metrics** (via Prometheus middleware):
- `kaptn_http_requests_total{method, path, status_code}`
- `kaptn_http_request_duration_seconds{method, path, status_code}`

**Path Sanitization Examples:**
```
# Original paths
/api/v1/pods/kube-system/coredns-abc123
/api/v1/nodes/worker-1/metrics
/api/v1/namespaces/production/apply

# Sanitized for metrics
/api/v1/pods/:namespace/:pod
/api/v1/nodes/:node/metrics  
/api/v1/namespaces/:namespace/apply
```

### Performance Impact

**Prometheus Middleware:**
- Minimal overhead (~1-2ms per request)
- Path sanitization prevents cardinality explosion
- Request ID propagation for correlation

**Error Sanitizer:**
- Only activates on error responses
- Pattern matching optimized for common cases
- Logging separated from response generation

**ETag Middleware:**
- MD5 calculation overhead for response content
- Memory usage for response buffering
- Significant bandwidth savings for cache hits

**Idempotency Middleware:**
- In-memory cache with automatic cleanup
- SHA256 overhead for key generation
- Memory usage proportional to request volume

## Best Practices

### Middleware Ordering

Recommended middleware stack order:

```go
// 1. Core infrastructure
r.Use(middleware.RequestID)
r.Use(middleware.RealIP)
r.Use(middleware.Logger)
r.Use(middleware.Recoverer)

// 2. Security and CORS
r.Use(corsMiddleware)
r.Use(securityHeadersMiddleware)

// 3. Authentication and authorization
r.Use(authMiddleware)
r.Use(permissionMiddleware)

// 4. Observability
r.Use(apimiddleware.PrometheusMiddleware)
r.Use(apimiddleware.RequestIDResponseMiddleware)

// 5. Error handling
r.Use(errorSanitizer.Middleware)

// 6. Performance optimization
r.Use(etagMiddleware.Middleware)
r.Use(idempotencyMiddleware.Middleware)

// 7. Business logic handlers
```

### Error Handling Strategy

```go
// Always use sanitizer for error responses
func handleError(w http.ResponseWriter, r *http.Request, err error, statusCode int) {
    userID := getUserFromContext(r.Context())
    errorSanitizer.SanitizeAndRespond(w, r, err, statusCode, userID)
}

// Don't expose internal errors directly
func badExample(w http.ResponseWriter, r *http.Request) {
    _, err := kubeClient.CoreV1().Pods("default").Get(ctx, "pod-name", metav1.GetOptions{})
    if err != nil {
        // BAD: Exposes Kubernetes API details
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
}

func goodExample(w http.ResponseWriter, r *http.Request) {
    _, err := kubeClient.CoreV1().Pods("default").Get(ctx, "pod-name", metav1.GetOptions{})
    if err != nil {
        // GOOD: Sanitized error response
        handleError(w, r, err, http.StatusInternalServerError)
        return
    }
}
```

### Idempotency Implementation

```go
// Server-side: Include idempotency middleware
r.Use(idempotencyMiddleware.Middleware)

// Client-side: Use UUIDs for idempotency keys
idempotencyKey := uuid.New().String()
req.Header.Set("X-Idempotency-Key", idempotencyKey)

// Database operations should be idempotent
func (s *Service) CreateResource(ctx context.Context, data ResourceData, idempotencyKey string) error {
    // Check if resource already exists with this idempotency key
    existing, err := s.db.GetResourceByIdempotencyKey(ctx, idempotencyKey)
    if err == nil && existing != nil {
        return nil // Already created
    }
    
    // Create with idempotency key
    return s.db.CreateResourceWithIdempotencyKey(ctx, data, idempotencyKey)
}
```

## Dependencies

### External Dependencies
- `github.com/go-chi/chi/v5/middleware` - Chi router middleware utilities
- `github.com/prometheus/client_golang` - Prometheus metrics (via internal/metrics)
- `go.uber.org/zap` - Structured logging
- Standard library (`net/http`, `crypto/md5`, `crypto/sha256`, `time`)

### Internal Dependencies
- `internal/metrics` - Prometheus metrics recording functions

This documentation provides comprehensive coverage of the middleware package, serving as both a developer guide for implementing middleware patterns and an operational reference for configuring secure, performant HTTP middleware in Kaptn.