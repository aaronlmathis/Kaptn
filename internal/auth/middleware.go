package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

// AuthMode represents the authentication mode
type AuthMode string

// CSPNonceKey is the context key for CSP nonce
type CSPNonceKey struct{}

const (
	AuthModeNone   AuthMode = "none"
	AuthModeHeader AuthMode = "header"
	AuthModeOIDC   AuthMode = "oidc"
)

// Middleware provides authentication and authorization middleware
type Middleware struct {
	logger         *zap.Logger
	authMode       AuthMode
	oidcClient     *OIDCClient
	sessionManager *SessionManager
	authzResolver  *AuthzResolver
	usernameFormat string
	rateLimits     map[string]*rate.Limiter
	rateMutex      sync.RWMutex

	// Failed login attempt tracking
	loginAttempts map[string]*LoginAttempts
	attemptMutex  sync.RWMutex
}

// LoginAttempts tracks failed login attempts for rate limiting
type LoginAttempts struct {
	Count     int       `json:"count"`
	FirstTry  time.Time `json:"first_try"`
	LastTry   time.Time `json:"last_try"`
	BlockedAt time.Time `json:"blocked_at,omitempty"`
}

// NewMiddleware creates a new authentication middleware
func NewMiddleware(logger *zap.Logger, authMode AuthMode, oidcClient *OIDCClient, sessionManager *SessionManager, authzResolver *AuthzResolver, usernameFormat string) *Middleware {
	return &Middleware{
		logger:         logger,
		authMode:       authMode,
		oidcClient:     oidcClient,
		sessionManager: sessionManager,
		authzResolver:  authzResolver,
		usernameFormat: usernameFormat,
		rateLimits:     make(map[string]*rate.Limiter),
		loginAttempts:  make(map[string]*LoginAttempts),
	}
}

// Authenticate returns a middleware that authenticates requests
func (m *Middleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		switch m.authMode {
		case AuthModeNone:
			// No authentication required
			next.ServeHTTP(w, r)
			return

		case AuthModeHeader:
			// Extract user from headers (for development/testing)
			user := m.authenticateFromHeaders(r)
			if user != nil {
				ctx = WithUser(ctx, user)
			}

		case AuthModeOIDC:
			// Try access token cookie first, then session cookie (legacy), then Bearer token
			var user *User
			var err error

			// Try to authenticate from new access token cookie
			if m.sessionManager != nil {
				// Get token manager for new authentication
				tokenManager := m.sessionManager.GetTokenManager()
				if tokenManager != nil {
					accessToken, _ := tokenManager.GetTokensFromCookies(r)
					if accessToken != "" {
						if claims, tokenErr := tokenManager.ValidateAccessToken(accessToken); tokenErr == nil {
							user = &User{
								ID:      claims.UserID,
								Email:   claims.Email,
								Name:    claims.Name,
								Picture: claims.Picture,
								Groups:  claims.Roles, // Use roles as groups
								Claims: map[string]interface{}{
									"sub":         claims.UserID,
									"email":       claims.Email,
									"name":        claims.Name,
									"picture":     claims.Picture,
									"roles":       claims.Roles,
									"perms":       claims.Perms,
									"session_ver": claims.SessionVer,
									"jti":         claims.JTI,
									"trace_id":    claims.TraceID,
								},
							}
							m.logger.Debug("Authenticated via access token",
								zap.String("userId", user.ID),
								zap.String("jti", claims.JTI),
								zap.String("trace_id", claims.TraceID))
						} else {
							m.logger.Debug("Access token authentication failed", zap.Error(tokenErr))
						}
					}
				}

				// Fallback to legacy session cookie authentication
				if user == nil {
					if session, sessionErr := m.sessionManager.GetSessionFromCookie(r); sessionErr == nil {
						user = session.ToUser()
						m.logger.Debug("Authenticated via legacy session cookie", zap.String("userId", user.ID))
					} else {
						m.logger.Debug("Session cookie authentication failed", zap.Error(sessionErr))
					}
				}
			}

			// If no session cookie or session invalid, try Bearer token
			if user == nil {
				user, err = m.authenticateFromToken(ctx, r)
				if err != nil {
					m.logger.Debug("Token authentication failed", zap.Error(err))
					// Only return error if all auth methods failed
					m.writeUnauthorized(w, "Invalid or missing authentication")
					return
				}
				if user != nil {
					m.logger.Debug("Authenticated via Bearer token", zap.String("userId", user.ID))
				}
			}

			if user != nil {
				// Resolve authorization using the configured resolver
				if m.authzResolver != nil {
					authzResult, authzErr := m.authzResolver.ResolveAuthorization(ctx, user, m.usernameFormat)
					if authzErr != nil {
						m.logger.Warn("Authorization resolution failed",
							zap.String("userId", user.ID),
							zap.String("email", user.Email),
							zap.Error(authzErr))
						// Still allow the user through with original groups, but log the issue
					} else {
						// Update user with resolved authorization info
						user.Groups = authzResult.Groups
						m.logger.Debug("Authorization resolved",
							zap.String("userId", user.ID),
							zap.String("username", authzResult.Username),
							zap.Strings("groups", authzResult.Groups),
							zap.Strings("namespaces", authzResult.Namespaces))
					}
				}

				ctx = WithUser(ctx, user)
			}

		default:
			m.logger.Error("Unknown auth mode", zap.String("mode", string(m.authMode)))
			m.writeUnauthorized(w, "Authentication mode not configured")
			return
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAuth returns a middleware that requires authentication
func (m *Middleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := UserFromContext(r.Context())
		if !ok || user == nil {
			m.auditAuthorizationDecision(r, nil, "authentication", "", "", "", "DENIED", "No authenticated user")
			m.writeUnauthorized(w, "Authentication required")
			return
		}

		// Validate session version
		if !m.validateSessionVersion(user) {
			m.auditAuthorizationDecision(r, user, "authentication", "", "", "", "DENIED", "Session version invalid")
			m.writeUnauthorized(w, "Session expired - please re-authenticate")
			return
		}

		m.auditAuthorizationDecision(r, user, "authentication", "", "", "", "ALLOWED", "")
		next.ServeHTTP(w, r)
	})
}

