package actions

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	policyv1 "k8s.io/api/policy/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/client-go/kubernetes"
)

// NodeActionsService handles node operations
type NodeActionsService struct {
	client     kubernetes.Interface
	logger     *zap.Logger
	jobTracker *JobTracker
}

// NewNodeActionsService creates a new node actions service
func NewNodeActionsService(client kubernetes.Interface, logger *zap.Logger) *NodeActionsService {
	return &NodeActionsService{
		client:     client,
		logger:     logger,
		jobTracker: NewJobTracker(logger),
	}
}

// DrainOptions contains options for node drain operation
type DrainOptions struct {
	TimeoutSeconds   int  `json:"timeoutSeconds,omitempty"`
	Force            bool `json:"force,omitempty"`
	DeleteLocalData  bool `json:"deleteLocalData,omitempty"`
	IgnoreDaemonSets bool `json:"ignoreDaemonSets,omitempty"`
}

// AuditLog represents an audit log entry
type AuditLog struct {
	RequestID string                 `json:"requestId"`
	User      string                 `json:"user,omitempty"`
	Action    string                 `json:"action"`
	Resource  string                 `json:"resource"`
	Timestamp time.Time              `json:"timestamp"`
	Success   bool                   `json:"success"`
	Error     string                 `json:"error,omitempty"`
	Details   map[string]interface{} `json:"details,omitempty"`
}

// CordonNode cordons a node (makes it unschedulable)
func (s *NodeActionsService) CordonNode(ctx context.Context, requestID, user, nodeName string) error {
	audit := &AuditLog{
		RequestID: requestID,
		User:      user,
		Action:    "cordon",
		Resource:  fmt.Sprintf("node/%s", nodeName),
		Timestamp: time.Now(),
	}

	s.logger.Info("Cordoning node",
		zap.String("requestId", requestID),
		zap.String("user", user),
		zap.String("node", nodeName))

	node, err := s.client.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil {
		audit.Success = false
		audit.Error = err.Error()
		s.logAudit(audit)
		return fmt.Errorf("failed to get node %s: %w", nodeName, err)
	}

	if node.Spec.Unschedulable {
		audit.Success = true
		audit.Details = map[string]interface{}{"alreadyCordoned": true}
		s.logAudit(audit)
		return nil // Node is already cordoned
	}

	node.Spec.Unschedulable = true
	_, err = s.client.CoreV1().Nodes().Update(ctx, node, metav1.UpdateOptions{})
	if err != nil {
		audit.Success = false
		audit.Error = err.Error()
		s.logAudit(audit)
		return fmt.Errorf("failed to cordon node %s: %w", nodeName, err)
	}

	audit.Success = true
	s.logAudit(audit)
	s.logger.Info("Successfully cordoned node", zap.String("node", nodeName))
	return nil
}

// UncordonNode uncordons a node (makes it schedulable)
func (s *NodeActionsService) UncordonNode(ctx context.Context, requestID, user, nodeName string) error {
	audit := &AuditLog{
		RequestID: requestID,
		User:      user,
		Action:    "uncordon",
		Resource:  fmt.Sprintf("node/%s", nodeName),
		Timestamp: time.Now(),
	}

	s.logger.Info("Uncordoning node",
		zap.String("requestId", requestID),
		zap.String("user", user),
		zap.String("node", nodeName))

	node, err := s.client.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil {
		audit.Success = false
		audit.Error = err.Error()
		s.logAudit(audit)
		return fmt.Errorf("failed to get node %s: %w", nodeName, err)
	}

	if !node.Spec.Unschedulable {
		audit.Success = true
		audit.Details = map[string]interface{}{"alreadyUncordoned": true}
		s.logAudit(audit)
		return nil // Node is already uncordoned
	}

	node.Spec.Unschedulable = false
	_, err = s.client.CoreV1().Nodes().Update(ctx, node, metav1.UpdateOptions{})
	if err != nil {
		audit.Success = false
		audit.Error = err.Error()
		s.logAudit(audit)
		return fmt.Errorf("failed to uncordon node %s: %w", nodeName, err)
	}

	audit.Success = true
	s.logAudit(audit)
	s.logger.Info("Successfully uncordoned node", zap.String("node", nodeName))
	return nil
}

// DrainNode drains a node by evicting all pods (async operation)
func (s *NodeActionsService) DrainNode(ctx context.Context, requestID, user, nodeName string, opts DrainOptions) (string, error) {
	audit := &AuditLog{
		RequestID: requestID,
		User:      user,
		Action:    "drain",
		Resource:  fmt.Sprintf("node/%s", nodeName),
		Timestamp: time.Now(),
		Details:   map[string]interface{}{"options": opts},
	}

	s.logger.Info("Starting node drain",
		zap.String("requestId", requestID),
		zap.String("user", user),
		zap.String("node", nodeName),
		zap.Any("options", opts))

	// Set defaults
	if opts.TimeoutSeconds <= 0 {
		opts.TimeoutSeconds = 300 // 5 minutes default
	}

	// Create async job
	job := s.jobTracker.CreateJob(fmt.Sprintf("drain-node-%s", nodeName), "drain")

	// Start drain operation in background
	go func() {
		err := s.drainNodeAsync(context.Background(), job, nodeName, opts)
		if err != nil {
			audit.Success = false
			audit.Error = err.Error()
			s.logAudit(audit)
			job.SetError(err)
		} else {
			audit.Success = true
			s.logAudit(audit)
			job.SetComplete()
		}
	}()

	return job.ID, nil
}

