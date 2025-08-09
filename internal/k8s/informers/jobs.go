package informers

import (
	"fmt"
	"time"

	"go.uber.org/zap"
	batchv1 "k8s.io/api/batch/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// JobEventHandler handles job events and broadcasts them via WebSocket
type JobEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewJobEventHandler creates a new job event handler
func NewJobEventHandler(logger *zap.Logger, hub *ws.Hub) *JobEventHandler {
	return &JobEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles job addition events
func (h *JobEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	job, ok := obj.(*batchv1.Job)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "job"))
		return
	}

	h.logger.Info("Job added", zap.String("name", job.Name), zap.String("namespace", job.Namespace))

	// Convert to summary and broadcast
	summary := h.jobToSummary(job)
	h.hub.BroadcastToRoom("overview", "job_added", summary)
}

// OnUpdate handles job update events
func (h *JobEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newJob, ok := newObj.(*batchv1.Job)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "job"))
		return
	}

	h.logger.Info("Job updated", zap.String("name", newJob.Name), zap.String("namespace", newJob.Namespace))

	// Convert to summary and broadcast
	summary := h.jobToSummary(newJob)
	h.hub.BroadcastToRoom("overview", "job_updated", summary)
}

// OnDelete handles job deletion events
func (h *JobEventHandler) OnDelete(obj interface{}) {
	job, ok := obj.(*batchv1.Job)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "job"))
		return
	}

	h.logger.Info("Job deleted", zap.String("name", job.Name), zap.String("namespace", job.Namespace))

	// Convert to summary and broadcast
	summary := h.jobToSummary(job)
	h.hub.BroadcastToRoom("overview", "job_deleted", summary)
}

// jobToSummary converts a job to a summary representation
func (h *JobEventHandler) jobToSummary(job *batchv1.Job) map[string]interface{} {
	// Get job status - improved logic
	status := "Pending"
	var conditions []map[string]interface{}

	// Process conditions to build status
	hasCompleteCondition := false
	hasFailedCondition := false

	for _, condition := range job.Status.Conditions {
		conditionMap := map[string]interface{}{
			"type":               string(condition.Type),
			"status":             string(condition.Status),
			"reason":             condition.Reason,
			"message":            condition.Message,
			"lastTransitionTime": condition.LastTransitionTime.Time,
		}
		conditions = append(conditions, conditionMap)

		// Check for completion or failure
		if condition.Type == batchv1.JobComplete && condition.Status == "True" {
			status = "Complete"
			hasCompleteCondition = true
		} else if condition.Type == batchv1.JobFailed && condition.Status == "True" {
			status = "Failed"
			hasFailedCondition = true
		}
	}

	// If no terminal conditions, determine status from job metrics
	if !hasCompleteCondition && !hasFailedCondition {
		if job.Status.Active > 0 {
			status = "Running"
		} else if job.Status.Succeeded > 0 {
			status = "Complete" // Job succeeded but condition might not be set yet
		} else if job.Status.Failed > 0 {
			status = "Failed"
		} else {
			// Job exists but no pods created yet - check if it's stuck
			if len(job.Status.Conditions) == 0 && job.Status.Active == 0 && job.Status.Succeeded == 0 && job.Status.Failed == 0 {
				status = "Pending"
			} else {
				status = "Unknown"
			}
		}
	}

	// Calculate completions - handle different job types
	completions := "0/1" // Default
	if job.Spec.Completions != nil {
		// Regular job with specific completion count
		completions = fmt.Sprintf("%d/%d", job.Status.Succeeded, *job.Spec.Completions)
	} else {
		// Work queue job or job without completions specified
		if job.Status.Succeeded > 0 {
			completions = fmt.Sprintf("%d", job.Status.Succeeded)
		} else {
			completions = "0"
		}
	}

	// Calculate duration - only if job actually started
	duration := "-"
	if job.Status.StartTime != nil {
		if job.Status.CompletionTime != nil {
			// Job completed, show actual duration
			duration = job.Status.CompletionTime.Sub(job.Status.StartTime.Time).Round(time.Second).String()
		} else if job.Status.Active > 0 {
			// Job is running, show elapsed time
			duration = time.Since(job.Status.StartTime.Time).Round(time.Second).String()
		} else {
			// Job started but not active and not completed - might be failed or pending
			duration = time.Since(job.Status.StartTime.Time).Round(time.Second).String()
		}
	}

	// Get parallelism
	parallelism := int32(1)
	if job.Spec.Parallelism != nil {
		parallelism = *job.Spec.Parallelism
	}

	// Get backoff limit
	backoffLimit := int32(6) // Default backoff limit
	if job.Spec.BackoffLimit != nil {
		backoffLimit = *job.Spec.BackoffLimit
	}

	// Get active deadline seconds
	var activeDeadlineSeconds *int64
	if job.Spec.ActiveDeadlineSeconds != nil {
		activeDeadlineSeconds = job.Spec.ActiveDeadlineSeconds
	}

	// Get container images
	images := []string{}
	for _, container := range job.Spec.Template.Spec.Containers {
		images = append(images, container.Image)
	}

	// Get the first image or empty string for the main image field
	image := ""
	if len(images) > 0 {
		image = images[0]
	}

	return map[string]interface{}{
		"name":                  job.Name,
		"namespace":             job.Namespace,
		"status":                status,
		"completions":           completions,
		"duration":              duration,
		"image":                 image,
		"images":                images,
		"parallelism":           parallelism,
		"backoffLimit":          backoffLimit,
		"activeDeadlineSeconds": activeDeadlineSeconds,
		"conditions":            conditions,
		"labels":                job.Labels,
		"annotations":           job.Annotations,
		"creationTimestamp":     job.CreationTimestamp.Time.Format(time.RFC3339),
		"active":                job.Status.Active,
		"succeeded":             job.Status.Succeeded,
		"failed":                job.Status.Failed,
	}
}
