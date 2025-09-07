package logs

import (
	"context"
	"fmt"
	"sync"

	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/kubernetes"

	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"github.com/aaronlmathis/kaptn/internal/logs"
)

// WebSocketBroadcaster defines the interface for broadcasting to WebSocket rooms
type WebSocketBroadcaster interface {
	BroadcastToRoom(room string, messageType string, data interface{})
}

// PodSelector defines criteria for selecting pods to stream logs from
type PodSelector struct {
	Namespace     string            `json:"namespace"`
	LabelSelector map[string]string `json:"label_selector"`
	FieldSelector map[string]string `json:"field_selector"`
	// If empty, all namespaces accessible to the user will be watched
	Namespaces []string `json:"namespaces"`
}

// StreamCoordinator manages log streaming from multiple pods based on selectors
type StreamCoordinator struct {
	logger       *zap.Logger
	kubeClient   kubernetes.Interface
	cacheService logs.LogService
	wsHub        WebSocketBroadcaster // WebSocket hub for broadcasting logs

	// Active streams keyed by coordinatorID
	activeStreams map[string]*CoordinatorStream
	streamsMutex  sync.RWMutex

	// Default cluster name for log entries
	clusterName string

	// RBAC components for per-pod authorization
	ssarHelper         *k8s.SSARHelper
	impersonatedClient kubernetes.Interface
	user               *auth.User
	enablePodRBAC      bool // Feature flag for per-pod RBAC checks
}

// CoordinatorStream represents a multi-pod log streaming session
type CoordinatorStream struct {
	ID       string
	ctx      context.Context
	cancel   context.CancelFunc
	selector PodSelector
	filter   LogFilter

	// Pod watchers and streams
	podWatchers  map[string]watch.Interface // namespace -> watcher
	podStreams   map[string]*LogStream      // podKey -> stream
	streamsMutex sync.RWMutex

	// Normalization context
	clusterName   string
	workloadCache map[string]string // podKey -> workload name
}

// NewStreamCoordinator creates a new multi-pod log stream coordinator
func NewStreamCoordinator(logger *zap.Logger, kubeClient kubernetes.Interface, cacheService logs.LogService, wsHub WebSocketBroadcaster, clusterName string) *StreamCoordinator {
	return &StreamCoordinator{
		logger:        logger,
		kubeClient:    kubeClient,
		cacheService:  cacheService,
		wsHub:         wsHub,
		clusterName:   clusterName,
		activeStreams: make(map[string]*CoordinatorStream),
	}
}

// SetRBACContext sets the RBAC context for per-pod authorization checks
func (sc *StreamCoordinator) SetRBACContext(ssarHelper *k8s.SSARHelper, impersonatedClient kubernetes.Interface, user *auth.User) {
	sc.ssarHelper = ssarHelper
	sc.impersonatedClient = impersonatedClient
	sc.user = user
	sc.enablePodRBAC = true // Enable per-pod RBAC checks by default
}

// SetPodRBACEnabled controls whether per-pod RBAC checks are performed
func (sc *StreamCoordinator) SetPodRBACEnabled(enabled bool) {
	sc.enablePodRBAC = enabled
}

// StartCoordinatedStream starts streaming logs from multiple pods matching the selector
func (sc *StreamCoordinator) StartCoordinatedStream(ctx context.Context, coordinatorID string, selector PodSelector, filter LogFilter) error {
	sc.streamsMutex.Lock()
	defer sc.streamsMutex.Unlock()

	// Stop existing stream if it exists
	if existingStream, exists := sc.activeStreams[coordinatorID]; exists {
		existingStream.cancel()
		delete(sc.activeStreams, coordinatorID)
	}

	// Create new coordinated stream
	streamCtx, cancel := context.WithCancel(ctx)

	coordStream := &CoordinatorStream{
		ID:            coordinatorID,
		ctx:           streamCtx,
		cancel:        cancel,
		selector:      selector,
		filter:        filter,
		podWatchers:   make(map[string]watch.Interface),
		podStreams:    make(map[string]*LogStream),
		clusterName:   sc.clusterName,
		workloadCache: make(map[string]string),
	}

	sc.activeStreams[coordinatorID] = coordStream

	// Start watching pods in background
	go sc.watchAndStreamPods(coordStream)

	sc.logger.Info("Started coordinated log stream",
		zap.String("coordinatorID", coordinatorID),
		zap.Any("selector", selector))

	return nil
}

// StopCoordinatedStream stops a coordinated stream and all its pod streams
func (sc *StreamCoordinator) StopCoordinatedStream(coordinatorID string) {
	sc.streamsMutex.Lock()
	defer sc.streamsMutex.Unlock()

	if coordStream, exists := sc.activeStreams[coordinatorID]; exists {
		coordStream.cancel()
		delete(sc.activeStreams, coordinatorID)
		sc.logger.Info("Stopped coordinated log stream", zap.String("coordinatorID", coordinatorID))
	}
}

