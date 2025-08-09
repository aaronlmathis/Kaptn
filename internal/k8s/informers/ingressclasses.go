package informers

import (
	"time"

	"go.uber.org/zap"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/client-go/tools/cache"
)

// IngressClassEventHandler handles IngressClass events and broadcasts via WebSocket
type IngressClassEventHandler struct {
	logger    *zap.Logger
	broadcast func(room string, event string, data interface{})
}

// NewIngressClassEventHandler creates a new ingress class event handler
func NewIngressClassEventHandler(logger *zap.Logger, broadcast func(room string, event string, data interface{})) *IngressClassEventHandler {
	return &IngressClassEventHandler{
		logger:    logger,
		broadcast: broadcast,
	}
}

// OnAdd handles ingress class addition events
func (h *IngressClassEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	ingressClass, ok := obj.(*networkingv1.IngressClass)
	if !ok {
		h.logger.Error("Failed to cast object to IngressClass")
		return
	}

	h.logger.Info("IngressClass added",
		zap.String("name", ingressClass.Name))

	summary := h.ingressClassToSummary(ingressClass)
	h.broadcast("overview", "ingressclasses_added", summary)
}

// OnUpdate handles ingress class update events
func (h *IngressClassEventHandler) OnUpdate(oldObj, newObj interface{}) {
	ingressClass, ok := newObj.(*networkingv1.IngressClass)
	if !ok {
		h.logger.Error("Failed to cast object to IngressClass")
		return
	}

	h.logger.Info("IngressClass updated",
		zap.String("name", ingressClass.Name))

	summary := h.ingressClassToSummary(ingressClass)
	h.broadcast("overview", "ingressclasses_updated", summary)
}

// OnDelete handles ingress class deletion events
func (h *IngressClassEventHandler) OnDelete(obj interface{}) {
	ingressClass, ok := obj.(*networkingv1.IngressClass)
	if !ok {
		// Handle DeletedFinalStateUnknown
		if deletedObj, ok := obj.(cache.DeletedFinalStateUnknown); ok {
			ingressClass, ok = deletedObj.Obj.(*networkingv1.IngressClass)
			if !ok {
				h.logger.Error("Failed to cast DeletedFinalStateUnknown object to IngressClass")
				return
			}
		} else {
			h.logger.Error("Failed to cast object to IngressClass")
			return
		}
	}

	h.logger.Info("IngressClass deleted",
		zap.String("name", ingressClass.Name))

	summary := h.ingressClassToSummary(ingressClass)
	h.broadcast("overview", "ingressclasses_deleted", summary)
}

// ingressClassToSummary converts a Kubernetes ingress class to summary format
func (h *IngressClassEventHandler) ingressClassToSummary(ingressClass *networkingv1.IngressClass) map[string]interface{} {
	// Check if this is the default ingress class
	isDefault := false
	if ingressClass.Annotations != nil {
		if val, exists := ingressClass.Annotations["ingressclass.kubernetes.io/is-default-class"]; exists && val == "true" {
			isDefault = true
		}
	}

	// Extract controller name
	controller := ""
	if ingressClass.Spec.Controller != "" {
		controller = ingressClass.Spec.Controller
	}

	// Extract parameters reference if exists
	parametersKind := ""
	parametersName := ""
	if ingressClass.Spec.Parameters != nil {
		if ingressClass.Spec.Parameters.Kind != "" {
			parametersKind = ingressClass.Spec.Parameters.Kind
		}
		if ingressClass.Spec.Parameters.Name != "" {
			parametersName = ingressClass.Spec.Parameters.Name
		}
	}

	return map[string]interface{}{
		"name":              ingressClass.Name,
		"creationTimestamp": ingressClass.CreationTimestamp.Format(time.RFC3339),
		"controller":        controller,
		"isDefault":         isDefault,
		"parametersKind":    parametersKind,
		"parametersName":    parametersName,
	}
}
