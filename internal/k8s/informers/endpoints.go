package informers

import (
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
)

// EndpointEventHandler handles endpoint events and broadcasts via WebSocket
type EndpointEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewEndpointEventHandler creates a new endpoint event handler
func NewEndpointEventHandler(logger *zap.Logger, hub *ws.Hub) *EndpointEventHandler {
	return &EndpointEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles endpoint addition events
func (h *EndpointEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	endpoint, ok := obj.(*v1.Endpoints)
	if !ok {
		h.logger.Error("Failed to cast object to Endpoints")
		return
	}

	h.logger.Debug("Endpoint added", zap.String("name", endpoint.Name), zap.String("namespace", endpoint.Namespace))

	summary := h.endpointToSummary(endpoint)
	h.hub.BroadcastToRoom("overview", "endpoints_added", summary)
}

// OnUpdate handles endpoint update events
func (h *EndpointEventHandler) OnUpdate(oldObj, newObj interface{}) {
	endpoint, ok := newObj.(*v1.Endpoints)
	if !ok {
		h.logger.Error("Failed to cast object to Endpoints")
		return
	}

	h.logger.Debug("Endpoint updated", zap.String("name", endpoint.Name), zap.String("namespace", endpoint.Namespace))

	summary := h.endpointToSummary(endpoint)
	h.hub.BroadcastToRoom("overview", "endpoints_updated", summary)
}

// OnDelete handles endpoint deletion events
func (h *EndpointEventHandler) OnDelete(obj interface{}) {
	endpoint, ok := obj.(*v1.Endpoints)
	if !ok {
		h.logger.Error("Failed to cast object to Endpoints")
		return
	}

	h.logger.Debug("Endpoint deleted", zap.String("name", endpoint.Name), zap.String("namespace", endpoint.Namespace))

	// Broadcast deletion event with basic identifiers
	h.hub.BroadcastToRoom("overview", "endpoints_deleted", map[string]string{
		"name":      endpoint.Name,
		"namespace": endpoint.Namespace,
	})
}

// endpointToSummary converts a Kubernetes Endpoints to summary format
func (h *EndpointEventHandler) endpointToSummary(endpoint *v1.Endpoints) map[string]interface{} {
	// Count total addresses and ports
	var totalAddresses int
	var totalPorts int
	var readyAddresses int
	var notReadyAddresses int

	for _, subset := range endpoint.Subsets {
		readyAddresses += len(subset.Addresses)
		notReadyAddresses += len(subset.NotReadyAddresses)
		totalAddresses += len(subset.Addresses) + len(subset.NotReadyAddresses)
		totalPorts += len(subset.Ports)
	}

	// Get port information
	var ports []map[string]interface{}
	for _, subset := range endpoint.Subsets {
		for _, port := range subset.Ports {
			portInfo := map[string]interface{}{
				"name":     port.Name,
				"port":     port.Port,
				"protocol": string(port.Protocol),
			}
			ports = append(ports, portInfo)
		}
	}

	// Count labels and annotations
	labelsCount := len(endpoint.Labels)
	annotationsCount := len(endpoint.Annotations)

	return map[string]interface{}{
		"name":              endpoint.Name,
		"namespace":         endpoint.Namespace,
		"creationTimestamp": endpoint.CreationTimestamp.Format(time.RFC3339),
		"totalAddresses":    totalAddresses,
		"readyAddresses":    readyAddresses,
		"notReadyAddresses": notReadyAddresses,
		"totalPorts":        totalPorts,
		"ports":             ports,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
	}
}
