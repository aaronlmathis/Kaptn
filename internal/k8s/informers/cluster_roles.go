package informers

import (
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
	// Count unique verbs and resources
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

	return map[string]interface{}{
		"name":              clusterRole.Name,
		"creationTimestamp": clusterRole.CreationTimestamp.Time,
		"ruleCount":         len(clusterRole.Rules),
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
	// Count subjects by kind
	userCount := 0
	groupCount := 0
	serviceAccountCount := 0

	for _, subject := range clusterRoleBinding.Subjects {
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
		"name":                clusterRoleBinding.Name,
		"creationTimestamp":   clusterRoleBinding.CreationTimestamp.Time,
		"roleName":            clusterRoleBinding.RoleRef.Name,
		"roleKind":            clusterRoleBinding.RoleRef.Kind,
		"subjectCount":        len(clusterRoleBinding.Subjects),
		"userCount":           userCount,
		"groupCount":          groupCount,
		"serviceAccountCount": serviceAccountCount,
		"labels":              clusterRoleBinding.Labels,
		"annotations":         clusterRoleBinding.Annotations,
	}
}