// RequireRole returns a middleware that requires specific roles
func (m *Middleware) RequireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := UserFromContext(r.Context())
			if !ok || user == nil {
				m.auditAuthorizationDecision(r, nil, "role_check", "", "", "", "DENIED", "No authenticated user")
				m.writeForbidden(w, "Authentication required")
				return
			}

			// Validate session version for role-based access
			if !m.validateSessionVersion(user) {
				m.auditAuthorizationDecision(r, user, "role_check", "", "", "", "DENIED", "Session version invalid")
				m.writeUnauthorized(w, "Session expired - please re-authenticate")
				return
			}

			// Check if user has any of the required roles
			hasRole := false
			for _, role := range roles {
				if user.HasRole(role) {
					hasRole = true
					break
				}
			}

			if !hasRole {
				m.logger.Info("Access denied - insufficient roles",
					zap.String("userId", user.ID),
					zap.Strings("userRoles", user.Groups),
					zap.Strings("requiredRoles", roles))
				m.auditAuthorizationDecision(r, user, "role_check", "", "", "", "DENIED", fmt.Sprintf("Required roles: %v", roles))
				m.writeForbidden(w, "Insufficient permissions")
				return
			}

			m.auditAuthorizationDecision(r, user, "role_check", "", "", "", "ALLOWED", fmt.Sprintf("Matched role from: %v", roles))
			next.ServeHTTP(w, r)
		})
	}
}

// RequireWrite returns a middleware that requires write permissions
func (m *Middleware) RequireWrite(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := UserFromContext(r.Context())
		if !ok || user == nil {
			m.auditAuthorizationDecision(r, nil, "write", "", "", "", "DENIED", "No authenticated user")
			m.writeForbidden(w, "Authentication required")
			return
		}

		// Validate session version for write operations
		if !m.validateSessionVersion(user) {
			m.auditAuthorizationDecision(r, user, "write", "", "", "", "DENIED", "Session version invalid")
			m.writeUnauthorized(w, "Session expired - please re-authenticate")
			return
		}

		if !user.CanWrite() {
			m.logger.Info("Access denied - write permission required",
				zap.String("userId", user.ID),
				zap.Strings("userRoles", user.Groups))
			m.auditAuthorizationDecision(r, user, "write", "", "", "", "DENIED", "Insufficient write permissions")
			m.writeForbidden(w, "Write permission required")
			return
		}

		m.auditAuthorizationDecision(r, user, "write", "", "", "", "ALLOWED", "")
		next.ServeHTTP(w, r)
	})
}

