package actions

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap/zaptest"
)

func TestJobPersistenceToDisk(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create temporary directory for test
	tempDir, err := os.MkdirTemp("", "job_persistence_test")
	assert.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create persistence manager
	persistence := NewJobPersistence(tempDir, logger)

	// Create a test job
	job := NewJob("test")
	job.UpdateStatus("Test step 1")
	job.UpdateStatus("Test step 2")
	job.SetComplete()

	// Save job to disk
	err = persistence.SaveJob(job)
	assert.NoError(t, err)

	// Verify file was created
	expectedFile := filepath.Join(tempDir, "job_"+job.ID+".json")
	_, err = os.Stat(expectedFile)
	assert.NoError(t, err, "Job file should be created")

	// Load jobs from disk
	loadedJobs, err := persistence.LoadJobs()
	assert.NoError(t, err)
	assert.Len(t, loadedJobs, 1, "Should load one job")

	// Verify loaded job matches original
	loadedJob, exists := loadedJobs[job.ID]
	assert.True(t, exists, "Loaded job should exist")
	assert.Equal(t, job.ID, loadedJob.ID)
	assert.Equal(t, job.Type, loadedJob.Type)
	assert.Equal(t, job.Status, loadedJob.Status)
	assert.Equal(t, len(job.Progress), len(loadedJob.Progress))
}

func TestJobPersistenceCleanup(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create temporary directory for test
	tempDir, err := os.MkdirTemp("", "job_cleanup_test")
	assert.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create persistence manager
	persistence := NewJobPersistence(tempDir, logger)

	// Create an old completed job
	oldJob := NewJob("old_test")
	oldJob.SetComplete()
	// Manually set an old start time
	oldJob.StartTime = time.Now().Add(-25 * time.Hour)

	// Save the old job
	err = persistence.SaveJob(oldJob)
	assert.NoError(t, err)

	// Create a recent job
	newJob := NewJob("new_test")
	newJob.UpdateStatus("Recent job")

	// Save the new job
	err = persistence.SaveJob(newJob)
	assert.NoError(t, err)

	// Load jobs - old job should be filtered out during load
	loadedJobs, err := persistence.LoadJobs()
	assert.NoError(t, err)

	// Should only have the new job (old completed job should be filtered)
	assert.Len(t, loadedJobs, 1, "Should only load recent jobs")

	_, hasOldJob := loadedJobs[oldJob.ID]
	_, hasNewJob := loadedJobs[newJob.ID]

	assert.False(t, hasOldJob, "Old completed job should be filtered out")
	assert.True(t, hasNewJob, "New job should be loaded")
}

func TestJobTrackerWithPersistence(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create temporary directory for test
	tempDir, err := os.MkdirTemp("", "job_tracker_persistence_test")
	assert.NoError(t, err)
	defer os.RemoveAll(tempDir)

	// Create first tracker and enable persistence
	tracker1 := NewJobTracker(logger)
	err = tracker1.EnablePersistence(tempDir)
	assert.NoError(t, err)

	// Create a job
	job := tracker1.CreateJob("persistent test job", "test")
	job.UpdateStatus("Step 1")
	job.UpdateStatus("Step 2")
	job.SetComplete()

	// Allow time for async save
	time.Sleep(50 * time.Millisecond)

	// Create second tracker and enable persistence (simulating restart)
	tracker2 := NewJobTracker(logger)
	err = tracker2.EnablePersistence(tempDir)
	assert.NoError(t, err)

	// Job should be restored
	restoredJob, exists := tracker2.GetJob(job.ID)
	assert.True(t, exists, "Job should be restored after restart")
	assert.Equal(t, job.ID, restoredJob.ID)
	assert.Equal(t, job.Type, restoredJob.Type)
	assert.Equal(t, job.Status, restoredJob.Status)
	assert.Equal(t, JobStatusCompleted, restoredJob.Status)
}
