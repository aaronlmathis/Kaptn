package actions

import (
    "context"
    "fmt"
    "strings"
    "time"

    "github.com/aaronlmathis/kaptn/internal/k8s"
    "github.com/google/uuid"
    "encoding/json"
    "go.uber.org/zap"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
    "k8s.io/apimachinery/pkg/runtime"
    "k8s.io/apimachinery/pkg/types"
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
    Concurrency  int                    `json:"concurrency,omitempty"`
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

    // idempotency cache for request-level dedupe
    idem *IdempotencyStore

    // concurrency limits
    defaultConcurrency int
    maxConcurrency     int
}

// NewActionCoordinator creates a new action coordinator
type CoordinatorOptions struct {
    IdempotencyTTL     time.Duration
    DefaultConcurrency int
    MaxConcurrency     int
}

func NewActionCoordinator(
    logger *zap.Logger,
    safetyGuard *SafetyGuard,
    auditLogger *AuditLogger,
    ssarHelper *k8s.SSARHelper,
    nodeActionsService *NodeActionsService,
    applyService *ApplyService,
    impersonationMgr *k8s.ImpersonationManager,
    opts *CoordinatorOptions,
) *ActionCoordinator {
    c := &ActionCoordinator{
        logger:             logger,
        safetyGuard:        safetyGuard,
        auditLogger:        auditLogger,
        ssarHelper:         ssarHelper,
        nodeActionsService: nodeActionsService,
        applyService:       applyService,
        impersonationMgr:   impersonationMgr,
    }
    // Defaults
    idemTTL := 10 * time.Minute
    defConc := 8
    maxConc := 32
    if opts != nil {
        if opts.IdempotencyTTL > 0 { idemTTL = opts.IdempotencyTTL }
        if opts.DefaultConcurrency > 0 { defConc = opts.DefaultConcurrency }
        if opts.MaxConcurrency > 0 { maxConc = opts.MaxConcurrency }
    }
    c.idem = NewIdempotencyStore(idemTTL)
    c.defaultConcurrency = defConc
    c.maxConcurrency = maxConc
    return c
}

