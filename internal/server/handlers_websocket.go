package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/exec"
	k8slogs "github.com/aaronlmathis/kaptn/internal/k8s/logs"
	"github.com/aaronlmathis/kaptn/internal/logs"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// WebSocket handlers

func (s *Server) HandleNodesWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "nodes")
}

func (s *Server) HandlePodsWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "pods")
}

func (s *Server) HandleServicesWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "services")
}

func (s *Server) HandleDeploymentsWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "deployments")
}

func (s *Server) HandleOverviewWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "overview")
}

func (s *Server) HandleLogsWebSocket(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamId")
	if streamID == "" {
		http.Error(w, "Stream ID is required", http.StatusBadRequest)
		return
	}

	// Check if the stream exists (verify it was started via coordinator)
	activeStreams := s.logsCoordinator.GetActiveStreams()
	selector, exists := activeStreams[streamID]
	if !exists {
		http.Error(w, "Log stream not found or inactive", http.StatusNotFound)
		return
	}

	// TODO: Implement RBAC validation for the stream scope
	// For each namespace/pod in the stream selector, verify user has 'get' permission on 'pods/log'
	// This should use SSARHelper.CanPerformActionWithSubresource
	if err := s.validateLogStreamAccess(r, selector); err != nil {
		s.logger.Error("Log stream access denied",
			zap.String("streamID", streamID),
			zap.Error(err))
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	// Create log filter from query parameters for initial replay
	logFilter := s.buildLogFilterFromRequest(r, selector)

	// Start a streaming subscription with the logs cache service
	streamCh, cancelStream := s.logsCacheService.Stream(logFilter)
	defer cancelStream()

	// Send initial backfill before connecting to WebSocket
	replayEntries := s.logsCacheService.Replay(logFilter)

	// Connect to WebSocket and bridge the live stream
	s.bridgeLogStreamToWebSocket(w, r, "logs:"+streamID, replayEntries, streamCh)
}

func (s *Server) HandleStartLogStream(w http.ResponseWriter, r *http.Request) {
	var req StartLogStreamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request parameters
	if req.Selector.Namespace == "" && len(req.Selector.Namespaces) == 0 {
		http.Error(w, "At least one namespace must be specified", http.StatusBadRequest)
		return
	}

	// TODO: Implement RBAC validation for the requested scope
	// Validate user has 'get' permission on 'pods/log' for requested namespaces
	if err := s.validateLogStreamAccess(r, req.Selector); err != nil {
		s.logger.Error("Log stream access denied", zap.Error(err))
		http.Error(w, "Access denied", http.StatusForbidden)
		return
	}

	// Generate unique stream ID
	streamID := uuid.New().String()

	// Convert request filter to k8s log filter
	k8sFilter := k8slogs.LogFilter{
		Container:    req.Container,
		SinceSeconds: req.SinceSeconds,
		TailLines:    req.TailLines,
		Follow:       req.Follow,
		Timestamps:   req.Timestamps,
		Previous:     req.Previous,
	}

	// Start coordinated stream with request context timeout
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	err := s.logsCoordinator.StartCoordinatedStream(ctx, streamID, req.Selector, k8sFilter)
	if err != nil {
		s.logger.Error("Failed to start coordinated log stream",
			zap.Error(err),
			zap.String("streamID", streamID))
		http.Error(w, "Failed to start log stream", http.StatusInternalServerError)
		return
	}

	// Get initial pod count
	podCount := s.logsCoordinator.GetStreamPodCount(streamID)

	// Build WebSocket URL
	basePath := s.config.Server.BasePath
	if basePath == "" {
		basePath = ""
	}
	websocketURL := fmt.Sprintf("ws://%s%s/api/v1/stream/logs/%s", r.Host, basePath, streamID)

	response := StartLogStreamResponse{
		StreamID:     streamID,
		StartedAt:    time.Now(),
		PodCount:     podCount,
		WebSocketURL: websocketURL,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)

	s.logger.Info("Started coordinated log stream",
		zap.String("streamID", streamID),
		zap.Int("podCount", podCount),
		zap.Any("selector", req.Selector))
}

func (s *Server) HandleStopLogStream(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamId")
	if streamID == "" {
		http.Error(w, "Stream ID is required", http.StatusBadRequest)
		return
	}

	// Check if the stream exists before stopping
	activeStreams := s.logsCoordinator.GetActiveStreams()
	_, exists := activeStreams[streamID]
	if !exists {
		http.Error(w, "Log stream not found or already stopped", http.StatusNotFound)
		return
	}

	// Stop the coordinated stream and clean up any WebSocket connections
	s.logsCoordinator.StopCoordinatedStream(streamID)

	response := StopLogStreamResponse{
		StreamID:  streamID,
		StoppedAt: time.Now(),
		Success:   true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)

	s.logger.Info("Stopped coordinated log stream",
		zap.String("streamID", streamID))
}

func (s *Server) HandleJobWebSocket(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobId")
	if jobID == "" {
		http.Error(w, "Job ID is required", http.StatusBadRequest)
		return
	}

	// Check if job exists
	if _, exists := s.actionsService.GetJob(jobID); !exists {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	s.wsHub.ServeWS(w, r, "job:"+jobID)
}

func (s *Server) HandleExecWebSocket(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	if sessionID == "" {
		http.Error(w, "Session ID is required", http.StatusBadRequest)
		return
	}

	// Parse query parameters
	namespace := r.URL.Query().Get("namespace")
	podName := r.URL.Query().Get("pod")
	containerName := r.URL.Query().Get("container")
	commandStr := r.URL.Query().Get("command")
	ttyStr := r.URL.Query().Get("tty")

	if namespace == "" || podName == "" {
		http.Error(w, "namespace and pod are required", http.StatusBadRequest)
		return
	}

	// Default container name if not specified or auto-detect first container
	if containerName == "" {
		// Try to get the first container from the pod
		pod, err := s.kubeClient.CoreV1().Pods(namespace).Get(r.Context(), podName, metav1.GetOptions{})
		if err != nil {
			s.logger.Error("Failed to get pod for container detection",
				zap.String("namespace", namespace),
				zap.String("pod", podName),
				zap.Error(err))
			http.Error(w, "Failed to get pod information for container detection", http.StatusInternalServerError)
			return
		} else if len(pod.Spec.Containers) > 0 {
			containerName = pod.Spec.Containers[0].Name // use first container
			s.logger.Info("Auto-detected container",
				zap.String("pod", podName),
				zap.String("container", containerName))
		} else {
			s.logger.Error("Pod has no containers",
				zap.String("namespace", namespace),
				zap.String("pod", podName))
			http.Error(w, "Pod has no containers", http.StatusBadRequest)
			return
		}
	}

	// Default command if not specified - let the exec service handle shell detection
	var command []string
	if commandStr != "" {
		command = []string{commandStr}
	} else {
		// Let the exec service handle shell detection by passing empty command
		command = []string{}
	}

	// Parse TTY parameter
	tty := ttyStr == "true"

	// Create exec request
	execReq := exec.ExecRequest{
		Namespace: namespace,
		Pod:       podName,
		Container: containerName,
		Command:   command,
		TTY:       tty,
	}

	// Start exec session
	err := s.execService.StartExecSession(w, r, sessionID, execReq)
	if err != nil {
		s.logger.Error("Failed to start exec session",
			zap.String("sessionID", sessionID),
			zap.String("namespace", namespace),
			zap.String("pod", podName),
			zap.String("container", containerName),
			zap.Error(err))
		http.Error(w, "Failed to start exec session", http.StatusInternalServerError)
		return
	}
}

// validateLogStreamAccess validates RBAC permissions for log stream access
func (s *Server) validateLogStreamAccess(r *http.Request, selector k8slogs.PodSelector) error {
	// Get security context for RBAC checks
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		return err
	}

	// Determine the effective namespaces to check
	var namespacesToCheck []string

	if selector.Namespace != "" {
		// Single namespace specified
		namespacesToCheck = []string{selector.Namespace}
	} else if len(selector.Namespaces) > 0 {
		// Multiple namespaces specified
		namespacesToCheck = selector.Namespaces
	} else {
		// No specific namespace - check if user has cluster-wide pod log access
		// This is more restrictive - they need cluster-wide permissions
		if err := s.checkResourcePermission(r.Context(), secCtx, "list", "pods", "", ""); err != nil {
			return &SecurityError{
				Code:    "FORBIDDEN",
				Message: "Insufficient permissions to access logs across all namespaces",
				Status:  http.StatusForbidden,
			}
		}
		// If they have cluster-wide access, allow the stream
		return nil
	}

	// Check permissions for each specific namespace
	for _, namespace := range namespacesToCheck {
		// Check if user can list pods in this namespace
		if err := s.checkResourcePermission(r.Context(), secCtx, "list", "pods", namespace, ""); err != nil {
			return &SecurityError{
				Code:    "FORBIDDEN",
				Message: fmt.Sprintf("Insufficient permissions to list pods in namespace %s", namespace),
				Status:  http.StatusForbidden,
			}
		}

		// Check if user can access pod logs in this namespace
		if err := s.checkResourcePermissionWithSubresource(r.Context(), secCtx, "get", "pods", "log", namespace, ""); err != nil {
			return &SecurityError{
				Code:    "FORBIDDEN",
				Message: fmt.Sprintf("Insufficient permissions to access pod logs in namespace %s", namespace),
				Status:  http.StatusForbidden,
			}
		}
	}

	// Log audit event for successful validation
	s.logAuditEvent(r, secCtx.User, "get", "pods/log",
		strings.Join(namespacesToCheck, ","), "", "ALLOWED", nil)

	return nil
}

// buildLogFilterFromRequest creates a LogFilter from request parameters and stream selector
func (s *Server) buildLogFilterFromRequest(r *http.Request, selector k8slogs.PodSelector) logs.LogFilter {
	query := r.URL.Query()

	filter := logs.LogFilter{
		Namespace: selector.Namespace, // Use selector's namespace if specified
		Limit:     1000,               // Default limit
		Direction: "backward",         // Default to newest first
	}

	// Parse time parameters
	if sinceStr := query.Get("since"); sinceStr != "" {
		if since, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			filter.Since = since
		} else if duration, err := time.ParseDuration(sinceStr); err == nil {
			filter.Since = time.Now().Add(-duration)
		}
	}

	if untilStr := query.Get("until"); untilStr != "" {
		if until, err := time.Parse(time.RFC3339, untilStr); err == nil {
			filter.Until = until
		}
	}

	// Parse other filters
	if levels := query.Get("levels"); levels != "" {
		filter.Levels = strings.Split(levels, ",")
	}

	if workload := query.Get("workload"); workload != "" {
		filter.Workload = workload
	}

	if pod := query.Get("pod"); pod != "" {
		filter.Pod = pod
	}

	if text := query.Get("q"); text != "" {
		filter.Text = text
	}

	if limitStr := query.Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 {
			filter.Limit = limit
		}
	}

	if direction := query.Get("direction"); direction == "forward" || direction == "backward" {
		filter.Direction = direction
	}

	// If no since time specified, default to last 10 minutes for initial backfill
	if filter.Since.IsZero() {
		filter.Since = time.Now().Add(-10 * time.Minute)
	}

	return filter
}

