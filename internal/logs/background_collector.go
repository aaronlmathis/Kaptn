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
	"k8s.io/client-go/kubernetes"
)

// BackgroundCollector continuously collects logs from all pods in the cluster
// and ingests them into the logs cache service
type BackgroundCollector struct {
	logger       *zap.Logger
	kubeClient   kubernetes.Interface
	logsService  *Service
	config       BackgroundCollectorConfig
	stopCh       chan struct{}
	podStreams   map[string]context.CancelFunc // pod key -> cancel function
	podStreamsMu sync.RWMutex
	wg           sync.WaitGroup // Track running goroutines
	clusterName  string
}

// BackgroundCollectorConfig configures the background log collection
type BackgroundCollectorConfig struct {
	Enabled   bool
	Retention time.Duration
	Interval  time.Duration
	TailLines int64
}

// NewBackgroundCollector creates a new background log collector
func NewBackgroundCollector(logger *zap.Logger, kubeClient kubernetes.Interface, logsService *Service, clusterName string, config BackgroundCollectorConfig) *BackgroundCollector {

	return &BackgroundCollector{
		logger:      logger.Named("background-collector"),
		kubeClient:  kubeClient,
		logsService: logsService,
		config:      config,
		stopCh:      make(chan struct{}),
		podStreams:  make(map[string]context.CancelFunc),
		clusterName: clusterName,
	}
}

// Start begins background log collection
func (bc *BackgroundCollector) Start(ctx context.Context) error {
	bc.logger.Info("Background collector Start() called",
		zap.Bool("enabled", bc.config.Enabled))

	if !bc.config.Enabled {
		bc.logger.Info("Background log collection is disabled")
		return nil
	}

	// Start the main collection loop
	bc.wg.Add(1) // Track main collection loop
	go func() {
		defer bc.wg.Done() // Mark main loop as finished
		bc.collectLogs(ctx)
	}()

	return nil
}

// Stop stops background log collection and waits for all goroutines to finish
func (bc *BackgroundCollector) Stop() {
	bc.logger.Info("Stopping background log collection")

	close(bc.stopCh)

	// Cancel all active pod streams
	bc.podStreamsMu.Lock()
	for podKey, cancel := range bc.podStreams {
		bc.logger.Debug("Canceling pod stream", zap.String("pod", podKey))
		cancel()
	}
	bc.podStreams = make(map[string]context.CancelFunc)
	bc.podStreamsMu.Unlock()

	// Wait for all goroutines to finish with timeout
	bc.logger.Info("Waiting for all log collection goroutines to finish...")
	done := make(chan struct{})
	go func() {
		bc.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		bc.logger.Info("All log collection goroutines have finished")
	case <-time.After(10 * time.Second):
		bc.logger.Warn("Timeout waiting for log collection goroutines to finish, proceeding with shutdown")
	}
}

// collectLogs is the main collection loop
func (bc *BackgroundCollector) collectLogs(ctx context.Context) {

	ticker := time.NewTicker(bc.config.Interval)
	defer ticker.Stop()

	// Initial collection
	bc.discoverAndCollectPods(ctx)

	for {
		select {
		case <-ticker.C:

			bc.discoverAndCollectPods(ctx)
		case <-bc.stopCh:
			bc.logger.Info("Stop signal received, exiting collection loop")
			return
		case <-ctx.Done():
			bc.logger.Info("Context cancelled, exiting collection loop")
			return
		}
	}
}

// discoverAndCollectPods discovers all pods and starts log collection
func (bc *BackgroundCollector) discoverAndCollectPods(ctx context.Context) {
	bc.logger.Info("Discovering pods for log collection")

	// List all pods in all namespaces
	pods, err := bc.kubeClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		FieldSelector: "status.phase=Running", // Only collect from running pods
	})
	if err != nil {
		bc.logger.Error("[ERROR] Failed to list pods", zap.Error(err))
		return
	}

	// Track active pods
	activePods := make(map[string]bool)

	runningCount := 0
	for _, pod := range pods.Items {
		if pod.Status.Phase == corev1.PodRunning {
			runningCount++
		}
		podKey := fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)
		activePods[podKey] = true

		// Check if we're already collecting from this pod
		bc.podStreamsMu.RLock()
		_, exists := bc.podStreams[podKey]
		bc.podStreamsMu.RUnlock()

		if !exists {
			// Start collecting from this pod
			bc.logger.Debug("Starting new pod collection", zap.String("pod", podKey))
			bc.startPodCollection(ctx, &pod)
		}
	}

	// Stop collection from pods that no longer exist
	bc.podStreamsMu.Lock()
	for podKey, cancel := range bc.podStreams {
		if !activePods[podKey] {
			bc.logger.Debug("Pod no longer exists, stopping collection", zap.String("pod", podKey))
			cancel()
			delete(bc.podStreams, podKey)
		}
	}
	bc.podStreamsMu.Unlock()
}

