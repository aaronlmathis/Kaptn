package actions

import (
	"context"
	"fmt"
	"strings"

	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
)

// SafetyGuard provides safety validation for actions
type SafetyGuard struct {
    logger           *zap.Logger
    deniedNamespaces map[string]bool
    deniedLabels     map[string]string
    isProduction     bool
    actionAllow      map[string]bool
    actionDeny       map[string]bool
}

// SafetyViolation represents a safety rule violation
type SafetyViolation struct {
	Rule        string `json:"rule"`
	Description string `json:"description"`
	Severity    string `json:"severity"` // "warning", "error", "critical"
	Namespace   string `json:"namespace,omitempty"`
	Resource    string `json:"resource,omitempty"`
}

// SafetyResult contains the result of safety validation
type SafetyResult struct {
	Allowed    bool              `json:"allowed"`
	Violations []SafetyViolation `json:"violations,omitempty"`
	Warnings   []string          `json:"warnings,omitempty"`
}

// NewSafetyGuard creates a new safety guard with default protections
func NewSafetyGuard(logger *zap.Logger, isProduction bool) *SafetyGuard {
	// Default denied namespaces - critical system namespaces
	deniedNamespaces := map[string]bool{
		"kube-system":     true,
		"kube-public":     true,
		"kube-node-lease": true,
		"monitoring":      true,
		"prometheus":      true,
		"grafana":         true,
		"istio-system":    true,
		"cert-manager":    true,
		"ingress-nginx":   true,
		"metallb-system":  true,
		"calico-system":   true,
		"tigera-operator": true,
		"rook-ceph":       true,
		"longhorn-system": true,
		"velero":          true,
		"argocd":          true,
		"flux-system":     true,
		"kaptn":           true, // Protect Kaptn's own namespace
	}

	// Default denied labels - resources with these labels are protected
	deniedLabels := map[string]string{
		"kaptn.io/protected":           "true",
		"app.kubernetes.io/managed-by": "kaptn",
		"heritage":                     "Tiller", // Helm v2 managed
		"app.kubernetes.io/part-of":    "kube-system",
	}

    return &SafetyGuard{
        logger:           logger,
        deniedNamespaces: deniedNamespaces,
        deniedLabels:     deniedLabels,
        isProduction:     isProduction,
        actionAllow:      map[string]bool{},
        actionDeny:       map[string]bool{},
    }
}

// ValidateAction validates an action request against safety rules
func (sg *SafetyGuard) ValidateAction(ctx context.Context, client kubernetes.Interface, action, verb, resource, namespace, name string, labels map[string]string) (*SafetyResult, error) {
    result := &SafetyResult{
        Allowed:    true,
        Violations: []SafetyViolation{},
        Warnings:   []string{},
    }

	sg.logger.Debug("Validating action safety",
		zap.String("action", action),
		zap.String("verb", verb),
		zap.String("resource", resource),
		zap.String("namespace", namespace),
		zap.String("name", name))

	// Check namespace restrictions
	if sg.isNamespaceDenied(namespace) {
		violation := SafetyViolation{
			Rule:        "namespace_protection",
			Description: fmt.Sprintf("Actions on namespace '%s' are prohibited for safety", namespace),
			Severity:    "critical",
			Namespace:   namespace,
			Resource:    fmt.Sprintf("%s/%s", resource, name),
		}
		result.Violations = append(result.Violations, violation)
		result.Allowed = false
	}

	// Check label-based protections
	if violations := sg.checkProtectedLabels(labels, resource, namespace, name); len(violations) > 0 {
		result.Violations = append(result.Violations, violations...)
		for _, v := range violations {
			if v.Severity == "critical" || v.Severity == "error" {
				result.Allowed = false
			}
		}
	}

	// Check action allow/deny policies if configured
	pair := fmt.Sprintf("%s:%s", strings.ToLower(action), strings.ToLower(resource))
	if len(sg.actionAllow) > 0 {
		if !sg.actionAllow[pair] {
			result.Violations = append(result.Violations, SafetyViolation{
				Rule:        "action_policy_not_allowed",
				Description: fmt.Sprintf("Action '%s' on resource '%s' is not in allowlist", action, resource),
				Severity:    "error",
				Namespace:   namespace,
				Resource:    fmt.Sprintf("%s/%s", resource, name),
			})
			result.Allowed = false
		}
	}
	if sg.actionDeny[pair] {
		result.Violations = append(result.Violations, SafetyViolation{
			Rule:        "action_policy_denied",
			Description: fmt.Sprintf("Action '%s' on resource '%s' is denied by policy", action, resource),
			Severity:    "error",
			Namespace:   namespace,
			Resource:    fmt.Sprintf("%s/%s", resource, name),
		})
		result.Allowed = false
	}

	// Check destructive action protections
	if sg.isDestructiveAction(verb, action) {
		if sg.isProduction {
			result.Warnings = append(result.Warnings,
				"This is a destructive action in a production environment. Confirmation required.")
		}

		// Special protection for certain critical resources
		if sg.isCriticalResource(resource, namespace, name) {
			violation := SafetyViolation{
				Rule:        "critical_resource_protection",
				Description: fmt.Sprintf("Resource %s/%s in namespace %s is marked as critical", resource, name, namespace),
				Severity:    "error",
				Namespace:   namespace,
				Resource:    fmt.Sprintf("%s/%s", resource, name),
			}
			result.Violations = append(result.Violations, violation)
			result.Allowed = false
		}
	}

	// Check for concurrent operations (if this is a singleton operation)
	if sg.requiresConcurrencyFence(action, resource, namespace, name) {
		result.Warnings = append(result.Warnings,
			"This action requires exclusive access. Ensure no other operations are running on this resource.")
	}

	sg.logger.Info("Safety validation completed",
		zap.String("action", action),
		zap.String("resource", fmt.Sprintf("%s/%s", namespace, name)),
		zap.Bool("allowed", result.Allowed),
		zap.Int("violations", len(result.Violations)),
		zap.Int("warnings", len(result.Warnings)))

	return result, nil
}

