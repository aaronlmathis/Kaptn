package informers

import (
	"time"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// ResourceQuotaEventHandler handles resource quota events and broadcasts via WebSocket
type ResourceQuotaEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewResourceQuotaEventHandler creates a new resource quota event handler
func NewResourceQuotaEventHandler(logger *zap.Logger, hub *ws.Hub) *ResourceQuotaEventHandler {
	return &ResourceQuotaEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles resource quota addition events
func (h *ResourceQuotaEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	resourceQuota, ok := obj.(*corev1.ResourceQuota)
	if !ok {
		h.logger.Error("Failed to cast object to ResourceQuota")
		return
	}

	h.logger.Info("ResourceQuota added",
		zap.String("name", resourceQuota.Name),
		zap.String("namespace", resourceQuota.Namespace))

	summary := h.resourceQuotaToSummary(resourceQuota)
	h.broadcastResourceQuotaEvent("resource_quotas_added", summary)
}

// OnUpdate handles resource quota update events
func (h *ResourceQuotaEventHandler) OnUpdate(oldObj, newObj interface{}) {
	resourceQuota, ok := newObj.(*corev1.ResourceQuota)
	if !ok {
		h.logger.Error("Failed to cast object to ResourceQuota")
		return
	}

	h.logger.Info("ResourceQuota updated",
		zap.String("name", resourceQuota.Name),
		zap.String("namespace", resourceQuota.Namespace))

	summary := h.resourceQuotaToSummary(resourceQuota)
	h.broadcastResourceQuotaEvent("resource_quotas_updated", summary)
}

// OnDelete handles resource quota deletion events
func (h *ResourceQuotaEventHandler) OnDelete(obj interface{}) {
	resourceQuota, ok := obj.(*corev1.ResourceQuota)
	if !ok {
		h.logger.Error("Failed to cast object to ResourceQuota")
		return
	}

	h.logger.Info("ResourceQuota deleted",
		zap.String("name", resourceQuota.Name),
		zap.String("namespace", resourceQuota.Namespace))

	summary := h.resourceQuotaToSummary(resourceQuota)
	h.broadcastResourceQuotaEvent("resource_quotas_deleted", summary)
}

// resourceQuotaToSummary converts a Kubernetes resource quota to summary format
func (h *ResourceQuotaEventHandler) resourceQuotaToSummary(resourceQuota *corev1.ResourceQuota) map[string]interface{} {
	// Calculate label and annotation counts
	labelsCount := 0
	if resourceQuota.Labels != nil {
		labelsCount = len(resourceQuota.Labels)
	}

	annotationsCount := 0
	if resourceQuota.Annotations != nil {
		annotationsCount = len(resourceQuota.Annotations)
	}

	// Extract hard limits
	hardLimits := make([]map[string]interface{}, 0)
	if resourceQuota.Spec.Hard != nil {
		for name, quantity := range resourceQuota.Spec.Hard {
			hardLimits = append(hardLimits, map[string]interface{}{
				"name":     string(name),
				"quantity": quantity.String(),
			})
		}
	}

	// Extract used resources
	usedResources := make([]map[string]interface{}, 0)
	if resourceQuota.Status.Used != nil {
		for name, quantity := range resourceQuota.Status.Used {
			usedResources = append(usedResources, map[string]interface{}{
				"name":     string(name),
				"quantity": quantity.String(),
			})
		}
	}

	return map[string]interface{}{
		"name":              resourceQuota.Name,
		"namespace":         resourceQuota.Namespace,
		"creationTimestamp": resourceQuota.CreationTimestamp.Format(time.RFC3339),
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"hardLimits":        hardLimits,
		"usedResources":     usedResources,
		"labels":            resourceQuota.Labels,
		"annotations":       resourceQuota.Annotations,
	}
}

// broadcastResourceQuotaEvent broadcasts resource quota events to WebSocket clients
func (h *ResourceQuotaEventHandler) broadcastResourceQuotaEvent(action string, data map[string]interface{}) {
	h.logger.Info("Broadcasting resource quota event",
		zap.String("action", action),
		zap.Any("data", data))
	// Broadcast to "overview" room for unified resource monitoring
	h.hub.BroadcastToRoom("overview", action, data)
}
