package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aaronlmathis/kaptn/internal/timeseries"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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

// New unified timeseries WebSocket message types
type TimeSeriesHelloMessage struct {
	Type         string           `json:"type"`         // "hello"
	Capabilities map[string]bool  `json:"capabilities"` // API capabilities
	Limits       TimeSeriesLimits `json:"limits"`       // Server limits
}

type TimeSeriesLimits struct {
	MaxClients         int `json:"maxClients"`
	MaxSeriesPerClient int `json:"maxSeriesPerClient"`
	MaxRateHz          int `json:"maxRateHz"`
}

type TimeSeriesSubscribeMessage struct {
	Type    string   `json:"type"`    // "subscribe"
	GroupID string   `json:"groupId"` // Group identifier
	Res     string   `json:"res"`     // Resolution: "hi" or "lo"
	Since   string   `json:"since"`   // Time window like "15m"
	Series  []string `json:"series"`  // Array of series keys
}

type TimeSeriesUnsubscribeMessage struct {
	Type    string   `json:"type"`    // "unsubscribe"
	GroupID string   `json:"groupId"` // Group identifier
	Series  []string `json:"series"`  // Array of series keys to unsubscribe
}

type TimeSeriesAckMessage struct {
	Type     string                  `json:"type"`               // "ack"
	GroupID  string                  `json:"groupId"`            // Group identifier
	Accepted []string                `json:"accepted"`           // Accepted series keys
	Rejected []TimeSeriesRejectedKey `json:"rejected,omitempty"` // Rejected keys with reasons
}

type TimeSeriesRejectedKey struct {
	Key    string `json:"key"`    // Series key
	Reason string `json:"reason"` // Rejection reason
}

type TimeSeriesInitMessage struct {
	Type    string             `json:"type"`    // "init"
	GroupID string             `json:"groupId"` // Group identifier
	Data    TimeSeriesResponse `json:"data"`    // Initial buffer data
}

type TimeSeriesAppendMessage struct {
	Type  string          `json:"type"`  // "append"
	Key   string          `json:"key"`   // Series key
	Point TimeSeriesPoint `json:"point"` // New data point
}

type TimeSeriesErrorMessage struct {
	Type  string `json:"type"`  // "error"
	Error string `json:"error"` // Error message
}

// Client connection state for new WebSocket endpoint
type TimeSeriesWSClient struct {
	ID               string
	Conn             *websocket.Conn
	Send             chan []byte
	Subscriptions    map[string]TimeSeriesSubscription // GroupID -> Subscription
	LastActivity     time.Time
	TotalSeriesCount int
}

type TimeSeriesSubscription struct {
	GroupID    string
	Resolution timeseries.Resolution
	Since      time.Duration
	Series     []string
}

// Global client manager for the new timeseries WebSocket endpoint
type TimeSeriesWSManager struct {
	clients map[string]*TimeSeriesWSClient
	mu      sync.RWMutex
}

func newTimeSeriesWSManager() *TimeSeriesWSManager {
	return &TimeSeriesWSManager{
		clients: make(map[string]*TimeSeriesWSClient),
	}
}

func (m *TimeSeriesWSManager) addClient(client *TimeSeriesWSClient) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clients[client.ID] = client
}

func (m *TimeSeriesWSManager) removeClient(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.clients, clientID)
}

func (m *TimeSeriesWSManager) broadcastToSubscribers(key string, point TimeSeriesPoint) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	message := TimeSeriesAppendMessage{
		Type:  "append",
		Key:   key,
		Point: point,
	}

	for _, client := range m.clients {
		// Check if client is subscribed to this series
		isSubscribed := false
		for _, subscription := range client.Subscriptions {
			for _, seriesKey := range subscription.Series {
				if seriesKey == key {
					isSubscribed = true
					break
				}
			}
			if isSubscribed {
				break
			}
		}

		if isSubscribed {
			select {
			case client.Send <- mustMarshal(message):
			default:
				// Client send buffer full, skip
			}
		}
	}
}

