package informers

import (
	"time"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// NamespaceEventHandler handles namespace events and broadcasts via WebSocket
type NamespaceEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewNamespaceEventHandler creates a new namespace event handler
func NewNamespaceEventHandler(logger *zap.Logger, hub *ws.Hub) *NamespaceEventHandler {
	return &NamespaceEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles namespace addition events
func (h *NamespaceEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	namespace, ok := obj.(*corev1.Namespace)
	if !ok {
		h.logger.Error("Failed to cast object to Namespace")
		return
	}

	h.logger.Info("Namespace added",
		zap.String("name", namespace.Name))

	summary := h.namespaceToSummary(namespace)
	h.broadcastNamespaceEvent("namespaces_added", summary)
}

// OnUpdate handles namespace update events
func (h *NamespaceEventHandler) OnUpdate(oldObj, newObj interface{}) {
	namespace, ok := newObj.(*corev1.Namespace)
	if !ok {
		h.logger.Error("Failed to cast object to Namespace")
		return
	}

	h.logger.Info("Namespace updated",
		zap.String("name", namespace.Name))

	summary := h.namespaceToSummary(namespace)
	h.broadcastNamespaceEvent("namespaces_updated", summary)
}

// OnDelete handles namespace deletion events
func (h *NamespaceEventHandler) OnDelete(obj interface{}) {
	namespace, ok := obj.(*corev1.Namespace)
	if !ok {
		h.logger.Error("Failed to cast object to Namespace")
		return
	}

	h.logger.Info("Namespace deleted",
		zap.String("name", namespace.Name))

	summary := h.namespaceToSummary(namespace)
	h.broadcastNamespaceEvent("namespaces_deleted", summary)
}

// namespaceToSummary converts a Kubernetes namespace to summary format
func (h *NamespaceEventHandler) namespaceToSummary(namespace *corev1.Namespace) map[string]interface{} {
	// Calculate label and annotation counts
	labelsCount := 0
	if namespace.Labels != nil {
		labelsCount = len(namespace.Labels)
	}

	annotationsCount := 0
	if namespace.Annotations != nil {
		annotationsCount = len(namespace.Annotations)
	}

	return map[string]interface{}{
		"name":              namespace.Name,
		"creationTimestamp": namespace.CreationTimestamp.Format(time.RFC3339),
		"status":            string(namespace.Status.Phase),
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"labels":            namespace.Labels,
		"annotations":       namespace.Annotations,
	}
}

// broadcastNamespaceEvent broadcasts namespace events to WebSocket clients
func (h *NamespaceEventHandler) broadcastNamespaceEvent(action string, data map[string]interface{}) {
	// Broadcast to "overview" room for unified resource monitoring
	h.hub.BroadcastToRoom("overview", action, data)
}
