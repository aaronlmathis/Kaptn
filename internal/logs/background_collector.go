package logs

import (
	"bufio"
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/kubernetes"
)

// BackgroundCollector is the event-driven log collector
// It watches for pod lifecycle events and maintains persistent streams per container
type BackgroundCollector struct {
	logger      *zap.Logger
	kubeClient  kubernetes.Interface
	logsService *Service
	enabled     bool
	retention   time.Duration
	tailLines   int64
	clusterName string

	// Container tracking - key: namespace/podName/containerName
	containerStreams   map[string]*containerStream
	containerStreamsMu sync.RWMutex

	// Lifecycle management
	ctx       context.Context
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	startTime time.Time
}

// containerStream represents a persistent log stream for a single container
type containerStream struct {
	namespace     string
	podName       string
	containerName string
	cancel        context.CancelFunc
	startTime     time.Time
	lineCount     int64
	lastActivity  time.Time
}

// NewBackgroundCollector creates the event-driven collector
func NewBackgroundCollector(logger *zap.Logger, kubeClient kubernetes.Interface, logsService *Service, clusterName string, enabled bool, retention time.Duration, tailLines int64) *BackgroundCollector {
	ctx, cancel := context.WithCancel(context.Background())

	return &BackgroundCollector{
		logger:           logger.Named("background-collector"),
		kubeClient:       kubeClient,
		logsService:      logsService,
		enabled:          enabled,
		retention:        retention,
		tailLines:        tailLines,
		clusterName:      clusterName,
		containerStreams: make(map[string]*containerStream),
		ctx:              ctx,
		cancel:           cancel,
		startTime:        time.Now(),
	}
}

// Start begins event-driven log collection
func (bc *BackgroundCollector) Start(ctx context.Context) error {
	if !bc.enabled {
		bc.logger.Info("Background log collection is disabled")
		return nil
	}

	bc.logger.Info("Starting event-driven background log collector")

	// Start the pod watcher
	bc.wg.Add(1)
	go func() {
		defer bc.wg.Done()
		bc.watchPods()
	}()

	// Start initial discovery of existing pods
	bc.wg.Add(1)
	go func() {
		defer bc.wg.Done()
		bc.initialPodDiscovery()
	}()

	// Start metrics/monitoring goroutine
	bc.wg.Add(1)
	go func() {
		defer bc.wg.Done()
		bc.monitorStreams()
	}()

	return nil
}

// Stop gracefully shuts down the collector
func (bc *BackgroundCollector) Stop() {
	bc.logger.Info("Stopping background log collector")

	// Cancel all operations
	bc.cancel()

	// Stop all container streams
	bc.containerStreamsMu.Lock()
	for key, stream := range bc.containerStreams {
		bc.logger.Debug("Stopping container stream", zap.String("container", key))
		stream.cancel()
	}
	bc.containerStreams = make(map[string]*containerStream)
	bc.containerStreamsMu.Unlock()

	// Wait for all goroutines to finish with timeout
	done := make(chan struct{})
	go func() {
		bc.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		bc.logger.Info("All background collector goroutines finished")
	case <-time.After(10 * time.Second):
		bc.logger.Warn("Timeout waiting for background collector goroutines to finish")
	}
}

// initialPodDiscovery discovers existing running pods and starts collecting from them
func (bc *BackgroundCollector) initialPodDiscovery() {
	bc.logger.Info("Starting initial pod discovery")

	pods, err := bc.kubeClient.CoreV1().Pods("").List(bc.ctx, metav1.ListOptions{
		FieldSelector: "status.phase=Running",
	})
	if err != nil {
		bc.logger.Error("Failed to list existing pods", zap.Error(err))
		return
	}

	bc.logger.Info("Discovered existing pods", zap.Int("count", len(pods.Items)))

	for _, pod := range pods.Items {
		bc.handlePodAdded(&pod)
	}

	bc.logger.Info("Initial pod discovery completed")
}

