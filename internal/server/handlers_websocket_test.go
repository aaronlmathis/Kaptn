package server

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/logs"
	logsInternal "github.com/aaronlmathis/kaptn/internal/logs"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestBuildLogFilterFromRequest(t *testing.T) {
	logger := zap.NewNop()
	server := &Server{logger: logger}

	selector := logs.PodSelector{
		Namespace: "test-namespace",
	}

	tests := []struct {
		name     string
		query    string
		expected logsInternal.LogFilter
	}{
		{
			name:  "default parameters",
			query: "",
			expected: logsInternal.LogFilter{
				Namespace: "test-namespace",
				Limit:     1000,
				Direction: "backward",
				Since:     time.Now().Add(-10 * time.Minute), // Will be approximately this
			},
		},
		{
			name:  "with levels and workload",
			query: "levels=ERROR,WARN&workload=test-app",
			expected: logsInternal.LogFilter{
				Namespace: "test-namespace",
				Workload:  "test-app",
				Levels:    []string{"ERROR", "WARN"},
				Limit:     1000,
				Direction: "backward",
			},
		},
		{
			name:  "with text search and limit",
			query: "q=error+message&limit=500&direction=forward",
			expected: logsInternal.LogFilter{
				Namespace: "test-namespace",
				Text:      "error message",
				Limit:     500,
				Direction: "forward",
			},
		},
		{
			name:  "with pod and since duration",
			query: "pod=test-pod-123&since=5m",
			expected: logsInternal.LogFilter{
				Namespace: "test-namespace",
				Pod:       "test-pod-123",
				Limit:     1000,
				Direction: "backward",
				Since:     time.Now().Add(-5 * time.Minute), // Will be approximately this
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create request with query parameters
			req := httptest.NewRequest("GET", "/api/v1/stream/logs/test-stream?"+tt.query, nil)

			filter := server.buildLogFilterFromRequest(req, selector)

			assert.Equal(t, tt.expected.Namespace, filter.Namespace)
			assert.Equal(t, tt.expected.Workload, filter.Workload)
			assert.Equal(t, tt.expected.Pod, filter.Pod)
			assert.Equal(t, tt.expected.Text, filter.Text)
			assert.Equal(t, tt.expected.Levels, filter.Levels)
			assert.Equal(t, tt.expected.Limit, filter.Limit)
			assert.Equal(t, tt.expected.Direction, filter.Direction)

			// For time-based tests, check that Since is within a reasonable range
			if strings.Contains(tt.query, "since=5m") {
				expectedSince := time.Now().Add(-5 * time.Minute)
				timeDiff := filter.Since.Sub(expectedSince)
				assert.True(t, timeDiff < time.Second && timeDiff > -time.Second, "Since time should be close to expected")
			} else if tt.query == "" {
				// Default case
				expectedSince := time.Now().Add(-10 * time.Minute)
				timeDiff := filter.Since.Sub(expectedSince)
				assert.True(t, timeDiff < time.Second && timeDiff > -time.Second, "Default since time should be close to expected")
			}
		})
	}
}

func TestValidateLogStreamAccess(t *testing.T) {
	logger := zap.NewNop()
	server := &Server{logger: logger}

	// Test that the method exists and doesn't panic
	// In Phase 6, this will be enhanced with actual RBAC logic
	req := httptest.NewRequest("GET", "/api/v1/stream/logs/test-stream", nil)
	selector := logs.PodSelector{Namespace: "default"}

	err := server.validateLogStreamAccess(req, selector)
	assert.NoError(t, err, "Should allow access for now (Phase 6 will implement real RBAC)")
}

