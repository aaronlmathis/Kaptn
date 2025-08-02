package actions

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// WebSocketBroadcaster defines the interface for broadcasting job updates
type WebSocketBroadcaster interface {
	BroadcastToRoom(room string, messageType string, data interface{})
}

// JobStatus represents the status of an async job
type JobStatus string

const (
	JobStatusRunning   JobStatus = "running"
	JobStatusCompleted JobStatus = "completed"
	JobStatusError     JobStatus = "error"
)

// JobProgressMessage represents a job progress update for WebSocket streaming
type JobProgressMessage struct {
	Type      string                 `json:"type"`
	ID        string                 `json:"id"`
	JobType   string                 `json:"jobType"`
	Status    JobStatus              `json:"status"`
	Step      string                 `json:"step,omitempty"`
	Progress  []string               `json:"progress"`
	Error     string                 `json:"error,omitempty"`
	Timestamp time.Time              `json:"timestamp"`
	Details   map[string]interface{} `json:"details,omitempty"`
}

// JobSafe represents a job without mutex (for safe copying)
type JobSafe struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Status    JobStatus              `json:"status"`
	Progress  []string               `json:"progress"`
	Error     string                 `json:"error,omitempty"`
	StartTime time.Time              `json:"startTime"`
	EndTime   *time.Time             `json:"endTime,omitempty"`
	Details   map[string]interface{} `json:"details,omitempty"`
}

// Job represents an async operation
type Job struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Status    JobStatus              `json:"status"`
	Progress  []string               `json:"progress"`
	Error     string                 `json:"error,omitempty"`
	StartTime time.Time              `json:"startTime"`
	EndTime   *time.Time             `json:"endTime,omitempty"`
	Details   map[string]interface{} `json:"details,omitempty"`
	mu        sync.RWMutex

	// WebSocket broadcasting
	broadcaster WebSocketBroadcaster

	// Persistence callback
	persistenceCallback func(*Job)
}

// NewJob creates a new job
func NewJob(jobType string) *Job {
	return &Job{
		ID:        uuid.New().String(),
		Type:      jobType,
		Status:    JobStatusRunning,
		Progress:  []string{},
		StartTime: time.Now(),
		Details:   make(map[string]interface{}),
	}
}

// SetBroadcaster sets the WebSocket broadcaster for this job
func (j *Job) SetBroadcaster(broadcaster WebSocketBroadcaster) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.broadcaster = broadcaster
}

// broadcastUpdate sends a job progress update via WebSocket
func (j *Job) broadcastUpdate(step string) {
	if j.broadcaster == nil {
		return
	}

	// Create progress message
	message := JobProgressMessage{
		Type:      "jobProgress",
		ID:        j.ID,
		JobType:   j.Type,
		Status:    j.Status,
		Step:      step,
		Progress:  make([]string, len(j.Progress)),
		Error:     j.Error,
		Timestamp: time.Now(),
		Details:   make(map[string]interface{}),
	}

	// Copy progress and details safely
	copy(message.Progress, j.Progress)
	for k, v := range j.Details {
		message.Details[k] = v
	}

	// Broadcast to job-specific room
	j.broadcaster.BroadcastToRoom("job:"+j.ID, "jobProgress", message)
}

// UpdateStatus adds a progress update to the job
func (j *Job) UpdateStatus(message string) {
	j.mu.Lock()
	timestampedMessage := fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), message)
	j.Progress = append(j.Progress, timestampedMessage)
	j.mu.Unlock()

	// Broadcast update (outside of lock to avoid deadlock)
	j.broadcastUpdate(message)

	// Trigger persistence save
	j.triggerPersistenceSave()
}

// SetError marks the job as failed with an error
func (j *Job) SetError(err error) {
	j.mu.Lock()
	j.Status = JobStatusError
	j.Error = err.Error()
	now := time.Now()
	j.EndTime = &now
	j.mu.Unlock()

	// Broadcast final update
	j.broadcastUpdate("Job failed: " + err.Error())

	// Trigger persistence save
	j.triggerPersistenceSave()
}

// SetComplete marks the job as completed successfully
func (j *Job) SetComplete() {
	j.mu.Lock()
	j.Status = JobStatusCompleted
	now := time.Now()
	j.EndTime = &now
	j.mu.Unlock()

	// Broadcast final update
	j.broadcastUpdate("Job completed successfully")

	// Trigger persistence save
	j.triggerPersistenceSave()
}

// triggerPersistenceSave notifies that this job should be saved to disk
// This is implemented as a callback mechanism to avoid circular dependencies
func (j *Job) triggerPersistenceSave() {
	if j.persistenceCallback != nil {
		j.persistenceCallback(j)
	}
}

// GetSafeJob returns a copy of the job for safe reading
func (j *Job) GetSafeJob() JobSafe {
	j.mu.RLock()
	defer j.mu.RUnlock()

	// Create a copy to avoid race conditions
	jobCopy := JobSafe{
		ID:        j.ID,
		Type:      j.Type,
		Status:    j.Status,
		Error:     j.Error,
		StartTime: j.StartTime,
		Details:   make(map[string]interface{}),
	}

	if j.EndTime != nil {
		endTime := *j.EndTime
		jobCopy.EndTime = &endTime
	}

	// Copy progress slice
	jobCopy.Progress = make([]string, len(j.Progress))
	copy(jobCopy.Progress, j.Progress)

	// Copy details map
	for k, v := range j.Details {
		jobCopy.Details[k] = v
	}

	return jobCopy
}