// watchAndStreamPods watches for pod changes and manages individual pod streams
func (sc *StreamCoordinator) watchAndStreamPods(coordStream *CoordinatorStream) {
	defer func() {
		// Clean up all watchers and streams
		coordStream.streamsMutex.Lock()
		for _, watcher := range coordStream.podWatchers {
			watcher.Stop()
		}
		coordStream.streamsMutex.Unlock()
	}()

	// Determine namespaces to watch
	namespacesToWatch := coordStream.selector.Namespaces
	if len(namespacesToWatch) == 0 {
		if coordStream.selector.Namespace != "" {
			namespacesToWatch = []string{coordStream.selector.Namespace}
		} else {
			// Watch all namespaces - this should be controlled by RBAC
			namespacesToWatch = []string{metav1.NamespaceAll}
		}
	}

	// Start watchers for each namespace
	var wg sync.WaitGroup
	for _, namespace := range namespacesToWatch {
		wg.Add(1)
		go func(ns string) {
			defer wg.Done()
			sc.watchNamespacePods(coordStream, ns)
		}(namespace)
	}

	wg.Wait()
}

// watchNamespacePods watches pods in a specific namespace
func (sc *StreamCoordinator) watchNamespacePods(coordStream *CoordinatorStream, namespace string) {
	// Build label selector
	labelSelector := labels.Everything()
	if len(coordStream.selector.LabelSelector) > 0 {
		labelSelector = labels.SelectorFromSet(coordStream.selector.LabelSelector)
	}

	// Build field selector
	fieldSelector := fields.Everything()
	if len(coordStream.selector.FieldSelector) > 0 {
		fieldSelector = fields.SelectorFromSet(coordStream.selector.FieldSelector)
	}

	// Create watcher
	watcher, err := sc.kubeClient.CoreV1().Pods(namespace).Watch(coordStream.ctx, metav1.ListOptions{
		LabelSelector: labelSelector.String(),
		FieldSelector: fieldSelector.String(),
	})
	if err != nil {
		sc.logger.Error("Failed to create pod watcher",
			zap.Error(err),
			zap.String("namespace", namespace),
			zap.String("coordinatorID", coordStream.ID))
		return
	}

	// Store watcher for cleanup
	coordStream.streamsMutex.Lock()
	coordStream.podWatchers[namespace] = watcher
	coordStream.streamsMutex.Unlock()

	// Process watch events
	for event := range watcher.ResultChan() {
		select {
		case <-coordStream.ctx.Done():
			return
		default:
		}

		pod, ok := event.Object.(*v1.Pod)
		if !ok {
			continue
		}

		podKey := fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)

		switch event.Type {
		case watch.Added, watch.Modified:
			// Only stream logs from running pods
			if pod.Status.Phase == v1.PodRunning {
				sc.startPodStream(coordStream, pod)
			} else {
				sc.stopPodStream(coordStream, podKey)
			}

		case watch.Deleted:
			sc.stopPodStream(coordStream, podKey)
		}
	}
}

// startPodStream starts streaming logs from a specific pod
func (sc *StreamCoordinator) startPodStream(coordStream *CoordinatorStream, pod *v1.Pod) {
	podKey := fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)

	coordStream.streamsMutex.Lock()
	defer coordStream.streamsMutex.Unlock()

	// Stop existing stream if any
	if existingStream, exists := coordStream.podStreams[podKey]; exists {
		existingStream.Cancel()
	}

	// Perform per-pod RBAC check for pod log access
	// This ensures that even if the user has general permissions, they're checked per-pod
	// This can be disabled via SetPodRBACEnabled(false) if needed for troubleshooting
	if sc.enablePodRBAC && sc.ssarHelper != nil && sc.impersonatedClient != nil {
		allowed, err := sc.ssarHelper.CanPerformActionWithSubresource(
			coordStream.ctx,
			sc.impersonatedClient,
			"get",
			"", // group - empty for core resources
			"pods",
			"log",
			pod.Namespace,
			pod.Name,
		)

		if err != nil {
			sc.logger.Error("RBAC check failed for pod stream",
				zap.Error(err),
				zap.String("podKey", podKey),
				zap.String("coordinatorID", coordStream.ID))
			// Log audit DENIED for error case
			sc.logAuditEvent("get", "pods/log", pod.Namespace, pod.Name, "ERROR", err)
			return
		}

		if !allowed {
			sc.logger.Info("RBAC denied for pod stream",
				zap.String("podKey", podKey),
				zap.String("coordinatorID", coordStream.ID))
			// Log audit DENIED for permission denied
			sc.logAuditEvent("get", "pods/log", pod.Namespace, pod.Name, "DENIED", nil)
			return
		}

		// Log audit ALLOWED for successful check
		sc.logAuditEvent("get", "pods/log", pod.Namespace, pod.Name, "ALLOWED", nil)
	}

	// Create stream manager for this pod
	streamManager := NewStreamManager(sc.logger, sc.kubeClient)

	// Create a unique stream ID
	streamID := fmt.Sprintf("%s:%s", coordStream.ID, podKey)

	// Start the pod stream
	stream, err := streamManager.StartStream(
		coordStream.ctx,
		streamID,
		pod.Namespace,
		pod.Name,
		coordStream.filter,
	)
	if err != nil {
		sc.logger.Error("Failed to start pod stream",
			zap.Error(err),
			zap.String("podKey", podKey),
			zap.String("coordinatorID", coordStream.ID))
		return
	}

	coordStream.podStreams[podKey] = stream

	// Resolve workload for this pod
	workload := sc.resolveWorkload(pod)
	coordStream.workloadCache[podKey] = workload

	// Start goroutine to bridge pod logs to cache service
	go sc.bridgePodLogsToCache(coordStream, stream, pod, workload)

	sc.logger.Debug("Started pod stream",
		zap.String("podKey", podKey),
		zap.String("workload", workload),
		zap.String("coordinatorID", coordStream.ID))
}