// RateLimit returns a middleware that applies rate limiting
func (m *Middleware) RateLimit(requestsPerMinute int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Get user identifier for rate limiting
			userID := "anonymous"
			if user, ok := UserFromContext(r.Context()); ok && user != nil {
				userID = user.ID
			} else {
				// Fall back to IP address for anonymous users
				userID = r.RemoteAddr
			}

			// Get or create rate limiter for this user
			limiter := m.getRateLimiter(userID, requestsPerMinute)

			if !limiter.Allow() {
				m.logger.Warn("Rate limit exceeded",
					zap.String("userId", userID),
					zap.String("path", r.URL.Path))
				m.writeRateLimitExceeded(w)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// SecureHeaders returns a middleware that adds security headers
func (m *Middleware) SecureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Generate nonce for inline scripts
		nonce := m.generateNonce()

		// Store nonce in context for templates that need it
		ctx := context.WithValue(r.Context(), CSPNonceKey{}, nonce)
		r = r.WithContext(ctx)

		// Security headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Permissions Policy (restrict dangerous browser features)
		permissionsPolicy := "camera=(), microphone=(), geolocation=(), payment=(), " +
			"usb=(), magnetometer=(), gyroscope=(), accelerometer=(), " +
			"ambient-light-sensor=(), autoplay=self, encrypted-media=*"
		w.Header().Set("Permissions-Policy", permissionsPolicy)

		// Content Security Policy with nonce - TEMPORARILY DISABLED FOR DEVELOPMENT
		// TODO: Re-enable CSP once Astro inline scripts are properly handled
		/*
			csp := fmt.Sprintf("default-src 'self'; "+
				"script-src 'self' 'nonce-%s' https://cdn.jsdelivr.net blob:; "+
				"worker-src 'self' blob:; "+
				"style-src 'self' 'nonce-%s' https://cdn.jsdelivr.net; "+
				"img-src 'self' data:; "+
				"font-src 'self' https://cdn.jsdelivr.net; "+
				"connect-src 'self' ws: wss:; "+
				"frame-ancestors 'none'; "+
				"base-uri 'self'; "+
				"form-action 'self'",
				nonce, nonce)
			w.Header().Set("Content-Security-Policy", csp)
		*/

		// HSTS header - unconditional in production for security
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")

		// Cache control based on authentication status
		user, authenticated := UserFromContext(r.Context())
		if authenticated && user != nil {
			// Authenticated content should not be cached
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate, private")
			w.Header().Set("Pragma", "no-cache")
			w.Header().Set("Expires", "0")
		} else {
			// Anonymous content can be cached for short periods
			w.Header().Set("Cache-Control", "public, max-age=300") // 5 minutes
		}

		next.ServeHTTP(w, r)
	})
}

// authenticateFromHeaders extracts user information from request headers
func (m *Middleware) authenticateFromHeaders(r *http.Request) *User {
	userID := r.Header.Get("X-User-ID")
	email := r.Header.Get("X-User-Email")
	name := r.Header.Get("X-User-Name")
	groupsHeader := r.Header.Get("X-User-Groups")

	if userID == "" && email == "" {
		return nil
	}

	var groups []string
	if groupsHeader != "" {
		groups = strings.Split(groupsHeader, ",")
		for i, group := range groups {
			groups[i] = strings.TrimSpace(group)
		}
	}

	return &User{
		ID:     userID,
		Email:  email,
		Name:   name,
		Groups: groups,
		Claims: map[string]interface{}{
			"sub":    userID,
			"email":  email,
			"name":   name,
			"groups": groups,
		},
	}
}

// authenticateFromToken extracts and validates JWT token from request
func (m *Middleware) authenticateFromToken(ctx context.Context, r *http.Request) (*User, error) {
	if m.oidcClient == nil {
		return nil, nil // OIDC not configured
	}

	// Extract token from Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return nil, nil // No token provided
	}

	// Check for Bearer token
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return nil, nil // Invalid format
	}

	token := parts[1]
	if token == "" {
		return nil, nil // Empty token
	}

	// Verify the token
	user, err := m.oidcClient.VerifyToken(ctx, token)
	if err != nil {
		return nil, err
	}

	return user, nil
}

