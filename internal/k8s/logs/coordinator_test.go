package logs

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"

	"github.com/aaronlmathis/kaptn/internal/logs"
)

// MockLogService is a mock implementation of the LogService interface
type MockLogService struct {
	mock.Mock
}

func (m *MockLogService) Start(ctx context.Context) error {
	args := m.Called(ctx)
	return args.Error(0)
}

func (m *MockLogService) Ingest(e logs.LogEntry) {
	m.Called(e)
}

func (m *MockLogService) Replay(f logs.LogFilter) []logs.LogEntry {
	args := m.Called(f)
	return args.Get(0).([]logs.LogEntry)
}

func (m *MockLogService) Stream(f logs.LogFilter) (<-chan logs.LogEntry, func()) {
	args := m.Called(f)
	return args.Get(0).(<-chan logs.LogEntry), args.Get(1).(func())
}

func (m *MockLogService) Stop() {
	m.Called()
}

func (m *MockLogService) Stats() logs.ServiceStats {
	args := m.Called()
	return args.Get(0).(logs.ServiceStats)
}

func (m *MockLogService) Health() logs.HealthStatus {
	args := m.Called()
	return args.Get(0).(logs.HealthStatus)
}

// MockWebSocketHub is a mock implementation of the WebSocketBroadcaster interface
type MockWebSocketHub struct {
	mock.Mock
}

func (m *MockWebSocketHub) BroadcastToRoom(room string, messageType string, data interface{}) {
	m.Called(room, messageType, data)
}

func TestStreamCoordinator_StartCoordinatedStream(t *testing.T) {
	logger := zap.NewNop()
	kubeClient := fake.NewSimpleClientset()
	mockLogService := &MockLogService{}
	mockWSHub := &MockWebSocketHub{}

	coordinator := NewStreamCoordinator(logger, kubeClient, mockLogService, mockWSHub, "test-cluster")

	// Test starting a coordinated stream
	selector := PodSelector{
		Namespace: "default",
		LabelSelector: map[string]string{
			"app": "test-app",
		},
	}
	filter := LogFilter{
		Follow:     true,
		Timestamps: true,
	}

	ctx := context.Background()
	streamID := "test-stream"

	err := coordinator.StartCoordinatedStream(ctx, streamID, selector, filter)
	assert.NoError(t, err)

	// Verify stream is tracked
	activeStreams := coordinator.GetActiveStreams()
	assert.Contains(t, activeStreams, streamID)
	assert.Equal(t, selector, activeStreams[streamID])

	// Clean up
	coordinator.StopCoordinatedStream(streamID)
}

func TestStreamCoordinator_PodWatchingAndStreaming(t *testing.T) {
	logger := zap.NewNop()
	kubeClient := fake.NewSimpleClientset()
	mockLogService := &MockLogService{}
	mockWSHub := &MockWebSocketHub{}

	// Set up expectations for log ingestion
	mockLogService.On("Ingest", mock.AnythingOfType("logs.LogEntry")).Return()
	mockWSHub.On("BroadcastToRoom", mock.AnythingOfType("string"), "logs", mock.AnythingOfType("logs.LogEntry")).Return()

	coordinator := NewStreamCoordinator(logger, kubeClient, mockLogService, mockWSHub, "test-cluster")

	// Create a test pod
	pod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-pod",
			Namespace: "default",
			Labels: map[string]string{
				"app": "test-app",
			},
			OwnerReferences: []metav1.OwnerReference{
				{
					Kind:       "ReplicaSet",
					Name:       "test-app-1234567890",
					Controller: &[]bool{true}[0],
				},
			},
		},
		Spec: v1.PodSpec{
			NodeName: "test-node",
			Containers: []v1.Container{
				{Name: "test-container"},
			},
		},
		Status: v1.PodStatus{
			Phase: v1.PodRunning,
		},
	}

	// Set up watch reactor to simulate pod events
	watchlist := watch.NewFake()
	kubeClient.PrependWatchReactor("pods", k8stesting.DefaultWatchReactor(watchlist, nil))

	// Start coordinated stream
	selector := PodSelector{
		Namespace: "default",
		LabelSelector: map[string]string{
			"app": "test-app",
		},
	}
	filter := LogFilter{
		Follow:     true,
		Timestamps: true,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	streamID := "test-stream"
	err := coordinator.StartCoordinatedStream(ctx, streamID, selector, filter)
	assert.NoError(t, err)

	// Give the watcher time to start
	time.Sleep(100 * time.Millisecond)

	// Add pod to trigger watch event
	watchlist.Add(pod)

	// Give time for pod stream to be processed
	time.Sleep(200 * time.Millisecond)

	// Verify pod count
	podCount := coordinator.GetStreamPodCount(streamID)
	assert.Equal(t, 1, podCount)

	// Clean up
	coordinator.StopCoordinatedStream(streamID)
}