func mustMarshal(v interface{}) []byte {
	data, _ := json.Marshal(v)
	return data
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

// handleTimeSeriesLiveWebSocket handles the new unified WebSocket endpoint GET /api/v1/timeseries/live
func (s *Server) handleTimeSeriesLiveWebSocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade to WebSocket
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins for now
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.logger.Error("Failed to upgrade WebSocket connection", zap.Error(err))
		return
	}

	// Check WebSocket client limits
	if s.timeSeriesStore != nil {
		health := s.timeSeriesStore.GetHealth()
		if !health.CheckWSClientLimit() {
			s.logger.Warn("WebSocket connection rejected - client limit reached")
			conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "Client limit reached"))
			conn.Close()
			return
		}
	}

	// Create client
	clientID := fmt.Sprintf("ts-%d", time.Now().UnixNano())
	client := &TimeSeriesWSClient{
		ID:               clientID,
		Conn:             conn,
		Send:             make(chan []byte, 256),
		Subscriptions:    make(map[string]TimeSeriesSubscription),
		LastActivity:     time.Now(),
		TotalSeriesCount: 0,
	}

	s.logger.Info("New timeseries WebSocket client connected", zap.String("clientId", clientID))

	// Register client with manager
	s.timeSeriesWSManager.addClient(client)

	// Send hello message
	s.sendTimeSeriesHello(client)

	// Start client goroutines
	go s.timeSeriesWSClientWriter(client)
	go s.timeSeriesWSClientReader(client)
}

// sendTimeSeriesHello sends the hello message to a new client
func (s *Server) sendTimeSeriesHello(client *TimeSeriesWSClient) {
	capabilities := make(map[string]bool)
	if s.timeSeriesAggregator != nil {
		aggregatorCaps := s.timeSeriesAggregator.GetCapabilities(context.Background())
		// Only copy the aggregator-specific capabilities (metricsAPI, summaryAPI)
		for key, value := range aggregatorCaps {
			capabilities[key] = value
		}
	}

	// Set capabilities based on what we support
	capabilities["cluster"] = true
	capabilities["namespace"] = true // Namespace metrics are supported
	capabilities["node"] = true      // Node metrics are supported
	capabilities["pod"] = true       // Pod metrics are supported

	hello := TimeSeriesHelloMessage{
		Type:         "hello",
		Capabilities: capabilities,
		Limits: TimeSeriesLimits{
			MaxClients:         s.config.Timeseries.MaxWSClients,
			MaxSeriesPerClient: s.config.Timeseries.MaxSeries,
			MaxRateHz:          10,
		},
	}

	if err := s.sendTimeSeriesMessage(client, hello); err != nil {
		s.logger.Error("Failed to send hello message", zap.String("clientId", client.ID), zap.Error(err))
		return
	}

	// Send a default subscription after a short delay if client hasn't subscribed
	go func() {
		time.Sleep(2 * time.Second)

		// Check if client is still connected and has no subscriptions
		s.timeSeriesWSManager.mu.RLock()
		stillConnected := s.timeSeriesWSManager.clients[client.ID] != nil
		hasSubscriptions := len(client.Subscriptions) > 0
		s.timeSeriesWSManager.mu.RUnlock()

		if stillConnected && !hasSubscriptions {
			s.logger.Info("Client has no subscriptions, sending default subscription", zap.String("clientId", client.ID))

			// Create a default subscription for basic cluster metrics
			defaultSub := TimeSeriesSubscribeMessage{
				Type:    "subscribe",
				GroupID: "default-cluster",
				Res:     "hi",
				Since:   "15m",
				Series:  []string{"cluster.cpu.used.cores", "cluster.cpu.capacity.cores", "cluster.mem.used.bytes", "cluster.mem.capacity.bytes"},
			}

			// Convert to bytes and process as if it came from the client
			if msgBytes, err := json.Marshal(defaultSub); err == nil {
				s.handleTimeSeriesSubscribe(client, msgBytes)
			}
		}
	}()
}

// sendTimeSeriesMessage sends a message to a WebSocket client
func (s *Server) sendTimeSeriesMessage(client *TimeSeriesWSClient, message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	select {
	case client.Send <- data:
		return nil
	case <-time.After(5 * time.Second):
		return fmt.Errorf("client send timeout")
	}
}

