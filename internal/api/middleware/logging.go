package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/aaronlmathis/kaptn/internal/auth"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

// RequestLogger provides enhanced request logging with security context.
type RequestLogger struct {
	logger *zap.Logger
}

// NewRequestLogger creates a new request logger middleware.
func NewRequestLogger(logger *zap.Logger) *RequestLogger {
	return &RequestLogger{
		logger: logger,
	}
}

// Middleware returns an HTTP middleware that logs requests with security context.
func (rl *RequestLogger) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Get request ID if available
		reqID := chimiddleware.GetReqID(r.Context())

		// Get user info for logging
		var userInfo map[string]interface{}
		if user, ok := auth.UserFromContext(r.Context()); ok && user != nil {
			userInfo = map[string]interface{}{
				"user_id":    user.ID,
				"user_email": user.Email,
			}
		}

		// Add request to context for audit logging
		ctx := context.WithValue(r.Context(), "http_request", r)

		// Extract trace ID from authenticated user's claims if available
		if user, ok := auth.UserFromContext(ctx); ok && user != nil {
			if traceID, exists := user.Claims["trace_id"].(string); exists && traceID != "" {
				// Add trace ID to response headers for correlation
				w.Header().Set("X-Trace-ID", traceID)
				ctx = context.WithValue(ctx, "trace_id", traceID)
			}
		}

		// Create a response writer wrapper to capture status code
		ww := chimiddleware.NewWrapResponseWriter(w, r.ProtoMajor)

		// Process the request
		next.ServeHTTP(ww, r.WithContext(ctx))

		// Log the request
		duration := time.Since(start)

		fields := []zap.Field{
			zap.String("method", r.Method),
			zap.String("path", r.URL.Path),
			zap.String("query", r.URL.RawQuery),
			zap.Int("status", ww.Status()),
			zap.Duration("duration", duration),
			zap.String("remote_addr", r.RemoteAddr),
			zap.String("user_agent", r.UserAgent()),
		}

		if reqID != "" {
			fields = append(fields, zap.String("request_id", reqID))
		}

		if userInfo != nil {
			fields = append(fields, zap.Any("user", userInfo))
		}

		// Log at appropriate level based on status code
		if ww.Status() >= 500 {
			rl.logger.Error("HTTP request", fields...)
		} else if ww.Status() >= 400 {
			rl.logger.Warn("HTTP request", fields...)
		} else {
			rl.logger.Info("HTTP request", fields...)
		}
	})
}

// AuditLogger provides audit logging for security-sensitive operations.
type AuditLogger struct {
	logger *zap.Logger
}

// NewAuditLogger creates a new audit logger.
func NewAuditLogger(logger *zap.Logger) *AuditLogger {
	return &AuditLogger{
		logger: logger.Named("audit"),
	}
}

// LogSecurityEvent logs a security-related event for compliance and monitoring.
func (al *AuditLogger) LogSecurityEvent(r *http.Request, event string, details map[string]interface{}) {
	fields := []zap.Field{
		zap.String("event", event),
		zap.String("method", r.Method),
		zap.String("path", r.URL.Path),
		zap.String("remote_addr", r.RemoteAddr),
		zap.String("user_agent", r.UserAgent()),
		zap.Time("timestamp", time.Now()),
	}

	if reqID := chimiddleware.GetReqID(r.Context()); reqID != "" {
		fields = append(fields, zap.String("request_id", reqID))
	}

	if user, ok := auth.UserFromContext(r.Context()); ok && user != nil {
		fields = append(fields, zap.String("user_id", user.ID))
		fields = append(fields, zap.String("user_email", user.Email))
	}

	if details != nil {
		fields = append(fields, zap.Any("details", details))
	}

	al.logger.Info("Security event", fields...)
}

// LogPermissionCheck logs a permission check for audit purposes.
func (al *AuditLogger) LogPermissionCheck(r *http.Request, user *auth.User, verb, resource, namespace string, allowed bool) {
	details := map[string]interface{}{
		"verb":      verb,
		"resource":  resource,
		"namespace": namespace,
		"allowed":   allowed,
	}

	event := "permission_check"
	if !allowed {
		event = "permission_denied"
	}

	al.LogSecurityEvent(r, event, details)
}