func TestWebSocketMessageTypes(t *testing.T) {
	// Test that we can properly structure WebSocket messages for logs

	// Test initial backfill message
	backfillEntries := []logsInternal.LogEntry{
		{
			TS:        time.Now(),
			Level:     "INFO",
			Namespace: "default",
			Pod:       "test-pod",
			Msg:       "Test message",
		},
	}

	backfillMsg := map[string]interface{}{
		"type": "logs.init",
		"data": backfillEntries,
	}

	msgBytes, err := json.Marshal(backfillMsg)
	require.NoError(t, err)

	var parsed map[string]interface{}
	err = json.Unmarshal(msgBytes, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "logs.init", parsed["type"])
	assert.NotNil(t, parsed["data"])

	// Test live log message
	liveEntry := logsInternal.LogEntry{
		TS:        time.Now(),
		Level:     "ERROR",
		Namespace: "default",
		Pod:       "test-pod",
		Msg:       "Error occurred",
	}

	liveMsg := map[string]interface{}{
		"type": "logs",
		"data": liveEntry,
	}

	msgBytes, err = json.Marshal(liveMsg)
	require.NoError(t, err)

	err = json.Unmarshal(msgBytes, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "logs", parsed["type"])
	assert.NotNil(t, parsed["data"])

	// Test degraded mode message
	degradedMsg := map[string]interface{}{
		"type":     "logs",
		"data":     liveEntry,
		"degraded": true,
	}

	msgBytes, err = json.Marshal(degradedMsg)
	require.NoError(t, err)

	err = json.Unmarshal(msgBytes, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "logs", parsed["type"])
	assert.True(t, parsed["degraded"].(bool))
}

func TestStartLogStreamRequestValidation(t *testing.T) {
	tests := []struct {
		name        string
		request     StartLogStreamRequest
		expectValid bool
	}{
		{
			name: "valid request with namespace",
			request: StartLogStreamRequest{
				Selector: logs.PodSelector{
					Namespace: "default",
				},
				Follow: true,
			},
			expectValid: true,
		},
		{
			name: "valid request with multiple namespaces",
			request: StartLogStreamRequest{
				Selector: logs.PodSelector{
					Namespaces: []string{"default", "kube-system"},
				},
				Follow: true,
			},
			expectValid: true,
		},
		{
			name: "invalid request - no namespace",
			request: StartLogStreamRequest{
				Selector: logs.PodSelector{},
				Follow:   true,
			},
			expectValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hasNamespace := tt.request.Selector.Namespace != "" || len(tt.request.Selector.Namespaces) > 0
			assert.Equal(t, tt.expectValid, hasNamespace, "Namespace validation should match expected")
		})
	}
}

func TestWebSocketHandlerParameterExtraction(t *testing.T) {
	// Test that URL parameters are correctly extracted

	testStreamID := "test-stream-123"

	// Create request with URL parameter
	req := httptest.NewRequest("GET", "/api/v1/stream/logs/"+testStreamID, nil)

	// Set up chi context for URL parameter
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("streamId", testStreamID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	// Extract parameter
	extractedStreamID := chi.URLParam(req, "streamId")
	assert.Equal(t, testStreamID, extractedStreamID, "Stream ID should be correctly extracted")
}

func TestLogFilterTimeHandling(t *testing.T) {
	logger := zap.NewNop()
	server := &Server{logger: logger}

	selector := logs.PodSelector{Namespace: "default"}

	tests := []struct {
		name          string
		sinceParam    string
		expectDefault bool
	}{
		{
			name:          "no since parameter",
			sinceParam:    "",
			expectDefault: true,
		},
		{
			name:          "duration format",
			sinceParam:    "5m",
			expectDefault: false,
		},
		{
			name:          "RFC3339 format",
			sinceParam:    time.Now().Add(-30 * time.Minute).Format(time.RFC3339),
			expectDefault: false,
		},
		{
			name:          "invalid format falls back to default",
			sinceParam:    "invalid-time",
			expectDefault: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			query := ""
			if tt.sinceParam != "" {
				query = "since=" + tt.sinceParam
			}

			req := httptest.NewRequest("GET", "/api/v1/stream/logs/test?"+query, nil)
			filter := server.buildLogFilterFromRequest(req, selector)

			if tt.expectDefault {
				// Should be approximately 10 minutes ago
				expectedDefault := time.Now().Add(-10 * time.Minute)
				timeDiff := filter.Since.Sub(expectedDefault)
				assert.True(t, timeDiff < time.Second && timeDiff > -time.Second,
					"Should use default time of 10 minutes ago")
			} else if tt.sinceParam == "5m" {
				// Should be approximately 5 minutes ago
				expected := time.Now().Add(-5 * time.Minute)
				timeDiff := filter.Since.Sub(expected)
				assert.True(t, timeDiff < time.Second && timeDiff > -time.Second,
					"Should parse duration correctly")
			}
		})
	}
}