// timeSeriesWSClientReader handles incoming messages from WebSocket client
func (s *Server) timeSeriesWSClientReader(client *TimeSeriesWSClient) {
	defer func() {
		s.timeSeriesWSManager.removeClient(client.ID)
		client.Conn.Close()
		s.logger.Info("TimeSeries WebSocket client disconnected", zap.String("clientId", client.ID))
	}()

	client.Conn.SetReadLimit(int64(s.config.Timeseries.WSReadLimit))
	client.Conn.SetReadDeadline(time.Now().Add(300 * time.Second)) // 5 minutes instead of 60 seconds
	client.Conn.SetPongHandler(func(string) error {
		client.Conn.SetReadDeadline(time.Now().Add(300 * time.Second)) // 5 minutes instead of 60 seconds
		return nil
	})

	for {
		_, messageBytes, err := client.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				s.logger.Error("Unexpected WebSocket close", zap.String("clientId", client.ID), zap.Error(err))
			}
			break
		}

		client.LastActivity = time.Now()

		// Parse message type first
		var baseMessage struct {
			Type string `json:"type"`
		}

		if err := json.Unmarshal(messageBytes, &baseMessage); err != nil {
			s.sendTimeSeriesError(client, "Invalid JSON format")
			continue
		}

		switch baseMessage.Type {
		case "subscribe":
			s.handleTimeSeriesSubscribe(client, messageBytes)
		case "unsubscribe":
			s.handleTimeSeriesUnsubscribe(client, messageBytes)
		default:
			s.sendTimeSeriesError(client, fmt.Sprintf("Unknown message type: %s", baseMessage.Type))
		}
	}
}

