# Auth Package Documentation

## Overview

The `internal/auth` package provides comprehensive authentication and authorization services for the Kaptn Kubernetes admin dashboard. It implements OIDC (OpenID Connect) authentication, session management, JWT token handling, and authorization resolution with support for multiple authentication modes and user-to-group resolution strategies.

## Package Architecture

```
internal/auth/
├── README.md           # Package scope and guardrails
├── oidc.go            # OIDC client and JWT verification
├── context.go         # User context management and helpers
├── session.go         # Session management with dual token system
├── middleware.go      # HTTP authentication and security middleware
├── token_manager.go   # JWT access/refresh token management
├── authz.go           # Authorization resolution and group mapping
├── authz_test.go      # Authorization testing
├── groups.go          # Group resolution strategies
├── oidc_state.go      # OIDC state management for PKCE
├── store.go           # User binding storage (ConfigMap backend)
├── csrf_middleware.go # CSRF protection middleware
└── login_next.go      # Post-login redirection handling
```

## Core Components

### 1. OIDC Client (`oidc.go`)

Handles OpenID Connect authentication flow with comprehensive token verification.

#### Key Features:
- **Provider Discovery**: Automatic OIDC provider configuration
- **JWT Verification**: ID token validation with configurable audiences
- **Multiple Group Claims**: Support for various group claim formats
- **PKCE Support**: Proof Key for Code Exchange for enhanced security
- **UserInfo Integration**: Optional userinfo endpoint data fetching

#### Configuration:
```go
type OIDCConfig struct {
    Issuer       string   `yaml:"issuer"`
    ClientID     string   `yaml:"client_id"`
    ClientSecret string   `yaml:"client_secret"`
    RedirectURL  string   `yaml:"redirect_url"`
    Scopes       []string `yaml:"scopes"`
    Audience     string   `yaml:"audience"`
    JWKSURL      string   `yaml:"jwks_url"`
}
```

#### Supported Identity Providers:
- **Generic OIDC**: Any compliant OpenID Connect provider
- **Google OAuth2**: With picture claim support
- **Microsoft Azure AD**: With group claims
- **Auth0**: With custom claim mapping
- **Keycloak**: With realm-based configurations

### 2. User Context Management (`context.go`)

Provides type-safe user context management throughout the application.

#### User Model:
```go
type User struct {
    ID      string                 `json:"id"`
    Sub     string                 `json:"sub"`
    Email   string                 `json:"email"`
    Name    string                 `json:"name"`
    Picture string                 `json:"picture"`
    Groups  []string               `json:"groups"`
    Claims  map[string]interface{} `json:"claims"`
}
```

#### Context Helpers:
- `WithUser(ctx, user)` - Add user to context
- `UserFromContext(ctx)` - Extract user from context
- `GetUserIDFromContext(ctx)` - Get user ID safely
- `HasRole(role)` - Check role membership
- `HasPerm(permission)` - Check UI permissions

### 3. Session Management (`session.go`)

Implements dual token system with access and refresh tokens for enhanced security.

#### Dual Token System:
- **Access Tokens**: Short-lived (15 minutes), for API authentication
- **Refresh Tokens**: Long-lived (7 days), for silent token renewal
- **Token Rotation**: Automatic refresh token rotation on use
- **Family Tracking**: Refresh token family for compromise detection

#### Session Features:
- **PKCE Support**: For OAuth2 authorization code flow
- **Client Binding**: Tokens bound to client context for security
- **Session Versioning**: Global session invalidation capability
- **Legacy Compatibility**: Backward compatibility with HMAC sessions

### 4. Token Manager (`token_manager.go`)

Advanced JWT token management with RSA signing and comprehensive security features.

#### Key Features:
- **RSA Key Management**: Support for shared keys across replicas
- **Token Families**: Refresh token rotation with compromise detection
- **Session Versioning**: User session invalidation across all tokens
- **Client Context Binding**: IP subnet + User-Agent binding
- **Automatic Cleanup**: Expired token and family cleanup

