package logs

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"regexp"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// LogCollector implements an informer-based log collection system
// It watches for pod events and manages log streams efficiently
type LogCollector struct {
	logger      *zap.Logger
	kubeClient  kubernetes.Interface
	service     LogService
	clusterName string

	// Informer setup
	informerFactory informers.SharedInformerFactory
	podInformer     cache.SharedIndexInformer
	stopCh          chan struct{}

	// Active streams tracking
	activeStreams map[string]*PodLogStream // key: namespace/podname
	streamsMu     sync.RWMutex

	// Configuration
	config CollectorConfig

	// Lifecycle
	started bool
	startMu sync.Mutex
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup

	// Statistics
	stats CollectorStats
	mu    sync.RWMutex
}

// CollectorConfig holds configuration for the log collector
type CollectorConfig struct {
	Enabled                bool
	TailLines              int64
	MaxConcurrentStreams   int
	LogRetention           time.Duration
	StreamBufferSize       int
	RestartBackoffInterval time.Duration
	RestartMaxInterval     time.Duration
	ExcludeSystemPods      bool
	IncludeNamespaces      []string
	ExcludeNamespaces      []string
}

// PodLogStream manages logs for a single pod
type PodLogStream struct {
	namespace  string
	podName    string
	containers []string
	lastSeen   time.Time
	streams    map[string]*ContainerStream // container -> stream
	mu         sync.RWMutex
	ctx        context.Context
	cancel     context.CancelFunc
	retryCount int
	nextRetry  time.Time
}

// ContainerStream manages logs for a single container
type ContainerStream struct {
	containerName string
	stream        io.ReadCloser
	lastLine      time.Time
	lineCount     int64
}

// CollectorStats tracks collector statistics
type CollectorStats struct {
	PodsWatched       int
	ActiveStreams     int
	TotalLinesRead    int64
	RestartedStreams  int64
	FailedConnections int64
	LastEventTime     time.Time
}

// NewLogCollector creates a new log collector
func NewLogCollector(logger *zap.Logger, kubeClient kubernetes.Interface, service LogService, clusterName string, config CollectorConfig) *LogCollector {
	ctx, cancel := context.WithCancel(context.Background())

	// Set reasonable defaults
	if config.TailLines == 0 {
		config.TailLines = 100
	}
	if config.MaxConcurrentStreams == 0 {
		config.MaxConcurrentStreams = 50
	}
	if config.StreamBufferSize == 0 {
		config.StreamBufferSize = 1000
	}
	if config.RestartBackoffInterval == 0 {
		config.RestartBackoffInterval = 5 * time.Second
	}
	if config.RestartMaxInterval == 0 {
		config.RestartMaxInterval = 2 * time.Minute
	}
	if config.LogRetention == 0 {
		config.LogRetention = 1 * time.Hour
	}

	// Default exclusions for system pods
	if config.ExcludeSystemPods && len(config.ExcludeNamespaces) == 0 {
		config.ExcludeNamespaces = []string{"kube-system", "kube-public", "kube-node-lease"}
	}

	collector := &LogCollector{
		logger:        logger.Named("log-collector"),
		kubeClient:    kubeClient,
		service:       service,
		clusterName:   clusterName,
		config:        config,
		activeStreams: make(map[string]*PodLogStream),
		stopCh:        make(chan struct{}),
		ctx:           ctx,
		cancel:        cancel,
	}

	// Setup informer factory with reasonable resync period
	collector.informerFactory = informers.NewSharedInformerFactory(kubeClient, 30*time.Second)
	collector.podInformer = collector.informerFactory.Core().V1().Pods().Informer()

	// Add event handlers
	collector.podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    collector.onPodAdd,
		UpdateFunc: collector.onPodUpdate,
		DeleteFunc: collector.onPodDelete,
	})

	return collector
}

