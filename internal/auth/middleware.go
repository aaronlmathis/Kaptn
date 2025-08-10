package auth

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"golang.org/x/time/rate"
)

// AuthMode represents the authentication mode
type AuthMode string

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
			// Try session cookie first, then fall back to Bearer token
			var user *User
			var err error

			// Try to authenticate from session cookie
			if m.sessionManager != nil {
				if session, sessionErr := m.sessionManager.GetSessionFromCookie(r); sessionErr == nil {
					user = session.ToUser()
					m.logger.Debug("Authenticated via session cookie", zap.String("userId", user.ID))
				} else {
					m.logger.Debug("Session cookie authentication failed", zap.Error(sessionErr))
				}
			}

			// If no session cookie or session invalid, try Bearer token
			if user == nil {
				user, err = m.authenticateFromToken(ctx, r)
				if err != nil {
					m.logger.Debug("Token authentication failed", zap.Error(err))
					// Only return error if both session and token auth failed
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
			m.writeUnauthorized(w, "Authentication required")
			return
		}

		next.ServeHTTP(w, r)
	})
}

// RequireRole returns a middleware that requires specific roles
func (m *Middleware) RequireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := UserFromContext(r.Context())
			if !ok || user == nil {
				m.writeForbidden(w, "Authentication required")
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
				m.writeForbidden(w, "Insufficient permissions")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RequireWrite returns a middleware that requires write permissions
func (m *Middleware) RequireWrite(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := UserFromContext(r.Context())
		if !ok || user == nil {
			m.writeForbidden(w, "Authentication required")
			return
		}

		if !user.CanWrite() {
			m.logger.Info("Access denied - write permission required",
				zap.String("userId", user.ID),
				zap.Strings("userRoles", user.Groups))
			m.writeForbidden(w, "Write permission required")
			return
		}

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
		// Security headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Content Security Policy
		csp := "default-src 'self'; " +
			"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net blob:; " +
			"worker-src 'self' blob:; " +
			"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
			"img-src 'self' data:; " +
			"font-src 'self' https://cdn.jsdelivr.net; " +
			"connect-src 'self' ws: wss:; " +
			"frame-ancestors 'none';"
		w.Header().Set("Content-Security-Policy", csp)

		// HSTS header for HTTPS
		if r.TLS != nil {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
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
		// In a production system, you'd track last access time and remove stale limiters
		// For now, we'll keep all limiters to avoid complexity
		m.rateMutex.Unlock()
	}
}

// Helper methods for writing HTTP responses

func (m *Middleware) writeUnauthorized(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte(`{"error":"` + message + `","code":"UNAUTHORIZED"}`))
}

func (m *Middleware) writeForbidden(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	w.Write([]byte(`{"error":"` + message + `","code":"FORBIDDEN"}`))
}

func (m *Middleware) writeRateLimitExceeded(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	w.Write([]byte(`{"error":"Rate limit exceeded","code":"RATE_LIMIT_EXCEEDED"}`))
}
