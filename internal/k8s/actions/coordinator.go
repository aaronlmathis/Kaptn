package actions

import (
	"context"
	"fmt"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s"
	"github.com/google/uuid"
	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// ActionRequest represents a request to execute an action
type ActionRequest struct {
	ID           string                 `json:"id"`
	Action       string                 `json:"action"`
	Verb         string                 `json:"verb"`
	Resource     string                 `json:"resource"`
	Namespace    string                 `json:"namespace,omitempty"`
	Name         string                 `json:"name,omitempty"`
	Targets      []TargetResource       `json:"targets,omitempty"` // For bulk operations
	Params       map[string]interface{} `json:"params,omitempty"`
	DryRun       bool                   `json:"dry_run"`
	Timeout      time.Duration          `json:"timeout,omitempty"`
	User         string                 `json:"user"`
	UserGroups   []string               `json:"user_groups,omitempty"`
	ForceConfirm bool                   `json:"force_confirm"` // User has confirmed destructive action
	Metadata     map[string]string      `json:"metadata,omitempty"`
}

// ActionResult represents the result of an action execution
type ActionResult struct {
	ID                   string                 `json:"id"`
	Action               string                 `json:"action"`
	Success              bool                   `json:"success"`
	Message              string                 `json:"message"`
	Error                string                 `json:"error,omitempty"`
	StartTime            time.Time              `json:"start_time"`
	EndTime              time.Time              `json:"end_time"`
	Duration             time.Duration          `json:"duration"`
	DryRun               bool                   `json:"dry_run"`
	ResourcesAffected    int                    `json:"resources_affected"`
	Details              map[string]interface{} `json:"details,omitempty"`
	SafetyResult         *SafetyResult          `json:"safety_result,omitempty"`
	RequiresConfirmation bool                   `json:"requires_confirmation"`
}

// ActionCoordinator coordinates action execution with safety checks, RBAC, and audit logging
type ActionCoordinator struct {
	logger             *zap.Logger
	safetyGuard        *SafetyGuard
	auditLogger        *AuditLogger
	ssarHelper         *k8s.SSARHelper
	nodeActionsService *NodeActionsService
	applyService       *ApplyService
	impersonationMgr   *k8s.ImpersonationManager
}

// NewActionCoordinator creates a new action coordinator
func NewActionCoordinator(
	logger *zap.Logger,
	safetyGuard *SafetyGuard,
	auditLogger *AuditLogger,
	ssarHelper *k8s.SSARHelper,
	nodeActionsService *NodeActionsService,
	applyService *ApplyService,
	impersonationMgr *k8s.ImpersonationManager,
) *ActionCoordinator {
	return &ActionCoordinator{
		logger:             logger,
		safetyGuard:        safetyGuard,
		auditLogger:        auditLogger,
		ssarHelper:         ssarHelper,
		nodeActionsService: nodeActionsService,
		applyService:       applyService,
		impersonationMgr:   impersonationMgr,
	}
}

// ExecuteAction executes an action with full validation and safety checks
func (ac *ActionCoordinator) ExecuteAction(ctx context.Context, req *ActionRequest, impersonatedClient kubernetes.Interface) (*ActionResult, error) {
	startTime := time.Now()

	// Generate ID if not provided
	if req.ID == "" {
		req.ID = uuid.New().String()
	}

	ac.logger.Info("Executing action",
		zap.String("request_id", req.ID),
		zap.String("action", req.Action),
		zap.String("user", req.User),
		zap.Bool("dry_run", req.DryRun))

	result := &ActionResult{
		ID:        req.ID,
		Action:    req.Action,
		StartTime: startTime,
		DryRun:    req.DryRun,
		Details:   make(map[string]interface{}),
	}

	// Step 1: RBAC Permission Check
	rbacAllowed, err := ac.checkRBACPermission(ctx, impersonatedClient, req)
	if err != nil {
		return ac.createFailureResult(result, fmt.Sprintf("RBAC check failed: %v", err), startTime), err
	}
	if !rbacAllowed {
		ac.logAuditFailure(ctx, req, "RBAC permission denied", startTime)
		return ac.createFailureResult(result, "Insufficient permissions", startTime), fmt.Errorf("RBAC permission denied")
	}

	// Step 2: Safety Validation
	var safetyResult *SafetyResult
	if len(req.Targets) > 0 {
		// Bulk operation
		safetyResult, err = ac.safetyGuard.ValidateBulkAction(ctx, impersonatedClient, req.Action, req.Verb, req.Resource, req.Targets)
	} else {
		// Single resource operation
		resourceLabels, _ := ac.getResourceLabels(ctx, impersonatedClient, req.Resource, req.Namespace, req.Name)
		safetyResult, err = ac.safetyGuard.ValidateAction(ctx, impersonatedClient, req.Action, req.Verb, req.Resource, req.Namespace, req.Name, resourceLabels)
	}

	if err != nil {
		return ac.createFailureResult(result, fmt.Sprintf("Safety check failed: %v", err), startTime), err
	}

	result.SafetyResult = safetyResult
	result.RequiresConfirmation = !safetyResult.Allowed

	// If safety check failed and not force confirmed
	if !safetyResult.Allowed && !req.ForceConfirm {
		ac.logAuditFailure(ctx, req, "Safety validation failed", startTime)
		return ac.createFailureResult(result, "Safety validation failed", startTime), fmt.Errorf("safety validation failed")
	}

	// Step 3: Execute the action
	var actionErr error
	switch req.Action {
	case "restart-pods":
		actionErr = ac.executeRestartPods(ctx, req, impersonatedClient, result)
	case "delete-pods":
		actionErr = ac.executeDeletePods(ctx, req, impersonatedClient, result)
	case "restart-deployments":
		actionErr = ac.executeRestartDeployments(ctx, req, impersonatedClient, result)
	case "scale-deployments":
		actionErr = ac.executeScaleDeployments(ctx, req, impersonatedClient, result)
	case "delete-deployments":
		actionErr = ac.executeDeleteDeployments(ctx, req, impersonatedClient, result)
	case "cordon-nodes":
		actionErr = ac.executeCordonNodes(ctx, req, impersonatedClient, result)
	case "drain-nodes":
		actionErr = ac.executeDrainNodes(ctx, req, impersonatedClient, result)
	case "delete-services":
		actionErr = ac.executeDeleteServices(ctx, req, impersonatedClient, result)
	default:
		actionErr = fmt.Errorf("unknown action: %s", req.Action)
	}

	// Finalize result
	result.EndTime = time.Now()
	result.Duration = result.EndTime.Sub(result.StartTime)
	result.Success = actionErr == nil

	if actionErr != nil {
		result.Error = actionErr.Error()
		ac.logAuditFailure(ctx, req, actionErr.Error(), startTime)
	} else {
		ac.logAuditSuccess(ctx, req, result, startTime)
	}

	return result, actionErr
}

// checkRBACPermission checks if the user has permission for the action
func (ac *ActionCoordinator) checkRBACPermission(ctx context.Context, client kubernetes.Interface, req *ActionRequest) (bool, error) {
	// For bulk operations, check permission on the first target or use a generic check
	namespace := req.Namespace
	name := req.Name

	if len(req.Targets) > 0 && req.Targets[0].Namespace != "" {
		namespace = req.Targets[0].Namespace
		name = req.Targets[0].Name
	}

	return ac.ssarHelper.CanPerformAction(ctx, client, req.Verb, "", req.Resource, namespace, name)
}

// getResourceLabels retrieves labels from a Kubernetes resource
func (ac *ActionCoordinator) getResourceLabels(ctx context.Context, client kubernetes.Interface, resource, namespace, name string) (map[string]string, error) {
	// This is a simplified implementation
	// In practice, you'd need to handle different resource types appropriately
	switch resource {
	case "pods":
		pod, err := client.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		return pod.Labels, nil
	case "deployments":
		deployment, err := client.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		return deployment.Labels, nil
	case "services":
		service, err := client.CoreV1().Services(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		return service.Labels, nil
	case "nodes":
		node, err := client.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, err
		}
		return node.Labels, nil
	default:
		return nil, nil // No labels available for unknown resource types
	}
}

// Helper methods for specific actions
func (ac *ActionCoordinator) executeRestartPods(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
	if len(req.Targets) == 0 {
		return fmt.Errorf("no targets specified for pod restart")
	}

	successCount := 0
	for _, target := range req.Targets {
		if req.DryRun {
			ac.logger.Info("DRY RUN: Would restart pod",
				zap.String("namespace", target.Namespace),
				zap.String("name", target.Name))
			successCount++
		} else {
			// Use existing NodeActionsService pattern but for pods
			err := ac.restartSinglePod(ctx, client, target.Namespace, target.Name)
			if err != nil {
				ac.logger.Error("Failed to restart pod",
					zap.String("namespace", target.Namespace),
					zap.String("name", target.Name),
					zap.Error(err))
				continue
			}
			successCount++
		}
	}

	result.ResourcesAffected = successCount
	result.Message = fmt.Sprintf("Successfully processed %d/%d pods", successCount, len(req.Targets))

	if successCount == 0 {
		return fmt.Errorf("failed to restart any pods")
	}
	return nil
}

func (ac *ActionCoordinator) executeDeletePods(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
	if len(req.Targets) == 0 {
		return fmt.Errorf("no targets specified for pod deletion")
	}

	successCount := 0
	for _, target := range req.Targets {
		if req.DryRun {
			ac.logger.Info("DRY RUN: Would delete pod",
				zap.String("namespace", target.Namespace),
				zap.String("name", target.Name))
			successCount++
		} else {
			err := client.CoreV1().Pods(target.Namespace).Delete(ctx, target.Name, metav1.DeleteOptions{})
			if err != nil {
				ac.logger.Error("Failed to delete pod",
					zap.String("namespace", target.Namespace),
					zap.String("name", target.Name),
					zap.Error(err))
				continue
			}
			successCount++
		}
	}

	result.ResourcesAffected = successCount
	result.Message = fmt.Sprintf("Successfully deleted %d/%d pods", successCount, len(req.Targets))

	if successCount == 0 {
		return fmt.Errorf("failed to delete any pods")
	}
	return nil
}

func (ac *ActionCoordinator) executeRestartDeployments(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
	// Implementation for deployment restart
	return fmt.Errorf("deployment restart not yet implemented")
}

func (ac *ActionCoordinator) executeScaleDeployments(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
	// Implementation for deployment scaling
	return fmt.Errorf("deployment scaling not yet implemented")
}

func (ac *ActionCoordinator) executeDeleteDeployments(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
	// Implementation for deployment deletion
	return fmt.Errorf("deployment deletion not yet implemented")
}

func (ac *ActionCoordinator) executeCordonNodes(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
	if len(req.Targets) == 0 {
		return fmt.Errorf("no targets specified for node cordon")
	}

	successCount := 0
	for _, target := range req.Targets {
		if req.DryRun {
			ac.logger.Info("DRY RUN: Would cordon node", zap.String("name", target.Name))
			successCount++
		} else {
			err := ac.nodeActionsService.CordonNode(ctx, req.ID, req.User, target.Name)
			if err != nil {
				ac.logger.Error("Failed to cordon node",
					zap.String("name", target.Name),
					zap.Error(err))
				continue
			}
			successCount++
		}
	}

	result.ResourcesAffected = successCount
	result.Message = fmt.Sprintf("Successfully cordoned %d/%d nodes", successCount, len(req.Targets))

	if successCount == 0 {
		return fmt.Errorf("failed to cordon any nodes")
	}
	return nil
}

func (ac *ActionCoordinator) executeDrainNodes(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
	if len(req.Targets) == 0 {
		return fmt.Errorf("no targets specified for node drain")
	}

	successCount := 0
	for _, target := range req.Targets {
		if req.DryRun {
			ac.logger.Info("DRY RUN: Would drain node", zap.String("name", target.Name))
			successCount++
		} else {
			// Use default drain options or extract from params
			drainOpts := DrainOptions{
				TimeoutSeconds:   300,
				IgnoreDaemonSets: true,
				DeleteLocalData:  true,
			}

			jobID, err := ac.nodeActionsService.DrainNode(ctx, req.ID, req.User, target.Name, drainOpts)
			if err != nil {
				ac.logger.Error("Failed to start drain for node",
					zap.String("name", target.Name),
					zap.Error(err))
				continue
			}

			// Store job ID for tracking
			if result.Details == nil {
				result.Details = make(map[string]interface{})
			}
			if result.Details["job_ids"] == nil {
				result.Details["job_ids"] = make([]string, 0)
			}
			result.Details["job_ids"] = append(result.Details["job_ids"].([]string), jobID)

			successCount++
		}
	}

	result.ResourcesAffected = successCount
	result.Message = fmt.Sprintf("Successfully started drain for %d/%d nodes", successCount, len(req.Targets))

	if successCount == 0 {
		return fmt.Errorf("failed to drain any nodes")
	}
	return nil
}

func (ac *ActionCoordinator) executeDeleteServices(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
	// Implementation for service deletion
	return fmt.Errorf("service deletion not yet implemented")
}

// Helper method to restart a single pod (delete it, let controller recreate)
func (ac *ActionCoordinator) restartSinglePod(ctx context.Context, client kubernetes.Interface, namespace, name string) error {
	return client.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// Helper methods for result handling
func (ac *ActionCoordinator) createFailureResult(result *ActionResult, errorMsg string, startTime time.Time) *ActionResult {
	result.Success = false
	result.Error = errorMsg
	result.EndTime = time.Now()
	result.Duration = result.EndTime.Sub(startTime)
	return result
}

func (ac *ActionCoordinator) logAuditSuccess(ctx context.Context, req *ActionRequest, result *ActionResult, startTime time.Time) {
	auditEntry := CreateActionAuditEntry(
		ctx, req.Action, req.Verb, req.Resource, req.Namespace, req.Name, req.User, req.UserGroups,
		true, "", result.Duration, req.DryRun, result.SafetyResult, result.Details)
	ac.auditLogger.LogAction(ctx, auditEntry)
}

func (ac *ActionCoordinator) logAuditFailure(ctx context.Context, req *ActionRequest, errorMsg string, startTime time.Time) {
	duration := time.Since(startTime)
	auditEntry := CreateActionAuditEntry(
		ctx, req.Action, req.Verb, req.Resource, req.Namespace, req.Name, req.User, req.UserGroups,
		false, errorMsg, duration, req.DryRun, nil, nil)
	ac.auditLogger.LogAction(ctx, auditEntry)
}