// Start starts the log collector
func (c *LogCollector) Start(ctx context.Context) error {
	c.startMu.Lock()
	defer c.startMu.Unlock()

	if c.started {
		return nil // Already started
	}

	if !c.config.Enabled {
		c.logger.Info("Log collector is disabled")
		return nil
	}

	c.logger.Info("Starting log collector",
		zap.String("cluster", c.clusterName),
		zap.Int("max_concurrent_streams", c.config.MaxConcurrentStreams),
		zap.Int64("tail_lines", c.config.TailLines))

	// Start informer
	c.informerFactory.Start(c.stopCh)

	// Wait for cache sync
	if !cache.WaitForCacheSync(c.stopCh, c.podInformer.HasSynced) {
		c.cancel()
		return fmt.Errorf("failed to sync pod informer cache")
	}

	c.logger.Info("Pod informer cache synced")

	// Start background workers
	c.wg.Add(3)
	go c.cleanupWorker()
	go c.retryWorker()
	go c.statsWorker()

	c.started = true
	c.logger.Info("Log collector started successfully")

	return nil
}

// Stop stops the log collector
func (c *LogCollector) Stop() {
	c.startMu.Lock()
	defer c.startMu.Unlock()

	if !c.started {
		return
	}

	c.logger.Info("Stopping log collector")

	// Cancel context to stop all streams
	c.cancel()

	// Stop informer
	close(c.stopCh)

	// Stop all active streams
	c.streamsMu.Lock()
	for _, stream := range c.activeStreams {
		stream.cancel()
	}
	c.activeStreams = make(map[string]*PodLogStream)
	c.streamsMu.Unlock()

	// Wait for workers to finish
	c.wg.Wait()

	c.started = false
	c.logger.Info("Log collector stopped")
}

// GetStats returns current collector statistics
func (c *LogCollector) GetStats() CollectorStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// Update active streams count
	c.streamsMu.RLock()
	c.stats.ActiveStreams = len(c.activeStreams)
	c.streamsMu.RUnlock()

	return c.stats
}

// onPodAdd handles pod addition events
func (c *LogCollector) onPodAdd(obj interface{}) {
	pod, ok := obj.(*corev1.Pod)
	if !ok {
		c.logger.Error("Failed to cast object to Pod")
		return
	}

	c.logger.Debug("Pod added",
		zap.String("namespace", pod.Namespace),
		zap.String("name", pod.Name),
		zap.String("phase", string(pod.Status.Phase)))

	// Check if we should collect logs from this pod
	if c.shouldCollectLogs(pod) {
		c.startPodLogStream(pod)
	}

	c.mu.Lock()
	c.stats.LastEventTime = time.Now()
	c.mu.Unlock()
}

// onPodUpdate handles pod update events
func (c *LogCollector) onPodUpdate(oldObj, newObj interface{}) {
	oldPod, ok1 := oldObj.(*corev1.Pod)
	newPod, ok2 := newObj.(*corev1.Pod)
	if !ok1 || !ok2 {
		c.logger.Error("Failed to cast objects to Pod")
		return
	}

	// Only care about phase changes or container restarts
	if oldPod.Status.Phase != newPod.Status.Phase || c.hasContainerRestarted(oldPod, newPod) {
		c.logger.Debug("Pod updated",
			zap.String("namespace", newPod.Namespace),
			zap.String("name", newPod.Name),
			zap.String("old_phase", string(oldPod.Status.Phase)),
			zap.String("new_phase", string(newPod.Status.Phase)))

		if c.shouldCollectLogs(newPod) {
			c.startPodLogStream(newPod)
		} else {
			c.stopPodLogStream(newPod.Namespace, newPod.Name)
		}
	}

	c.mu.Lock()
	c.stats.LastEventTime = time.Now()
	c.mu.Unlock()
}

// onPodDelete handles pod deletion events
func (c *LogCollector) onPodDelete(obj interface{}) {
	pod, ok := obj.(*corev1.Pod)
	if !ok {
		// Handle DeletedFinalStateUnknown
		if deleteState, ok := obj.(cache.DeletedFinalStateUnknown); ok {
			pod, ok = deleteState.Obj.(*corev1.Pod)
			if !ok {
				c.logger.Error("Failed to cast DeletedFinalStateUnknown object to Pod")
				return
			}
		} else {
			c.logger.Error("Failed to cast object to Pod")
			return
		}
	}

	c.logger.Debug("Pod deleted",
		zap.String("namespace", pod.Namespace),
		zap.String("name", pod.Name))

	c.stopPodLogStream(pod.Namespace, pod.Name)

	c.mu.Lock()
	c.stats.LastEventTime = time.Now()
	c.mu.Unlock()
}