#### Token Types:
```go
// Access Token Claims
type AccessTokenClaims struct {
    UserID     string   `json:"sub"`
    Email      string   `json:"email"`
    Name       string   `json:"name,omitempty"`
    Picture    string   `json:"picture,omitempty"`
    Roles      []string `json:"roles"`
    Perms      []string `json:"perms"`
    SessionVer int64    `json:"session_ver"`
    JTI        string   `json:"jti"`
    TraceID    string   `json:"trace_id"`
}

// Refresh Token Claims
type RefreshTokenClaims struct {
    UserID     string   `json:"sub"`
    FamilyID   string   `json:"family_id"`
    TokenID    string   `json:"token_id"`
    ClientHash string   `json:"client_hash"`
    // ... additional metadata
}
```

### 5. Authentication Middleware (`middleware.go`)

Comprehensive HTTP middleware for authentication, authorization, and security.

#### Middleware Components:
- **Authenticate**: Main authentication pipeline
- **RequireAuth**: Enforce authentication requirement
- **RequireRole**: Role-based access control
- **RequireWrite**: Write permission enforcement
- **SecureHeaders**: Security header application
- **RateLimit**: Per-user rate limiting
- **CSRFProtection**: CSRF token validation

#### Authentication Modes:
```go
type AuthMode string

const (
    AuthModeNone   AuthMode = "none"   // No authentication (development)
    AuthModeHeader AuthMode = "header" // Header-based auth (testing)
    AuthModeOIDC   AuthMode = "oidc"   // OIDC authentication (production)
)
```

### 6. Authorization Resolution (`authz.go`)

Handles the conversion of OIDC user information to Kubernetes RBAC subjects with flexible group resolution strategies.

#### Authorization Modes:
- **idp_groups**: Use groups directly from Identity Provider
- **user_bindings**: Resolve groups from ConfigMap user bindings

#### Group Resolution:
```go
type AuthzResult struct {
    Username   string   `json:"username"`   // Formatted for K8s RBAC
    Groups     []string `json:"groups"`     // Kubernetes groups
    Namespaces []string `json:"namespaces"` // Accessible namespaces
}
```

## Authentication Flow

### OIDC Authentication Flow
```
1. User → /api/v1/auth/login
2. Generate PKCE parameters + state
3. Redirect to OIDC Provider
4. User authenticates with provider
5. Provider → /api/v1/auth/callback with code
6. Exchange code for tokens (with PKCE)
7. Verify ID token + extract user info
8. Resolve authorization (groups/permissions)
9. Create access + refresh tokens
10. Set HttpOnly cookies
11. Redirect to application
```

### Token Refresh Flow
```
1. Access token expires
2. Frontend/middleware detects expiration
3. Extract refresh token from HttpOnly cookie
4. Validate refresh token + client context
5. Mark old refresh token as used
6. Create new access + refresh tokens
7. Update HttpOnly cookies
8. Continue with request
```

### Silent Authentication
```
1. Request with expired access token
2. Middleware attempts silent refresh
3. If refresh succeeds → continue with new tokens
4. If refresh fails → return 401 Unauthorized
5. Frontend redirects to login if needed
```

## Security Features

### Token Security
- **RSA Signing**: Cryptographically secure token signing
- **Short-Lived Access Tokens**: 15-minute expiration reduces exposure
- **Refresh Token Rotation**: Single-use refresh tokens with family tracking
- **Client Context Binding**: Tokens bound to IP subnet + User-Agent
- **Session Versioning**: Global session invalidation capability

### CSRF Protection
- **Double-Submit Pattern**: CSRF tokens in headers + validation
- **State Parameter**: OAuth2 state parameter for flow protection
- **Nonce Validation**: OIDC nonce for replay protection
- **SameSite Cookies**: Cookie-based CSRF mitigation

### Security Headers
```go
// Applied security headers
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=()...
Cache-Control: no-cache, no-store, must-revalidate, private
```

### Rate Limiting
- **Per-User Limits**: Individual rate limiting per authenticated user
- **Failed Login Protection**: Exponential backoff for failed attempts
- **IP-Based Fallback**: Rate limiting for anonymous users by IP