// stopPodStream stops streaming logs from a specific pod
func (sc *StreamCoordinator) stopPodStream(coordStream *CoordinatorStream, podKey string) {
	coordStream.streamsMutex.Lock()
	defer coordStream.streamsMutex.Unlock()

	if stream, exists := coordStream.podStreams[podKey]; exists {
		stream.Cancel()
		delete(coordStream.podStreams, podKey)
		delete(coordStream.workloadCache, podKey)
		sc.logger.Debug("Stopped pod stream", zap.String("podKey", podKey))
	}
}

// bridgePodLogsToCache bridges log entries from a pod stream to the cache service
func (sc *StreamCoordinator) bridgePodLogsToCache(coordStream *CoordinatorStream, stream *LogStream, pod *v1.Pod, workload string) {
	for {
		select {
		case <-coordStream.ctx.Done():
			return
		case logEntry, ok := <-stream.Events():
			if !ok {
				return
			}

			// Convert and normalize the log entry
			normalizedEntry := sc.normalizeLogEntry(logEntry, pod, workload, coordStream.clusterName)

			// Ingest into cache service
			sc.cacheService.Ingest(normalizedEntry)

		case err, ok := <-stream.Errors():
			if !ok {
				return
			}
			sc.logger.Warn("Pod stream error",
				zap.Error(err),
				zap.String("pod", fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)),
				zap.String("coordinatorID", coordStream.ID))
		}
	}
}

// normalizeLogEntry converts a k8s logs.LogEntry to the cache logs.LogEntry format
func (sc *StreamCoordinator) normalizeLogEntry(k8sEntry LogEntry, pod *v1.Pod, workload, clusterName string) logs.LogEntry {
	// Extract log level from message if possible
	level := sc.extractLogLevel(k8sEntry.Line)

	// Build labels map
	labels := make(map[string]string)
	for k, v := range pod.Labels {
		labels[k] = v
	}

	return logs.LogEntry{
		TS:        k8sEntry.Timestamp,
		Level:     level,
		Cluster:   clusterName,
		Namespace: k8sEntry.Namespace,
		Workload:  workload,
		Pod:       k8sEntry.Pod,
		Container: k8sEntry.Container,
		Node:      pod.Spec.NodeName,
		Msg:       k8sEntry.Line,
		TraceID:   sc.extractTraceID(k8sEntry.Line),
		SpanID:    sc.extractSpanID(k8sEntry.Line),
		Labels:    labels,
	}
}

// resolveWorkload determines the workload name from pod owner references
func (sc *StreamCoordinator) resolveWorkload(pod *v1.Pod) string {
	for _, ownerRef := range pod.OwnerReferences {
		if ownerRef.Controller != nil && *ownerRef.Controller {
			switch ownerRef.Kind {
			case "ReplicaSet":
				// For Deployments, get the deployment name from ReplicaSet
				if rsName := ownerRef.Name; rsName != "" {
					// ReplicaSet name format: deployment-name-hash
					// Try to extract deployment name by removing hash suffix
					if idx := findLastDashBeforeHash(rsName); idx > 0 {
						return rsName[:idx]
					}
					return rsName
				}
			case "DaemonSet", "StatefulSet", "Job":
				return ownerRef.Name
			case "Deployment":
				return ownerRef.Name
			}
		}
	}

	// Fallback to pod name if no suitable owner reference found
	return pod.Name
}