// shouldCollectLogs determines if we should collect logs from a pod
func (c *LogCollector) shouldCollectLogs(pod *corev1.Pod) bool {
	// Skip if pod is not running
	if pod.Status.Phase != corev1.PodRunning {
		return false
	}

	// Check namespace exclusions
	for _, excluded := range c.config.ExcludeNamespaces {
		if pod.Namespace == excluded {
			return false
		}
	}

	// Check namespace inclusions (if specified)
	if len(c.config.IncludeNamespaces) > 0 {
		found := false
		for _, included := range c.config.IncludeNamespaces {
			if pod.Namespace == included {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Skip pods without containers
	if len(pod.Spec.Containers) == 0 {
		return false
	}

	return true
}

// hasContainerRestarted checks if any container has restarted
func (c *LogCollector) hasContainerRestarted(oldPod, newPod *corev1.Pod) bool {
	oldStatus := make(map[string]int32)
	for _, status := range oldPod.Status.ContainerStatuses {
		oldStatus[status.Name] = status.RestartCount
	}

	for _, status := range newPod.Status.ContainerStatuses {
		if oldCount, exists := oldStatus[status.Name]; exists {
			if status.RestartCount > oldCount {
				return true
			}
		}
	}

	return false
}

// startPodLogStream starts log streaming for a pod
func (c *LogCollector) startPodLogStream(pod *corev1.Pod) {
	podKey := fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)

	c.streamsMu.Lock()
	defer c.streamsMu.Unlock()

	// Check current stream count
	if len(c.activeStreams) >= c.config.MaxConcurrentStreams {
		c.logger.Warn("Maximum concurrent streams reached, skipping pod",
			zap.String("pod", podKey),
			zap.Int("max_streams", c.config.MaxConcurrentStreams))
		return
	}

	// Stop existing stream if any
	if existingStream, exists := c.activeStreams[podKey]; exists {
		existingStream.cancel()
		delete(c.activeStreams, podKey)
	}

	// Create new stream context
	ctx, cancel := context.WithCancel(c.ctx)

	// Extract container names
	containers := make([]string, 0, len(pod.Spec.Containers))
	for _, container := range pod.Spec.Containers {
		containers = append(containers, container.Name)
	}

	stream := &PodLogStream{
		namespace:  pod.Namespace,
		podName:    pod.Name,
		containers: containers,
		lastSeen:   time.Now(),
		streams:    make(map[string]*ContainerStream),
		ctx:        ctx,
		cancel:     cancel,
	}

	c.activeStreams[podKey] = stream

	c.logger.Debug("Starting pod log stream",
		zap.String("pod", podKey),
		zap.Strings("containers", containers))

	// Start streaming for each container
	c.wg.Add(1)
	go c.streamPodLogs(stream)

	c.mu.Lock()
	c.stats.PodsWatched++
	c.mu.Unlock()
}

// stopPodLogStream stops log streaming for a pod
func (c *LogCollector) stopPodLogStream(namespace, podName string) {
	podKey := fmt.Sprintf("%s/%s", namespace, podName)

	c.streamsMu.Lock()
	defer c.streamsMu.Unlock()

	if stream, exists := c.activeStreams[podKey]; exists {
		c.logger.Debug("Stopping pod log stream", zap.String("pod", podKey))
		stream.cancel()
		delete(c.activeStreams, podKey)
	}
}

// streamPodLogs streams logs for all containers in a pod
func (c *LogCollector) streamPodLogs(podStream *PodLogStream) {
	defer c.wg.Done()

	for _, containerName := range podStream.containers {
		c.wg.Add(1)
		go c.streamContainerLogs(podStream, containerName)
	}
}

// streamContainerLogs streams logs for a single container
func (c *LogCollector) streamContainerLogs(podStream *PodLogStream, containerName string) {
	defer c.wg.Done()

	for {
		select {
		case <-podStream.ctx.Done():
			return
		default:
		}

		// Check retry backoff (with proper locking)
		podStream.mu.RLock()
		shouldWait := time.Now().Before(podStream.nextRetry)
		podStream.mu.RUnlock()

		if shouldWait {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		err := c.streamSingleContainer(podStream, containerName)
		if err != nil {
			c.logger.Debug("Container log stream ended",
				zap.String("pod", fmt.Sprintf("%s/%s", podStream.namespace, podStream.podName)),
				zap.String("container", containerName),
				zap.Error(err))

			// Implement exponential backoff (with proper locking)
			podStream.mu.Lock()
			podStream.retryCount++
			backoff := time.Duration(podStream.retryCount) * c.config.RestartBackoffInterval
			if backoff > c.config.RestartMaxInterval {
				backoff = c.config.RestartMaxInterval
			}
			podStream.nextRetry = time.Now().Add(backoff)
			podStream.mu.Unlock()

			c.mu.Lock()
			c.stats.RestartedStreams++
			c.mu.Unlock()

			// Don't retry immediately
			time.Sleep(backoff)
		} else {
			// Reset retry count on successful connection (with proper locking)
			podStream.mu.Lock()
			podStream.retryCount = 0
			podStream.mu.Unlock()
		}
	}
}

// streamSingleContainer handles the actual log streaming for a container
func (c *LogCollector) streamSingleContainer(podStream *PodLogStream, containerName string) error {
	// Prepare log request options
	tailLines := c.config.TailLines
	logOptions := &corev1.PodLogOptions{
		Container:  containerName,
		Follow:     true,
		Timestamps: true,
		TailLines:  &tailLines,
	}

	// Get the log stream
	req := c.kubeClient.CoreV1().Pods(podStream.namespace).GetLogs(podStream.podName, logOptions)
	stream, err := req.Stream(podStream.ctx)
	if err != nil {
		c.mu.Lock()
		c.stats.FailedConnections++
		c.mu.Unlock()
		return fmt.Errorf("failed to open log stream: %w", err)
	}
	defer stream.Close()

	// Reset retry count on successful connection (with proper locking)
	podStream.mu.Lock()
	podStream.retryCount = 0
	podStream.mu.Unlock()

	// Create scanner for reading lines
	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024) // 1MB max line size

	// Parse log lines and forward to service
	for scanner.Scan() {
		select {
		case <-podStream.ctx.Done():
			return nil
		default:
		}

		line := scanner.Text()
		if line == "" {
			continue
		}

		// Parse the log entry
		entry := c.parseLogLine(line, podStream.namespace, podStream.podName, containerName)
		if entry != nil {
			// Ingest into service
			c.service.Ingest(*entry)

			c.mu.Lock()
			c.stats.TotalLinesRead++
			c.mu.Unlock()
		}

		// Update lastSeen with proper locking
		podStream.mu.Lock()
		podStream.lastSeen = time.Now()
		podStream.mu.Unlock()
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("scanner error: %w", err)
	}

	return nil // Stream ended normally
}

// parseLogLine parses a Kubernetes log line into a LogEntry
func (c *LogCollector) parseLogLine(line, namespace, podName, containerName string) *LogEntry {
	// Kubernetes log format: timestamp logline
	// Example: 2023-01-01T00:00:00.000000000Z log message here

	// Find the first space to separate timestamp from message
	spaceIndex := strings.Index(line, " ")
	if spaceIndex == -1 {
		// No timestamp, treat entire line as message
		return &LogEntry{
			TS:        time.Now(),
			Level:     "info", // Default level
			Cluster:   c.clusterName,
			Namespace: namespace,
			Workload:  c.extractWorkloadFromPod(podName),
			Pod:       podName,
			Container: containerName,
			Node:      "", // TODO: Get from pod spec if needed
			Msg:       line,
			Labels:    make(map[string]string),
		}
	}

	timestampStr := line[:spaceIndex]
	message := line[spaceIndex+1:]

	// Parse timestamp
	timestamp, err := time.Parse(time.RFC3339Nano, timestampStr)
	if err != nil {
		// If timestamp parsing fails, use current time
		timestamp = time.Now()
	}

	// Extract log level from message (common patterns)
	level := c.extractLogLevel(message)

	return &LogEntry{
		TS:        timestamp,
		Level:     level,
		Cluster:   c.clusterName,
		Namespace: namespace,
		Workload:  c.extractWorkloadFromPod(podName),
		Pod:       podName,
		Container: containerName,
		Node:      "", // TODO: Get from pod spec if needed
		Msg:       message,
		Labels:    make(map[string]string),
	}
}

// extractWorkloadFromPod attempts to extract workload name from pod name
func (c *LogCollector) extractWorkloadFromPod(podName string) string {
	// Common patterns for workload extraction
	patterns := []string{
		`^([^-]+)-[a-f0-9]{8,10}-[a-z0-9]{5}$`, // ReplicaSet: app-1234567890-abcde
		`^([^-]+)-[0-9]+$`,                     // StatefulSet: app-0, app-1
		`^([^-]+)-[a-z0-9]{5}$`,                // Job: job-abcde
		`^([^-]+)-\d{10}-[a-z0-9]{5}$`,         // CronJob: cronjob-1234567890-abcde
	}

	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(podName); len(matches) > 1 {
			return matches[1]
		}
	}

	// Fallback: return pod name without common suffixes
	parts := strings.Split(podName, "-")
	if len(parts) > 1 {
		return strings.Join(parts[:len(parts)-1], "-")
	}

	return podName
}

// extractLogLevel attempts to extract log level from message
func (c *LogCollector) extractLogLevel(message string) string {
	message = strings.ToLower(message)

	// Check for common log level patterns
	if strings.Contains(message, "error") || strings.Contains(message, "err") {
		return "error"
	}
	if strings.Contains(message, "warn") || strings.Contains(message, "warning") {
		return "warn"
	}
	if strings.Contains(message, "debug") {
		return "debug"
	}
	if strings.Contains(message, "info") {
		return "info"
	}
	if strings.Contains(message, "fatal") || strings.Contains(message, "panic") {
		return "fatal"
	}

	// Default to info
	return "info"
}

// cleanupWorker periodically cleans up stale streams
func (c *LogCollector) cleanupWorker() {
	defer c.wg.Done()

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-c.ctx.Done():
			return
		case <-ticker.C:
			c.cleanupStaleStreams()
		}
	}
}