// JobTracker manages async jobs
type JobTracker struct {
	jobs        map[string]*Job
	mu          sync.RWMutex
	logger      *zap.Logger
	broadcaster WebSocketBroadcaster
	persistence *JobPersistence
}

// NewJobTracker creates a new job tracker
func NewJobTracker(logger *zap.Logger) *JobTracker {
	tracker := &JobTracker{
		jobs:   make(map[string]*Job),
		logger: logger,
	}

	// Start cleanup routine
	go tracker.cleanupRoutine()

	return tracker
}

// EnablePersistence enables job persistence to disk
func (jt *JobTracker) EnablePersistence(storePath string) error {
	jt.mu.Lock()
	defer jt.mu.Unlock()

	// Initialize persistence
	jt.persistence = NewJobPersistence(storePath, jt.logger)

	// Load existing jobs from disk
	persistedJobs, err := jt.persistence.LoadJobs()
	if err != nil {
		return fmt.Errorf("failed to load persisted jobs: %w", err)
	}

	// Add loaded jobs to tracker
	for jobID, job := range persistedJobs {
		// Set broadcaster if available
		if jt.broadcaster != nil {
			job.SetBroadcaster(jt.broadcaster)
		}
		// Set persistence callback
		job.persistenceCallback = jt.saveJobToDisk

		jt.jobs[jobID] = job

		jt.logger.Info("Restored job from persistence",
			zap.String("jobId", jobID),
			zap.String("type", job.Type),
			zap.String("status", string(job.Status)))
	}

	jt.logger.Info("Job persistence enabled",
		zap.String("storePath", storePath),
		zap.Int("restoredJobs", len(persistedJobs)))

	return nil
}

// saveJobToDisk saves a job to persistent storage if persistence is enabled
func (jt *JobTracker) saveJobToDisk(job *Job) {
	if jt.persistence == nil {
		return
	}

	go func() {
		if err := jt.persistence.SaveJob(job); err != nil {
			jt.logger.Error("Failed to save job to disk",
				zap.String("jobId", job.ID),
				zap.Error(err))
		}
	}()
}

// SetBroadcaster sets the WebSocket broadcaster for job updates
func (jt *JobTracker) SetBroadcaster(broadcaster WebSocketBroadcaster) {
	jt.mu.Lock()
	defer jt.mu.Unlock()
	jt.broadcaster = broadcaster

	// Set broadcaster for all existing jobs
	for _, job := range jt.jobs {
		job.SetBroadcaster(broadcaster)
	}
}

// CreateJob creates a new job and returns its ID
func (jt *JobTracker) CreateJob(description, jobType string) *Job {
	job := NewJob(jobType)

	// Set broadcaster if available
	jt.mu.RLock()
	if jt.broadcaster != nil {
		job.SetBroadcaster(jt.broadcaster)
	}
	jt.mu.RUnlock()

	// Set persistence callback
	job.persistenceCallback = jt.saveJobToDisk

	job.UpdateStatus(fmt.Sprintf("Job created: %s", description))

	jt.mu.Lock()
	jt.jobs[job.ID] = job
	jt.mu.Unlock()

	jt.logger.Info("Created new job",
		zap.String("jobId", job.ID),
		zap.String("type", jobType),
		zap.String("description", description))

	return job
}

// GetJob retrieves a job by ID
func (jt *JobTracker) GetJob(jobID string) (*JobSafe, bool) {
	jt.mu.RLock()
	job, exists := jt.jobs[jobID]
	jt.mu.RUnlock()

	if !exists {
		return nil, false
	}

	// Return a safe copy
	safeCopy := job.GetSafeJob()
	return &safeCopy, true
}

// ListJobs returns all jobs (for debugging/admin purposes)
func (jt *JobTracker) ListJobs() []JobSafe {
	jt.mu.RLock()
	defer jt.mu.RUnlock()

	jobs := make([]JobSafe, 0, len(jt.jobs))
	for _, job := range jt.jobs {
		jobs = append(jobs, job.GetSafeJob())
	}

	return jobs
}

// cleanupRoutine periodically removes old completed jobs
func (jt *JobTracker) cleanupRoutine() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		jt.cleanup()
	}
}

// cleanup removes jobs older than 1 hour that are completed or errored
func (jt *JobTracker) cleanup() {
	jt.mu.Lock()
	defer jt.mu.Unlock()

	cutoff := time.Now().Add(-1 * time.Hour)
	removed := 0

	for jobID, job := range jt.jobs {
		job.mu.RLock()
		shouldRemove := (job.Status == JobStatusCompleted || job.Status == JobStatusError) &&
			(job.EndTime != nil && job.EndTime.Before(cutoff))
		job.mu.RUnlock()

		if shouldRemove {
			delete(jt.jobs, jobID)
			removed++
		}
	}

	if removed > 0 {
		jt.logger.Info("Cleaned up old jobs", zap.Int("removed", removed))
	}
}
