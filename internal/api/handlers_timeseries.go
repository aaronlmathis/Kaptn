package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/aaronlmathis/kaptn/internal/timeseries"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// TimeSeriesResponse represents the API response for time series data
type TimeSeriesResponse struct {
	Series       map[string][]TimeSeriesPoint `json:"series"`
	Capabilities map[string]bool              `json:"capabilities"`
	Metadata     *TimeSeriesMetadata          `json:"metadata,omitempty"`
}

// TimeSeriesMetadata provides additional context about the response
type TimeSeriesMetadata struct {
	Resolution string `json:"resolution"`
	TimeSpan   string `json:"timespan"`
	Scope      string `json:"scope"`
	Entity     string `json:"entity,omitempty"`
}

// TimeSeriesPoint represents a single time series data point for API responses
type TimeSeriesPoint struct {
	T      int64             `json:"t"`                // Unix timestamp in milliseconds
	V      float64           `json:"v"`                // Value
	Entity map[string]string `json:"entity,omitempty"` // Entity metadata
}

// LiveTimeSeriesMessage represents a WebSocket message for live time series updates
type LiveTimeSeriesMessage struct {
	Type  string              `json:"type"`            // "init" or "append"
	Key   string              `json:"key,omitempty"`   // Series key for append messages
	Point *TimeSeriesPoint    `json:"point,omitempty"` // Data point for append messages
	Data  *TimeSeriesResponse `json:"data,omitempty"`  // Full data for init messages
}

// handleGetClusterTimeSeries handles GET /api/v1/timeseries/cluster
func (s *Server) handleGetClusterTimeSeries(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	seriesParam := r.URL.Query().Get("series")
	resParam := r.URL.Query().Get("res")
	sinceParam := r.URL.Query().Get("since")

	// Default values
	if resParam == "" {
		resParam = "lo"
	}
	if sinceParam == "" {
		sinceParam = "60m"
	}

	// Parse resolution
	var resolution timeseries.Resolution
	switch resParam {
	case "hi":
		resolution = timeseries.Hi
	case "lo":
		resolution = timeseries.Lo
	default:
		s.logger.Warn("Invalid resolution parameter", zap.String("res", resParam))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid resolution parameter. Must be 'hi' or 'lo'",
		})
		return
	}

	// Parse duration
	since, err := time.ParseDuration(sinceParam)
	if err != nil {
		s.logger.Warn("Invalid since parameter", zap.String("since", sinceParam), zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid since parameter. Must be a valid duration (e.g., '60m', '1h')",
		})
		return
	}

	// Parse series keys
	var requestedKeys []string
	if seriesParam != "" {
		requestedKeys = strings.Split(seriesParam, ",")
		// Trim whitespace
		for i, key := range requestedKeys {
			requestedKeys[i] = strings.TrimSpace(key)
		}
	} else {
		// Default to all series if none specified
		requestedKeys = timeseries.AllSeriesKeys()
	}

	// Validate series keys
	validKeys := make(map[string]bool)
	for _, key := range timeseries.AllSeriesKeys() {
		validKeys[key] = true
	}

	for _, key := range requestedKeys {
		if !validKeys[key] {
			s.logger.Warn("Invalid series key", zap.String("key", key))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": "Invalid series key: " + key,
			})
			return
		}
	}

	// Check if timeseries aggregator is available
	if s.timeSeriesAggregator == nil {
		s.logger.Error("TimeSeries aggregator not initialized")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "TimeSeries service not available",
		})
		return
	}

	// Get capabilities
	capabilities := s.timeSeriesAggregator.GetCapabilities(r.Context())

	// Calculate time threshold
	timeThreshold := time.Now().Add(-since)

	// Collect data for each requested series
	seriesData := make(map[string][]TimeSeriesPoint)

	for _, key := range requestedKeys {
		// Get the series from the store
		series, exists := s.timeSeriesStore.Get(key)
		if !exists {
			// Series doesn't exist yet, return empty array
			seriesData[key] = []TimeSeriesPoint{}
			continue
		}

		// Get points since the specified time
		points := series.GetSince(timeThreshold, resolution)

		// Convert to API format
		var apiPoints []TimeSeriesPoint
		for _, point := range points {
			apiPoints = append(apiPoints, TimeSeriesPoint{
				T:      point.T.UnixMilli(),
				V:      point.V,
				Entity: point.Entity,
			})
		}

		seriesData[key] = apiPoints
	}

	// Build response
	response := TimeSeriesResponse{
		Series:       seriesData,
		Capabilities: capabilities,
	}

	// Log successful request
	s.logger.Debug("TimeSeries API request",
		zap.Strings("series", requestedKeys),
		zap.String("resolution", resParam),
		zap.String("since", sinceParam),
		zap.Int("total_points", getTotalPoints(seriesData)))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleClusterTimeSeriesLiveWebSocket handles GET /api/v1/timeseries/cluster/live
