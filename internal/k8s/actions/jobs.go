package actions

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// JobStatus represents the status of an async job
type JobStatus string

const (
	JobStatusRunning   JobStatus = "running"
	JobStatusCompleted JobStatus = "completed"
	JobStatusError     JobStatus = "error"
)

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

// UpdateStatus adds a progress update to the job
func (j *Job) UpdateStatus(message string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Progress = append(j.Progress, fmt.Sprintf("[%s] %s", time.Now().Format("15:04:05"), message))
}

// SetError marks the job as failed with an error
func (j *Job) SetError(err error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = JobStatusError
	j.Error = err.Error()
	now := time.Now()
	j.EndTime = &now
}

// SetComplete marks the job as completed successfully
func (j *Job) SetComplete() {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.Status = JobStatusCompleted
	now := time.Now()
	j.EndTime = &now
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
	jobs   map[string]*Job
	mu     sync.RWMutex
	logger *zap.Logger
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

// CreateJob creates a new job and returns its ID
func (jt *JobTracker) CreateJob(description, jobType string) *Job {
	job := NewJob(jobType)
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