## Configuration

### Environment Variables
```bash
# OIDC Configuration
KAPTN_OIDC_ISSUER=https://your-idp.com/.well-known/openid-configuration
KAPTN_OIDC_CLIENT_ID=your-client-id
KAPTN_OIDC_CLIENT_SECRET=your-client-secret
KAPTN_OIDC_SCOPES=openid,profile,email,groups

# JWT Key Management (for shared deployments)
KAPTN_JWT_PRIVATE_KEY_PEM=-----BEGIN RSA PRIVATE KEY-----...
KAPTN_JWT_PUBLIC_KEY_PEM=-----BEGIN PUBLIC KEY-----...

# Session Configuration
KAPTN_SESSION_SECRET=minimum-32-character-secret
KAPTN_SESSION_TTL=15m
KAPTN_REFRESH_TOKEN_TTL=168h

# Authorization Configuration
KAPTN_AUTHZ_MODE=user_bindings
KAPTN_USERNAME_FORMAT={email}
```

### YAML Configuration
```yaml
security:
  auth_mode: "oidc"
  username_format: "{email}"
  session_ttl: "15m"
  refresh_token_ttl: "168h"

oidc:
  issuer: "https://your-idp.com"
  client_id: "your-client-id"
  scopes: ["openid", "profile", "email", "groups"]

authz:
  mode: "user_bindings"
  groups_prefix_allowlist: ["kaptn-"]
  bindings:
    source: "configmap"
    configmap:
      namespace: "kaptn-system"
      name: "user-bindings"
```

## Usage Examples

### Basic Authentication Setup
```go
// Create OIDC client
oidcConfig := auth.OIDCConfig{
    Issuer:       "https://your-idp.com",
    ClientID:     "your-client-id",
    ClientSecret: "your-client-secret",
    RedirectURL:  "https://kaptn.example.com/api/v1/auth/callback",
    Scopes:       []string{"openid", "profile", "email", "groups"},
}

oidcClient, err := auth.NewOIDCClient(logger, oidcConfig)
if err != nil {
    return fmt.Errorf("failed to create OIDC client: %w", err)
}

// Create session manager
sessionManager, err := auth.NewSessionManager(logger, sessionSecret, sessionTTL)
if err != nil {
    return fmt.Errorf("failed to create session manager: %w", err)
}

// Create authorization resolver
authzResolver := auth.NewAuthzResolver(authzConfig, bindingsConfig, k8sClient, logger)

// Create middleware
authMiddleware := auth.NewMiddleware(logger, auth.AuthModeOIDC, oidcClient, sessionManager, authzResolver, usernameFormat)
```

### Route Protection
```go
// Apply authentication middleware
r.Use(authMiddleware.Authenticate)
r.Use(authMiddleware.SecureHeaders)

// Protected routes
r.Group(func(r chi.Router) {
    r.Use(authMiddleware.RequireAuth)
    
    // Admin-only routes
    r.Group(func(r chi.Router) {
        r.Use(authMiddleware.RequireRole("kaptn-admins"))
        r.Get("/admin/users", adminUsersHandler)
    })
    
    // Write-protected routes
    r.Group(func(r chi.Router) {
        r.Use(authMiddleware.RequireWrite)
        r.Use(authMiddleware.CSRFProtection)
        r.Post("/api/v1/pods", createPodHandler)
    })
})
```

### User Context Usage
```go
func myHandler(w http.ResponseWriter, r *http.Request) {
    // Extract user from context
    user, ok := auth.UserFromContext(r.Context())
    if !ok {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }
    
    // Check permissions
    if !user.HasPerm("write") {
        http.Error(w, "Forbidden", http.StatusForbidden)
        return
    }
    
    // Use user information
    logger.Info("API request", 
        zap.String("user_id", user.ID),
        zap.String("email", user.Email),
        zap.Strings("groups", user.Groups))
}
```