// timeSeriesWSClientWriter handles outgoing messages to WebSocket client
func (s *Server) timeSeriesWSClientWriter(client *TimeSeriesWSClient) {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		client.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.Send:
			client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := client.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := client.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleTimeSeriesSubscribe handles subscribe messages
func (s *Server) handleTimeSeriesSubscribe(client *TimeSeriesWSClient, messageBytes []byte) {
	var subscribeMsg TimeSeriesSubscribeMessage
	if err := json.Unmarshal(messageBytes, &subscribeMsg); err != nil {
		s.sendTimeSeriesError(client, "Invalid subscribe message format")
		return
	}

	// Validate resolution
	var resolution timeseries.Resolution
	switch subscribeMsg.Res {
	case "hi":
		resolution = timeseries.Hi
	case "lo":
		resolution = timeseries.Lo
	default:
		s.sendTimeSeriesError(client, "Invalid resolution. Must be 'hi' or 'lo'")
		return
	}

	// Parse since duration
	since, err := time.ParseDuration(subscribeMsg.Since)
	if err != nil {
		s.sendTimeSeriesError(client, "Invalid since parameter. Must be a valid duration (e.g., '15m', '1h')")
		return
	}

	// Validate series keys and check limits
	// Use all keys in the store, not just the predefined cluster keys
	allAvailableKeys := s.timeSeriesStore.Keys()
	validKeys := make(map[string]bool)
	for _, key := range allAvailableKeys {
		validKeys[key] = true
	}

	// Also allow cluster-level base keys for static validation
	for _, key := range timeseries.AllSeriesKeys() {
		validKeys[key] = true
	}

	// CRITICAL FIX: Also allow node and pod metric patterns
	// Node metrics follow pattern: {base}.{nodename}
	nodeMetricBases := timeseries.GetNodeMetricBases()
	podMetricBases := timeseries.GetPodMetricBases()
	
	isValidNodeOrPodMetric := func(key string) bool {
		// Check node patterns
		for _, base := range nodeMetricBases {
			if strings.HasPrefix(key, base+".") && len(key) > len(base)+1 {
				return true
			}
		}
		// Check pod patterns  
		for _, base := range podMetricBases {
			if strings.HasPrefix(key, base+".") && len(key) > len(base)+1 {
				return true
			}
		}
		return false
	}

	var accepted []string
	var rejected []TimeSeriesRejectedKey

	newSeriesCount := 0
	for _, key := range subscribeMsg.Series {
		isValid := validKeys[key] || isValidNodeOrPodMetric(key)
		
		if !isValid {
			rejected = append(rejected, TimeSeriesRejectedKey{
				Key:    key,
				Reason: "Unknown series key",
			})
			continue
		}

		// Check if this is a new series for this client
		isNew := true
		for _, sub := range client.Subscriptions {
			for _, existingKey := range sub.Series {
				if existingKey == key {
					isNew = false
					break
				}
			}
			if !isNew {
				break
			}
		}

		if isNew {
			newSeriesCount++
		}
		accepted = append(accepted, key)
	}

	// Check series limit
	if client.TotalSeriesCount+newSeriesCount > s.config.Timeseries.MaxSeries {
		s.sendTimeSeriesError(client, fmt.Sprintf("Series limit exceeded. Maximum %d series per client", s.config.Timeseries.MaxSeries))
		return
	}

	// Update subscription
	subscription := TimeSeriesSubscription{
		GroupID:    subscribeMsg.GroupID,
		Resolution: resolution,
		Since:      since,
		Series:     accepted,
	}

	client.Subscriptions[subscribeMsg.GroupID] = subscription
	client.TotalSeriesCount += newSeriesCount

	// Send acknowledgment
	ack := TimeSeriesAckMessage{
		Type:     "ack",
		GroupID:  subscribeMsg.GroupID,
		Accepted: accepted,
		Rejected: rejected,
	}

	if err := s.sendTimeSeriesMessage(client, ack); err != nil {
		s.logger.Error("Failed to send ack message", zap.String("clientId", client.ID), zap.Error(err))
		return
	}

	// Send initial data
	s.sendTimeSeriesInitialData(client, subscribeMsg.GroupID, subscription)
}

// handleTimeSeriesUnsubscribe handles unsubscribe messages
func (s *Server) handleTimeSeriesUnsubscribe(client *TimeSeriesWSClient, messageBytes []byte) {
	var unsubscribeMsg TimeSeriesUnsubscribeMessage
	if err := json.Unmarshal(messageBytes, &unsubscribeMsg); err != nil {
		s.sendTimeSeriesError(client, "Invalid unsubscribe message format")
		return
	}

	// Find and update subscription
	if subscription, exists := client.Subscriptions[unsubscribeMsg.GroupID]; exists {
		// Remove specified series from subscription
		var remainingSeries []string
		removedCount := 0

		for _, existingKey := range subscription.Series {
			shouldRemove := false
			for _, keyToRemove := range unsubscribeMsg.Series {
				if existingKey == keyToRemove {
					shouldRemove = true
					removedCount++
					break
				}
			}
			if !shouldRemove {
				remainingSeries = append(remainingSeries, existingKey)
			}
		}

		client.TotalSeriesCount -= removedCount

		if len(remainingSeries) == 0 {
			// Remove entire subscription
			delete(client.Subscriptions, unsubscribeMsg.GroupID)
		} else {
			// Update subscription with remaining series
			subscription.Series = remainingSeries
			client.Subscriptions[unsubscribeMsg.GroupID] = subscription
		}
	}
}

// sendTimeSeriesInitialData sends initial data for a subscription
func (s *Server) sendTimeSeriesInitialData(client *TimeSeriesWSClient, groupID string, subscription TimeSeriesSubscription) {
	if s.timeSeriesStore == nil {
		return
	}

	// Calculate time threshold
	timeThreshold := time.Now().Add(-subscription.Since)

	// Collect data for subscribed series
	seriesData := make(map[string][]TimeSeriesPoint)

	for _, key := range subscription.Series {
		series, exists := s.timeSeriesStore.Get(key)
		if !exists {
			seriesData[key] = []TimeSeriesPoint{}
			continue
		}

		points := series.GetSince(timeThreshold, subscription.Resolution)
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

	// Get capabilities
	capabilities := make(map[string]bool)
	if s.timeSeriesAggregator != nil {
		aggregatorCaps := s.timeSeriesAggregator.GetCapabilities(context.Background())
		// Only copy the aggregator-specific capabilities (metricsAPI, summaryAPI)
		for key, value := range aggregatorCaps {
			capabilities[key] = value
		}
	}
	// Set scope-level capabilities based on what we support
	capabilities["cluster"] = true
	capabilities["namespace"] = true
	capabilities["node"] = true
	capabilities["pod"] = true

	// Send initial data
	response := TimeSeriesResponse{
		Series:       seriesData,
		Capabilities: capabilities,
	}

	initMsg := TimeSeriesInitMessage{
		Type:    "init",
		GroupID: groupID,
		Data:    response,
	}

	if err := s.sendTimeSeriesMessage(client, initMsg); err != nil {
		s.logger.Error("Failed to send initial data", zap.String("clientId", client.ID), zap.String("groupId", groupID), zap.Error(err))
	}
}

// sendTimeSeriesError sends an error message to a client
func (s *Server) sendTimeSeriesError(client *TimeSeriesWSClient, errorMsg string) {
	errorMessage := TimeSeriesErrorMessage{
		Type:  "error",
		Error: errorMsg,
	}

	if err := s.sendTimeSeriesMessage(client, errorMessage); err != nil {
		s.logger.Error("Failed to send error message", zap.String("clientId", client.ID), zap.Error(err))
	}
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

				// Check each series for new data - use ALL keys in store, not just cluster keys
				allKeys := s.timeSeriesStore.Keys() // This gets ALL series keys including nodes, pods, namespaces
				for _, key := range allKeys {
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
						T:      latestPoint.T.UnixMilli(),
						V:      latestPoint.V,
						Entity: latestPoint.Entity, // Include entity metadata for nodes/pods/namespaces
					}

					// Broadcast to new unified WebSocket clients
					if s.timeSeriesWSManager != nil {
						s.timeSeriesWSManager.broadcastToSubscribers(key, apiPoint)
					}

					// Create broadcast message for legacy clients
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

// Entity discovery endpoints for timeseries

// handleGetTimeSeriesNodes returns available nodes for timeseries subscription
func (s *Server) handleGetTimeSeriesNodes(w http.ResponseWriter, r *http.Request) {
	// Check if we have access to Kubernetes client
	if s.kubeClient == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Kubernetes client not available",
		})
		return
	}

	// Get all nodes
	nodeList, err := s.kubeClient.CoreV1().Nodes().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		s.logger.Error("Failed to list nodes for timeseries entities", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to fetch nodes",
		})
		return
	}

	// Convert to entity format
	entities := make([]map[string]interface{}, 0, len(nodeList.Items))
	for _, node := range nodeList.Items {
		entity := map[string]interface{}{
			"id":     node.Name,
			"name":   node.Name,
			"type":   "node",
			"labels": node.Labels,
		}

		// Add some useful metadata
		if len(node.Status.Addresses) > 0 {
			for _, addr := range node.Status.Addresses {
				if addr.Type == "InternalIP" {
					entity["internalIP"] = addr.Address
					break
				}
			}
		}

		entities = append(entities, entity)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"entities": entities,
	})
}