// findLastDashBeforeHash finds the last dash before a hash suffix in ReplicaSet names
func findLastDashBeforeHash(name string) int {
	// ReplicaSet hash is typically 8-10 characters of alphanumeric
	if len(name) < 10 {
		return -1
	}

	// Look for pattern: name-hash where hash is alphanumeric
	for i := len(name) - 1; i >= 0; i-- {
		if name[i] == '-' {
			// Check if what follows looks like a hash (8-10 alphanumeric chars)
			suffix := name[i+1:]
			if len(suffix) >= 8 && len(suffix) <= 10 && isAlphanumeric(suffix) {
				return i
			}
		}
	}
	return -1
}

// isAlphanumeric checks if a string contains only alphanumeric characters
func isAlphanumeric(s string) bool {
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')) {
			return false
		}
	}
	return true
}

// extractLogLevel attempts to extract log level from log message
func (sc *StreamCoordinator) extractLogLevel(message string) string {
	// Simple heuristic-based log level extraction
	// This can be enhanced with more sophisticated parsing
	msgLower := message
	if len(msgLower) > 100 {
		msgLower = msgLower[:100] // Only check first 100 chars for performance
	}

	// Check for exact log level matches (order matters - more specific first)
	levelChecks := []struct {
		pattern string
		level   string
	}{
		{"FATAL", "FATAL"},
		{"ERROR", "ERROR"},
		{"WARN", "WARN"},
		{"INFO", "INFO"},
		{"DEBUG", "DEBUG"},
		{"TRACE", "TRACE"},
		{"fatal", "FATAL"},
		{"error", "ERROR"},
		{"warn", "WARN"},
		{"info", "INFO"},
		{"debug", "DEBUG"},
		{"trace", "TRACE"},
	}

	for _, check := range levelChecks {
		if contains(msgLower, check.pattern) {
			return check.level
		}
	}

	return "INFO" // Default level
}

// extractTraceID attempts to extract trace ID from log message
func (sc *StreamCoordinator) extractTraceID(message string) string {
	// Simple regex-like extraction for common trace ID patterns
	// This can be enhanced with proper regex parsing
	// Look for patterns like trace_id=xxx, traceId:xxx, etc.
	return "" // Placeholder - implement based on your tracing setup
}

// extractSpanID attempts to extract span ID from log message
func (sc *StreamCoordinator) extractSpanID(message string) string {
	// Simple regex-like extraction for common span ID patterns
	// This can be enhanced with proper regex parsing
	return "" // Placeholder - implement based on your tracing setup
}

// contains is a case-insensitive substring check
func contains(s, substr string) bool {
	if len(substr) > len(s) {
		return false
	}
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// GetActiveStreams returns information about active coordinated streams
func (sc *StreamCoordinator) GetActiveStreams() map[string]PodSelector {
	sc.streamsMutex.RLock()
	defer sc.streamsMutex.RUnlock()

	result := make(map[string]PodSelector)
	for id, stream := range sc.activeStreams {
		result[id] = stream.selector
	}
	return result
}

// logAuditEvent logs RBAC audit events for pod stream access
func (sc *StreamCoordinator) logAuditEvent(verb, resource, namespace, name, decision string, err error) {
	logFields := []zap.Field{
		zap.String("event_type", "audit"),
		zap.String("component", "stream_coordinator"),
		zap.String("verb", verb),
		zap.String("resource", resource),
		zap.String("namespace", namespace),
		zap.String("name", name),
		zap.String("decision", decision),
	}

	if sc.user != nil {
		logFields = append(logFields,
			zap.String("user_sub", sc.user.Sub),
			zap.String("user_email", sc.user.Email),
			zap.Strings("user_groups", sc.user.Groups))
	}

	if err != nil {
		logFields = append(logFields, zap.Error(err))
	}

	// Log at appropriate level based on decision
	switch decision {
	case "ALLOWED":
		sc.logger.Info("Stream coordinator audit event", logFields...)
	case "DENIED":
		sc.logger.Warn("Stream coordinator audit event - access denied", logFields...)
	case "ERROR":
		sc.logger.Error("Stream coordinator audit event - error", logFields...)
	default:
		sc.logger.Info("Stream coordinator audit event", logFields...)
	}
}

// GetStreamPodCount returns the number of pods being streamed for a coordinator
func (sc *StreamCoordinator) GetStreamPodCount(coordinatorID string) int {
	sc.streamsMutex.RLock()
	defer sc.streamsMutex.RUnlock()

	if coordStream, exists := sc.activeStreams[coordinatorID]; exists {
		coordStream.streamsMutex.RLock()
		count := len(coordStream.podStreams)
		coordStream.streamsMutex.RUnlock()
		return count
	}
	return 0
}