// startPodCollection starts log collection for a single pod
func (bc *BackgroundCollector) startPodCollection(ctx context.Context, pod *corev1.Pod) {
	podKey := fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)

	bc.logger.Debug("Starting log collection for pod",
		zap.String("pod", podKey),
		zap.Int("containers", len(pod.Spec.Containers)))

	// Create a cancellable context for this pod
	podCtx, cancel := context.WithCancel(ctx)

	// Store the cancel function
	bc.podStreamsMu.Lock()
	bc.podStreams[podKey] = cancel
	bc.podStreamsMu.Unlock()

	// Start collection for each container in the pod
	for _, container := range pod.Spec.Containers {
		bc.wg.Add(1) // Track this goroutine
		go func(containerName string) {
			defer bc.wg.Done() // Mark goroutine as finished
			bc.collectContainerLogs(podCtx, pod, containerName)
		}(container.Name)
	}
}

// collectContainerLogs collects logs from a specific container
func (bc *BackgroundCollector) collectContainerLogs(ctx context.Context, pod *corev1.Pod, containerName string) {
	podKey := fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)
	containerKey := fmt.Sprintf("%s/%s", podKey, containerName)

	// Prepare log request options
	logOptions := &corev1.PodLogOptions{
		Container:  containerName,
		Follow:     true,
		Timestamps: true,
		TailLines:  &bc.config.TailLines,
	}

	// Get the log stream
	req := bc.kubeClient.CoreV1().Pods(pod.Namespace).GetLogs(pod.Name, logOptions)
	stream, err := req.Stream(ctx)
	if err != nil {
		// Check if this is due to context cancellation (expected during shutdown)
		if ctx.Err() != nil {
			bc.logger.Debug("Log stream creation canceled due to context cancellation",
				zap.String("container", containerKey),
				zap.Error(err))
		} else {
			bc.logger.Error("Failed to open log stream",
				zap.String("container", containerKey),
				zap.Error(err))
		}
		return
	}
	defer stream.Close()

	// Read log lines and ingest them
	scanner := bufio.NewScanner(stream)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024) // 1MB max line size

	lineCount := 0
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			bc.logger.Info("Context canceled, stopping log collection",
				zap.String("container", containerKey),
				zap.Int("lines_processed", lineCount))
			return
		default:
		}

		line := scanner.Text()
		if line == "" {
			continue
		}

		lineCount++
		if lineCount%100 == 0 {
			// Log progress every 100 lines (optional)
		}

		// Parse the log entry
		entry := bc.parseLogLine(line, pod, containerName)
		if entry != nil {
			// Ingest into the cache
			bc.logsService.Ingest(*entry)
		}
	}

	if err := scanner.Err(); err != nil {
		// Check if this is due to context cancellation (expected during shutdown)
		if ctx.Err() != nil {
			bc.logger.Debug("Log stream ended due to context cancellation",
				zap.String("container", containerKey),
				zap.Error(err))
		} else {
			bc.logger.Error("Error reading log stream",
				zap.String("container", containerKey),
				zap.Error(err))
		}
	}

	bc.logger.Debug("Log stream ended", zap.String("container", containerKey))
}

// parseLogLine parses a raw log line from Kubernetes into a LogEntry
func (bc *BackgroundCollector) parseLogLine(line string, pod *corev1.Pod, containerName string) *LogEntry {
	// Kubernetes log format: "2023-09-07T16:36:20.123456789Z log message here"
	parts := strings.SplitN(line, " ", 2)
	if len(parts) < 2 {
		// No timestamp, treat whole line as message
		return &LogEntry{
			TS:        time.Now(),
			Level:     "INFO", // Default level
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
		// If timestamp parsing fails, use current time
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
	// Try various common workload labels
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
	// Strip common suffixes like hash/random strings
	name := pod.Name
	if strings.Contains(name, "-") {
		parts := strings.Split(name, "-")
		if len(parts) > 1 {
			// Take all but the last part (which is usually a hash)
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

	// Default to INFO
	return "INFO"
}