func TestResolveWorkload(t *testing.T) {
	logger := zap.NewNop()
	kubeClient := fake.NewSimpleClientset()
	mockLogService := &MockLogService{}
	mockWSHub := &MockWebSocketHub{}

	coordinator := NewStreamCoordinator(logger, kubeClient, mockLogService, mockWSHub, "test-cluster")

	tests := []struct {
		name     string
		pod      *v1.Pod
		expected string
	}{
		{
			name: "Deployment via ReplicaSet",
			pod: &v1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name: "test-pod",
					OwnerReferences: []metav1.OwnerReference{
						{
							Kind:       "ReplicaSet",
							Name:       "my-app-1234567890",
							Controller: &[]bool{true}[0],
						},
					},
				},
			},
			expected: "my-app",
		},
		{
			name: "StatefulSet",
			pod: &v1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name: "test-pod",
					OwnerReferences: []metav1.OwnerReference{
						{
							Kind:       "StatefulSet",
							Name:       "my-statefulset",
							Controller: &[]bool{true}[0],
						},
					},
				},
			},
			expected: "my-statefulset",
		},
		{
			name: "DaemonSet",
			pod: &v1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name: "test-pod",
					OwnerReferences: []metav1.OwnerReference{
						{
							Kind:       "DaemonSet",
							Name:       "my-daemonset",
							Controller: &[]bool{true}[0],
						},
					},
				},
			},
			expected: "my-daemonset",
		},
		{
			name: "No owner reference",
			pod: &v1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name: "standalone-pod",
				},
			},
			expected: "standalone-pod",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := coordinator.resolveWorkload(tt.pod)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestExtractLogLevel(t *testing.T) {
	logger := zap.NewNop()
	kubeClient := fake.NewSimpleClientset()
	mockLogService := &MockLogService{}
	mockWSHub := &MockWebSocketHub{}

	coordinator := NewStreamCoordinator(logger, kubeClient, mockLogService, mockWSHub, "test-cluster")

	tests := []struct {
		message  string
		expected string
	}{
		{"ERROR: Something went wrong", "ERROR"},
		{"2023-01-01T12:00:00Z INFO Starting application", "INFO"},
		{"[WARN] Configuration issue detected", "WARN"},
		{"DEBUG: Processing request", "DEBUG"},
		{"This is a regular message", "INFO"}, // Default
		{"fatal error occurred", "FATAL"},
		{"trace: entering function", "TRACE"},
	}

	for _, tt := range tests {
		t.Run(tt.message, func(t *testing.T) {
			result := coordinator.extractLogLevel(tt.message)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestNormalizeLogEntry(t *testing.T) {
	logger := zap.NewNop()
	kubeClient := fake.NewSimpleClientset()
	mockLogService := &MockLogService{}
	mockWSHub := &MockWebSocketHub{}

	coordinator := NewStreamCoordinator(logger, kubeClient, mockLogService, mockWSHub, "test-cluster")

	// Create test k8s log entry
	k8sEntry := LogEntry{
		Timestamp: time.Now(),
		Line:      "ERROR: Test error message",
		Container: "test-container",
		Pod:       "test-pod",
		Namespace: "default",
	}

	// Create test pod
	pod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-pod",
			Namespace: "default",
			Labels: map[string]string{
				"app":     "test-app",
				"version": "v1.0",
			},
		},
		Spec: v1.PodSpec{
			NodeName: "test-node",
		},
	}

	workload := "test-app"
	clusterName := "test-cluster"

	normalized := coordinator.normalizeLogEntry(k8sEntry, pod, workload, clusterName)

	assert.Equal(t, k8sEntry.Timestamp, normalized.TS)
	assert.Equal(t, "ERROR", normalized.Level)
	assert.Equal(t, clusterName, normalized.Cluster)
	assert.Equal(t, k8sEntry.Namespace, normalized.Namespace)
	assert.Equal(t, workload, normalized.Workload)
	assert.Equal(t, k8sEntry.Pod, normalized.Pod)
	assert.Equal(t, k8sEntry.Container, normalized.Container)
	assert.Equal(t, "test-node", normalized.Node)
	assert.Equal(t, k8sEntry.Line, normalized.Msg)
	assert.Equal(t, pod.Labels, normalized.Labels)
}

func TestFindLastDashBeforeHash(t *testing.T) {
	tests := []struct {
		name     string
		rsName   string
		expected int
	}{
		{
			name:     "Valid ReplicaSet name",
			rsName:   "my-app-1234567890",
			expected: 6,
		},
		{
			name:     "ReplicaSet with multiple dashes",
			rsName:   "my-complex-app-name-abcd123456",
			expected: 19,
		},
		{
			name:     "Short name",
			rsName:   "app-123",
			expected: -1,
		},
		{
			name:     "No dash",
			rsName:   "app1234567890",
			expected: -1,
		},
		{
			name:     "Hash with special chars",
			rsName:   "my-app-abc@def123",
			expected: -1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := findLastDashBeforeHash(tt.rsName)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsAlphanumeric(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"abc123", true},
		{"ABC123", true},
		{"1234567890", true},
		{"abcDEF", true},
		{"abc@123", false},
		{"abc-123", false},
		{"abc_123", false},
		{"", true}, // Edge case: empty string
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := isAlphanumeric(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// Integration test to verify the full flow
func TestStreamCoordinator_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	logger := zap.NewNop()
	kubeClient := fake.NewSimpleClientset()
	mockLogService := &MockLogService{}
	mockWSHub := &MockWebSocketHub{}

	// Set up expectations
	mockLogService.On("Ingest", mock.AnythingOfType("logs.LogEntry")).Return()
	mockWSHub.On("BroadcastToRoom", mock.AnythingOfType("string"), "logs", mock.AnythingOfType("logs.LogEntry")).Return()

	coordinator := NewStreamCoordinator(logger, kubeClient, mockLogService, mockWSHub, "test-cluster")

	// Start multiple streams
	ctx := context.Background()

	// Stream 1: default namespace, app=web
	err := coordinator.StartCoordinatedStream(ctx, "stream-1", PodSelector{
		Namespace:     "default",
		LabelSelector: map[string]string{"app": "web"},
	}, LogFilter{Follow: true, Timestamps: true})
	assert.NoError(t, err)

	// Stream 2: kube-system namespace, all pods
	err = coordinator.StartCoordinatedStream(ctx, "stream-2", PodSelector{
		Namespace: "kube-system",
	}, LogFilter{Follow: true, Timestamps: true})
	assert.NoError(t, err)

	// Verify both streams are active
	activeStreams := coordinator.GetActiveStreams()
	assert.Len(t, activeStreams, 2)
	assert.Contains(t, activeStreams, "stream-1")
	assert.Contains(t, activeStreams, "stream-2")

	// Stop one stream
	coordinator.StopCoordinatedStream("stream-1")

	// Verify only one stream remains
	activeStreams = coordinator.GetActiveStreams()
	assert.Len(t, activeStreams, 1)
	assert.Contains(t, activeStreams, "stream-2")

	// Clean up
	coordinator.StopCoordinatedStream("stream-2")

	activeStreams = coordinator.GetActiveStreams()
	assert.Len(t, activeStreams, 0)
}