// ValidateBulkAction validates a bulk action across multiple resources
func (sg *SafetyGuard) ValidateBulkAction(ctx context.Context, client kubernetes.Interface, action, verb, resource string, targets []TargetResource) (*SafetyResult, error) {
	result := &SafetyResult{
		Allowed:    true,
		Violations: []SafetyViolation{},
		Warnings:   []string{},
	}

	// Check bulk operation limits
	if len(targets) > 50 {
		violation := SafetyViolation{
			Rule:        "bulk_operation_limit",
			Description: fmt.Sprintf("Bulk operations are limited to 50 resources. Requested: %d", len(targets)),
			Severity:    "error",
		}
		result.Violations = append(result.Violations, violation)
		result.Allowed = false
		return result, nil
	}

	// Validate each target
	deniedCount := 0
	for _, target := range targets {
		targetResult, err := sg.ValidateAction(ctx, client, action, verb, resource, target.Namespace, target.Name, target.Labels)
		if err != nil {
			return nil, fmt.Errorf("failed to validate target %s/%s: %w", target.Namespace, target.Name, err)
		}

		// Accumulate violations
		result.Violations = append(result.Violations, targetResult.Violations...)
		result.Warnings = append(result.Warnings, targetResult.Warnings...)

		if !targetResult.Allowed {
			deniedCount++
		}
	}

	// If any target is denied, the bulk operation should be denied
	if deniedCount > 0 {
		result.Allowed = false
		result.Violations = append(result.Violations, SafetyViolation{
			Rule:        "bulk_operation_partial_failure",
			Description: fmt.Sprintf("%d out of %d resources failed safety validation", deniedCount, len(targets)),
			Severity:    "error",
		})
	}

	// Add bulk-specific warnings
	if sg.isProduction && sg.isDestructiveAction(verb, action) {
		result.Warnings = append(result.Warnings,
			fmt.Sprintf("Bulk %s operation on %d resources in production environment. Extra caution advised.", action, len(targets)))
	}

	return result, nil
}

