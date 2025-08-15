package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/aaronlmathis/kaptn/internal/timeseries"
	"go.uber.org/zap"
)

// TimeSeriesResponse represents the API response for time series data
type TimeSeriesResponse struct {
	Series       map[string][]TimeSeriesPoint `json:"series"`
	Capabilities map[string]bool              `json:"capabilities"`
}

// TimeSeriesPoint represents a single time series data point for API responses
type TimeSeriesPoint struct {
	T int64   `json:"t"` // Unix timestamp in milliseconds
	V float64 `json:"v"` // Value
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
		apiPoints := make([]TimeSeriesPoint, len(points))
		for i, point := range points {
			apiPoints[i] = TimeSeriesPoint{
				T: point.T.UnixMilli(), // Convert to milliseconds
				V: point.V,
			}
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

	// Check if timeseries aggregator is available
	if s.timeSeriesAggregator == nil {
		s.logger.Error("TimeSeries aggregator not initialized for WebSocket")
		http.Error(w, "TimeSeries service not available", http.StatusServiceUnavailable)
		return
	}

	// Create room name for this WebSocket connection
	room := "timeseries:cluster:" + strings.Join(requestedKeys, ",")

	// Store the requested keys in the room for later use by the broadcaster
	// This is a simple approach - in a production system you might want more sophisticated tracking

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
