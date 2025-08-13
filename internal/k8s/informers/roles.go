package informers

import (
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
	// Count unique verbs and resources
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

	return map[string]interface{}{
		"name":              role.Name,
		"namespace":         role.Namespace,
		"creationTimestamp": role.CreationTimestamp.Time,
		"ruleCount":         len(role.Rules),
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
	// Count subjects by kind
	userCount := 0
	groupCount := 0
	serviceAccountCount := 0

	for _, subject := range roleBinding.Subjects {
		switch subject.Kind {
		case "User":
			userCount++
		case "Group":
			groupCount++
		case "ServiceAccount":
			serviceAccountCount++
		}
	}

	return map[string]interface{}{
		"name":                roleBinding.Name,
		"namespace":           roleBinding.Namespace,
		"creationTimestamp":   roleBinding.CreationTimestamp.Time,
		"roleName":            roleBinding.RoleRef.Name,
		"roleKind":            roleBinding.RoleRef.Kind,
		"subjectCount":        len(roleBinding.Subjects),
		"userCount":           userCount,
		"groupCount":          groupCount,
		"serviceAccountCount": serviceAccountCount,
		"labels":              roleBinding.Labels,
		"annotations":         roleBinding.Annotations,
	}
}