// handleGetTimeSeriesNamespaces returns available namespaces for timeseries subscription
func (s *Server) handleGetTimeSeriesNamespaces(w http.ResponseWriter, r *http.Request) {
	// Check if we have access to Kubernetes client
	if s.kubeClient == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Kubernetes client not available",
		})
		return
	}

	// Get all namespaces
	namespaceList, err := s.kubeClient.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		s.logger.Error("Failed to list namespaces for timeseries entities", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to fetch namespaces",
		})
		return
	}

	// Convert to entity format
	entities := make([]map[string]interface{}, 0, len(namespaceList.Items))
	for _, ns := range namespaceList.Items {
		entity := map[string]interface{}{
			"id":     ns.Name,
			"name":   ns.Name,
			"type":   "namespace",
			"labels": ns.Labels,
			"status": string(ns.Status.Phase),
		}
		entities = append(entities, entity)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"entities": entities,
	})
}

// handleGetTimeSeriesPods returns available pods for timeseries subscription
func (s *Server) handleGetTimeSeriesPods(w http.ResponseWriter, r *http.Request) {
	// Check if we have access to Kubernetes client
	if s.kubeClient == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Kubernetes client not available",
		})
		return
	}

	// Get query parameters for filtering
	namespaceFilter := r.URL.Query().Get("namespace")
	limitStr := r.URL.Query().Get("limit")

	// Parse limit (default to 100 to avoid overwhelming responses)
	limit := 100
	if limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 && parsedLimit <= 1000 {
			limit = parsedLimit
		}
	}

	// Get pods
	var podList *corev1.PodList
	var err error

	if namespaceFilter != "" {
		podList, err = s.kubeClient.CoreV1().Pods(namespaceFilter).List(r.Context(), metav1.ListOptions{
			Limit: int64(limit),
		})
	} else {
		podList, err = s.kubeClient.CoreV1().Pods("").List(r.Context(), metav1.ListOptions{
			Limit: int64(limit),
		})
	}

	if err != nil {
		s.logger.Error("Failed to list pods for timeseries entities", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to fetch pods",
		})
		return
	}

	// Convert to entity format
	entities := make([]map[string]interface{}, 0, len(podList.Items))
	for _, pod := range podList.Items {
		entity := map[string]interface{}{
			"id":        fmt.Sprintf("%s/%s", pod.Namespace, pod.Name),
			"name":      pod.Name,
			"namespace": pod.Namespace,
			"type":      "pod",
			"labels":    pod.Labels,
			"status":    string(pod.Status.Phase),
			"node":      pod.Spec.NodeName,
		}
		entities = append(entities, entity)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"entities": entities,
	})
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

	capabilities := make(map[string]bool)
	if s.timeSeriesAggregator != nil {
		aggregatorCaps := s.timeSeriesAggregator.GetCapabilities(r.Context())
		// Copy the aggregator-specific capabilities (metricsAPI, summaryAPI)
		for key, value := range aggregatorCaps {
			capabilities[key] = value
		}
	}
	// Add scope-level capabilities based on what we support
	capabilities["cluster"] = true
	capabilities["namespace"] = true
	capabilities["node"] = true
	capabilities["pod"] = true

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