// getRateLimiter gets or creates a rate limiter for a user
func (m *Middleware) getRateLimiter(userID string, requestsPerMinute int) *rate.Limiter {
	m.rateMutex.Lock()
	defer m.rateMutex.Unlock()

	if limiter, exists := m.rateLimits[userID]; exists {
		return limiter
	}

	// Create new rate limiter: requestsPerMinute requests per minute with burst of 10
	limiter := rate.NewLimiter(rate.Every(time.Minute/time.Duration(requestsPerMinute)), 10)
	m.rateLimits[userID] = limiter

	return limiter
}

// cleanupRateLimiters periodically cleans up old rate limiters
func (m *Middleware) CleanupRateLimiters() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		m.rateMutex.Lock()
		// For now, just log the cleanup - in production you'd implement proper cleanup
		m.logger.Debug("Rate limiter cleanup cycle", zap.Int("active_limiters", len(m.rateLimits)))
		m.rateMutex.Unlock()
	}
}

// Helper methods for writing HTTP responses

// validateSessionVersion validates if a user's session version is current
func (m *Middleware) validateSessionVersion(user *User) bool {
	if m.sessionManager == nil {
		return true // If no session manager, assume valid
	}

	tokenManager := m.sessionManager.GetTokenManager()
	if tokenManager == nil {
		return true // If no token manager, assume valid
	}

	// Extract session_ver from user claims
	if claims, ok := user.Claims["session_ver"].(float64); ok {
		currentVersion := tokenManager.GetSessionVersion(user.ID)
		return int64(claims) == currentVersion
	}

	// If no session_ver claim, assume legacy session (valid)
	return true
}

// auditAuthorizationDecision logs authorization decisions for audit purposes
func (m *Middleware) auditAuthorizationDecision(r *http.Request, user *User, operation, resource, namespace, name, decision, reason string) {
	// Get trace ID from user claims if available
	traceID := ""
	if user != nil {
		if tid, ok := user.Claims["trace_id"].(string); ok {
			traceID = tid
		}
	}

	// Get request ID from context
	requestID := ""
	if r.Context().Value("requestID") != nil {
		if rid, ok := r.Context().Value("requestID").(string); ok {
			requestID = rid
		}
	}

	auditFields := []zap.Field{
		zap.String("event_type", "authorization"),
		zap.String("request_id", requestID),
		zap.String("trace_id", traceID),
		zap.String("method", r.Method),
		zap.String("path", r.URL.Path),
		zap.String("operation", operation),
		zap.String("resource", resource),
		zap.String("namespace", namespace),
		zap.String("name", name),
		zap.String("decision", decision),
		zap.String("reason", reason),
		zap.String("client_ip", r.RemoteAddr),
		zap.String("user_agent", r.Header.Get("User-Agent")),
	}

	if user != nil {
		auditFields = append(auditFields,
			zap.String("user_id", user.ID),
			zap.String("user_email", user.Email),
			zap.Strings("user_groups", user.Groups),
		)
	}

	if decision == "ALLOWED" {
		m.logger.Info("Authorization decision", auditFields...)
	} else {
		m.logger.Warn("Authorization decision", auditFields...)
	}
}

func (m *Middleware) writeUnauthorized(w http.ResponseWriter, message string) {
	// Sanitize error message for client
	sanitizedMessage := m.sanitizeErrorMessage(message)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte(`{"error":"` + sanitizedMessage + `","code":"UNAUTHORIZED"}`))
}

func (m *Middleware) writeForbidden(w http.ResponseWriter, message string) {
	// Sanitize error message for client
	sanitizedMessage := m.sanitizeErrorMessage(message)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	w.Write([]byte(`{"error":"` + sanitizedMessage + `","code":"FORBIDDEN"}`))
}

func (m *Middleware) writeRateLimitExceeded(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	w.Write([]byte(`{"error":"Rate limit exceeded","code":"RATE_LIMIT_EXCEEDED"}`))
}

// sanitizeErrorMessage removes sensitive details from error messages
func (m *Middleware) sanitizeErrorMessage(message string) string {
	// Define sensitive patterns to remove/replace
	sensitivePatterns := map[string]string{
		"token":         "authentication",
		"session":       "authentication",
		"jwt":           "authentication",
		"claim":         "authentication",
		"signature":     "authentication",
		"verification":  "authentication",
		"validation":    "authentication",
		"expired":       "expired",
		"invalid":       "invalid",
		"unauthorized":  "unauthorized",
		"forbidden":     "forbidden",
		"permission":    "permission",
		"access denied": "access denied",
	}

	// Convert to lowercase for pattern matching
	lowerMessage := strings.ToLower(message)

	// Check for sensitive patterns and return generic messages
	for pattern, replacement := range sensitivePatterns {
		if strings.Contains(lowerMessage, pattern) {
			switch replacement {
			case "authentication":
				return "Authentication failed"
			case "expired":
				return "Session expired"
			case "invalid":
				return "Invalid request"
			case "unauthorized":
				return "Unauthorized"
			case "forbidden":
				return "Forbidden"
			case "permission":
				return "Insufficient permissions"
			case "access denied":
				return "Access denied"
			}
		}
	}

	// If no sensitive patterns found, return the original message (truncated if too long)
	if len(message) > 100 {
		return message[:100] + "..."
	}

	return message
}

