package actions

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap/zaptest"
)

// mockWebSocketBroadcaster for testing
type mockWebSocketBroadcaster struct {
	messages []broadcastMessage
}

type broadcastMessage struct {
	room        string
	messageType string
	data        interface{}
}

func (m *mockWebSocketBroadcaster) BroadcastToRoom(room string, messageType string, data interface{}) {
	m.messages = append(m.messages, broadcastMessage{
		room:        room,
		messageType: messageType,
		data:        data,
	})
}

func TestJobWebSocketStreaming(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create job tracker
	tracker := NewJobTracker(logger)

	// Create mock broadcaster
	mockBroadcaster := &mockWebSocketBroadcaster{
		messages: []broadcastMessage{},
	}

	// Set broadcaster
	tracker.SetBroadcaster(mockBroadcaster)

	// Create a job
	job := tracker.CreateJob("test streaming job", "test")

	// Update job status - should trigger broadcast
	job.UpdateStatus("Step 1: Starting")
	job.UpdateStatus("Step 2: Processing")

	// Complete the job
	job.SetComplete()

	// Allow some time for async operations
	time.Sleep(10 * time.Millisecond)

	// Verify broadcasts were sent
	assert.GreaterOrEqual(t, len(mockBroadcaster.messages), 3, "Should have at least 3 broadcast messages")

	// Check that all messages are for the correct job room
	expectedRoom := "job:" + job.ID
	for _, msg := range mockBroadcaster.messages {
		assert.Equal(t, expectedRoom, msg.room, "Message should be sent to correct job room")
		assert.Equal(t, "jobProgress", msg.messageType, "Message type should be jobProgress")

		// Verify message structure
		if progressMsg, ok := msg.data.(JobProgressMessage); ok {
			assert.Equal(t, job.ID, progressMsg.ID, "Message should contain correct job ID")
			assert.Equal(t, "test", progressMsg.JobType, "Message should contain correct job type")
		}
	}

	// Verify final status is completed
	finalMsg := mockBroadcaster.messages[len(mockBroadcaster.messages)-1]
	if progressMsg, ok := finalMsg.data.(JobProgressMessage); ok {
		assert.Equal(t, JobStatusCompleted, progressMsg.Status, "Final message should show completed status")
	}
}

func TestJobPersistenceCallback(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create job tracker
	tracker := NewJobTracker(logger)

	// Track persistence calls by creating a custom job
	persistenceCalls := 0
	job := tracker.CreateJob("test persistence", "test")

	// Replace the persistence callback to count calls
	job.persistenceCallback = func(j *Job) {
		persistenceCalls++
	}

	// Update job - should trigger persistence
	job.UpdateStatus("Test update")
	job.SetComplete()

	// Allow time for async operations
	time.Sleep(10 * time.Millisecond)

	// Verify persistence was called
	assert.GreaterOrEqual(t, persistenceCalls, 2, "Persistence should be called for updates and completion")
}