func (s *Server) handleClusterTimeSeriesLiveWebSocket(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters for series selection
	seriesParam := r.URL.Query().Get("series")

	var requestedKeys []string
	if seriesParam != "" {
		requestedKeys = strings.Split(seriesParam, ",")
		// Trim whitespace
		for i, key := range requestedKeys {
			requestedKeys[i] = strings.TrimSpace(key)
		}
	} else {
		// Default to all series if none specified
		requestedKeys = timeseries.AllSeriesKeys()
	}

	// Validate series keys
	validKeys := make(map[string]bool)
	for _, key := range timeseries.AllSeriesKeys() {
		validKeys[key] = true
	}

	for _, key := range requestedKeys {
		if !validKeys[key] {
			s.logger.Warn("Invalid series key in WebSocket request", zap.String("key", key))
			http.Error(w, "Invalid series key: "+key, http.StatusBadRequest)
			return
		}
	}

	// Check if timeseries store and aggregator are available
	if s.timeSeriesStore == nil || s.timeSeriesAggregator == nil {
		s.logger.Error("TimeSeries services not initialized for WebSocket")
		http.Error(w, "TimeSeries service not available", http.StatusServiceUnavailable)
		return
	}

	// Check WebSocket client limits
	health := s.timeSeriesStore.GetHealth()
	if !health.CheckWSClientLimit() {
		s.logger.Warn("WebSocket connection rejected - client limit reached")
		http.Error(w, "WebSocket client limit reached", http.StatusServiceUnavailable)
		return
	}

	// Create room name for this WebSocket connection
	room := "timeseries:cluster:" + strings.Join(requestedKeys, ",")

	s.logger.Info("Starting timeseries WebSocket connection",
		zap.Strings("series", requestedKeys),
		zap.String("room", room))

	// Use the existing WebSocket hub to serve the connection
	s.wsHub.ServeWS(w, r, room)
}

// startTimeSeriesWebSocketBroadcaster starts a background goroutine that broadcasts
// timeseries updates to WebSocket clients
func (s *Server) startTimeSeriesWebSocketBroadcaster() {
	go func() {
		// Track last broadcast time for each series to implement coalescing
		lastBroadcast := make(map[string]time.Time)

		ticker := time.NewTicker(time.Second) // Check for broadcasts every second
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				// Check if we have timeseries data to broadcast
				if s.timeSeriesStore == nil {
					continue
				}

				// Update WebSocket client count in health metrics
				if health := s.timeSeriesStore.GetHealth(); health != nil {
					clientCount := int64(s.wsHub.ClientCount())
					health.SetWSClientCount(clientCount)
				}

				// Check each series for new data
				for _, key := range timeseries.AllSeriesKeys() {
					series, exists := s.timeSeriesStore.Get(key)
					if !exists {
						continue
					}

					// Get the latest point (last minute of hi-res data)
					points := series.GetSince(time.Now().Add(-time.Minute), timeseries.Hi)
					if len(points) == 0 {
						continue
					}

					// Get the most recent point
					latestPoint := points[len(points)-1]

					// Check if we should broadcast (coalesce to max 1 per second per key)
					lastTime, exists := lastBroadcast[key]
					if exists && time.Since(lastTime) < time.Second {
						continue // Skip broadcast for this key
					}

					// Convert to API format
					apiPoint := TimeSeriesPoint{
						T: latestPoint.T.UnixMilli(),
						V: latestPoint.V,
					}

					// Create broadcast message
					message := LiveTimeSeriesMessage{
						Type:  "append",
						Key:   key,
						Point: &apiPoint,
					}

					// Record WebSocket message in health metrics
					if health := s.timeSeriesStore.GetHealth(); health != nil {
						health.RecordWSMessage()
					}

					// Find all rooms that should receive this key's updates
					// Simple approach: broadcast to rooms that contain this key
					// In production, you might want more sophisticated room management
					s.broadcastToTimeSeriesRooms(key, message)

					// Update last broadcast time
					lastBroadcast[key] = time.Now()
				}
			}
		}
	}()
}

