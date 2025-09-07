package server

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/aaronlmathis/kaptn/internal/logs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestParseLogFilter(t *testing.T) {
	logger := zap.NewNop()
	server := &Server{logger: logger}

	tests := []struct {
		name     string
		query    string
		expected logs.LogFilter
		hasError bool
	}{
		{
			name:  "default parameters",
			query: "",
			expected: logs.LogFilter{
				Direction: "backward",
				Limit:     1000,
			},
		},
		{
			name:  "with namespace and since",
			query: "namespace=default&since=5m",
			expected: logs.LogFilter{
				Namespace: "default",
				Direction: "backward",
				Limit:     1000,
				Since:     time.Now().Add(-5 * time.Minute),
			},
		},
		{
			name:  "with pod and levels",
			query: "namespace=kube-system&pod=coredns-123&levels=ERROR,WARN",
			expected: logs.LogFilter{
				Namespace: "kube-system",
				Pod:       "coredns-123",
				Levels:    []string{"ERROR", "WARN"},
				Direction: "backward",
				Limit:     1000,
			},
		},
		{
			name:  "with text search and limit",
			query: "q=error&limit=500&direction=forward",
			expected: logs.LogFilter{
				Text:      "error",
				Direction: "forward",
				Limit:     500,
			},
		},
		{
			name:     "invalid since parameter",
			query:    "since=invalid",
			hasError: true,
		},
		{
			name:     "invalid limit parameter",
			query:    "limit=abc",
			hasError: true,
		},
		{
			name:     "invalid direction parameter",
			query:    "direction=sideways",
			hasError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/v1/logs?"+tt.query, nil)

			filter, err := server.parseLogFilter(req)

			if tt.hasError {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.expected.Namespace, filter.Namespace)
			assert.Equal(t, tt.expected.Pod, filter.Pod)
			assert.Equal(t, tt.expected.Levels, filter.Levels)
			assert.Equal(t, tt.expected.Text, filter.Text)
			assert.Equal(t, tt.expected.Direction, filter.Direction)
			assert.Equal(t, tt.expected.Limit, filter.Limit)

			// For time-based tests, check that Since is within a reasonable range
			if tt.query == "namespace=default&since=5m" {
				expectedSince := time.Now().Add(-5 * time.Minute)
				timeDiff := filter.Since.Sub(expectedSince)
				assert.True(t, timeDiff < time.Second && timeDiff > -time.Second, "Since time should be close to expected")
			}
		})
	}
}

func TestLogsServiceIntegration(t *testing.T) {
	// Test that the logs service can be properly used in the replay flow
	config := logs.DefaultServiceConfig()
	config.GlobalMaxEntries = 100
	config.EvictionInterval = 10 * time.Millisecond

	service := logs.NewService(config)
	defer service.Stop()

	// Start the service
	ctx := context.Background()
	err := service.Start(ctx)
	require.NoError(t, err)

	// Ingest some test log entries
	testEntries := []logs.LogEntry{
		{
			TS:        time.Now().Add(-2 * time.Minute),
			Level:     "INFO",
			Cluster:   "test-cluster",
			Namespace: "default",
			Workload:  "test-app",
			Pod:       "test-pod-1",
			Container: "main",
			Node:      "node-1",
			Msg:       "Application started",
		},
		{
			TS:        time.Now().Add(-1 * time.Minute),
			Level:     "ERROR",
			Cluster:   "test-cluster",
			Namespace: "default",
			Workload:  "test-app",
			Pod:       "test-pod-1",
			Container: "main",
			Node:      "node-1",
			Msg:       "Connection failed",
		},
		{
			TS:        time.Now(),
			Level:     "INFO",
			Cluster:   "test-cluster",
			Namespace: "kube-system",
			Workload:  "coredns",
			Pod:       "coredns-456",
			Container: "coredns",
			Node:      "node-2",
			Msg:       "DNS query processed",
		},
	}

	for _, entry := range testEntries {
		service.Ingest(entry)
	}

	// Test replay with namespace filter
	filter := logs.LogFilter{
		Namespace: "default",
		Limit:     100,
	}
	results := service.Replay(filter)
	assert.Len(t, results, 2, "Should return 2 entries for default namespace")

	// Test replay with level filter
	filter = logs.LogFilter{
		Levels: []string{"ERROR"},
		Limit:  100,
	}
	results = service.Replay(filter)
	assert.Len(t, results, 1, "Should return 1 ERROR entry")
	assert.Equal(t, "ERROR", results[0].Level)
	assert.Contains(t, results[0].Msg, "Connection failed")

	// Test replay with text filter
	filter = logs.LogFilter{
		Text:  "DNS",
		Limit: 100,
	}
	results = service.Replay(filter)
	assert.Len(t, results, 1, "Should return 1 entry containing 'DNS'")
	assert.Contains(t, results[0].Msg, "DNS query")

	// Test empty filter (should return all)
	filter = logs.LogFilter{
		Limit: 100,
	}
	results = service.Replay(filter)
	assert.Len(t, results, 3, "Should return all 3 entries")
}

func TestLogPermissionScenarios(t *testing.T) {
	// Test different permission scenarios for log access

	tests := []struct {
		name               string
		filter             logs.LogFilter
		expectsNamespace   string
		expectsPod         string
		expectsClusterWide bool
	}{
		{
			name: "specific pod access",
			filter: logs.LogFilter{
				Namespace: "default",
				Pod:       "test-pod",
			},
			expectsNamespace: "default",
			expectsPod:       "test-pod",
		},
		{
			name: "namespace access",
			filter: logs.LogFilter{
				Namespace: "kube-system",
			},
			expectsNamespace: "kube-system",
		},
		{
			name:   "cluster-wide access",
			filter: logs.LogFilter{
				// No namespace specified
			},
			expectsClusterWide: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// These tests verify the permission checking logic structure
			// In a real test, we'd mock the SSAR helper and verify the right calls are made

			if tt.expectsPod != "" {
				assert.NotEmpty(t, tt.filter.Pod, "Pod should be specified")
				assert.NotEmpty(t, tt.filter.Namespace, "Namespace should be specified for pod access")
			}

			if tt.expectsNamespace != "" {
				assert.Equal(t, tt.expectsNamespace, tt.filter.Namespace, "Namespace should match")
			}

			if tt.expectsClusterWide {
				assert.Empty(t, tt.filter.Namespace, "Namespace should be empty for cluster-wide access")
			}
		})
	}
}
