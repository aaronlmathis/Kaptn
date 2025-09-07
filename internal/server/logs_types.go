package server

import (
	"time"

	k8slogs "github.com/aaronlmathis/kaptn/internal/k8s/logs"
)

// StartLogStreamRequest represents the request to start a coordinated log stream
type StartLogStreamRequest struct {
	// Pod selection criteria
	Selector k8slogs.PodSelector `json:"selector"`

	// Stream options
	Container    string `json:"container,omitempty"`    // Specific container, empty for all
	SinceSeconds *int64 `json:"sinceSeconds,omitempty"` // Time window for historical logs
	TailLines    *int64 `json:"tailLines,omitempty"`    // Number of recent lines to include
	Follow       bool   `json:"follow"`                 // Whether to follow new logs
	Timestamps   bool   `json:"timestamps"`             // Whether to include timestamps
	Previous     bool   `json:"previous"`               // Whether to get previous container logs
}

// StartLogStreamResponse represents the response when starting a log stream
type StartLogStreamResponse struct {
	StreamID     string    `json:"streamId"`
	StartedAt    time.Time `json:"startedAt"`
	PodCount     int       `json:"podCount"`     // Number of pods currently being streamed
	WebSocketURL string    `json:"websocketUrl"` // URL to connect WebSocket for live streaming
}

// StopLogStreamResponse represents the response when stopping a log stream
type StopLogStreamResponse struct {
	StreamID  string    `json:"streamId"`
	StoppedAt time.Time `json:"stoppedAt"`
	Success   bool      `json:"success"`
}

// LogStreamStatus represents the status of an active log stream
type LogStreamStatus struct {
	StreamID  string              `json:"streamId"`
	Selector  k8slogs.PodSelector `json:"selector"`
	StartedAt time.Time           `json:"startedAt"`
	PodCount  int                 `json:"podCount"`
	IsActive  bool                `json:"isActive"`
}

// ListLogStreamsResponse represents the response for listing active streams
type ListLogStreamsResponse struct {
	Streams []LogStreamStatus `json:"streams"`
	Total   int               `json:"total"`
}