// broadcastToTimeSeriesRooms broadcasts a message to all timeseries WebSocket rooms
// that are interested in the given series key
func (s *Server) broadcastToTimeSeriesRooms(seriesKey string, message LiveTimeSeriesMessage) {
	// Get all connected clients and check their rooms
	// This is a simplified approach - room management could be more sophisticated

	// For now, we'll broadcast to all timeseries rooms and let clients filter
	// In the future, you could maintain a mapping of rooms to interested keys

	// Broadcast to rooms that might be interested
	// Simple pattern matching for room names containing the series key
	s.wsHub.BroadcastToRoom("timeseries:cluster", "timeseries_update", message)

	// Also broadcast to rooms with specific series combinations
	// This could be optimized with better room management
	if seriesKey == timeseries.ClusterCPUUsedCores || seriesKey == timeseries.ClusterCPUCapacityCores {
		s.wsHub.BroadcastToRoom("timeseries:cluster:cpu", "timeseries_update", message)
	}
	if seriesKey == timeseries.ClusterNetRxBps || seriesKey == timeseries.ClusterNetTxBps {
		s.wsHub.BroadcastToRoom("timeseries:cluster:network", "timeseries_update", message)
	}
}

// sendInitialTimeSeriesData sends initial timeseries data to a new WebSocket client
func (s *Server) sendInitialTimeSeriesData(room string, requestedKeys []string) {
	// This would be called when a new WebSocket client connects
	// For now, this is handled by the client making an initial REST API call
	// In the future, you could implement this to send initial data over WebSocket

	if s.timeSeriesStore == nil {
		return
	}

	// Get last 30-60 seconds of hi-res data as initial payload
	timeThreshold := time.Now().Add(-60 * time.Second)

	// Collect initial data
	seriesData := make(map[string][]TimeSeriesPoint)
	capabilities := make(map[string]bool)

	if s.timeSeriesAggregator != nil {
		capabilities = s.timeSeriesAggregator.GetCapabilities(context.Background())
	}

	for _, key := range requestedKeys {
		series, exists := s.timeSeriesStore.Get(key)
		if !exists {
			seriesData[key] = []TimeSeriesPoint{}
			continue
		}

		points := series.GetSince(timeThreshold, timeseries.Hi)
		apiPoints := make([]TimeSeriesPoint, len(points))
		for i, point := range points {
			apiPoints[i] = TimeSeriesPoint{
				T: point.T.UnixMilli(),
				V: point.V,
			}
		}
		seriesData[key] = apiPoints
	}

	// Send initial data
	response := TimeSeriesResponse{
		Series:       seriesData,
		Capabilities: capabilities,
	}

	message := LiveTimeSeriesMessage{
		Type: "init",
		Data: &response,
	}

	s.wsHub.BroadcastToRoom(room, "timeseries_init", message)
}

// Helper function to count total points across all series
func getTotalPoints(seriesData map[string][]TimeSeriesPoint) int {
	total := 0
	for _, points := range seriesData {
		total += len(points)
	}
	return total
}

// handleGetTimeSeriesHealth handles GET /api/v1/timeseries/health
func (s *Server) handleGetTimeSeriesHealth(w http.ResponseWriter, r *http.Request) {
	// Check if timeseries store is available
	if s.timeSeriesStore == nil {
		s.logger.Error("TimeSeries store not initialized")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "TimeSeries service not available",
		})
		return
	}

	// Get health snapshot
	health := s.timeSeriesStore.GetHealthSnapshot()

	// Get capabilities if aggregator is available
	capabilities := make(map[string]bool)
	if s.timeSeriesAggregator != nil {
		capabilities = s.timeSeriesAggregator.GetCapabilities(r.Context())
	}

	// Build response
	response := struct {
		Health       timeseries.HealthSnapshot `json:"health"`
		Capabilities map[string]bool           `json:"capabilities"`
		Status       string                    `json:"status"`
	}{
		Health:       health,
		Capabilities: capabilities,
		Status:       health.GetStatus(),
	}

	s.logger.Debug("TimeSeries health request",
		zap.String("status", health.GetStatus()),
		zap.Int64("series_count", health.SeriesCount),
		zap.Int64("ws_clients", health.WSClientCount))

	w.Header().Set("Content-Type", "application/json")

	// Return appropriate HTTP status based on health
	if health.IsHealthy() {
		w.WriteHeader(http.StatusOK)
	} else {
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	json.NewEncoder(w).Encode(response)
}