// ExecuteAction executes an action with full validation and safety checks
func (ac *ActionCoordinator) ExecuteAction(ctx context.Context, req *ActionRequest, impersonatedClient kubernetes.Interface) (*ActionResult, error) {
    startTime := time.Now()

    // Generate ID if not provided
    if req.ID == "" {
        req.ID = uuid.New().String()
    }

    // Idempotency: return cached result when available
    if cached, ok := ac.idem.Get(req.ID); ok {
        ac.logger.Info("Idempotent replay: returning cached action result",
            zap.String("request_id", req.ID),
            zap.String("action", req.Action))
        return cached, nil
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
    case "uncordon-nodes":
        actionErr = ac.executeUncordonNodes(ctx, req, impersonatedClient, result)
    case "drain-nodes":
        actionErr = ac.executeDrainNodes(ctx, req, impersonatedClient, result)
    case "delete-services":
        actionErr = ac.executeDeleteServices(ctx, req, impersonatedClient, result)
    case "delete-configmaps":
        actionErr = ac.executeDeleteConfigMaps(ctx, req, impersonatedClient, result)
    case "delete-secrets":
        actionErr = ac.executeDeleteSecrets(ctx, req, impersonatedClient, result)
    case "edit-configmaps":
        actionErr = ac.executeEditConfigMaps(ctx, req, impersonatedClient, result)
    case "edit-secrets":
        actionErr = ac.executeEditSecrets(ctx, req, impersonatedClient, result)
    case "restart-daemonsets":
        actionErr = ac.executeRestartDaemonSets(ctx, req, impersonatedClient, result)
    case "delete-daemonsets":
        actionErr = ac.executeDeleteDaemonSets(ctx, req, impersonatedClient, result)
    case "restart-statefulsets":
        actionErr = ac.executeRestartStatefulSets(ctx, req, impersonatedClient, result)
    case "scale-statefulsets":
        actionErr = ac.executeScaleStatefulSets(ctx, req, impersonatedClient, result)
    case "delete-statefulsets":
        actionErr = ac.executeDeleteStatefulSets(ctx, req, impersonatedClient, result)
    case "suspend-cronjobs":
        actionErr = ac.executeSuspendResumeCronJobs(ctx, req, impersonatedClient, result, true)
    case "resume-cronjobs":
        actionErr = ac.executeSuspendResumeCronJobs(ctx, req, impersonatedClient, result, false)
    case "delete-cronjobs":
        actionErr = ac.executeDeleteCronJobs(ctx, req, impersonatedClient, result)
    case "export-yaml":
        actionErr = ac.executeExportYAML(ctx, req, impersonatedClient, result)
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

    // Store in idempotency cache for replays
    ac.idem.Set(req.ID, result)

    return result, actionErr
}

// runConcurrent processes targets with a bounded worker pool and per-item function.
func (ac *ActionCoordinator) runConcurrent(ctx context.Context, req *ActionRequest, targets []TargetResource, fn func(context.Context, TargetResource) error) (int, int) {
    if len(targets) == 0 {
        return 0, 0
    }
    // Determine workers with clamp
    workers := ac.clampConcurrency(req.Concurrency)
    if len(targets) < workers {
        workers = len(targets)
    }
    type res struct{ ok bool }
    jobs := make(chan TargetResource)
    results := make(chan res)

    worker := func() {
        for t := range jobs {
            err := fn(ctx, t)
            results <- res{ok: err == nil}
        }
    }

    for i := 0; i < workers; i++ {
        go worker()
    }
    go func() {
        for _, t := range targets {
            jobs <- t
        }
        close(jobs)
    }()

    succ := 0
    total := 0
    for range targets {
        r := <-results
        total++
        if r.ok {
            succ++
        }
    }
    return succ, total
}

// clampConcurrency returns the effective worker count from request or defaults
func (ac *ActionCoordinator) clampConcurrency(reqConcurrency int) int {
    if reqConcurrency <= 0 {
        return ac.defaultConcurrency
    }
    if reqConcurrency > ac.maxConcurrency {
        return ac.maxConcurrency
    }
    return reqConcurrency
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

    fn := func(ctx context.Context, target TargetResource) error {
        if req.DryRun {
            ac.logger.Info("DRY RUN: Would restart pod",
                zap.String("namespace", target.Namespace),
                zap.String("name", target.Name))
            return nil
        }
        return ac.restartSinglePod(ctx, client, target.Namespace, target.Name)
    }

    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Successfully processed %d/%d pods", succ, total)

    if succ == 0 {
        return fmt.Errorf("failed to restart any pods")
    }
    return nil
}

func (ac *ActionCoordinator) executeDeletePods(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
	if len(req.Targets) == 0 {
		return fmt.Errorf("no targets specified for pod deletion")
	}

    fn := func(ctx context.Context, target TargetResource) error {
        opts := metav1.DeleteOptions{}
        if req.DryRun { opts.DryRun = []string{"All"} }
        return client.CoreV1().Pods(target.Namespace).Delete(ctx, target.Name, opts)
    }

    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Successfully deleted %d/%d pods", succ, total)

    if succ == 0 {
        return fmt.Errorf("failed to delete any pods")
    }
    return nil
}

func (ac *ActionCoordinator) executeRestartDeployments(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    if len(req.Targets) == 0 {
        return fmt.Errorf("no targets specified for deployment restart")
    }

    annotationKey := "kubectl.kubernetes.io/restartedAt"
    ts := time.Now().Format(time.RFC3339)

    fn := func(ctx context.Context, t TargetResource) error {
        if req.DryRun {
            ac.logger.Info("DRY RUN: Would restart deployment",
                zap.String("namespace", t.Namespace), zap.String("name", t.Name))
            return nil
        }
        // Strategic merge patch to set annotation
        patch := []byte(fmt.Sprintf(`{"metadata":{"annotations":{"%s":"%s"}}}`, annotationKey, ts))
        // Use PatchOptions with dry-run if requested (handled above), field manager not required
        po := metav1.PatchOptions{}
        if req.DryRun { po.DryRun = []string{"All"} }
        _, err := client.AppsV1().Deployments(t.Namespace).Patch(ctx, t.Name, types.StrategicMergePatchType, patch, po)
        return err
    }

    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Restarted %d/%d deployments", succ, total)
    if succ == 0 {
        return fmt.Errorf("failed to restart any deployments")
    }
    return nil
}

func (ac *ActionCoordinator) executeScaleDeployments(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    replicasRaw, ok := req.Params["replicas"]
    if !ok {
        return fmt.Errorf("missing required param: replicas")
    }
    // Accept float64 from JSON decoding or int
    var replicas int32
    switch v := replicasRaw.(type) {
    case float64:
        replicas = int32(v)
    case int:
        replicas = int32(v)
    case int32:
        replicas = v
    default:
        return fmt.Errorf("invalid replicas param type")
    }
    if replicas < 0 {
        return fmt.Errorf("replicas must be >= 0")
    }

    fn := func(ctx context.Context, t TargetResource) error {
        if req.DryRun {
            ac.logger.Info("DRY RUN: Would scale deployment",
                zap.String("namespace", t.Namespace), zap.String("name", t.Name), zap.Int32("replicas", replicas))
            return nil
        }
        // Read existing scale, modify, and update with dry-run if supported
        scaleObj, err := client.AppsV1().Deployments(t.Namespace).GetScale(ctx, t.Name, metav1.GetOptions{})
        if err != nil {
            return err
        }
        scaleObj.Spec.Replicas = replicas
        uo := metav1.UpdateOptions{}
        if req.DryRun { uo.DryRun = []string{"All"} }
        _, err = client.AppsV1().Deployments(t.Namespace).UpdateScale(ctx, t.Name, scaleObj, uo)
        return err
    }

    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Scaled %d/%d deployments to %d", succ, total, replicas)
    if succ == 0 {
        return fmt.Errorf("failed to scale any deployments")
    }
    return nil
}

func (ac *ActionCoordinator) executeDeleteDeployments(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    // Optional params
    var pp *metav1.DeletionPropagation
    if v, ok := req.Params["propagationPolicy"].(string); ok {
        switch strings.ToLower(v) {
        case "foreground":
            p := metav1.DeletePropagationForeground; pp = &p
        case "background":
            p := metav1.DeletePropagationBackground; pp = &p
        case "orphan":
            p := metav1.DeletePropagationOrphan; pp = &p
        }
    }
    var gps *int64
    if v, ok := req.Params["gracePeriodSeconds"]; ok {
        switch t := v.(type) {
        case float64:
            x := int64(t); gps = &x
        case int:
            x := int64(t); gps = &x
        case int64:
            x := t; gps = &x
        }
    }
    fn := func(ctx context.Context, t TargetResource) error {
        // Build delete options
        opts := metav1.DeleteOptions{}
        if pp != nil { opts.PropagationPolicy = pp }
        if gps != nil { opts.GracePeriodSeconds = gps }
        if req.DryRun { opts.DryRun = []string{"All"} }
        return client.AppsV1().Deployments(t.Namespace).Delete(ctx, t.Name, opts)
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    if req.DryRun {
        result.Message = fmt.Sprintf("Would delete %d/%d deployments", succ, total)
    } else {
        result.Message = fmt.Sprintf("Deleted %d/%d deployments", succ, total)
    }
    if succ == 0 {
        return fmt.Errorf("failed to delete any deployments")
    }
    return nil
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

func (ac *ActionCoordinator) executeUncordonNodes(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    if len(req.Targets) == 0 {
        return fmt.Errorf("no targets specified for node uncordon")
    }

    successCount := 0
    for _, target := range req.Targets {
        if req.DryRun {
            ac.logger.Info("DRY RUN: Would uncordon node", zap.String("name", target.Name))
            successCount++
        } else {
            err := ac.nodeActionsService.UncordonNode(ctx, req.ID, req.User, target.Name)
            if err != nil {
                ac.logger.Error("Failed to uncordon node",
                    zap.String("name", target.Name),
                    zap.Error(err))
                continue
            }
            successCount++
        }
    }

    result.ResourcesAffected = successCount
    result.Message = fmt.Sprintf("Successfully uncordoned %d/%d nodes", successCount, len(req.Targets))

    if successCount == 0 {
        return fmt.Errorf("failed to uncordon any nodes")
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
    var pp *metav1.DeletionPropagation
    if v, ok := req.Params["propagationPolicy"].(string); ok {
        switch strings.ToLower(v) {
        case "foreground":
            p := metav1.DeletePropagationForeground; pp = &p
        case "background":
            p := metav1.DeletePropagationBackground; pp = &p
        case "orphan":
            p := metav1.DeletePropagationOrphan; pp = &p
        }
    }
    var gps *int64
    if v, ok := req.Params["gracePeriodSeconds"]; ok {
        switch t := v.(type) {
        case float64:
            x := int64(t); gps = &x
        case int:
            x := int64(t); gps = &x
        case int64:
            x := t; gps = &x
        }
    }
    fn := func(ctx context.Context, t TargetResource) error {
        opts := metav1.DeleteOptions{}
        if pp != nil { opts.PropagationPolicy = pp }
        if gps != nil { opts.GracePeriodSeconds = gps }
        if req.DryRun { opts.DryRun = []string{"All"} }
        return client.CoreV1().Services(t.Namespace).Delete(ctx, t.Name, opts)
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    if req.DryRun {
        result.Message = fmt.Sprintf("Would delete %d/%d services", succ, total)
    } else {
        result.Message = fmt.Sprintf("Deleted %d/%d services", succ, total)
    }
    if succ == 0 {
        return fmt.Errorf("failed to delete any services")
    }
    return nil
}

func (ac *ActionCoordinator) executeRestartDaemonSets(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    if len(req.Targets) == 0 { return fmt.Errorf("no targets specified for daemonset restart") }
    annotationKey := "kubectl.kubernetes.io/restartedAt"
    ts := time.Now().Format(time.RFC3339)
    fn := func(ctx context.Context, t TargetResource) error {
        patch := []byte(fmt.Sprintf(`{"metadata":{"annotations":{"%s":"%s"}}}`, annotationKey, ts))
        po := metav1.PatchOptions{}
        if req.DryRun { po.DryRun = []string{"All"} }
        _, err := client.AppsV1().DaemonSets(t.Namespace).Patch(ctx, t.Name, types.StrategicMergePatchType, patch, po)
        return err
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Restarted %d/%d daemonsets", succ, total)
    if succ == 0 { return fmt.Errorf("failed to restart any daemonsets") }
    return nil
}

func (ac *ActionCoordinator) executeDeleteDaemonSets(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    var pp *metav1.DeletionPropagation
    if v, ok := req.Params["propagationPolicy"].(string); ok {
        switch strings.ToLower(v) {
        case "foreground": p := metav1.DeletePropagationForeground; pp = &p
        case "background": p := metav1.DeletePropagationBackground; pp = &p
        case "orphan": p := metav1.DeletePropagationOrphan; pp = &p
        }
    }
    var gps *int64
    if v, ok := req.Params["gracePeriodSeconds"]; ok {
        switch t := v.(type) { case float64: x := int64(t); gps = &x; case int: x := int64(t); gps = &x; case int64: x := t; gps = &x }
    }
    fn := func(ctx context.Context, t TargetResource) error {
        opts := metav1.DeleteOptions{}
        if pp != nil { opts.PropagationPolicy = pp }
        if gps != nil { opts.GracePeriodSeconds = gps }
        if req.DryRun { opts.DryRun = []string{"All"} }
        return client.AppsV1().DaemonSets(t.Namespace).Delete(ctx, t.Name, opts)
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Deleted %d/%d daemonsets", succ, total)
    if succ == 0 { return fmt.Errorf("failed to delete any daemonsets") }
    return nil
}

func (ac *ActionCoordinator) executeRestartStatefulSets(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    if len(req.Targets) == 0 { return fmt.Errorf("no targets specified for statefulset restart") }
    annotationKey := "kubectl.kubernetes.io/restartedAt"
    ts := time.Now().Format(time.RFC3339)
    fn := func(ctx context.Context, t TargetResource) error {
        patch := []byte(fmt.Sprintf(`{"metadata":{"annotations":{"%s":"%s"}}}`, annotationKey, ts))
        po := metav1.PatchOptions{}
        if req.DryRun { po.DryRun = []string{"All"} }
        _, err := client.AppsV1().StatefulSets(t.Namespace).Patch(ctx, t.Name, types.StrategicMergePatchType, patch, po)
        return err
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Restarted %d/%d statefulsets", succ, total)
    if succ == 0 { return fmt.Errorf("failed to restart any statefulsets") }
    return nil
}

func (ac *ActionCoordinator) executeScaleStatefulSets(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    replicasRaw, ok := req.Params["replicas"]
    if !ok { return fmt.Errorf("missing required param: replicas") }
    var replicas int32
    switch v := replicasRaw.(type) { case float64: replicas = int32(v); case int: replicas = int32(v); case int32: replicas = v; default: return fmt.Errorf("invalid replicas param type") }
    if replicas < 0 { return fmt.Errorf("replicas must be >= 0") }
    fn := func(ctx context.Context, t TargetResource) error {
        scaleObj, err := client.AppsV1().StatefulSets(t.Namespace).GetScale(ctx, t.Name, metav1.GetOptions{})
        if err != nil { return err }
        scaleObj.Spec.Replicas = replicas
        uo := metav1.UpdateOptions{}
        if req.DryRun { uo.DryRun = []string{"All"} }
        _, err = client.AppsV1().StatefulSets(t.Namespace).UpdateScale(ctx, t.Name, scaleObj, uo)
        return err
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Scaled %d/%d statefulsets to %d", succ, total, replicas)
    if succ == 0 { return fmt.Errorf("failed to scale any statefulsets") }
    return nil
}

func (ac *ActionCoordinator) executeDeleteStatefulSets(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    var pp *metav1.DeletionPropagation
    if v, ok := req.Params["propagationPolicy"].(string); ok {
        switch strings.ToLower(v) { case "foreground": p := metav1.DeletePropagationForeground; pp = &p; case "background": p := metav1.DeletePropagationBackground; pp = &p; case "orphan": p := metav1.DeletePropagationOrphan; pp = &p }
    }
    var gps *int64
    if v, ok := req.Params["gracePeriodSeconds"]; ok {
        switch t := v.(type) { case float64: x := int64(t); gps = &x; case int: x := int64(t); gps = &x; case int64: x := t; gps = &x }
    }
    fn := func(ctx context.Context, t TargetResource) error {
        opts := metav1.DeleteOptions{}
        if pp != nil { opts.PropagationPolicy = pp }
        if gps != nil { opts.GracePeriodSeconds = gps }
        if req.DryRun { opts.DryRun = []string{"All"} }
        return client.AppsV1().StatefulSets(t.Namespace).Delete(ctx, t.Name, opts)
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Deleted %d/%d statefulsets", succ, total)
    if succ == 0 { return fmt.Errorf("failed to delete any statefulsets") }
    return nil
}

func (ac *ActionCoordinator) executeSuspendResumeCronJobs(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult, suspend bool) error {
    if len(req.Targets) == 0 { return fmt.Errorf("no targets specified for cronjob %s", map[bool]string{true:"suspend",false:"resume"}[suspend]) }
    // Patch: spec.suspend: true/false
    patch := []byte(fmt.Sprintf(`{"spec":{"suspend":%t}}`, suspend))
    fn := func(ctx context.Context, t TargetResource) error {
        po := metav1.PatchOptions{}
        if req.DryRun { po.DryRun = []string{"All"} }
        _, err := client.BatchV1().CronJobs(t.Namespace).Patch(ctx, t.Name, types.StrategicMergePatchType, patch, po)
        return err
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    if suspend {
        result.Message = fmt.Sprintf("Suspended %d/%d cronjobs", succ, total)
    } else {
        result.Message = fmt.Sprintf("Resumed %d/%d cronjobs", succ, total)
    }
    if succ == 0 { return fmt.Errorf("no cronjobs updated") }
    return nil
}

func (ac *ActionCoordinator) executeDeleteCronJobs(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    var pp *metav1.DeletionPropagation
    if v, ok := req.Params["propagationPolicy"].(string); ok {
        switch strings.ToLower(v) { case "foreground": p := metav1.DeletePropagationForeground; pp = &p; case "background": p := metav1.DeletePropagationBackground; pp = &p; case "orphan": p := metav1.DeletePropagationOrphan; pp = &p }
    }
    var gps *int64
    if v, ok := req.Params["gracePeriodSeconds"]; ok {
        switch t := v.(type) { case float64: x := int64(t); gps = &x; case int: x := int64(t); gps = &x; case int64: x := t; gps = &x }
    }
    fn := func(ctx context.Context, t TargetResource) error {
        opts := metav1.DeleteOptions{}
        if pp != nil { opts.PropagationPolicy = pp }
        if gps != nil { opts.GracePeriodSeconds = gps }
        if req.DryRun { opts.DryRun = []string{"All"} }
        return client.BatchV1().CronJobs(t.Namespace).Delete(ctx, t.Name, opts)
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Deleted %d/%d cronjobs", succ, total)
    if succ == 0 { return fmt.Errorf("failed to delete any cronjobs") }
    return nil
}

func (ac *ActionCoordinator) executeExportYAML(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    // Export raw unstructured-like maps for now. Frontend can render as YAML.
    // Supported: pods, deployments, services, configmaps, secrets.
    type objGetter func(ctx context.Context, ns, name string) (map[string]interface{}, error)
    var get objGetter
    switch req.Resource {
    case "pods":
        get = func(ctx context.Context, ns, name string) (map[string]interface{}, error) {
            o, err := client.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
            if err != nil { return nil, err }
            return objectToMap(o)
        }
    case "deployments":
        get = func(ctx context.Context, ns, name string) (map[string]interface{}, error) {
            o, err := client.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
            if err != nil { return nil, err }
            return objectToMap(o)
        }
    case "services":
        get = func(ctx context.Context, ns, name string) (map[string]interface{}, error) {
            o, err := client.CoreV1().Services(ns).Get(ctx, name, metav1.GetOptions{})
            if err != nil { return nil, err }
            return objectToMap(o)
        }
    case "configmaps":
        get = func(ctx context.Context, ns, name string) (map[string]interface{}, error) {
            o, err := client.CoreV1().ConfigMaps(ns).Get(ctx, name, metav1.GetOptions{})
            if err != nil { return nil, err }
            return objectToMap(o)
        }
    case "secrets":
        get = func(ctx context.Context, ns, name string) (map[string]interface{}, error) {
            o, err := client.CoreV1().Secrets(ns).Get(ctx, name, metav1.GetOptions{})
            if err != nil { return nil, err }
            return objectToMap(o)
        }
    default:
        return fmt.Errorf("export-yaml unsupported for resource: %s", req.Resource)
    }
    succ := 0
    for _, t := range req.Targets {
        m, err := get(ctx, t.Namespace, t.Name)
        if err != nil {
            ac.logger.Warn("export-yaml get failed", zap.String("resource", req.Resource), zap.String("name", t.Name), zap.Error(err))
            continue
        }
        if result.Details == nil { result.Details = make(map[string]interface{}) }
        key := fmt.Sprintf("%s/%s", t.Namespace, t.Name)
        result.Details[key] = m
        succ++
    }
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Exported %d/%d as YAML-compatible maps", succ, len(req.Targets))
    if succ == 0 { return fmt.Errorf("no resources exported") }
    return nil
}

func (ac *ActionCoordinator) executeDeleteConfigMaps(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    var pp *metav1.DeletionPropagation
    if v, ok := req.Params["propagationPolicy"].(string); ok {
        switch strings.ToLower(v) {
        case "foreground":
            p := metav1.DeletePropagationForeground; pp = &p
        case "background":
            p := metav1.DeletePropagationBackground; pp = &p
        case "orphan":
            p := metav1.DeletePropagationOrphan; pp = &p
        }
    }
    var gps *int64
    if v, ok := req.Params["gracePeriodSeconds"]; ok {
        switch t := v.(type) {
        case float64:
            x := int64(t); gps = &x
        case int:
            x := int64(t); gps = &x
        case int64:
            x := t; gps = &x
        }
    }
    fn := func(ctx context.Context, t TargetResource) error {
        opts := metav1.DeleteOptions{}
        if pp != nil { opts.PropagationPolicy = pp }
        if gps != nil { opts.GracePeriodSeconds = gps }
        if req.DryRun { opts.DryRun = []string{"All"} }
        return client.CoreV1().ConfigMaps(t.Namespace).Delete(ctx, t.Name, opts)
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    if req.DryRun {
        result.Message = fmt.Sprintf("Would delete %d/%d configmaps", succ, total)
    } else {
        result.Message = fmt.Sprintf("Deleted %d/%d configmaps", succ, total)
    }
    if succ == 0 {
        return fmt.Errorf("failed to delete any configmaps")
    }
    return nil
}

func (ac *ActionCoordinator) executeDeleteSecrets(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    var pp *metav1.DeletionPropagation
    if v, ok := req.Params["propagationPolicy"].(string); ok {
        switch strings.ToLower(v) {
        case "foreground":
            p := metav1.DeletePropagationForeground; pp = &p
        case "background":
            p := metav1.DeletePropagationBackground; pp = &p
        case "orphan":
            p := metav1.DeletePropagationOrphan; pp = &p
        }
    }
    var gps *int64
    if v, ok := req.Params["gracePeriodSeconds"]; ok {
        switch t := v.(type) {
        case float64:
            x := int64(t); gps = &x
        case int:
            x := int64(t); gps = &x
        case int64:
            x := t; gps = &x
        }
    }
    fn := func(ctx context.Context, t TargetResource) error {
        opts := metav1.DeleteOptions{}
        if pp != nil { opts.PropagationPolicy = pp }
        if gps != nil { opts.GracePeriodSeconds = gps }
        if req.DryRun { opts.DryRun = []string{"All"} }
        return client.CoreV1().Secrets(t.Namespace).Delete(ctx, t.Name, opts)
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    if req.DryRun {
        result.Message = fmt.Sprintf("Would delete %d/%d secrets", succ, total)
    } else {
        result.Message = fmt.Sprintf("Deleted %d/%d secrets", succ, total)
    }
    if succ == 0 {
        return fmt.Errorf("failed to delete any secrets")
    }
    return nil
}

func (ac *ActionCoordinator) executeEditConfigMaps(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    // Expect params.data map[string]string
    raw := req.Params["data"]
    data, ok := raw.(map[string]interface{})
    if !ok {
        return fmt.Errorf("params.data must be an object of string values")
    }
    // Build patch
    // Convert interface{} map to string map in JSON string
    // We'll rely on JSON marshalling of map[string]interface{}
    patchMap := map[string]interface{}{"data": data}
    patchBytes, _ := json.Marshal(patchMap)
    fn := func(ctx context.Context, t TargetResource) error {
        po := metav1.PatchOptions{}
        if req.DryRun { po.DryRun = []string{"All"} }
        _, err := client.CoreV1().ConfigMaps(t.Namespace).Patch(ctx, t.Name, types.StrategicMergePatchType, patchBytes, po)
        return err
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Edited %d/%d configmaps", succ, total)
    if succ == 0 { return fmt.Errorf("failed to edit any configmaps") }
    return nil
}

func (ac *ActionCoordinator) executeEditSecrets(ctx context.Context, req *ActionRequest, client kubernetes.Interface, result *ActionResult) error {
    // Prefer stringData for plaintext values. Accept params.stringData or params.data
    var patchMap map[string]interface{}
    if raw, ok := req.Params["stringData"]; ok {
        m, ok := raw.(map[string]interface{})
        if !ok { return fmt.Errorf("params.stringData must be an object") }
        patchMap = map[string]interface{}{"stringData": m}
    } else if raw, ok := req.Params["data"]; ok {
        m, ok := raw.(map[string]interface{})
        if !ok { return fmt.Errorf("params.data must be an object") }
        patchMap = map[string]interface{}{"data": m}
    } else {
        return fmt.Errorf("missing params.stringData or params.data for editing secrets")
    }
    patchBytes, _ := json.Marshal(patchMap)
    fn := func(ctx context.Context, t TargetResource) error {
        po := metav1.PatchOptions{}
        if req.DryRun { po.DryRun = []string{"All"} }
        _, err := client.CoreV1().Secrets(t.Namespace).Patch(ctx, t.Name, types.StrategicMergePatchType, patchBytes, po)
        return err
    }
    succ, total := ac.runConcurrent(ctx, req, req.Targets, fn)
    result.ResourcesAffected = succ
    result.Message = fmt.Sprintf("Edited %d/%d secrets", succ, total)
    if succ == 0 { return fmt.Errorf("failed to edit any secrets") }
    return nil
}

// Helper method to restart a single pod (delete it, let controller recreate)
func (ac *ActionCoordinator) restartSinglePod(ctx context.Context, client kubernetes.Interface, namespace, name string) error {
    return client.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// objectToMap converts a runtime.Object to a generic map for YAML rendering
func objectToMap(obj runtime.Object) (map[string]interface{}, error) {
    m, err := runtime.DefaultUnstructuredConverter.ToUnstructured(obj)
    if err != nil {
        return nil, err
    }
    return m, nil
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

// ValidateSafetyForAction exposes SafetyGuard validation for external callers
func (ac *ActionCoordinator) ValidateSafetyForAction(ctx context.Context, client kubernetes.Interface, action, verb, resource, namespace, name string) (*SafetyResult, error) {
    labels, _ := ac.getResourceLabels(ctx, client, resource, namespace, name)
    return ac.safetyGuard.ValidateAction(ctx, client, action, verb, resource, namespace, name, labels)
}
