package ws

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/metrics"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

// Hub maintains the set of active clients and broadcasts messages to them
type Hub struct {
	logger *zap.Logger

	// Registered clients
	clients map[*Client]bool

	// Inbound messages from the clients
	broadcast chan []byte

	// Register requests from the clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// Context for cancellation
	ctx    context.Context
	cancel context.CancelFunc

	// Mutex for thread-safety
	mu sync.RWMutex

	// Authentication middleware for WebSocket connections
	authMiddleware *auth.Middleware

	// Connection limits and backpressure
	maxConnections    int
	maxRoomSize       int
	broadcastTimeout  time.Duration
	clientSendTimeout time.Duration
}

// Client represents a WebSocket client
type Client struct {
	hub *Hub

	// The websocket connection
	conn *websocket.Conn

	// Buffered channel of outbound messages
	send chan []byte

	// Client identifier
	id string

	// Room/topic the client is subscribed to
	room string

	// User information (optional, for authenticated connections)
	user *auth.User
}

// Message represents a WebSocket message
type Message struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
	Room string      `json:"room,omitempty"`
}

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow connections from any origin
		return true
	},
}

// NewHub creates a new WebSocket hub
func NewHub(logger *zap.Logger) *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	return &Hub{
		logger:            logger,
		broadcast:         make(chan []byte),
		register:          make(chan *Client),
		unregister:        make(chan *Client),
		clients:           make(map[*Client]bool),
		ctx:               ctx,
		cancel:            cancel,
		maxConnections:    1000,            // Maximum total connections
		maxRoomSize:       100,             // Maximum connections per room
		broadcastTimeout:  time.Second,     // Timeout for broadcast operations
		clientSendTimeout: 5 * time.Second, // Timeout for sending to individual clients
	}
}

// SetAuthMiddleware sets the authentication middleware for WebSocket connections
func (h *Hub) SetAuthMiddleware(authMiddleware *auth.Middleware) {
	h.authMiddleware = authMiddleware
}