// handleGetTimeSeriesCapabilities handles GET /api/v1/timeseries/capabilities
func (s *Server) handleGetTimeSeriesCapabilities(w http.ResponseWriter, r *http.Request) {
	if s.timeSeriesAggregator == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "TimeSeries service not available",
		})
		return
	}

	capabilities := s.timeSeriesAggregator.GetCapabilities(r.Context())

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"capabilities": capabilities,
	})
}

// handleGetNodesTimeSeries handles GET /api/v1/timeseries/nodes
func (s *Server) handleGetNodesTimeSeries(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	seriesParam := r.URL.Query().Get("series")
	resParam := r.URL.Query().Get("res")
	sinceParam := r.URL.Query().Get("since")
	nodeFilter := r.URL.Query().Get("node")

	// Default values
	if resParam == "" {
		resParam = "lo"
	}
	if sinceParam == "" {
		sinceParam = "60m"
	}

	// Parse resolution
	var resolution timeseries.Resolution
	switch resParam {
	case "hi":
		resolution = timeseries.Hi
	case "lo":
		resolution = timeseries.Lo
	default:
		s.logger.Warn("Invalid resolution parameter", zap.String("res", resParam))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid resolution parameter. Must be 'hi' or 'lo'",
		})
		return
	}

	// Parse duration
	since, err := time.ParseDuration(sinceParam)
	if err != nil {
		s.logger.Warn("Invalid since parameter", zap.String("since", sinceParam), zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid since parameter. Must be a valid duration (e.g., '60m', '1h')",
		})
		return
	}

	// Parse series keys - default to node metrics if none specified
	var requestedMetricBases []string
	if seriesParam != "" {
		requestedMetricBases = strings.Split(seriesParam, ",")
		for i, key := range requestedMetricBases {
			requestedMetricBases[i] = strings.TrimSpace(key)
		}
	} else {
		requestedMetricBases = timeseries.GetNodeMetricBases()
	}

	// Check if timeseries store is available
	if s.timeSeriesStore == nil {
		s.logger.Error("TimeSeries store not initialized")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "TimeSeries service not available",
		})
		return
	}

	// Get capabilities
	capabilities := make(map[string]bool)
	if s.timeSeriesAggregator != nil {
		capabilities = s.timeSeriesAggregator.GetCapabilities(r.Context())
	}

	// Calculate time threshold
	timeThreshold := time.Now().Add(-since)

	// Collect data for each requested metric base
	seriesData := make(map[string][]TimeSeriesPoint)

	// Get all series keys and filter for node metrics
	allKeys := s.timeSeriesStore.Keys()
	for _, seriesKey := range allKeys {
		for _, metricBase := range requestedMetricBases {
			if strings.HasPrefix(seriesKey, metricBase+".") {
				// Extract node name from series key
				_, nodeName, ok := timeseries.ParseNodeSeriesKey(seriesKey)
				if !ok {
					continue
				}

				// Apply node filter if specified
				if nodeFilter != "" && nodeName != nodeFilter {
					continue
				}

				// Get the series from the store
				series, exists := s.timeSeriesStore.Get(seriesKey)
				if !exists {
					continue
				}

				// Get points since the specified time
				points := series.GetSince(timeThreshold, resolution)

				// Convert to API format
				var apiPoints []TimeSeriesPoint
				for _, point := range points {
					apiPoints = append(apiPoints, TimeSeriesPoint{
						T:      point.T.UnixMilli(),
						V:      point.V,
						Entity: point.Entity,
					})
				}

				seriesData[seriesKey] = apiPoints
			}
		}
	}

	// Build response
	response := TimeSeriesResponse{
		Series:       seriesData,
		Capabilities: capabilities,
		Metadata: &TimeSeriesMetadata{
			Resolution: resParam,
			TimeSpan:   sinceParam,
			Scope:      "nodes",
			Entity:     nodeFilter,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleGetNodeTimeSeries handles GET /api/v1/timeseries/nodes/{nodeName}
func (s *Server) handleGetNodeTimeSeries(w http.ResponseWriter, r *http.Request) {
	// Extract node name from URL
	nodeName := chi.URLParam(r, "nodeName")

	if nodeName == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Node name is required",
		})
		return
	}

	// Add node filter to query and delegate to handleGetNodesTimeSeries
	q := r.URL.Query()
	q.Set("node", nodeName)
	r.URL.RawQuery = q.Encode()

	s.handleGetNodesTimeSeries(w, r)
}

