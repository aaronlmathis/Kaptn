package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"go.uber.org/zap"
)

const (
	CSRFCookieName = "kaptn_csrf"
	CSRFHeaderName = "X-CSRF-Token"
)

// CSRFMiddleware implements double-submit cookie CSRF protection
type CSRFMiddleware struct {
	logger *zap.Logger
}

// NewCSRFMiddleware creates a new CSRF middleware
func NewCSRFMiddleware(logger *zap.Logger) *CSRFMiddleware {
	return &CSRFMiddleware{
		logger: logger,
	}
}

// generateCSRFToken generates a secure random CSRF token
func (c *CSRFMiddleware) generateCSRFToken() (string, error) {
	bytes := make([]byte, 32) // 32 bytes = 64 hex characters
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// SetCSRFCookie sets a CSRF cookie for authenticated users
func (c *CSRFMiddleware) SetCSRFCookie(w http.ResponseWriter, r *http.Request) {
	// Check if user is authenticated
	user, ok := UserFromContext(r.Context())
	if !ok || user == nil {
		return
	}

	// Check if CSRF cookie already exists and is valid
	if cookie, err := r.Cookie(CSRFCookieName); err == nil && len(cookie.Value) >= 64 {
		return // Cookie already exists
	}

	// Generate new CSRF token
	token, err := c.generateCSRFToken()
	if err != nil {
		c.logger.Error("Failed to generate CSRF token", zap.Error(err))
		return
	}

	// Set CSRF cookie
	cookie := &http.Cookie{
		Name:     CSRFCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: false, // Must be readable by JavaScript for double-submit
		Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(time.Hour.Seconds()), // 1 hour
	}

	http.SetCookie(w, cookie)
	c.logger.Debug("Set CSRF cookie",
		zap.String("userId", user.ID),
		zap.String("tokenPrefix", token[:8]+"..."))
}

// ValidateCSRFToken validates the double-submit CSRF token
func (c *CSRFMiddleware) ValidateCSRFToken(r *http.Request) bool {
	// Skip validation for safe methods
	if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
		return true
	}

	// TEMPORARY: Skip CSRF validation to test RBAC
	// TODO: Re-enable after confirming RBAC works
	// c.logger.Debug("CSRF validation temporarily disabled for testing")
	// return true

	// Get token from cookie
	cookie, err := r.Cookie(CSRFCookieName)
	if err != nil || cookie.Value == "" {
		c.logger.Debug("CSRF validation failed: no cookie")
		return false
	}

	// Get token from header
	headerToken := r.Header.Get(CSRFHeaderName)
	if headerToken == "" {
		c.logger.Debug("CSRF validation failed: no header token")
		return false
	}

	// Compare tokens (double-submit validation)
	if cookie.Value != headerToken {
		c.logger.Debug("CSRF validation failed: token mismatch")
		return false
	}

	// Validate token format (64 hex characters)
	if len(headerToken) != 64 {
		c.logger.Debug("CSRF validation failed: invalid token format")
		return false
	}

	c.logger.Debug("CSRF validation successful")
	return true
}

// Middleware returns HTTP middleware for CSRF protection
func (c *CSRFMiddleware) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CSRF cookie for authenticated users
		c.SetCSRFCookie(w, r)

		// Validate CSRF token for state-changing operations
		if !c.ValidateCSRFToken(r) {
			user, _ := UserFromContext(r.Context())
			if user != nil {
				c.logger.Warn("CSRF validation failed",
					zap.String("method", r.Method),
					zap.String("path", r.URL.Path),
					zap.String("userId", user.ID))
			}
			http.Error(w, "CSRF token required", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}