// handleGetNamespacesTimeSeries handles GET /api/v1/timeseries/namespaces
func (s *Server) handleGetNamespacesTimeSeries(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	seriesParam := r.URL.Query().Get("series")
	resParam := r.URL.Query().Get("res")
	sinceParam := r.URL.Query().Get("since")
	namespaceFilter := r.URL.Query().Get("namespace")

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

	// Parse series keys - default to namespace metrics if none specified
	var requestedMetricBases []string
	if seriesParam != "" {
		requestedMetricBases = strings.Split(seriesParam, ",")
		for i, key := range requestedMetricBases {
			requestedMetricBases[i] = strings.TrimSpace(key)
		}
	} else {
		requestedMetricBases = timeseries.GetNamespaceMetricBases()
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

	// Get all series keys and filter for namespace metrics
	allKeys := s.timeSeriesStore.Keys()
	for _, seriesKey := range allKeys {
		for _, metricBase := range requestedMetricBases {
			if strings.HasPrefix(seriesKey, metricBase+".") {
				// Extract namespace name from series key
				_, namespace, ok := timeseries.ParseNamespaceSeriesKey(seriesKey)
				if !ok {
					continue
				}

				// Apply namespace filter if specified
				if namespaceFilter != "" && namespace != namespaceFilter {
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
			Scope:      "namespaces",
			Entity:     namespaceFilter,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleGetNamespaceTimeSeries handles GET /api/v1/timeseries/namespaces/{namespace}
func (s *Server) handleGetNamespaceTimeSeries(w http.ResponseWriter, r *http.Request) {
	// Extract namespace from URL
	namespace := chi.URLParam(r, "namespace")

	if namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Namespace is required",
		})
		return
	}

	// Add filter to query and delegate to handleGetNamespacesTimeSeries
	q := r.URL.Query()
	q.Set("namespace", namespace)
	r.URL.RawQuery = q.Encode()

	s.handleGetNamespacesTimeSeries(w, r)
}
