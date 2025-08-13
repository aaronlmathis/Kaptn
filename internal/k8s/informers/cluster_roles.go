package informers

import (
	"fmt"
	"strings"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	"go.uber.org/zap"
	rbacv1 "k8s.io/api/rbac/v1"
)

// ClusterRoleEventHandler handles cluster role events and broadcasts via WebSocket
type ClusterRoleEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewClusterRoleEventHandler creates a new cluster role event handler
func NewClusterRoleEventHandler(logger *zap.Logger, hub *ws.Hub) *ClusterRoleEventHandler {
	return &ClusterRoleEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles cluster role addition events
func (h *ClusterRoleEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	clusterRole, ok := obj.(*rbacv1.ClusterRole)
	if !ok {
		h.logger.Error("Failed to cast object to ClusterRole")
		return
	}

	h.logger.Debug("ClusterRole added", zap.String("name", clusterRole.Name))

	summary := h.clusterRoleToSummary(clusterRole)
	h.hub.BroadcastToRoom("overview", "clusterrole_added", summary)
}

// OnUpdate handles cluster role update events
func (h *ClusterRoleEventHandler) OnUpdate(oldObj, newObj interface{}) {
	clusterRole, ok := newObj.(*rbacv1.ClusterRole)
	if !ok {
		h.logger.Error("Failed to cast object to ClusterRole")
		return
	}

	h.logger.Debug("ClusterRole updated", zap.String("name", clusterRole.Name))

	summary := h.clusterRoleToSummary(clusterRole)
	h.hub.BroadcastToRoom("overview", "clusterrole_updated", summary)
}

// OnDelete handles cluster role deletion events
func (h *ClusterRoleEventHandler) OnDelete(obj interface{}) {
	clusterRole, ok := obj.(*rbacv1.ClusterRole)
	if !ok {
		h.logger.Error("Failed to cast object to ClusterRole")
		return
	}

	h.logger.Debug("ClusterRole deleted", zap.String("name", clusterRole.Name))

	// Broadcast deletion event with basic identifiers
	h.hub.BroadcastToRoom("overview", "clusterrole_deleted", map[string]string{
		"name": clusterRole.Name,
	})
}

// clusterRoleToSummary converts a Kubernetes ClusterRole to summary format
func (h *ClusterRoleEventHandler) clusterRoleToSummary(clusterRole *rbacv1.ClusterRole) map[string]interface{} {
	// Calculate age
	age := time.Since(clusterRole.CreationTimestamp.Time)
	var ageStr string
	if age < time.Minute {
		ageStr = fmt.Sprintf("%ds", int(age.Seconds()))
	} else if age < time.Hour {
		ageStr = fmt.Sprintf("%dm", int(age.Minutes()))
	} else if age < 24*time.Hour {
		ageStr = fmt.Sprintf("%dh", int(age.Hours()))
	} else {
		ageStr = fmt.Sprintf("%dd", int(age.Hours()/24))
	}

	// Extract rules information
	ruleCount := len(clusterRole.Rules)

	// Count unique verbs and resources across all rules
	verbSet := make(map[string]bool)
	resourceSet := make(map[string]bool)

	for _, rule := range clusterRole.Rules {
		for _, verb := range rule.Verbs {
			verbSet[verb] = true
		}
		for _, resource := range rule.Resources {
			resourceSet[resource] = true
		}
	}

	// Create a meaningful summary of all rules
	var rulesDisplay string
	if ruleCount == 0 {
		rulesDisplay = "<none>"
	} else {
		// Get unique verbs and resources as slices for display
		var verbsList []string
		for verb := range verbSet {
			verbsList = append(verbsList, verb)
		}
		
		var resourcesList []string
		for resource := range resourceSet {
			resourcesList = append(resourcesList, resource)
		}

		// Create a concise summary
		if ruleCount == 1 {
			// For single rule, show the exact verbs and resources
			if len(verbsList) > 0 && len(resourcesList) > 0 {
				if len(verbsList) <= 3 && len(resourcesList) <= 3 {
					rulesDisplay = fmt.Sprintf("%s on %s", strings.Join(verbsList, ","), strings.Join(resourcesList, ","))
				} else {
					rulesDisplay = fmt.Sprintf("%d verbs on %d resources", len(verbsList), len(resourcesList))
				}
			} else {
				rulesDisplay = "1 rule"
			}
		} else {
			// For multiple rules, show a summary
			if len(verbsList) > 0 && len(resourcesList) > 0 {
				rulesDisplay = fmt.Sprintf("%d rules: %d verbs on %d resources", ruleCount, len(verbsList), len(resourcesList))
			} else {
				rulesDisplay = fmt.Sprintf("%d rules", ruleCount)
			}
		}
	}

	return map[string]interface{}{
		"id":                len(clusterRole.Name), // Simple ID generation
		"name":              clusterRole.Name,
		"age":               ageStr,
		"creationTimestamp": clusterRole.CreationTimestamp.Time,
		"rules":             ruleCount,        // Frontend expects 'rules', not 'ruleCount'
		"rulesDisplay":      rulesDisplay,     // Frontend expects this field
		"verbCount":         len(verbSet),
		"resourceCount":     len(resourceSet),
		"labels":            clusterRole.Labels,
		"annotations":       clusterRole.Annotations,
	}
}

// ClusterRoleBindingEventHandler handles cluster role binding events and broadcasts via WebSocket
type ClusterRoleBindingEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewClusterRoleBindingEventHandler creates a new cluster role binding event handler
func NewClusterRoleBindingEventHandler(logger *zap.Logger, hub *ws.Hub) *ClusterRoleBindingEventHandler {
	return &ClusterRoleBindingEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles cluster role binding addition events
func (h *ClusterRoleBindingEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	clusterRoleBinding, ok := obj.(*rbacv1.ClusterRoleBinding)
	if !ok {
		h.logger.Error("Failed to cast object to ClusterRoleBinding")
		return
	}

	h.logger.Debug("ClusterRoleBinding added", zap.String("name", clusterRoleBinding.Name))

	summary := h.clusterRoleBindingToSummary(clusterRoleBinding)
	h.hub.BroadcastToRoom("overview", "clusterrolebinding_added", summary)
}

// OnUpdate handles cluster role binding update events
func (h *ClusterRoleBindingEventHandler) OnUpdate(oldObj, newObj interface{}) {
	clusterRoleBinding, ok := newObj.(*rbacv1.ClusterRoleBinding)
	if !ok {
		h.logger.Error("Failed to cast object to ClusterRoleBinding")
		return
	}

	h.logger.Debug("ClusterRoleBinding updated", zap.String("name", clusterRoleBinding.Name))

	summary := h.clusterRoleBindingToSummary(clusterRoleBinding)
	h.hub.BroadcastToRoom("overview", "clusterrolebinding_updated", summary)
}

// OnDelete handles cluster role binding deletion events
func (h *ClusterRoleBindingEventHandler) OnDelete(obj interface{}) {
	clusterRoleBinding, ok := obj.(*rbacv1.ClusterRoleBinding)
	if !ok {
		h.logger.Error("Failed to cast object to ClusterRoleBinding")
		return
	}

	h.logger.Debug("ClusterRoleBinding deleted", zap.String("name", clusterRoleBinding.Name))

	// Broadcast deletion event with basic identifiers
	h.hub.BroadcastToRoom("overview", "clusterrolebinding_deleted", map[string]string{
		"name": clusterRoleBinding.Name,
	})
}

// clusterRoleBindingToSummary converts a Kubernetes ClusterRoleBinding to summary format
func (h *ClusterRoleBindingEventHandler) clusterRoleBindingToSummary(clusterRoleBinding *rbacv1.ClusterRoleBinding) map[string]interface{} {
	// Calculate age
	age := time.Since(clusterRoleBinding.CreationTimestamp.Time)
	var ageStr string
	if age < time.Minute {
		ageStr = fmt.Sprintf("%ds", int(age.Seconds()))
	} else if age < time.Hour {
		ageStr = fmt.Sprintf("%dm", int(age.Minutes()))
	} else if age < 24*time.Hour {
		ageStr = fmt.Sprintf("%dh", int(age.Hours()))
	} else {
		ageStr = fmt.Sprintf("%dd", int(age.Hours()/24))
	}

	// Extract role reference
	roleName := clusterRoleBinding.RoleRef.Name
	roleKind := clusterRoleBinding.RoleRef.Kind

	// Extract subjects
	subjectCount := len(clusterRoleBinding.Subjects)

	// Count subjects by kind and create display list
	userCount := 0
	groupCount := 0
	serviceAccountCount := 0
	var subjectsDisplayList []string

	for _, subject := range clusterRoleBinding.Subjects {
		switch subject.Kind {
		case "User":
			userCount++
			subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("User:%s", subject.Name))
		case "Group":
			groupCount++
			subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("Group:%s", subject.Name))
		case "ServiceAccount":
			serviceAccountCount++
			if subject.Namespace != "" {
				subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("SA:%s/%s", subject.Namespace, subject.Name))
			} else {
				subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("SA:%s", subject.Name))
			}
		}
	}

	// Format subjects display
	var subjectsDisplay string
	if len(subjectsDisplayList) == 0 {
		subjectsDisplay = "<none>"
	} else if len(subjectsDisplayList) == 1 {
		subjectsDisplay = subjectsDisplayList[0]
	} else {
		subjectsDisplay = fmt.Sprintf("%s +%d more", subjectsDisplayList[0], len(subjectsDisplayList)-1)
	}

	// Create role reference string
	roleRefStr := fmt.Sprintf("%s/%s", roleKind, roleName)

	return map[string]interface{}{
		"id":                  len(clusterRoleBinding.Name), // Simple ID generation
		"name":                clusterRoleBinding.Name,
		"age":                 ageStr,
		"creationTimestamp":   clusterRoleBinding.CreationTimestamp.Time,
		"roleName":            roleName,
		"roleKind":            roleKind,
		"roleRef":             roleRefStr,        // Frontend expects this field
		"subjects":            subjectCount,      // Frontend expects 'subjects', not 'subjectCount'
		"subjectsDisplay":     subjectsDisplay,   // Frontend expects this field
		"subjectCount":        subjectCount,      // Keep for backward compatibility
		"userCount":           userCount,
		"groupCount":          groupCount,
		"serviceAccountCount": serviceAccountCount,
		"labels":              clusterRoleBinding.Labels,
		"annotations":         clusterRoleBinding.Annotations,
	}
}