// Run starts the hub
func (h *Hub) Run() {
	defer h.cancel()

	for {
		select {
		case <-h.ctx.Done():
			h.logger.Info("WebSocket hub stopping")
			return

		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

			// Record WebSocket connection metrics
			metrics.RecordWebSocketConnection(client.room)

			userInfo := "anonymous"
			if client.user != nil {
				userInfo = client.user.ID
			}
			h.logger.Info("Client registered",
				zap.String("id", client.id),
				zap.String("room", client.room),
				zap.String("user", userInfo))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

			// Record WebSocket disconnection metrics
			metrics.RecordWebSocketDisconnection(client.room)

			userInfo := "anonymous"
			if client.user != nil {
				userInfo = client.user.ID
			}
			h.logger.Info("Client unregistered",
				zap.String("id", client.id),
				zap.String("room", client.room),
				zap.String("user", userInfo))

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					delete(h.clients, client)
					close(client.send)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastToRoom sends a message to all clients in a specific room
func (h *Hub) BroadcastToRoom(room string, messageType string, data interface{}) {
	message := Message{
		Type: messageType,
		Data: data,
		Room: room,
	}

	msgBytes, err := json.Marshal(message)
	if err != nil {
		h.logger.Error("Failed to marshal message", zap.Error(err))
		return
	}

	h.mu.RLock()
	roomClients := make([]*Client, 0)
	for client := range h.clients {
		if client.room == room {
			roomClients = append(roomClients, client)
		}
	}
	h.mu.RUnlock()

	// Send to all room clients with timeout and backpressure handling
	dropped := 0
	sent := 0

	for _, client := range roomClients {
		select {
		case client.send <- msgBytes:
			sent++
		case <-time.After(h.clientSendTimeout):
			// Client send timeout - remove slow client
			h.logger.Warn("Removing slow WebSocket client",
				zap.String("clientId", client.id),
				zap.String("room", room))
			h.removeClient(client)
			dropped++
		default:
			// Channel full - remove unresponsive client
			h.logger.Warn("Removing unresponsive WebSocket client",
				zap.String("clientId", client.id),
				zap.String("room", room))
			h.removeClient(client)
			dropped++
		}
	}

	if dropped > 0 {
		h.logger.Info("WebSocket broadcast completed with dropped clients",
			zap.String("room", room),
			zap.Int("sent", sent),
			zap.Int("dropped", dropped))
	}
}

// removeClient safely removes a client from the hub
func (h *Hub) removeClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, exists := h.clients[client]; exists {
		delete(h.clients, client)
		close(client.send)

		// Record disconnection metrics
		metrics.RecordWebSocketDisconnection(client.room)
	}
}

// Stop stops the hub
func (h *Hub) Stop() {
	h.cancel()
}

// ClientCount returns the number of connected clients
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// ServeWS handles websocket requests from the peer
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, room string) {
	// Check connection limits
	h.mu.RLock()
	totalConnections := len(h.clients)
	roomConnections := 0
	for client := range h.clients {
		if client.room == room {
			roomConnections++
		}
	}
	h.mu.RUnlock()

	if totalConnections >= h.maxConnections {
		h.logger.Warn("WebSocket connection rejected - total connection limit reached",
			zap.Int("current", totalConnections),
			zap.Int("limit", h.maxConnections))
		http.Error(w, "Connection limit reached", http.StatusServiceUnavailable)
		return
	}

	if roomConnections >= h.maxRoomSize {
		h.logger.Warn("WebSocket connection rejected - room connection limit reached",
			zap.String("room", room),
			zap.Int("current", roomConnections),
			zap.Int("limit", h.maxRoomSize))
		http.Error(w, "Room connection limit reached", http.StatusServiceUnavailable)
		return
	}

	// Perform authentication if middleware is configured
	var user *auth.User
	if h.authMiddleware != nil {
		// Check for authentication token in query parameter or Authorization header
		token := r.URL.Query().Get("token")
		if token == "" {
			// Fallback to Authorization header
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if token != "" {
			// Create a temporary request with the token for authentication
			tempReq := r.Clone(r.Context())
			tempReq.Header.Set("Authorization", "Bearer "+token)

			// Try to authenticate using the middleware
			var authenticated bool
			tempHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if u, ok := auth.UserFromContext(r.Context()); ok && u != nil {
					user = u
					authenticated = true
				}
			})

			// Apply authentication middleware
			h.authMiddleware.Authenticate(tempHandler).ServeHTTP(&noopResponseWriter{}, tempReq)

			if !authenticated && token != "" {
				h.logger.Warn("WebSocket authentication failed", zap.String("room", room))
				http.Error(w, "Authentication failed", http.StatusUnauthorized)
				return
			}
		}
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Error("Failed to upgrade connection", zap.Error(err))
		return
	}

	clientID := generateClientID()
	client := &Client{
		hub:  h,
		conn: conn,
		send: make(chan []byte, 256),
		id:   clientID,
		room: room,
		user: user,
	}

	client.hub.register <- client

	// Allow collection of memory referenced by the caller by doing all work in
	// new goroutines
	go client.writePump()
	go client.readPump()
}

// noopResponseWriter is a no-op response writer for authentication middleware
type noopResponseWriter struct{}

func (nw *noopResponseWriter) Header() http.Header {
	return make(http.Header)
}

func (nw *noopResponseWriter) Write([]byte) (int, error) {
	return 0, nil
}

func (nw *noopResponseWriter) WriteHeader(statusCode int) {
	// no-op
}

// readPump pumps messages from the websocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.hub.logger.Error("Unexpected WebSocket close", zap.Error(err))
			}
			break
		}
	}
}

// writePump pumps messages from the hub to the websocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current websocket message
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// generateClientID generates a unique client ID
func generateClientID() string {
	return time.Now().Format("20060102150405") + "-" + time.Now().Format("000000")
}