// watchPods watches for pod lifecycle events
func (bc *BackgroundCollector) watchPods() {
	bc.logger.Info("Starting pod watcher")

	for {
		select {
		case <-bc.ctx.Done():
			bc.logger.Info("Pod watcher context cancelled")
			return
		default:
		}

		// Create a new watcher
		watcher, err := bc.kubeClient.CoreV1().Pods("").Watch(bc.ctx, metav1.ListOptions{
			Watch: true,
		})
		if err != nil {
			bc.logger.Error("Failed to create pod watcher", zap.Error(err))
			time.Sleep(5 * time.Second) // Wait before retrying
			continue
		}

		bc.logger.Info("Pod watcher established")

		// Process events
		for event := range watcher.ResultChan() {
			pod, ok := event.Object.(*corev1.Pod)
			if !ok {
				bc.logger.Warn("Received non-pod object in pod watch")
				continue
			}

			switch event.Type {
			case watch.Added, watch.Modified:
				if pod.Status.Phase == corev1.PodRunning {
					bc.handlePodAdded(pod)
				} else {
					bc.handlePodRemoved(pod)
				}
			case watch.Deleted:
				bc.handlePodRemoved(pod)
			}
		}

		watcher.Stop()
		bc.logger.Warn("Pod watcher connection lost, retrying...")
		time.Sleep(2 * time.Second)
	}
}

// handlePodAdded starts log collection for a pod's containers
func (bc *BackgroundCollector) handlePodAdded(pod *corev1.Pod) {
	podKey := fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)

	bc.logger.Debug("Handling pod added/modified",
		zap.String("pod", podKey),
		zap.String("phase", string(pod.Status.Phase)),
		zap.Int("containers", len(pod.Spec.Containers)))

	// Start collection for each container
	for _, container := range pod.Spec.Containers {
		containerKey := fmt.Sprintf("%s/%s/%s", pod.Namespace, pod.Name, container.Name)

		bc.containerStreamsMu.RLock()
		_, exists := bc.containerStreams[containerKey]
		bc.containerStreamsMu.RUnlock()

		if !exists {
			bc.startContainerStream(pod, container.Name)
		}
	}
}

// handlePodRemoved stops log collection for a pod's containers
func (bc *BackgroundCollector) handlePodRemoved(pod *corev1.Pod) {
	podKey := fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)

	bc.logger.Debug("Handling pod removed", zap.String("pod", podKey))

	// Stop collection for each container
	for _, container := range pod.Spec.Containers {
		containerKey := fmt.Sprintf("%s/%s/%s", pod.Namespace, pod.Name, container.Name)
		bc.stopContainerStream(containerKey)
	}
}

// startContainerStream starts a persistent log stream for a container
func (bc *BackgroundCollector) startContainerStream(pod *corev1.Pod, containerName string) {
	containerKey := fmt.Sprintf("%s/%s/%s", pod.Namespace, pod.Name, containerName)

	bc.logger.Debug("Starting container stream", zap.String("container", containerKey))

	// Create cancellable context for this container
	streamCtx, cancel := context.WithCancel(bc.ctx)

	// Create stream info
	stream := &containerStream{
		namespace:     pod.Namespace,
		podName:       pod.Name,
		containerName: containerName,
		cancel:        cancel,
		startTime:     time.Now(),
		lineCount:     0,
		lastActivity:  time.Now(),
	}

	// Register the stream
	bc.containerStreamsMu.Lock()
	bc.containerStreams[containerKey] = stream
	bc.containerStreamsMu.Unlock()

	// Start the log collection goroutine
	bc.wg.Add(1)
	go func() {
		defer bc.wg.Done()
		defer func() {
			// Clean up on completion
			bc.containerStreamsMu.Lock()
			delete(bc.containerStreams, containerKey)
			bc.containerStreamsMu.Unlock()
		}()

		bc.collectContainerLogs(streamCtx, pod, containerName, stream)
	}()
}

