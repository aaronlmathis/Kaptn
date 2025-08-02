package metrics

import (
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Prometheus metrics for the API server
var (
	// HTTP request metrics
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kad_http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "path", "status_code"},
	)

	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "kad_http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path", "status_code"},
	)

	// Kubernetes API call metrics
	kubernetesRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kad_kubernetes_requests_total",
			Help: "Total number of requests to Kubernetes API",
		},
		[]string{"resource", "verb", "status_code"},
	)

	kubernetesRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "kad_kubernetes_request_duration_seconds",
			Help:    "Kubernetes API request duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"resource", "verb", "status_code"},
	)

	// WebSocket metrics
	websocketConnectionsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kad_websocket_connections_total",
			Help: "Total number of WebSocket connections",
		},
		[]string{"stream_type"},
	)

	websocketConnectionsActive = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "kad_websocket_connections_active",
			Help: "Number of active WebSocket connections",
		},
		[]string{"stream_type"},
	)

	// Rate limiting metrics
	rateLimitedRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kad_rate_limited_requests_total",
			Help: "Total number of rate limited requests",
		},
		[]string{"user_id", "endpoint"},
	)

	// Authentication metrics
	authRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kad_auth_requests_total",
			Help: "Total number of authentication requests",
		},
		[]string{"auth_mode", "status"},
	)

	// Job metrics
	jobsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "kad_jobs_total",
			Help: "Total number of background jobs",
		},
		[]string{"job_type", "status"},
	)

	jobDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "kad_job_duration_seconds",
			Help:    "Job execution duration in seconds",
			Buckets: []float64{1, 5, 10, 30, 60, 300, 600, 1800}, // 1s to 30m
		},
		[]string{"job_type", "status"},
	)

	// Cluster resource metrics (cached from Kubernetes metrics)
	clusterCPUUsagePercent = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "kad_cluster_cpu_usage_percent",
			Help: "Cluster CPU usage percentage",
		},
	)

	clusterMemoryUsagePercent = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "kad_cluster_memory_usage_percent",
			Help: "Cluster memory usage percentage",
		},
	)

	clusterPodsRunning = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "kad_cluster_pods_running",
			Help: "Number of running pods in cluster",
		},
	)

	clusterPodsTotal = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "kad_cluster_pods_total",
			Help: "Total number of pods in cluster",
		},
	)

	clusterNodesReady = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "kad_cluster_nodes_ready",
			Help: "Number of ready nodes in cluster",
		},
	)

	clusterNodesTotal = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "kad_cluster_nodes_total",
			Help: "Total number of nodes in cluster",
		},
	)
)

// RecordHTTPRequest records metrics for HTTP requests
func RecordHTTPRequest(method, path string, statusCode int, duration time.Duration) {
	labels := prometheus.Labels{
		"method":      method,
		"path":        path,
		"status_code": strconv.Itoa(statusCode),
	}

	httpRequestsTotal.With(labels).Inc()
	httpRequestDuration.With(labels).Observe(duration.Seconds())
}

// RecordKubernetesRequest records metrics for Kubernetes API requests
func RecordKubernetesRequest(resource, verb string, statusCode int, duration time.Duration) {
	labels := prometheus.Labels{
		"resource":    resource,
		"verb":        verb,
		"status_code": strconv.Itoa(statusCode),
	}

	kubernetesRequestsTotal.With(labels).Inc()
	kubernetesRequestDuration.With(labels).Observe(duration.Seconds())
}

// RecordWebSocketConnection records WebSocket connection metrics
func RecordWebSocketConnection(streamType string) {
	websocketConnectionsTotal.With(prometheus.Labels{"stream_type": streamType}).Inc()
	websocketConnectionsActive.With(prometheus.Labels{"stream_type": streamType}).Inc()
}

// RecordWebSocketDisconnection records WebSocket disconnection metrics
func RecordWebSocketDisconnection(streamType string) {
	websocketConnectionsActive.With(prometheus.Labels{"stream_type": streamType}).Dec()
}

// RecordRateLimitedRequest records rate limiting metrics
func RecordRateLimitedRequest(userID, endpoint string) {
	rateLimitedRequestsTotal.With(prometheus.Labels{
		"user_id":  userID,
		"endpoint": endpoint,
	}).Inc()
}

// RecordAuthRequest records authentication request metrics
func RecordAuthRequest(authMode, status string) {
	authRequestsTotal.With(prometheus.Labels{
		"auth_mode": authMode,
		"status":    status,
	}).Inc()
}

// RecordJob records job execution metrics
func RecordJob(jobType, status string, duration time.Duration) {
	labels := prometheus.Labels{
		"job_type": jobType,
		"status":   status,
	}

	jobsTotal.With(labels).Inc()
	jobDuration.With(labels).Observe(duration.Seconds())
}

// UpdateClusterMetrics updates cluster-level metrics from cached data
func UpdateClusterMetrics(cpuPercent, memoryPercent float64, podsRunning, podsTotal, nodesReady, nodesTotal int) {
	clusterCPUUsagePercent.Set(cpuPercent)
	clusterMemoryUsagePercent.Set(memoryPercent)
	clusterPodsRunning.Set(float64(podsRunning))
	clusterPodsTotal.Set(float64(podsTotal))
	clusterNodesReady.Set(float64(nodesReady))
	clusterNodesTotal.Set(float64(nodesTotal))
}