// TargetResource represents a resource targeted by an action
type TargetResource struct {
	Namespace string            `json:"namespace"`
	Name      string            `json:"name"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// isNamespaceDenied checks if a namespace is in the deny list
func (sg *SafetyGuard) isNamespaceDenied(namespace string) bool {
	if namespace == "" {
		return false // Cluster-scoped resources
	}
	return sg.deniedNamespaces[namespace]
}

// checkProtectedLabels checks if resource has any protected labels
func (sg *SafetyGuard) checkProtectedLabels(labels map[string]string, resource, namespace, name string) []SafetyViolation {
	var violations []SafetyViolation

	if labels == nil {
		return violations
	}

	for key, expectedValue := range sg.deniedLabels {
		if actualValue, exists := labels[key]; exists {
			// If expected value is empty, any value of this key is protected
			// If expected value is set, it must match exactly
			if expectedValue == "" || actualValue == expectedValue {
				violation := SafetyViolation{
					Rule:        "protected_label",
					Description: fmt.Sprintf("Resource has protected label '%s=%s'", key, actualValue),
					Severity:    "error",
					Namespace:   namespace,
					Resource:    fmt.Sprintf("%s/%s", resource, name),
				}
				violations = append(violations, violation)
			}
		}
	}

	return violations
}

// isDestructiveAction checks if an action is potentially destructive
func (sg *SafetyGuard) isDestructiveAction(verb, action string) bool {
	destructiveVerbs := map[string]bool{
		"delete":           true,
		"deletecollection": true,
	}

	destructiveActions := map[string]bool{
		"delete":    true,
		"drain":     true,
		"terminate": true,
		"evict":     true,
		"restart":   false, // Restart is disruptive but not destructive
	}

	return destructiveVerbs[verb] || destructiveActions[action]
}

// isCriticalResource checks if a resource is considered critical
func (sg *SafetyGuard) isCriticalResource(resource, namespace, name string) bool {
	// Resources that are always critical
	criticalResources := map[string]bool{
		"persistentvolumes":         true,
		"persistentvolumeclaims":    true,
		"customresourcedefinitions": true,
		"clusterroles":              true,
		"clusterrolebindings":       true,
	}

	if criticalResources[resource] {
		return true
	}

	// Specific critical resources by name pattern
	criticalPatterns := []string{
		"etcd",
		"kube-apiserver",
		"kube-controller-manager",
		"kube-scheduler",
		"kube-proxy",
		"coredns",
		"dns",
		"cni",
		"network",
	}

	lowerName := strings.ToLower(name)
	for _, pattern := range criticalPatterns {
		if strings.Contains(lowerName, pattern) {
			return true
		}
	}

	return false
}

// requiresConcurrencyFence checks if an action requires exclusive access
func (sg *SafetyGuard) requiresConcurrencyFence(action, resource, namespace, name string) bool {
	// Actions that should not be performed concurrently on the same resource
	exclusiveActions := map[string]bool{
		"drain":   true,
		"upgrade": true,
		"migrate": true,
		"backup":  true,
		"restore": true,
	}

	return exclusiveActions[action]
}

// GetSafetyConfig returns the current safety configuration
func (sg *SafetyGuard) GetSafetyConfig() map[string]interface{} {
	deniedNsList := make([]string, 0, len(sg.deniedNamespaces))
	for ns := range sg.deniedNamespaces {
		deniedNsList = append(deniedNsList, ns)
	}

	return map[string]interface{}{
		"denied_namespaces": deniedNsList,
		"denied_labels":     sg.deniedLabels,
		"is_production":     sg.isProduction,
	}
}

// UpdateSafetyConfig allows runtime updates to safety configuration
func (sg *SafetyGuard) UpdateSafetyConfig(deniedNamespaces []string, deniedLabels map[string]string) {
    sg.deniedNamespaces = make(map[string]bool)
    for _, ns := range deniedNamespaces {
        sg.deniedNamespaces[ns] = true
    }

	if deniedLabels != nil {
		sg.deniedLabels = deniedLabels
	}

	sg.logger.Info("Safety configuration updated",
		zap.Strings("denied_namespaces", deniedNamespaces),
		zap.Any("denied_labels", sg.deniedLabels))
}

// UpdateActionPolicies configures allow/deny action policies (pairs of action:resource)
func (sg *SafetyGuard) UpdateActionPolicies(allow, deny []string) {
    sg.actionAllow = make(map[string]bool)
    for _, a := range allow { sg.actionAllow[strings.ToLower(a)] = true }
    sg.actionDeny = make(map[string]bool)
    for _, d := range deny { sg.actionDeny[strings.ToLower(d)] = true }
    sg.logger.Info("Safety action policies updated",
        zap.Int("allow_count", len(sg.actionAllow)),
        zap.Int("deny_count", len(sg.actionDeny)))
}
