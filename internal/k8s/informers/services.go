package informers

import (
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// ServiceEventHandler handles service events and broadcasts them via WebSocket
type ServiceEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewServiceEventHandler creates a new service event handler
func NewServiceEventHandler(logger *zap.Logger, hub *ws.Hub) *ServiceEventHandler {
	return &ServiceEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles service addition events
func (h *ServiceEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	service, ok := obj.(*v1.Service)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "service"))
		return
	}

	h.logger.Debug("Service added", zap.String("name", service.Name))

	// Convert to summary and broadcast
	summary := h.serviceToSummary(service)
	// Broadcast to services room
	h.hub.BroadcastToRoom("services", "service_added", summary)
	
	// Also broadcast to overview room for unified WebSocket support
	h.hub.BroadcastToRoom("overview", "service_added", summary)
}

// OnUpdate handles service update events
func (h *ServiceEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newService, ok := newObj.(*v1.Service)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "service"))
		return
	}

	h.logger.Debug("Service updated", zap.String("name", newService.Name))

	// Convert to summary and broadcast
	summary := h.serviceToSummary(newService)
	// Broadcast to services room
	h.hub.BroadcastToRoom("services", "service_updated", summary)
	
	// Also broadcast to overview room for unified WebSocket support
	h.hub.BroadcastToRoom("overview", "service_updated", summary)
}

// OnDelete handles service deletion events
func (h *ServiceEventHandler) OnDelete(obj interface{}) {
	service, ok := obj.(*v1.Service)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "service"))
		return
	}

	h.logger.Debug("Service deleted", zap.String("name", service.Name))

	// Broadcast deletion event
	// Broadcast to services room  
	h.hub.BroadcastToRoom("services", "service_deleted", map[string]string{"name": service.Name})
	
	// Also broadcast to overview room for unified WebSocket support
	h.hub.BroadcastToRoom("overview", "service_deleted", map[string]string{"name": service.Name})
}

// serviceToSummary converts a service to a summary representation
func (h *ServiceEventHandler) serviceToSummary(service *v1.Service) map[string]interface{} {
	// Extract service type
	serviceType := string(service.Spec.Type)
	if serviceType == "" {
		serviceType = "ClusterIP" // Default service type
	}

	// Extract ports
	ports := []map[string]interface{}{}
	for _, port := range service.Spec.Ports {
		portInfo := map[string]interface{}{
			"name":       port.Name,
			"port":       port.Port,
			"targetPort": port.TargetPort.String(),
			"protocol":   string(port.Protocol),
		}
		if port.NodePort != 0 {
			portInfo["nodePort"] = port.NodePort
		}
		ports = append(ports, portInfo)
	}

	// Extract selector
	selector := service.Spec.Selector
	if selector == nil {
		selector = make(map[string]string)
	}

	// Get external IPs
	externalIPs := service.Spec.ExternalIPs
	if externalIPs == nil {
		externalIPs = []string{}
	}

	// Get load balancer ingress
	var loadBalancerIP string
	var loadBalancerIngress []map[string]string
	if service.Status.LoadBalancer.Ingress != nil {
		for _, ingress := range service.Status.LoadBalancer.Ingress {
			ingressInfo := map[string]string{}
			if ingress.IP != "" {
				ingressInfo["ip"] = ingress.IP
				if loadBalancerIP == "" {
					loadBalancerIP = ingress.IP
				}
			}
			if ingress.Hostname != "" {
				ingressInfo["hostname"] = ingress.Hostname
			}
			loadBalancerIngress = append(loadBalancerIngress, ingressInfo)
		}
	}

	return map[string]interface{}{
		"name":                service.Name,
		"namespace":           service.Namespace,
		"type":                serviceType,
		"clusterIP":           service.Spec.ClusterIP,
		"externalIPs":         externalIPs,
		"loadBalancerIP":      loadBalancerIP,
		"loadBalancerIngress": loadBalancerIngress,
		"ports":               ports,
		"selector":            selector,
		"sessionAffinity":     string(service.Spec.SessionAffinity),
		"labels":              service.Labels,
		"annotations":         service.Annotations,
		"creationTimestamp":   service.CreationTimestamp.Time,
	}
}