// stopContainerStream stops a container's log stream
func (bc *BackgroundCollector) stopContainerStream(containerKey string) {
	bc.containerStreamsMu.Lock()
	defer bc.containerStreamsMu.Unlock()

	if stream, exists := bc.containerStreams[containerKey]; exists {
		bc.logger.Debug("Stopping container stream", zap.String("container", containerKey))
		stream.cancel()
		delete(bc.containerStreams, containerKey)
	}
}

// collectContainerLogs runs the persistent log collection for a single container
func (bc *BackgroundCollector) collectContainerLogs(ctx context.Context, pod *corev1.Pod, containerName string, stream *containerStream) {
	containerKey := fmt.Sprintf("%s/%s/%s", pod.Namespace, pod.Name, containerName)

	bc.logger.Info("Starting persistent log collection",
		zap.String("container", containerKey))

	// Prepare log request options
	logOptions := &corev1.PodLogOptions{
		Container:  containerName,
		Follow:     true,
		Timestamps: true,
		TailLines:  &bc.tailLines,
	}

	// Get the log stream
	req := bc.kubeClient.CoreV1().Pods(pod.Namespace).GetLogs(pod.Name, logOptions)
	logStream, err := req.Stream(ctx)
	if err != nil {
		if ctx.Err() != nil {
			bc.logger.Debug("Log stream creation cancelled",
				zap.String("container", containerKey))
		} else {
			bc.logger.Error("Failed to open log stream",
				zap.String("container", containerKey),
				zap.Error(err))
		}
		return
	}
	defer logStream.Close()

	bc.logger.Info("Log stream established", zap.String("container", containerKey))

	// Read log lines
	scanner := bufio.NewScanner(logStream)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024) // 1MB max line size

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			bc.logger.Debug("Context cancelled, stopping log collection",
				zap.String("container", containerKey),
				zap.Int64("lines_processed", stream.lineCount))
			return
		default:
		}

		line := scanner.Text()
		if line == "" {
			continue
		}

		stream.lineCount++
		stream.lastActivity = time.Now()

		// Parse and ingest the log entry
		entry := bc.parseLogLine(line, pod, containerName)
		if entry != nil {
			bc.logsService.Ingest(*entry)
		}

		// Log progress periodically
		if stream.lineCount%1000 == 0 {
			bc.logger.Debug("Log collection progress",
				zap.String("container", containerKey),
				zap.Int64("lines", stream.lineCount))
		}
	}

	if err := scanner.Err(); err != nil {
		if ctx.Err() != nil {
			bc.logger.Debug("Log stream ended due to context cancellation",
				zap.String("container", containerKey),
				zap.Int64("lines_processed", stream.lineCount))
		} else {
			bc.logger.Error("Error reading log stream",
				zap.String("container", containerKey),
				zap.Int64("lines_processed", stream.lineCount),
				zap.Error(err))
		}
	}

	bc.logger.Info("Log stream ended",
		zap.String("container", containerKey),
		zap.Int64("total_lines", stream.lineCount),
		zap.Duration("duration", time.Since(stream.startTime)))
}

// monitorStreams periodically logs statistics about active streams
func (bc *BackgroundCollector) monitorStreams() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-bc.ctx.Done():
			return
		case <-ticker.C:
			bc.logStreamStats()
		}
	}
}

// logStreamStats logs current statistics about active streams
func (bc *BackgroundCollector) logStreamStats() {
	bc.containerStreamsMu.RLock()
	activeCount := len(bc.containerStreams)

	totalLines := int64(0)
	oldestStream := time.Now()
	newestStream := time.Time{}

	for _, stream := range bc.containerStreams {
		totalLines += stream.lineCount
		if stream.startTime.Before(oldestStream) {
			oldestStream = stream.startTime
		}
		if stream.startTime.After(newestStream) {
			newestStream = stream.startTime
		}
	}
	bc.containerStreamsMu.RUnlock()

	bc.logger.Info("Background collector statistics",
		zap.Int("active_streams", activeCount),
		zap.Int64("total_lines_collected", totalLines),
		zap.Duration("uptime", time.Since(bc.startTime)),
		zap.Duration("oldest_stream_age", time.Since(oldestStream)),
		zap.Duration("newest_stream_age", time.Since(newestStream)))
}

