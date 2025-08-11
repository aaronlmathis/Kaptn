package middleware

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
)

// IdempotencyResult represents a cached response
type IdempotencyResult struct {
	StatusCode int               `json:"status_code"`
	Headers    map[string]string `json:"headers"`
	Body       []byte            `json:"body"`
	Timestamp  time.Time         `json:"timestamp"`
}

// IdempotencyMiddleware provides idempotency for state-changing operations
type IdempotencyMiddleware struct {
	logger *zap.Logger
	cache  map[string]*IdempotencyResult
	mutex  sync.RWMutex
	ttl    time.Duration
}

// NewIdempotencyMiddleware creates a new idempotency middleware
func NewIdempotencyMiddleware(logger *zap.Logger, ttl time.Duration) *IdempotencyMiddleware {
	im := &IdempotencyMiddleware{
		logger: logger,
		cache:  make(map[string]*IdempotencyResult),
		ttl:    ttl,
	}

	// Start cleanup goroutine
	go im.cleanup()

	return im
}

// Middleware returns the idempotency middleware handler
func (im *IdempotencyMiddleware) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only apply to state-changing methods
		if r.Method != "POST" && r.Method != "PUT" && r.Method != "PATCH" && r.Method != "DELETE" {
			next.ServeHTTP(w, r)
			return
		}

		// Get idempotency key from header
		idempotencyKey := r.Header.Get("X-Idempotency-Key")
		if idempotencyKey == "" {
			// If no idempotency key, process normally
			next.ServeHTTP(w, r)
			return
		}

		// Generate cache key based on method, path, user, and idempotency key
		cacheKey := im.generateCacheKey(r, idempotencyKey)

		// Check if we have a cached result
		if result := im.getCachedResult(cacheKey); result != nil {
			im.logger.Debug("Serving cached idempotent response",
				zap.String("cache_key", cacheKey),
				zap.String("idempotency_key", idempotencyKey),
				zap.String("request_id", middleware.GetReqID(r.Context())))

			// Serve cached response
			im.serveCachedResponse(w, result)
			return
		}

		// No cached result, process the request and cache the response
		responseRecorder := &ResponseRecorder{
			ResponseWriter: w,
			statusCode:     200,
			headers:        make(map[string]string),
			body:           bytes.NewBuffer(nil),
		}

		next.ServeHTTP(responseRecorder, r)

		// Cache the response if it was successful (2xx status)
		if responseRecorder.statusCode >= 200 && responseRecorder.statusCode < 300 {
			result := &IdempotencyResult{
				StatusCode: responseRecorder.statusCode,
				Headers:    responseRecorder.headers,
				Body:       responseRecorder.body.Bytes(),
				Timestamp:  time.Now(),
			}

			im.cacheResult(cacheKey, result)

			im.logger.Debug("Cached idempotent response",
				zap.String("cache_key", cacheKey),
				zap.String("idempotency_key", idempotencyKey),
				zap.Int("status_code", result.StatusCode),
				zap.String("request_id", middleware.GetReqID(r.Context())))
		}
	})
}

// generateCacheKey generates a unique cache key for the request
func (im *IdempotencyMiddleware) generateCacheKey(r *http.Request, idempotencyKey string) string {
	// Include method, path, user info, and idempotency key
	userInfo := "anonymous"
	if user, ok := r.Context().Value("user").(string); ok {
		userInfo = user
	}

	// Create hash of the combination
	hasher := sha256.New()
	hasher.Write([]byte(fmt.Sprintf("%s:%s:%s:%s", r.Method, r.URL.Path, userInfo, idempotencyKey)))
	return hex.EncodeToString(hasher.Sum(nil))
}

// getCachedResult retrieves a cached result if it exists and is not expired
func (im *IdempotencyMiddleware) getCachedResult(cacheKey string) *IdempotencyResult {
	im.mutex.RLock()
	defer im.mutex.RUnlock()

	result, exists := im.cache[cacheKey]
	if !exists {
		return nil
	}

	// Check if expired
	if time.Since(result.Timestamp) > im.ttl {
		// Will be cleaned up by the cleanup goroutine
		return nil
	}

	return result
}

// cacheResult stores a result in the cache
func (im *IdempotencyMiddleware) cacheResult(cacheKey string, result *IdempotencyResult) {
	im.mutex.Lock()
	defer im.mutex.Unlock()
	im.cache[cacheKey] = result
}

// serveCachedResponse serves a cached response
func (im *IdempotencyMiddleware) serveCachedResponse(w http.ResponseWriter, result *IdempotencyResult) {
	// Set headers
	for key, value := range result.Headers {
		w.Header().Set(key, value)
	}

	// Add cache indicator header
	w.Header().Set("X-Idempotency-Cache", "HIT")

	// Set status code and write body
	w.WriteHeader(result.StatusCode)
	w.Write(result.Body)
}

// cleanup periodically removes expired entries from the cache
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

		im.logger.Debug("Idempotency cache cleanup completed",
			zap.Int("remaining_entries", len(im.cache)))

		im.mutex.Unlock()
	}
}

// ResponseRecorder captures response data for caching
type ResponseRecorder struct {
	http.ResponseWriter
	statusCode int
	headers    map[string]string
	body       *bytes.Buffer
}

// WriteHeader captures the status code
func (rr *ResponseRecorder) WriteHeader(statusCode int) {
	rr.statusCode = statusCode
	rr.ResponseWriter.WriteHeader(statusCode)
}

// Write captures the response body
func (rr *ResponseRecorder) Write(data []byte) (int, error) {
	rr.body.Write(data)
	return rr.ResponseWriter.Write(data)
}

// Header captures headers
func (rr *ResponseRecorder) Header() http.Header {
	headers := rr.ResponseWriter.Header()

	// Capture important headers for caching (exclude hop-by-hop headers)
	for key, values := range headers {
		if len(values) > 0 && !isHopByHopHeader(key) {
			rr.headers[key] = values[0]
		}
	}

	return headers
}

// isHopByHopHeader checks if a header is hop-by-hop and should not be cached
func isHopByHopHeader(header string) bool {
	hopByHopHeaders := []string{
		"Connection",
		"Keep-Alive",
		"Proxy-Authenticate",
		"Proxy-Authorization",
		"TE",
		"Trailers",
		"Transfer-Encoding",
		"Upgrade",
	}

	headerLower := strings.ToLower(header)
	for _, hopHeader := range hopByHopHeaders {
		if headerLower == strings.ToLower(hopHeader) {
			return true
		}
	}
	return false
}
