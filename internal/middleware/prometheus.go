package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/aaronlmathis/k8s-admin-dash/internal/metrics"
	"github.com/go-chi/chi/v5/middleware"
)

// PrometheusMiddleware records HTTP request metrics for Prometheus
func PrometheusMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Create a response writer wrapper to capture status code
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

		// Process the request
		next.ServeHTTP(ww, r)

		// Record metrics
		duration := time.Since(start)
		path := sanitizePath(r.URL.Path)
		statusCode := ww.Status()

		metrics.RecordHTTPRequest(r.Method, path, statusCode, duration)
	})
}

// RequestIDResponseMiddleware adds the request ID to response headers
func RequestIDResponseMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if reqID := middleware.GetReqID(r.Context()); reqID != "" {
			w.Header().Set("X-Request-ID", reqID)
		}
		next.ServeHTTP(w, r)
	})
}

// sanitizePath normalizes URL paths for metrics to prevent cardinality explosion
func sanitizePath(path string) string {
	// Replace dynamic path segments with placeholders
	path = strings.TrimSuffix(path, "/")

	// Common API path patterns
	if strings.HasPrefix(path, "/api/v1/") {
		parts := strings.Split(path, "/")
		if len(parts) >= 4 {
			// /api/v1/{resource}
			if len(parts) == 4 {
				return path
			}

			// /api/v1/{resource}/{id} -> /api/v1/{resource}/:id
			if len(parts) == 5 {
				return strings.Join(parts[:4], "/") + "/:id"
			}

			// /api/v1/{resource}/{id}/{action} -> /api/v1/{resource}/:id/{action}
			if len(parts) == 6 {
				return strings.Join(parts[:4], "/") + "/:id/" + parts[5]
			}

			// More complex patterns
			switch parts[3] {
			case "nodes":
				if len(parts) >= 5 {
					if len(parts) == 6 {
						// /api/v1/nodes/{node}/{action}
						return "/api/v1/nodes/:node/" + parts[5]
					}
					return "/api/v1/nodes/:node"
				}
			case "pods":
				if len(parts) >= 6 {
					if len(parts) == 7 && parts[6] == "logs" {
						// /api/v1/pods/{namespace}/{pod}/logs
						return "/api/v1/pods/:namespace/:pod/logs"
					}
					// /api/v1/pods/{namespace}/{pod}
					return "/api/v1/pods/:namespace/:pod"
				}
			case "namespaces":
				if len(parts) >= 6 && parts[5] == "apply" {
					// /api/v1/namespaces/{namespace}/apply
					return "/api/v1/namespaces/:namespace/apply"
				}
			case "stream":
				if len(parts) >= 5 {
					// /api/v1/stream/{type}
					return "/api/v1/stream/" + parts[4]
				}
			}
		}
	}

	// WebSocket endpoints
	if strings.HasPrefix(path, "/api/v1/stream/") {
		parts := strings.Split(path, "/")
		if len(parts) >= 5 {
			return "/api/v1/stream/" + parts[4]
		}
	}

	// Health endpoints
	if path == "/healthz" || path == "/readyz" || path == "/version" || path == "/metrics" {
		return path
	}

	// Default: return the path as-is for static content
	return path
}