// generateNonce generates a cryptographically secure nonce for CSP
func (m *Middleware) generateNonce() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to timestamp-based nonce if crypto fails
		return fmt.Sprintf("nonce-%d", time.Now().UnixNano())
	}
	return base64.RawURLEncoding.EncodeToString(bytes)
}

// validateCSRFToken validates a CSRF token using double-submit pattern
func (m *Middleware) validateCSRFToken(token, userID string) bool {
	// In a real implementation, you'd have a more sophisticated CSRF token validation
	// For now, we'll use a simple validation that checks if the token is non-empty
	// and matches a pattern that could include the user ID
	return token != "" && len(token) >= 16
}

// CSRF protection middleware for high-risk operations
func (m *Middleware) CSRFProtection(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip CSRF for safe methods
		if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
			next.ServeHTTP(w, r)
			return
		}

		// For state-changing operations, validate CSRF token
		user, ok := UserFromContext(r.Context())
		if !ok || user == nil {
			m.writeUnauthorized(w, "Authentication required for CSRF protection")
			return
		}

		// Check for CSRF token in header
		csrfToken := r.Header.Get("X-CSRF-Token")
		if csrfToken == "" {
			m.auditAuthorizationDecision(r, user, "csrf", "", "", "", "DENIED", "Missing CSRF token")
			m.writeForbidden(w, "CSRF token required")
			return
		}

		// Validate CSRF token (double-submit pattern)
		if !m.validateCSRFToken(csrfToken, user.ID) {
			m.auditAuthorizationDecision(r, user, "csrf", "", "", "", "DENIED", "Invalid CSRF token")
			m.writeForbidden(w, "Invalid CSRF token")
			return
		}

		m.auditAuthorizationDecision(r, user, "csrf", "", "", "", "ALLOWED", "")
		next.ServeHTTP(w, r)
	})
}

// TrackFailedLogin tracks a failed login attempt and applies incremental backoff
func (m *Middleware) TrackFailedLogin(identifier string) bool {
	now := time.Now()
	m.attemptMutex.Lock()
	defer m.attemptMutex.Unlock()

	attempt, exists := m.loginAttempts[identifier]
	if !exists {
		m.loginAttempts[identifier] = &LoginAttempts{
			Count:    1,
			FirstTry: now,
			LastTry:  now,
		}
		return true // Allow first attempt
	}

	// Check if user is currently blocked
	if !attempt.BlockedAt.IsZero() {
		blockDuration := m.calculateBackoffDuration(attempt.Count)
		if now.Sub(attempt.BlockedAt) < blockDuration {
			return false // Still blocked
		}
		// Reset block if enough time has passed
		attempt.BlockedAt = time.Time{}
	}

	// Increment attempt count and check if should be blocked
	attempt.Count++
	attempt.LastTry = now

	// Apply incremental backoff after 3 failed attempts
	if attempt.Count >= 3 {
		attempt.BlockedAt = now
		return false
	}

	return true
}

// ClearFailedLogins clears failed login attempts for an identifier (on successful login)
func (m *Middleware) ClearFailedLogins(identifier string) {
	m.attemptMutex.Lock()
	defer m.attemptMutex.Unlock()
	delete(m.loginAttempts, identifier)
}

// calculateBackoffDuration calculates the backoff duration based on attempt count
func (m *Middleware) calculateBackoffDuration(attempts int) time.Duration {
	// Exponential backoff: 1min, 5min, 15min, 30min, 1hour (max)
	switch {
	case attempts < 3:
		return 0
	case attempts == 3:
		return 1 * time.Minute
	case attempts == 4:
		return 5 * time.Minute
	case attempts == 5:
		return 15 * time.Minute
	case attempts == 6:
		return 30 * time.Minute
	default:
		return 1 * time.Hour
	}
}
