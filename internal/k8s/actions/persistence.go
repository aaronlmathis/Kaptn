package actions

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"go.uber.org/zap"
)

// JobPersistence handles saving and loading jobs to/from disk
type JobPersistence struct {
	storePath string
	logger    *zap.Logger
	mu        sync.RWMutex
}

// PersistentJobData represents job data that can be persisted to disk
type PersistentJobData struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Status    JobStatus              `json:"status"`
	Progress  []string               `json:"progress"`
	Error     string                 `json:"error,omitempty"`
	StartTime time.Time              `json:"startTime"`
	EndTime   *time.Time             `json:"endTime,omitempty"`
	Details   map[string]interface{} `json:"details,omitempty"`
	SavedAt   time.Time              `json:"savedAt"`
}

// NewJobPersistence creates a new job persistence manager
func NewJobPersistence(storePath string, logger *zap.Logger) *JobPersistence {
	return &JobPersistence{
		storePath: storePath,
		logger:    logger,
	}
}

// SaveJob saves a job to disk
func (jp *JobPersistence) SaveJob(job *Job) error {
	jp.mu.Lock()
	defer jp.mu.Unlock()

	// Create store directory if it doesn't exist
	if err := os.MkdirAll(jp.storePath, 0755); err != nil {
		return fmt.Errorf("failed to create store directory: %w", err)
	}

	// Convert job to persistent data
	safeJob := job.GetSafeJob()
	persistentData := PersistentJobData{
		ID:        safeJob.ID,
		Type:      safeJob.Type,
		Status:    safeJob.Status,
		Progress:  safeJob.Progress,
		Error:     safeJob.Error,
		StartTime: safeJob.StartTime,
		EndTime:   safeJob.EndTime,
		Details:   safeJob.Details,
		SavedAt:   time.Now(),
	}

	// Marshal to JSON
	data, err := json.MarshalIndent(persistentData, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal job data: %w", err)
	}

	// Write to file
	filePath := filepath.Join(jp.storePath, fmt.Sprintf("job_%s.json", job.ID))
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write job file: %w", err)
	}

	jp.logger.Debug("Saved job to disk",
		zap.String("jobId", job.ID),
		zap.String("status", string(job.Status)),
		zap.String("filePath", filePath))

	return nil
}

// LoadJobs loads all jobs from disk
func (jp *JobPersistence) LoadJobs() (map[string]*Job, error) {
	jp.mu.RLock()
	defer jp.mu.RUnlock()

	jobs := make(map[string]*Job)

	// Check if store directory exists
	if _, err := os.Stat(jp.storePath); os.IsNotExist(err) {
		jp.logger.Info("Job store directory does not exist, starting with empty job list")
		return jobs, nil
	}

	// Read all job files
	files, err := filepath.Glob(filepath.Join(jp.storePath, "job_*.json"))
	if err != nil {
		return nil, fmt.Errorf("failed to list job files: %w", err)
	}

	loaded := 0
	skipped := 0

	for _, filePath := range files {
		job, err := jp.loadJobFromFile(filePath)
		if err != nil {
			jp.logger.Warn("Failed to load job file",
				zap.String("filePath", filePath),
				zap.Error(err))
			skipped++
			continue
		}

		// Skip jobs older than 24 hours that are completed or errored
		if (job.Status == JobStatusCompleted || job.Status == JobStatusError) &&
			time.Since(job.StartTime) > 24*time.Hour {
			jp.logger.Debug("Skipping old completed job",
				zap.String("jobId", job.ID),
				zap.Duration("age", time.Since(job.StartTime)))
			// Delete the old file
			os.Remove(filePath)
			skipped++
			continue
		}

		jobs[job.ID] = job
		loaded++
	}

	jp.logger.Info("Loaded jobs from disk",
		zap.Int("loaded", loaded),
		zap.Int("skipped", skipped))

	return jobs, nil
}

// loadJobFromFile loads a single job from a file
func (jp *JobPersistence) loadJobFromFile(filePath string) (*Job, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	var persistentData PersistentJobData
	if err := json.Unmarshal(data, &persistentData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal job data: %w", err)
	}

	// Convert back to Job
	job := &Job{
		ID:        persistentData.ID,
		Type:      persistentData.Type,
		Status:    persistentData.Status,
		Progress:  persistentData.Progress,
		Error:     persistentData.Error,
		StartTime: persistentData.StartTime,
		EndTime:   persistentData.EndTime,
		Details:   persistentData.Details,
	}

	if job.Details == nil {
		job.Details = make(map[string]interface{})
	}

	return job, nil
}

// DeleteJob removes a job file from disk
func (jp *JobPersistence) DeleteJob(jobID string) error {
	jp.mu.Lock()
	defer jp.mu.Unlock()

	filePath := filepath.Join(jp.storePath, fmt.Sprintf("job_%s.json", jobID))
	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete job file: %w", err)
	}

	jp.logger.Debug("Deleted job file", zap.String("jobId", jobID), zap.String("filePath", filePath))
	return nil
}

// CleanupOldJobs removes old job files from disk
func (jp *JobPersistence) CleanupOldJobs(maxAge time.Duration) error {
	jp.mu.Lock()
	defer jp.mu.Unlock()

	files, err := filepath.Glob(filepath.Join(jp.storePath, "job_*.json"))
	if err != nil {
		return fmt.Errorf("failed to list job files: %w", err)
	}

	removed := 0
	cutoff := time.Now().Add(-maxAge)

	for _, filePath := range files {
		info, err := os.Stat(filePath)
		if err != nil {
			continue
		}

		if info.ModTime().Before(cutoff) {
			if err := os.Remove(filePath); err != nil {
				jp.logger.Warn("Failed to remove old job file",
					zap.String("filePath", filePath),
					zap.Error(err))
			} else {
				removed++
			}
		}
	}

	if removed > 0 {
		jp.logger.Info("Cleaned up old job files", zap.Int("removed", removed))
	}

	return nil
}
