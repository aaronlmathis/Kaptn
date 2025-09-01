package middleware

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"

	"go.uber.org/zap"
)

// SecurityMiddleware provides security-related HTTP middleware.
type SecurityMiddleware struct {
	logger *zap.Logger
}

// NewSecurityMiddleware creates a new security middleware.
func NewSecurityMiddleware(logger *zap.Logger) *SecurityMiddleware {
	return &SecurityMiddleware{
		logger: logger,
	}
}

// SecurityHeaders returns middleware that adds security headers to responses.
// This is extracted from auth.Middleware to centralize security header logic.
func (sm *SecurityMiddleware) SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

		// HSTS header - unconditional in production for security
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")

		// Cache control - authenticated content should not be cached
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate, private")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")

		next.ServeHTTP(w, r)
	})
}

// generateNonce generates a cryptographically secure nonce for CSP.
func (sm *SecurityMiddleware) generateNonce() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		sm.logger.Warn("Failed to generate secure nonce, using fallback", zap.Error(err))
		return "fallback-nonce"
	}
	return base64.URLEncoding.EncodeToString(bytes)
}

// CORS returns middleware that handles CORS for same-origin deployment.
// This is extracted from server.go setupMiddleware.
func (sm *SecurityMiddleware) CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// For same-origin deployment, we disable CORS entirely
		// All requests should come from the same origin that serves the static files

		// Set credentials flag for cookie-based auth
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		// Handle preflight OPTIONS requests
		if r.Method == "OPTIONS" {
			// Only allow same-origin requests
			origin := r.Header.Get("Origin")
			if origin == "" {
				// Same-origin requests don't send Origin header
				w.WriteHeader(http.StatusOK)
				return
			}

			// Reject cross-origin preflight requests
			w.WriteHeader(http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}