// drainNodeAsync performs the actual drain operation
func (s *NodeActionsService) drainNodeAsync(ctx context.Context, job *Job, nodeName string, opts DrainOptions) error {
	// First, cordon the node
	err := s.CordonNode(ctx, job.ID, "", nodeName)
	if err != nil {
		return fmt.Errorf("failed to cordon node during drain: %w", err)
	}

	job.UpdateStatus("Cordoned node, getting pod list...")

	// Get all pods on the node
	fieldSelector := fields.OneTermEqualSelector("spec.nodeName", nodeName).String()
	pods, err := s.client.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		FieldSelector: fieldSelector,
	})
	if err != nil {
		return fmt.Errorf("failed to list pods on node %s: %w", nodeName, err)
	}

	job.UpdateStatus(fmt.Sprintf("Found %d pods on node", len(pods.Items)))

	// Filter pods for eviction
	var podsToEvict []v1.Pod
	skippedPods := []string{}

	for _, pod := range pods.Items {
		// Skip completed/failed pods
		if pod.Status.Phase == v1.PodSucceeded || pod.Status.Phase == v1.PodFailed {
			skippedPods = append(skippedPods, fmt.Sprintf("%s/%s (completed)", pod.Namespace, pod.Name))
			continue
		}

		// Skip DaemonSet pods (unless forced)
		if isDaemonSetPod(&pod) && !opts.Force {
			skippedPods = append(skippedPods, fmt.Sprintf("%s/%s (DaemonSet)", pod.Namespace, pod.Name))
			continue
		}

		// Skip static/mirror pods
		if isMirrorPod(&pod) {
			skippedPods = append(skippedPods, fmt.Sprintf("%s/%s (static pod)", pod.Namespace, pod.Name))
			continue
		}

		podsToEvict = append(podsToEvict, pod)
	}

	if len(skippedPods) > 0 {
		job.UpdateStatus(fmt.Sprintf("Skipping %d pods: %v", len(skippedPods), skippedPods))
	}

	if len(podsToEvict) == 0 {
		job.UpdateStatus("No pods need to be evicted")
		return nil
	}

	job.UpdateStatus(fmt.Sprintf("Evicting %d pods...", len(podsToEvict)))

	// Create timeout context
	timeoutCtx, cancel := context.WithTimeout(ctx, time.Duration(opts.TimeoutSeconds)*time.Second)
	defer cancel()

	// Evict pods
	evictedCount := 0
	errorCount := 0

	for _, pod := range podsToEvict {
		select {
		case <-timeoutCtx.Done():
			return fmt.Errorf("drain operation timed out after %d seconds", opts.TimeoutSeconds)
		default:
		}

		err := s.evictPod(timeoutCtx, &pod, opts.Force)
		if err != nil {
			s.logger.Warn("Failed to evict pod",
				zap.String("pod", fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)),
				zap.Error(err))
			errorCount++
			job.UpdateStatus(fmt.Sprintf("Failed to evict %s/%s: %v", pod.Namespace, pod.Name, err))
		} else {
			evictedCount++
			job.UpdateStatus(fmt.Sprintf("Evicted %s/%s (%d/%d)", pod.Namespace, pod.Name, evictedCount, len(podsToEvict)))
		}
	}

	if errorCount > 0 {
		return fmt.Errorf("failed to evict %d out of %d pods", errorCount, len(podsToEvict))
	}

	job.UpdateStatus(fmt.Sprintf("Successfully drained node %s (%d pods evicted)", nodeName, evictedCount))
	return nil
}

// evictPod evicts a single pod
func (s *NodeActionsService) evictPod(ctx context.Context, pod *v1.Pod, force bool) error {
	eviction := &policyv1.Eviction{
		ObjectMeta: metav1.ObjectMeta{
			Name:      pod.Name,
			Namespace: pod.Namespace,
		},
	}

	err := s.client.PolicyV1().Evictions(pod.Namespace).Evict(ctx, eviction)
	if err != nil {
		// If PDB violation and not forcing, return the error
		if !force {
			return err
		}

		// If forcing, try to delete the pod directly
		s.logger.Warn("Eviction failed, attempting force delete",
			zap.String("pod", fmt.Sprintf("%s/%s", pod.Namespace, pod.Name)),
			zap.Error(err))

		gracePeriodSeconds := int64(0)
		deleteOptions := metav1.DeleteOptions{
			GracePeriodSeconds: &gracePeriodSeconds,
		}

		return s.client.CoreV1().Pods(pod.Namespace).Delete(ctx, pod.Name, deleteOptions)
	}

	return nil
}

// GetJob returns a job by ID
func (s *NodeActionsService) GetJob(jobID string) (*JobSafe, bool) {
	return s.jobTracker.GetJob(jobID)
}

// ListJobs returns all jobs
func (s *NodeActionsService) ListJobs() []JobSafe {
	return s.jobTracker.ListJobs()
}

// logAudit logs an audit entry
func (s *NodeActionsService) logAudit(audit *AuditLog) {
	s.logger.Info("audit_log",
		zap.String("requestId", audit.RequestID),
		zap.String("user", audit.User),
		zap.String("action", audit.Action),
		zap.String("resource", audit.Resource),
		zap.Time("timestamp", audit.Timestamp),
		zap.Bool("success", audit.Success),
		zap.String("error", audit.Error),
		zap.Any("details", audit.Details))
}

// isDaemonSetPod checks if a pod is owned by a DaemonSet
func isDaemonSetPod(pod *v1.Pod) bool {
	for _, owner := range pod.OwnerReferences {
		if owner.Kind == "DaemonSet" {
			return true
		}
	}
	return false
}

// isMirrorPod checks if a pod is a static/mirror pod
func isMirrorPod(pod *v1.Pod) bool {
	_, exists := pod.Annotations[v1.MirrorPodAnnotationKey]
	return exists
}