### Token Refresh Implementation
```go
func refreshHandler(w http.ResponseWriter, r *http.Request) {
    // Extract user for context
    user, ok := auth.UserFromContext(r.Context())
    if !ok {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }
    
    // Refresh tokens
    accessToken, refreshToken, err := sessionManager.RefreshSession(r, user)
    if err != nil {
        http.Error(w, "Failed to refresh", http.StatusUnauthorized)
        return
    }
    
    // Set new cookies
    sessionManager.SetDualTokenCookies(w, accessToken, refreshToken, r.TLS != nil)
    
    // Return success
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "refreshed"})
}
```

## Error Handling

### Authentication Errors
```go
// Structured error responses
type AuthError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
    Status  int    `json:"-"`
}

// Common error codes
const (
    ErrCodeUnauthorized     = "UNAUTHORIZED"
    ErrCodeForbidden        = "FORBIDDEN"
    ErrCodeSessionExpired   = "SESSION_EXPIRED"
    ErrCodeInvalidToken     = "INVALID_TOKEN"
    ErrCodeRateLimited      = "RATE_LIMITED"
)
```

### Error Sanitization
The middleware automatically sanitizes error messages to prevent information disclosure:
- Removes sensitive token details
- Provides generic messages for authentication failures
- Logs detailed errors server-side for debugging
- Returns appropriate HTTP status codes

## Testing

### Unit Testing
```go
func TestAuthMiddleware(t *testing.T) {
    logger := zaptest.NewLogger(t)
    
    // Create test OIDC client
    oidcConfig := auth.OIDCConfig{
        Issuer:   "https://test-idp.com",
        ClientID: "test-client",
    }
    oidcClient, _ := auth.NewOIDCClient(logger, oidcConfig)
    
    // Create test middleware
    middleware := auth.NewMiddleware(logger, auth.AuthModeOIDC, oidcClient, nil, nil, "")
    
    // Test authentication
    handler := middleware.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        user, ok := auth.UserFromContext(r.Context())
        assert.True(t, ok)
        assert.NotNil(t, user)
    }))
    
    // Create test request with valid token
    req := httptest.NewRequest("GET", "/test", nil)
    req.Header.Set("Authorization", "Bearer "+validToken)
    
    rec := httptest.NewRecorder()
    handler.ServeHTTP(rec, req)
    
    assert.Equal(t, http.StatusOK, rec.Code)
}
```

### Integration Testing
```go
func TestOIDCFlow(t *testing.T) {
    // Setup test OIDC server
    server := httptest.NewServer(oidcTestHandler)
    defer server.Close()
    
    // Configure OIDC client
    config := auth.OIDCConfig{
        Issuer:   server.URL,
        ClientID: "test-client",
    }
    
    client, err := auth.NewOIDCClient(logger, config)
    require.NoError(t, err)
    
    // Test token verification
    token := createTestToken(t)
    user, err := client.VerifyToken(context.Background(), token)
    require.NoError(t, err)
    assert.Equal(t, "test-user", user.ID)
}
```

## Performance Considerations

### Token Validation
- **RSA Public Key Caching**: Public key cached for verification
- **Efficient JWT Parsing**: Optimized JWT library usage
- **Minimal Token Claims**: Only necessary claims in tokens
- **Session Version Caching**: In-memory session version storage

### Group Resolution
- **ConfigMap Caching**: User bindings cached for performance
- **Batch Operations**: Efficient Kubernetes API usage
- **Fallback Strategies**: Graceful degradation on errors

### Session Management
- **HttpOnly Cookies**: Secure, automatic token transmission
- **Token Cleanup**: Automatic cleanup of expired tokens
- **Memory Efficiency**: Bounded memory usage for token storage

## Monitoring & Observability

### Authentication Metrics
```go
// Tracked metrics
var (
    authAttemptsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "kaptn_auth_attempts_total",
            Help: "Total authentication attempts",
        },
        []string{"result", "mode"},
    )
    
    tokenRefreshTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "kaptn_token_refresh_total",
            Help: "Total token refresh attempts",
        },
        []string{"result"},
    )
)
```