// retryWorker handles retrying failed streams
func (c *LogCollector) retryWorker() {
	defer c.wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.ctx.Done():
			return
		case <-ticker.C:
			// This is mainly for monitoring - actual retries happen in streamContainerLogs
		}
	}
}

// statsWorker periodically logs statistics
func (c *LogCollector) statsWorker() {
	defer c.wg.Done()

	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-c.ctx.Done():
			return
		case <-ticker.C:
			c.logStats()
		}
	}
}

// cleanupStaleStreams removes streams that haven't seen activity
func (c *LogCollector) cleanupStaleStreams() {
	c.streamsMu.Lock()
	defer c.streamsMu.Unlock()

	cutoff := time.Now().Add(-c.config.LogRetention)
	var toRemove []string

	for podKey, stream := range c.activeStreams {
		// Read lastSeen with proper locking
		stream.mu.RLock()
		isStale := stream.lastSeen.Before(cutoff)
		stream.mu.RUnlock()

		if isStale {
			toRemove = append(toRemove, podKey)
		}
	}

	for _, podKey := range toRemove {
		if stream, exists := c.activeStreams[podKey]; exists {
			c.logger.Debug("Cleaning up stale stream", zap.String("pod", podKey))
			stream.cancel()
			delete(c.activeStreams, podKey)
		}
	}

	if len(toRemove) > 0 {
		c.logger.Info("Cleaned up stale streams", zap.Int("count", len(toRemove)))
	}
}

// logStats logs current collector statistics
func (c *LogCollector) logStats() {
	stats := c.GetStats()

	c.logger.Info("Log collector statistics",
		zap.Int("pods_watched", stats.PodsWatched),
		zap.Int("active_streams", stats.ActiveStreams),
		zap.Int64("total_lines_read", stats.TotalLinesRead),
		zap.Int64("restarted_streams", stats.RestartedStreams),
		zap.Int64("failed_connections", stats.FailedConnections),
		zap.Time("last_event", stats.LastEventTime))
}
