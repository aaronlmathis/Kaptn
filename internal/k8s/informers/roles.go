package informers

import (
	"fmt"
	"strings"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	"go.uber.org/zap"
	rbacv1 "k8s.io/api/rbac/v1"
)

// RoleEventHandler handles role events and broadcasts via WebSocket
type RoleEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewRoleEventHandler creates a new role event handler
func NewRoleEventHandler(logger *zap.Logger, hub *ws.Hub) *RoleEventHandler {
	return &RoleEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles role addition events
func (h *RoleEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	role, ok := obj.(*rbacv1.Role)
	if !ok {
		h.logger.Error("Failed to cast object to Role")
		return
	}

	h.logger.Debug("Role added", zap.String("name", role.Name), zap.String("namespace", role.Namespace))

	summary := h.roleToSummary(role)
	h.hub.BroadcastToRoom("overview", "role_added", summary)
}

// OnUpdate handles role update events
func (h *RoleEventHandler) OnUpdate(oldObj, newObj interface{}) {
	role, ok := newObj.(*rbacv1.Role)
	if !ok {
		h.logger.Error("Failed to cast object to Role")
		return
	}

	h.logger.Debug("Role updated", zap.String("name", role.Name), zap.String("namespace", role.Namespace))

	summary := h.roleToSummary(role)
	h.hub.BroadcastToRoom("overview", "role_updated", summary)
}

// OnDelete handles role deletion events
func (h *RoleEventHandler) OnDelete(obj interface{}) {
	role, ok := obj.(*rbacv1.Role)
	if !ok {
		h.logger.Error("Failed to cast object to Role")
		return
	}

	h.logger.Debug("Role deleted", zap.String("name", role.Name), zap.String("namespace", role.Namespace))

	// Broadcast deletion event with basic identifiers
	h.hub.BroadcastToRoom("overview", "role_deleted", map[string]string{
		"name":      role.Name,
		"namespace": role.Namespace,
	})
}

// roleToSummary converts a Kubernetes Role to summary format
func (h *RoleEventHandler) roleToSummary(role *rbacv1.Role) map[string]interface{} {
	// Calculate age
	age := time.Since(role.CreationTimestamp.Time)
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
	ruleCount := len(role.Rules)

	// Count unique verbs and resources across all rules
	verbSet := make(map[string]bool)
	resourceSet := make(map[string]bool)

	for _, rule := range role.Rules {
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
		"id":                len(role.Name), // Simple ID generation
		"name":              role.Name,
		"namespace":         role.Namespace,
		"age":               ageStr,
		"creationTimestamp": role.CreationTimestamp.Time,
		"rules":             ruleCount,    // Frontend expects 'rules', not 'ruleCount'
		"rulesDisplay":      rulesDisplay, // Frontend expects this field
		"verbCount":         len(verbSet),
		"resourceCount":     len(resourceSet),
		"labels":            role.Labels,
		"annotations":       role.Annotations,
	}
}

// RoleBindingEventHandler handles role binding events and broadcasts via WebSocket
type RoleBindingEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewRoleBindingEventHandler creates a new role binding event handler
func NewRoleBindingEventHandler(logger *zap.Logger, hub *ws.Hub) *RoleBindingEventHandler {
	return &RoleBindingEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles role binding addition events
func (h *RoleBindingEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	roleBinding, ok := obj.(*rbacv1.RoleBinding)
	if !ok {
		h.logger.Error("Failed to cast object to RoleBinding")
		return
	}

	h.logger.Debug("RoleBinding added", zap.String("name", roleBinding.Name), zap.String("namespace", roleBinding.Namespace))

	summary := h.roleBindingToSummary(roleBinding)
	h.hub.BroadcastToRoom("overview", "rolebinding_added", summary)
}

// OnUpdate handles role binding update events
func (h *RoleBindingEventHandler) OnUpdate(oldObj, newObj interface{}) {
	roleBinding, ok := newObj.(*rbacv1.RoleBinding)
	if !ok {
		h.logger.Error("Failed to cast object to RoleBinding")
		return
	}

	h.logger.Debug("RoleBinding updated", zap.String("name", roleBinding.Name), zap.String("namespace", roleBinding.Namespace))

	summary := h.roleBindingToSummary(roleBinding)
	h.hub.BroadcastToRoom("overview", "rolebinding_updated", summary)
}

// OnDelete handles role binding deletion events
func (h *RoleBindingEventHandler) OnDelete(obj interface{}) {
	roleBinding, ok := obj.(*rbacv1.RoleBinding)
	if !ok {
		h.logger.Error("Failed to cast object to RoleBinding")
		return
	}

	h.logger.Debug("RoleBinding deleted", zap.String("name", roleBinding.Name), zap.String("namespace", roleBinding.Namespace))

	// Broadcast deletion event with basic identifiers
	h.hub.BroadcastToRoom("overview", "rolebinding_deleted", map[string]string{
		"name":      roleBinding.Name,
		"namespace": roleBinding.Namespace,
	})
}

// roleBindingToSummary converts a Kubernetes RoleBinding to summary format
func (h *RoleBindingEventHandler) roleBindingToSummary(roleBinding *rbacv1.RoleBinding) map[string]interface{} {
	// Calculate age
	age := time.Since(roleBinding.CreationTimestamp.Time)
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
	roleName := roleBinding.RoleRef.Name
	roleKind := roleBinding.RoleRef.Kind

	// Extract subjects
	subjectCount := len(roleBinding.Subjects)

	// Count subjects by kind and create display list
	userCount := 0
	groupCount := 0
	serviceAccountCount := 0
	var subjectsDisplayList []string

	for _, subject := range roleBinding.Subjects {
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
		"id":                  len(roleBinding.Name), // Simple ID generation
		"name":                roleBinding.Name,
		"namespace":           roleBinding.Namespace,
		"age":                 ageStr,
		"creationTimestamp":   roleBinding.CreationTimestamp.Time,
		"roleName":            roleName,
		"roleKind":            roleKind,
		"roleRef":             roleRefStr,      // Frontend expects this field
		"subjects":            subjectCount,    // Frontend expects 'subjects', not 'subjectCount'
		"subjectsDisplay":     subjectsDisplay, // Frontend expects this field
		"subjectCount":        subjectCount,    // Keep for backward compatibility
		"userCount":           userCount,
		"groupCount":          groupCount,
		"serviceAccountCount": serviceAccountCount,
		"labels":              roleBinding.Labels,
		"annotations":         roleBinding.Annotations,
	}
}