### Audit Logging
```json
{
    "level": "info",
    "timestamp": "2025-09-29T10:30:00Z",
    "message": "Authentication event",
    "event_type": "authentication",
    "user_id": "user@example.com",
    "result": "success",
    "auth_method": "oidc",
    "client_ip": "192.168.1.100",
    "user_agent": "Mozilla/5.0...",
    "trace_id": "trace-abc123"
}
```

## Advanced Features

### Multi-Tenant Support
- **Username Formatting**: Flexible username formatting for different tenants
- **Group Prefix Filtering**: Allow only specific group prefixes
- **Namespace Isolation**: User binding to specific namespaces

### Session Management
- **Global Session Invalidation**: Invalidate all user sessions
- **Session Versioning**: Track session versions for security
- **Device Tracking**: Basic client context tracking

### Authorization Flexibility
- **Multiple Group Sources**: IdP groups + ConfigMap bindings
- **Dynamic Permission Mapping**: Runtime permission calculation
- **Namespace-Scoped Access**: Fine-grained namespace permissions

## Security Best Practices

### Production Deployment
1. **Use Shared JWT Keys**: Set `KAPTN_JWT_PRIVATE_KEY_PEM` for multi-replica deployments
2. **Enable HTTPS**: Required for secure cookie transmission
3. **Configure OIDC Properly**: Validate redirect URLs and scopes
4. **Set Strong Session Secrets**: Minimum 32 characters for session encryption
5. **Monitor Authentication Events**: Track failed logins and unusual activity

### Key Management
1. **Rotate JWT Keys**: Regular key rotation for enhanced security
2. **Secure Key Storage**: Store keys in Kubernetes secrets or key management systems
3. **Backup Keys**: Ensure key availability for disaster recovery

### Session Security
1. **Short Access Token TTL**: 15 minutes maximum for reduced exposure
2. **Secure Cookie Settings**: HttpOnly, Secure, SameSite settings
3. **Regular Session Cleanup**: Automatic cleanup of expired sessions

## Troubleshooting

### Common Issues

#### OIDC Discovery Failure
```
Error: failed to initialize OIDC provider: context deadline exceeded
```
**Solution**: Verify OIDC issuer URL and network connectivity

#### Token Validation Errors
```
Error: failed to verify token: token is expired
```
**Solution**: Check system time synchronization and token TTL settings

#### Group Resolution Failures
```
Error: failed to resolve groups: ConfigMap not found
```
**Solution**: Verify ConfigMap exists and permissions are correct

#### Session Cookie Issues
```
Error: no session cookie found
```
**Solution**: Check cookie domain, path, and security settings

### Debug Mode
Enable debug logging for detailed authentication flow:
```go
logger := zap.NewDevelopment()
middleware := auth.NewMiddleware(logger, authMode, oidcClient, sessionManager, authzResolver, usernameFormat)
```

Debug output includes:
- OIDC token verification details
- Group resolution steps
- Session creation and validation
- Permission check results

## Future Enhancements

### Planned Features
- **JWKS Endpoint**: Public key distribution for external verification
- **Multi-Factor Authentication**: TOTP/WebAuthn integration
- **Advanced RBAC**: Fine-grained permission models
- **Audit Trail Enhancement**: Comprehensive security event logging
- **Session Analytics**: User session analytics and insights

### Extensibility Points
- **Custom Group Resolvers**: Pluggable group resolution backends
- **External Identity Sources**: LDAP, SAML integration
- **Custom Permission Mappers**: Flexible permission calculation
- **Token Enrichment**: Custom claims and metadata injection

## Dependencies

### External Dependencies
- `github.com/coreos/go-oidc/v3/oidc` - OIDC client library
- `github.com/golang-jwt/jwt/v5` - JWT token handling
- `golang.org/x/oauth2` - OAuth2 client implementation
- `golang.org/x/time/rate` - Rate limiting
- `go.uber.org/zap` - Structured logging

### Internal Dependencies
- `internal/config` - Configuration management
- Kubernetes client libraries for ConfigMap access
- Standard library crypto packages for security

This documentation provides comprehensive coverage of the auth package, serving as both a developer guide for extending authentication functionality and an operational reference for deploying and maintaining Kaptn's authentication system.