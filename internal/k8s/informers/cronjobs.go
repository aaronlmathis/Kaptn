package informers

import (
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	"go.uber.org/zap"
	batchv1 "k8s.io/api/batch/v1"
)

// CronJobEventHandler handles cronjob events and broadcasts via WebSocket
type CronJobEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewCronJobEventHandler creates a new cronjob event handler
func NewCronJobEventHandler(logger *zap.Logger, hub *ws.Hub) *CronJobEventHandler {
	return &CronJobEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles cronjob addition events
func (h *CronJobEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	cronJob, ok := obj.(*batchv1.CronJob)
	if !ok {
		h.logger.Error("Failed to cast object to CronJob")
		return
	}

	h.logger.Debug("CronJob added", zap.String("name", cronJob.Name), zap.String("namespace", cronJob.Namespace))

	summary := h.cronJobToSummary(cronJob)
	h.hub.BroadcastToRoom("overview", "cronjobs_added", summary)
}

// OnUpdate handles cronjob update events
func (h *CronJobEventHandler) OnUpdate(oldObj, newObj interface{}) {
	cronJob, ok := newObj.(*batchv1.CronJob)
	if !ok {
		h.logger.Error("Failed to cast object to CronJob")
		return
	}

	h.logger.Debug("CronJob updated", zap.String("name", cronJob.Name), zap.String("namespace", cronJob.Namespace))

	summary := h.cronJobToSummary(cronJob)
	h.hub.BroadcastToRoom("overview", "cronjobs_updated", summary)
}

// OnDelete handles cronjob deletion events
func (h *CronJobEventHandler) OnDelete(obj interface{}) {
	cronJob, ok := obj.(*batchv1.CronJob)
	if !ok {
		h.logger.Error("Failed to cast object to CronJob")
		return
	}

	h.logger.Debug("CronJob deleted", zap.String("name", cronJob.Name), zap.String("namespace", cronJob.Namespace))

	// Broadcast deletion event with basic identifiers
	h.hub.BroadcastToRoom("overview", "cronjobs_deleted", map[string]string{
		"name":      cronJob.Name,
		"namespace": cronJob.Namespace,
	})
}

// cronJobToSummary converts a Kubernetes CronJob to summary format
func (h *CronJobEventHandler) cronJobToSummary(cronJob *batchv1.CronJob) map[string]interface{} {
	// Get schedule information
	schedule := cronJob.Spec.Schedule

	// Get suspend status
	suspended := cronJob.Spec.Suspend != nil && *cronJob.Spec.Suspend

	// Get job history limits
	successfulJobsHistoryLimit := int32(3) // default
	if cronJob.Spec.SuccessfulJobsHistoryLimit != nil {
		successfulJobsHistoryLimit = *cronJob.Spec.SuccessfulJobsHistoryLimit
	}

	failedJobsHistoryLimit := int32(1) // default
	if cronJob.Spec.FailedJobsHistoryLimit != nil {
		failedJobsHistoryLimit = *cronJob.Spec.FailedJobsHistoryLimit
	}

	// Get last execution information
	var lastScheduleTime *time.Time
	var lastSuccessfulTime *time.Time
	if cronJob.Status.LastScheduleTime != nil {
		lastScheduleTime = &cronJob.Status.LastScheduleTime.Time
	}
	if cronJob.Status.LastSuccessfulTime != nil {
		lastSuccessfulTime = &cronJob.Status.LastSuccessfulTime.Time
	}

	// Count active jobs
	activeJobs := len(cronJob.Status.Active)

	// Determine status
	var status string
	if suspended {
		status = "Suspended"
	} else if activeJobs > 0 {
		status = "Running"
	} else {
		status = "Ready"
	}

	// Get concurrency policy
	concurrencyPolicy := string(cronJob.Spec.ConcurrencyPolicy)
	if concurrencyPolicy == "" {
		concurrencyPolicy = "Allow" // default
	}

	// Get starting deadline seconds
	var startingDeadlineSeconds *int64
	if cronJob.Spec.StartingDeadlineSeconds != nil {
		startingDeadlineSeconds = cronJob.Spec.StartingDeadlineSeconds
	}

	// Count labels and annotations
	labelsCount := len(cronJob.Labels)
	annotationsCount := len(cronJob.Annotations)

	// Get container information from job template
	containers := len(cronJob.Spec.JobTemplate.Spec.Template.Spec.Containers)
	initContainers := len(cronJob.Spec.JobTemplate.Spec.Template.Spec.InitContainers)

	result := map[string]interface{}{
		"name":                       cronJob.Name,
		"namespace":                  cronJob.Namespace,
		"creationTimestamp":          cronJob.CreationTimestamp.Format(time.RFC3339),
		"schedule":                   schedule,
		"suspended":                  suspended,
		"status":                     status,
		"activeJobs":                 activeJobs,
		"concurrencyPolicy":          concurrencyPolicy,
		"successfulJobsHistoryLimit": successfulJobsHistoryLimit,
		"failedJobsHistoryLimit":     failedJobsHistoryLimit,
		"containers":                 containers,
		"initContainers":             initContainers,
		"labelsCount":                labelsCount,
		"annotationsCount":           annotationsCount,
	}

	// Add optional fields
	if lastScheduleTime != nil {
		result["lastScheduleTime"] = lastScheduleTime.Format(time.RFC3339)
	}
	if lastSuccessfulTime != nil {
		result["lastSuccessfulTime"] = lastSuccessfulTime.Format(time.RFC3339)
	}
	if startingDeadlineSeconds != nil {
		result["startingDeadlineSeconds"] = *startingDeadlineSeconds
	}

	return result
}
