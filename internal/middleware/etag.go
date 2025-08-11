package middleware

import (
	"crypto/md5"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

// ETagMiddleware provides ETag and Last-Modified support for cacheable responses
type ETagMiddleware struct {
	logger *zap.Logger
}

// NewETagMiddleware creates a new ETag middleware
func NewETagMiddleware(logger *zap.Logger) *ETagMiddleware {
	return &ETagMiddleware{
		logger: logger,
	}
}

// Middleware returns the ETag middleware handler
func (em *ETagMiddleware) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only apply to safe GET requests
		if r.Method != "GET" {
			next.ServeHTTP(w, r)
			return
		}

		// Skip if this is a sensitive or dynamic endpoint
		if em.shouldSkipETag(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		// Create response recorder to capture response for ETag calculation
		recorder := &ETagResponseRecorder{
			ResponseWriter: w,
			status:         200,
			lastModified:   time.Now(),
		}

		next.ServeHTTP(recorder, r)

		// Only process successful responses
		if recorder.status == 200 && len(recorder.body) > 0 {
			// Calculate ETag based on content
			etag := em.calculateETag(recorder.body)

			// Set ETag and Last-Modified headers
			w.Header().Set("ETag", fmt.Sprintf(`"%s"`, etag))
			w.Header().Set("Last-Modified", recorder.lastModified.UTC().Format(http.TimeFormat))

			// Check if client has matching ETag
			if clientETag := r.Header.Get("If-None-Match"); clientETag != "" {
				if em.etagMatches(clientETag, etag) {
					em.logger.Debug("ETag matched, serving 304",
						zap.String("path", r.URL.Path),
						zap.String("etag", etag),
						zap.String("request_id", middleware.GetReqID(r.Context())))

					w.WriteHeader(http.StatusNotModified)
					return
				}
			}

			// Check if client has If-Modified-Since
			if modSince := r.Header.Get("If-Modified-Since"); modSince != "" {
				if clientTime, err := http.ParseTime(modSince); err == nil {
					if !recorder.lastModified.After(clientTime) {
						em.logger.Debug("Content not modified since client cache, serving 304",
							zap.String("path", r.URL.Path),
							zap.Time("client_time", clientTime),
							zap.Time("last_modified", recorder.lastModified),
							zap.String("request_id", middleware.GetReqID(r.Context())))

						w.WriteHeader(http.StatusNotModified)
						return
					}
				}
			}

			// Set cache control for cacheable content
			em.setCacheHeaders(w, r)
		}
	})
}

// shouldSkipETag determines if ETag should be skipped for a path
func (em *ETagMiddleware) shouldSkipETag(path string) bool {
	// Skip ETag for sensitive or dynamic endpoints
	skipPaths := []string{
		"/api/v1/auth/",
		"/api/v1/me",
		"/api/v1/stream/",
		"/api/v1/analytics/",
		"/api/v1/metrics/",
		"/api/v1/logs/",
	}

	for _, skipPath := range skipPaths {
		if strings.HasPrefix(path, skipPath) {
			return true
		}
	}

	// Skip for admin endpoints
	if strings.Contains(path, "/admin/") {
		return true
	}

	return false
}

// calculateETag calculates an ETag for the given content
func (em *ETagMiddleware) calculateETag(content []byte) string {
	hasher := md5.New()
	hasher.Write(content)
	return fmt.Sprintf("%x", hasher.Sum(nil))[:16] // Use first 16 chars for shorter ETags
}

// etagMatches checks if client ETag matches server ETag
func (em *ETagMiddleware) etagMatches(clientETag, serverETag string) bool {
	// Handle both quoted and unquoted ETags
	clientETag = strings.Trim(clientETag, `"`)
	serverETag = strings.Trim(serverETag, `"`)
	return clientETag == serverETag
}

// setCacheHeaders sets appropriate cache headers based on content type
func (em *ETagMiddleware) setCacheHeaders(w http.ResponseWriter, r *http.Request) {
	// Different cache strategies based on endpoint type
	path := r.URL.Path

	switch {
	case strings.HasPrefix(path, "/api/v1/capabilities"):
		// Capabilities can be cached for a short time
		w.Header().Set("Cache-Control", "public, max-age=300") // 5 minutes
	case strings.HasPrefix(path, "/api/v1/config"):
		// Config can be cached for longer
		w.Header().Set("Cache-Control", "public, max-age=1800") // 30 minutes
	case strings.HasPrefix(path, "/api/v1/nodes"):
		// Node information changes less frequently
		w.Header().Set("Cache-Control", "public, max-age=60") // 1 minute
	case strings.HasPrefix(path, "/api/v1/namespaces") && r.Method == "GET":
		// Namespace listing can be cached briefly
		w.Header().Set("Cache-Control", "public, max-age=30") // 30 seconds
	default:
		// Conservative caching for other GET endpoints
		w.Header().Set("Cache-Control", "public, max-age=30") // 30 seconds
	}
}

// ETagResponseRecorder captures response data for ETag calculation
type ETagResponseRecorder struct {
	http.ResponseWriter
	status       int
	body         []byte
	lastModified time.Time
}

// WriteHeader captures the status code
func (r *ETagResponseRecorder) WriteHeader(statusCode int) {
	r.status = statusCode
	r.ResponseWriter.WriteHeader(statusCode)
}

// Write captures the response body
func (r *ETagResponseRecorder) Write(data []byte) (int, error) {
	r.body = append(r.body, data...)
	return r.ResponseWriter.Write(data)
}

// Flush forwards flush calls
func (r *ETagResponseRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// CloseNotify forwards close notifications
func (r *ETagResponseRecorder) CloseNotify() <-chan bool {
	if cn, ok := r.ResponseWriter.(http.CloseNotifier); ok {
		return cn.CloseNotify()
	}
	// Return a closed channel if CloseNotify is not available
	ch := make(chan bool)
	close(ch)
	return ch
}