// bridgeLogStreamToWebSocket connects the logs cache stream to a WebSocket connection
func (s *Server) bridgeLogStreamToWebSocket(w http.ResponseWriter, r *http.Request, room string, replayEntries []logs.LogEntry, streamCh <-chan logs.LogEntry) {
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
	defer conn.Close()

	// Set up ping/pong to keep connection alive
	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()

	// Create a cancellable context for this connection
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Send initial backfill data
	if len(replayEntries) > 0 {
		backfillMsg := map[string]interface{}{
			"type": "logs.init",
			"data": replayEntries,
		}
		if err := conn.WriteJSON(backfillMsg); err != nil {
			s.logger.Error("Failed to send backfill data", zap.Error(err))
			return
		}
		s.logger.Info("Sent backfill data",
			zap.String("room", room),
			zap.Int("entries", len(replayEntries)))
	}

	// Handle backpressure and degraded mode
	degraded := false
	backpressureThreshold := 50 // If we can't send for this many messages, go degraded
	droppedCount := 0

	// Main message loop
	done := make(chan struct{})

	// Start goroutine to handle pongs and close detection
	go func() {
		defer close(done)
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					s.logger.Error("WebSocket closed unexpectedly", zap.Error(err))
				}
				return
			}
		}
	}()

	for {
		select {
		case <-done:
			s.logger.Info("WebSocket connection closed", zap.String("room", room))
			return

		case <-ctx.Done():
			s.logger.Info("WebSocket context cancelled", zap.String("room", room))
			return

		case entry := <-streamCh:
			// Try to send the log entry
			msg := map[string]interface{}{
				"type": "logs",
				"data": entry,
			}

			if degraded {
				msg["degraded"] = true
			}

			// Set a write timeout
			conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			err := conn.WriteJSON(msg)

			if err != nil {
				droppedCount++
				s.logger.Warn("Failed to send log entry",
					zap.Error(err),
					zap.String("room", room),
					zap.Int("droppedCount", droppedCount))

				// Check if we should go into degraded mode
				if droppedCount >= backpressureThreshold {
					if !degraded {
						degraded = true
						s.logger.Warn("Entering degraded mode due to backpressure",
							zap.String("room", room),
							zap.Int("droppedCount", droppedCount))
					}
				}

				// If we can't write, client is probably gone
				if websocket.IsCloseError(err, websocket.CloseAbnormalClosure, websocket.CloseGoingAway) {
					return
				}
			} else {
				// Successfully sent, reset dropped count
				if droppedCount > 0 {
					droppedCount = 0
				}

				// Exit degraded mode if we're sending successfully
				if degraded {
					degraded = false
					s.logger.Info("Exiting degraded mode", zap.String("room", room))
				}
			}

		case <-pingTicker.C:
			// Send ping to keep connection alive
			conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				s.logger.Error("Failed to send ping", zap.Error(err))
				return
			}
		}
	}
}