// handleGetPodsTimeSeries handles GET /api/v1/timeseries/pods
func (s *Server) handleGetPodsTimeSeries(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	seriesParam := r.URL.Query().Get("series")
	resParam := r.URL.Query().Get("res")
	sinceParam := r.URL.Query().Get("since")
	namespaceFilter := r.URL.Query().Get("namespace")
	podFilter := r.URL.Query().Get("pod")

	// Default values
	if resParam == "" {
		resParam = "lo"
	}
	if sinceParam == "" {
		sinceParam = "60m"
	}

	// Parse resolution
	var resolution timeseries.Resolution
	switch resParam {
	case "hi":
		resolution = timeseries.Hi
	case "lo":
		resolution = timeseries.Lo
	default:
		s.logger.Warn("Invalid resolution parameter", zap.String("res", resParam))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid resolution parameter. Must be 'hi' or 'lo'",
		})
		return
	}

	// Parse duration
	since, err := time.ParseDuration(sinceParam)
	if err != nil {
		s.logger.Warn("Invalid since parameter", zap.String("since", sinceParam), zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid since parameter. Must be a valid duration (e.g., '60m', '1h')",
		})
		return
	}

	// Parse series keys - default to pod metrics if none specified
	var requestedMetricBases []string
	if seriesParam != "" {
		requestedMetricBases = strings.Split(seriesParam, ",")
		for i, key := range requestedMetricBases {
			requestedMetricBases[i] = strings.TrimSpace(key)
		}
	} else {
		requestedMetricBases = timeseries.GetPodMetricBases()
	}

	// Check if timeseries store is available
	if s.timeSeriesStore == nil {
		s.logger.Error("TimeSeries store not initialized")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "TimeSeries service not available",
		})
		return
	}

	// Get capabilities
	capabilities := make(map[string]bool)
	if s.timeSeriesAggregator != nil {
		capabilities = s.timeSeriesAggregator.GetCapabilities(r.Context())
	}

	// Calculate time threshold
	timeThreshold := time.Now().Add(-since)

	// Collect data for each requested metric base
	seriesData := make(map[string][]TimeSeriesPoint)

	// Get all series keys and filter for pod metrics
	allKeys := s.timeSeriesStore.Keys()
	for _, seriesKey := range allKeys {
		for _, metricBase := range requestedMetricBases {
			if strings.HasPrefix(seriesKey, metricBase+".") {
				// Extract namespace and pod name from series key
				_, namespace, podName, ok := timeseries.ParsePodSeriesKey(seriesKey)
				if !ok {
					continue
				}

				// Apply filters if specified
				if namespaceFilter != "" && namespace != namespaceFilter {
					continue
				}
				if podFilter != "" && podName != podFilter {
					continue
				}

				// Get the series from the store
				series, exists := s.timeSeriesStore.Get(seriesKey)
				if !exists {
					continue
				}

				// Get points since the specified time
				points := series.GetSince(timeThreshold, resolution)

				// Convert to API format
				var apiPoints []TimeSeriesPoint
				for _, point := range points {
					apiPoints = append(apiPoints, TimeSeriesPoint{
						T:      point.T.UnixMilli(),
						V:      point.V,
						Entity: point.Entity,
					})
				}

				seriesData[seriesKey] = apiPoints
			}
		}
	}

	// Build response
	response := TimeSeriesResponse{
		Series:       seriesData,
		Capabilities: capabilities,
		Metadata: &TimeSeriesMetadata{
			Resolution: resParam,
			TimeSpan:   sinceParam,
			Scope:      "pods",
			Entity:     fmt.Sprintf("namespace=%s,pod=%s", namespaceFilter, podFilter),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleGetPodTimeSeries handles GET /api/v1/timeseries/pods/{namespace}/{podName}
func (s *Server) handleGetPodTimeSeries(w http.ResponseWriter, r *http.Request) {
	// Extract namespace and pod name from URL
	namespace := chi.URLParam(r, "namespace")
	podName := chi.URLParam(r, "podName")

	if namespace == "" || podName == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Namespace and pod name are required",
		})
		return
	}

	// Add filters to query and delegate to handleGetPodsTimeSeries
	q := r.URL.Query()
	q.Set("namespace", namespace)
	q.Set("pod", podName)
	r.URL.RawQuery = q.Encode()

	s.handleGetPodsTimeSeries(w, r)
}