// parseLogLine parses a raw log line from Kubernetes into a LogEntry
// This is the same as the original implementation
func (bc *BackgroundCollector) parseLogLine(line string, pod *corev1.Pod, containerName string) *LogEntry {
	// Kubernetes log format: "2023-09-07T16:36:20.123456789Z log message here"
	parts := strings.SplitN(line, " ", 2)
	if len(parts) < 2 {
		// No timestamp, treat whole line as message
		return &LogEntry{
			TS:        time.Now(),
			Level:     "INFO",
			Cluster:   bc.clusterName,
			Namespace: pod.Namespace,
			Workload:  bc.getWorkloadName(pod),
			Pod:       pod.Name,
			Container: containerName,
			Node:      pod.Spec.NodeName,
			Msg:       line,
			Labels:    pod.Labels,
		}
	}

	// Parse timestamp
	timestampStr := parts[0]
	message := parts[1]

	ts, err := time.Parse(time.RFC3339Nano, timestampStr)
	if err != nil {
		ts = time.Now()
	}

	// Try to detect log level from the message
	level := bc.detectLogLevel(message)

	return &LogEntry{
		TS:        ts,
		Level:     level,
		Cluster:   bc.clusterName,
		Namespace: pod.Namespace,
		Workload:  bc.getWorkloadName(pod),
		Pod:       pod.Name,
		Container: containerName,
		Node:      pod.Spec.NodeName,
		Msg:       message,
		Labels:    pod.Labels,
	}
}

// getWorkloadName extracts the workload name from pod labels
func (bc *BackgroundCollector) getWorkloadName(pod *corev1.Pod) string {
	if workload, exists := pod.Labels["app"]; exists {
		return workload
	}
	if workload, exists := pod.Labels["app.kubernetes.io/name"]; exists {
		return workload
	}
	if workload, exists := pod.Labels["k8s-app"]; exists {
		return workload
	}

	// If no workload label found, derive from pod name
	name := pod.Name
	if strings.Contains(name, "-") {
		parts := strings.Split(name, "-")
		if len(parts) > 1 {
			return strings.Join(parts[:len(parts)-1], "-")
		}
	}

	return name
}

// detectLogLevel tries to detect the log level from the message content
func (bc *BackgroundCollector) detectLogLevel(message string) string {
	upperMsg := strings.ToUpper(message)

	if strings.Contains(upperMsg, "ERROR") || strings.Contains(upperMsg, "FATAL") || strings.Contains(upperMsg, "PANIC") {
		return "ERROR"
	}
	if strings.Contains(upperMsg, "WARN") {
		return "WARN"
	}
	if strings.Contains(upperMsg, "DEBUG") || strings.Contains(upperMsg, "TRACE") {
		return "DEBUG"
	}

	return "INFO"
}

// GetStats returns current collector statistics
func (bc *BackgroundCollector) GetStats() BackgroundCollectorStats {
	bc.containerStreamsMu.RLock()
	defer bc.containerStreamsMu.RUnlock()

	totalLines := int64(0)
	for _, stream := range bc.containerStreams {
		totalLines += stream.lineCount
	}

	return BackgroundCollectorStats{
		ActiveStreams:  len(bc.containerStreams),
		TotalLinesRead: totalLines,
		UptimeSeconds:  int64(time.Since(bc.startTime).Seconds()),
		Version:        "v2-event-driven",
	}
}

// BackgroundCollectorStats holds statistics about the collector
type BackgroundCollectorStats struct {
	ActiveStreams  int    `json:"active_streams"`
	TotalLinesRead int64  `json:"total_lines_read"`
	UptimeSeconds  int64  `json:"uptime_seconds"`
	Version        string `json:"version"`
}
