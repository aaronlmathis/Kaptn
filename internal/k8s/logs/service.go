package logs

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// LogEntry represents a single log line with metadata
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Line      string    `json:"line"`
	Container string    `json:"container"`
	Pod       string    `json:"pod"`
	Namespace string    `json:"namespace"`
}

// LogFilter contains filtering options for log streaming
type LogFilter struct {
	Container    string
	SinceSeconds *int64
	TailLines    *int64
	Follow       bool
	Timestamps   bool
	Previous     bool
}

// StreamManager manages active log streams
type StreamManager struct {
	logger       *zap.Logger
	kubeClient   kubernetes.Interface
	streams      map[string]*LogStream
	streamsMutex sync.RWMutex
}

// LogStream represents an active log streaming session
type LogStream struct {
	ID        string
	ctx       context.Context
	cancel    context.CancelFunc
	events    chan LogEntry
	errors    chan error
	closed    chan struct{}
	namespace string
	podName   string
	filter    LogFilter
}

// NewStreamManager creates a new log stream manager
func NewStreamManager(logger *zap.Logger, kubeClient kubernetes.Interface) *StreamManager {
	return &StreamManager{
		logger:     logger,
		kubeClient: kubeClient,
		streams:    make(map[string]*LogStream),
	}
}

// StartStream starts a new log stream for a pod
func (sm *StreamManager) StartStream(ctx context.Context, streamID, namespace, podName string, filter LogFilter) (*LogStream, error) {
	sm.streamsMutex.Lock()
	defer sm.streamsMutex.Unlock()

	// Check if stream already exists
	if existingStream, exists := sm.streams[streamID]; exists {
		existingStream.cancel()
		delete(sm.streams, streamID)
	}

	// Create new stream context
	streamCtx, cancel := context.WithCancel(ctx)

	stream := &LogStream{
		ID:        streamID,
		ctx:       streamCtx,
		cancel:    cancel,
		events:    make(chan LogEntry, 100),
		errors:    make(chan error, 10),
		closed:    make(chan struct{}),
		namespace: namespace,
		podName:   podName,
		filter:    filter,
	}

	sm.streams[streamID] = stream

	// Start streaming in background
	go sm.streamLogs(stream)

	sm.logger.Info("Started log stream",
		zap.String("streamID", streamID),
		zap.String("namespace", namespace),
		zap.String("pod", podName),
		zap.String("container", filter.Container))

	return stream, nil
}

// StopStream stops an active log stream
func (sm *StreamManager) StopStream(streamID string) {
	sm.streamsMutex.Lock()
	defer sm.streamsMutex.Unlock()

	if stream, exists := sm.streams[streamID]; exists {
		stream.cancel()
		delete(sm.streams, streamID)
		sm.logger.Info("Stopped log stream", zap.String("streamID", streamID))
	}
}

// GetStream returns an active stream by ID
func (sm *StreamManager) GetStream(streamID string) (*LogStream, bool) {
	sm.streamsMutex.RLock()
	defer sm.streamsMutex.RUnlock()

	stream, exists := sm.streams[streamID]
	return stream, exists
}

// streamLogs performs the actual log streaming
func (sm *StreamManager) streamLogs(stream *LogStream) {
	defer func() {
		close(stream.events)
		close(stream.errors)
		close(stream.closed)
	}()

	// Get pod information to determine containers
	pod, err := sm.kubeClient.CoreV1().Pods(stream.namespace).Get(stream.ctx, stream.podName, metav1.GetOptions{})
	if err != nil {
		stream.errors <- fmt.Errorf("failed to get pod: %w", err)
		return
	}

	// Determine which containers to stream logs from
	containers := []string{}
	if stream.filter.Container != "" {
		containers = append(containers, stream.filter.Container)
	} else {
		// Stream from all containers
		for _, container := range pod.Spec.Containers {
			containers = append(containers, container.Name)
		}
		// Include init containers if they're still running
		for _, initContainer := range pod.Spec.InitContainers {
			containers = append(containers, initContainer.Name)
		}
	}

	// Stream logs from each container concurrently
	var wg sync.WaitGroup
	for _, containerName := range containers {
		wg.Add(1)
		go func(container string) {
			defer wg.Done()
			sm.streamContainerLogs(stream, container)
		}(containerName)
	}

	wg.Wait()
}

// streamContainerLogs streams logs from a specific container
func (sm *StreamManager) streamContainerLogs(stream *LogStream, containerName string) {
	logOptions := &v1.PodLogOptions{
		Container:  containerName,
		Follow:     stream.filter.Follow,
		Timestamps: stream.filter.Timestamps,
		Previous:   stream.filter.Previous,
	}

	if stream.filter.SinceSeconds != nil {
		logOptions.SinceSeconds = stream.filter.SinceSeconds
	}

	if stream.filter.TailLines != nil {
		logOptions.TailLines = stream.filter.TailLines
	}

	// Get log stream
	req := sm.kubeClient.CoreV1().Pods(stream.namespace).GetLogs(stream.podName, logOptions)
	logStream, err := req.Stream(stream.ctx)
	if err != nil {
		stream.errors <- fmt.Errorf("failed to get log stream for container %s: %w", containerName, err)
		return
	}
	defer logStream.Close()

	// Read logs line by line
	scanner := bufio.NewScanner(logStream)
	for scanner.Scan() {
		select {
		case <-stream.ctx.Done():
			return
		default:
			line := scanner.Text()
			logEntry := sm.parseLogLine(line, containerName, stream.namespace, stream.podName, stream.filter.Timestamps)

			select {
			case stream.events <- logEntry:
			case <-stream.ctx.Done():
				return
			}
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		stream.errors <- fmt.Errorf("error reading logs from container %s: %w", containerName, err)
	}
}

// parseLogLine parses a log line and creates a LogEntry
func (sm *StreamManager) parseLogLine(line, container, namespace, pod string, hasTimestamp bool) LogEntry {
	entry := LogEntry{
		Container: container,
		Pod:       pod,
		Namespace: namespace,
		Timestamp: time.Now(),
	}

	if hasTimestamp {
		// Parse RFC3339Nano timestamp from Kubernetes logs
		// Format: 2023-01-01T12:00:00.123456789Z log message here
		parts := strings.SplitN(line, " ", 2)
		if len(parts) == 2 {
			if timestamp, err := time.Parse(time.RFC3339Nano, parts[0]); err == nil {
				entry.Timestamp = timestamp
				entry.Line = parts[1]
			} else {
				entry.Line = line
			}
		} else {
			entry.Line = line
		}
	} else {
		entry.Line = line
	}

	return entry
}

// Events returns the events channel for a stream
func (ls *LogStream) Events() <-chan LogEntry {
	return ls.events
}

// Errors returns the errors channel for a stream
func (ls *LogStream) Errors() <-chan error {
	return ls.errors
}

// Done returns a channel that's closed when the stream is finished
func (ls *LogStream) Done() <-chan struct{} {
	return ls.closed
}

// Cancel stops the log stream
func (ls *LogStream) Cancel() {
	ls.cancel()
}
