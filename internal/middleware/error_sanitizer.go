package middleware

import (
	"bufio"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"

	"go.uber.org/zap"
)

// ErrorSanitizer provides sanitized error responses
type ErrorSanitizer struct {
	logger *zap.Logger
}

// NewErrorSanitizer creates a new error sanitizer
func NewErrorSanitizer(logger *zap.Logger) *ErrorSanitizer {
	return &ErrorSanitizer{
		logger: logger,
	}
}

// SanitizeAndRespond sanitizes error messages and sends appropriate HTTP responses
func (es *ErrorSanitizer) SanitizeAndRespond(w http.ResponseWriter, r *http.Request, err error, statusCode int, userID string) {
	// Log the actual error with full details server-side
	es.logger.Error("Request error",
		zap.Error(err),
		zap.Int("status_code", statusCode),
		zap.String("path", r.URL.Path),
		zap.String("method", r.Method),
		zap.String("user_id", userID),
		zap.String("user_agent", r.Header.Get("User-Agent")),
		zap.String("remote_addr", r.RemoteAddr))

	// Create sanitized error message for client
	clientMessage := es.sanitizeErrorMessage(err.Error(), statusCode)

	// Send sanitized response to client
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	response := map[string]interface{}{
		"error":  clientMessage,
		"status": statusCode,
	}

	json.NewEncoder(w).Encode(response)
}

// sanitizeErrorMessage removes sensitive information from error messages
func (es *ErrorSanitizer) sanitizeErrorMessage(message string, statusCode int) string {
	// Sensitive patterns that should not be exposed to clients
	sensitivePatterns := []string{
		"token", "jwt", "bearer", "authorization", "secret", "key",
		"credential", "password", "session", "refresh", "claim",
		"signature", "verify", "decode", "parse", "validate",
		"database", "sql", "query", "connection", "redis",
		"kubernetes", "api-server", "etcd", "rbac",
		"internal", "config", "env", "environment",
	}

	messageLower := strings.ToLower(message)

	// Check if message contains sensitive information
	containsSensitive := false
	for _, pattern := range sensitivePatterns {
		if strings.Contains(messageLower, pattern) {
			containsSensitive = true
			break
		}
	}

	// If message contains sensitive info, return generic message
	if containsSensitive {
		return es.getGenericErrorMessage(statusCode)
	}

	// Clean up common error patterns
	sanitized := message

	// Remove stack traces
	if idx := strings.Index(sanitized, "\n"); idx != -1 {
		sanitized = sanitized[:idx]
	}

	// Remove file paths
	if strings.Contains(sanitized, "/") || strings.Contains(sanitized, "\\") {
		return es.getGenericErrorMessage(statusCode)
	}

	// Limit message length
	if len(sanitized) > 100 {
		sanitized = sanitized[:100] + "..."
	}

	// If empty or too generic, use status-based message
	if len(strings.TrimSpace(sanitized)) < 5 {
		return es.getGenericErrorMessage(statusCode)
	}

	return sanitized
}

// getGenericErrorMessage returns appropriate generic messages based on HTTP status
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
	case http.StatusMethodNotAllowed:
		return "Method not allowed for this resource."
	case http.StatusConflict:
		return "The request conflicts with the current state. Please refresh and try again."
	case http.StatusUnprocessableEntity:
		return "The request contains invalid data."
	case http.StatusTooManyRequests:
		return "Too many requests. Please wait a moment and try again."
	case http.StatusInternalServerError:
		return "An internal server error occurred. Please try again later."
	case http.StatusBadGateway:
		return "The upstream service is unavailable. Please try again later."
	case http.StatusServiceUnavailable:
		return "The service is temporarily unavailable. Please try again later."
	case http.StatusGatewayTimeout:
		return "The request timed out. Please try again later."
	default:
		return "An unexpected error occurred. Please try again."
	}
}

// Middleware returns an HTTP middleware that sanitizes error responses
func (es *ErrorSanitizer) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip WebSocket upgrade requests early
		if r.Header.Get("Upgrade") == "websocket" ||
			strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade") ||
			strings.Contains(r.URL.Path, "/stream/") {
			next.ServeHTTP(w, r)
			return
		}

		// Wrap the response writer to capture errors
		wrapped := &errorCapturingWriter{
			ResponseWriter: w,
			sanitizer:      es,
			request:        r,
		}

		next.ServeHTTP(wrapped, r)
	})
}

// errorCapturingWriter wraps http.ResponseWriter to sanitize error responses
type errorCapturingWriter struct {
	http.ResponseWriter
	sanitizer *ErrorSanitizer
	request   *http.Request
	written   bool
}

// WriteHeader captures error status codes
func (ecw *errorCapturingWriter) WriteHeader(statusCode int) {
	if !ecw.written && statusCode >= 400 {
		// This is an error response - we could sanitize it here if needed
		// For now, we'll just pass it through since handlers should use SanitizeAndRespond
		ecw.written = true
	}
	ecw.ResponseWriter.WriteHeader(statusCode)
}

// Write captures response body
func (ecw *errorCapturingWriter) Write(data []byte) (int, error) {
	ecw.written = true
	return ecw.ResponseWriter.Write(data)
}

// Hijack implements http.Hijacker for WebSocket support
func (ecw *errorCapturingWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := ecw.ResponseWriter.(http.Hijacker); ok {
		return h.Hijack()
	}
	return nil, nil, errors.New("hijacker not supported")
}
