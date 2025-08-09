package informers

import (
	"time"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// LoadBalancerEventHandler handles LoadBalancer service events and broadcasts via WebSocket
type LoadBalancerEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewLoadBalancerEventHandler creates a new LoadBalancer event handler
func NewLoadBalancerEventHandler(logger *zap.Logger, hub *ws.Hub) *LoadBalancerEventHandler {
	return &LoadBalancerEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles LoadBalancer service addition events
func (h *LoadBalancerEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	service, ok := obj.(*corev1.Service)
	if !ok {
		h.logger.Error("Failed to cast object to Service")
		return
	}

	// Only process LoadBalancer type services
	if service.Spec.Type != corev1.ServiceTypeLoadBalancer {
		return
	}

	h.logger.Info("LoadBalancer service added", zap.String("name", service.Name), zap.String("namespace", service.Namespace))

	summary := h.loadBalancerToSummary(service)
	h.broadcastLoadBalancerEvent("loadbalancers_added", summary)
}

// OnUpdate handles LoadBalancer service update events
func (h *LoadBalancerEventHandler) OnUpdate(oldObj, newObj interface{}) {
	service, ok := newObj.(*corev1.Service)
	if !ok {
		h.logger.Error("Failed to cast object to Service")
		return
	}

	// Only process LoadBalancer type services
	if service.Spec.Type != corev1.ServiceTypeLoadBalancer {
		return
	}

	h.logger.Info("LoadBalancer service updated", zap.String("name", service.Name), zap.String("namespace", service.Namespace))

	summary := h.loadBalancerToSummary(service)
	h.broadcastLoadBalancerEvent("loadbalancers_updated", summary)
}

// OnDelete handles LoadBalancer service deletion events
func (h *LoadBalancerEventHandler) OnDelete(obj interface{}) {
	service, ok := obj.(*corev1.Service)
	if !ok {
		h.logger.Error("Failed to cast object to Service")
		return
	}

	// Only process LoadBalancer type services
	if service.Spec.Type != corev1.ServiceTypeLoadBalancer {
		return
	}

	h.logger.Info("LoadBalancer service deleted", zap.String("name", service.Name), zap.String("namespace", service.Namespace))

	summary := h.loadBalancerToSummary(service)
	h.broadcastLoadBalancerEvent("loadbalancers_deleted", summary)
}

// loadBalancerToSummary converts a LoadBalancer service to summary format
func (h *LoadBalancerEventHandler) loadBalancerToSummary(service *corev1.Service) map[string]interface{} {
	// Collect external IPs
	externalIPs := []string{}
	for _, ingress := range service.Status.LoadBalancer.Ingress {
		if ingress.IP != "" {
			externalIPs = append(externalIPs, ingress.IP)
		}
		if ingress.Hostname != "" {
			externalIPs = append(externalIPs, ingress.Hostname)
		}
	}

	// If no external IPs from status, check if it's pending
	externalIP := "<none>"
	if len(externalIPs) > 0 {
		externalIP = externalIPs[0]
	} else if len(service.Status.LoadBalancer.Ingress) == 0 {
		externalIP = "<pending>"
	}

	// Format ports
	ports := []map[string]interface{}{}
	for _, port := range service.Spec.Ports {
		portMap := map[string]interface{}{
			"port":     port.Port,
			"protocol": string(port.Protocol),
		}
		if port.TargetPort.String() != "" {
			portMap["targetPort"] = port.TargetPort.String()
		}
		if port.NodePort != 0 {
			portMap["nodePort"] = port.NodePort
		}
		ports = append(ports, portMap)
	}

	return map[string]interface{}{
		"name":              service.Name,
		"namespace":         service.Namespace,
		"creationTimestamp": service.CreationTimestamp.Format(time.RFC3339),
		"type":              string(service.Spec.Type),
		"clusterIP":         service.Spec.ClusterIP,
		"externalIPs":       externalIPs,
		"externalIP":        externalIP,
		"ports":             ports,
		"labels":            service.Labels,
		"annotations":       service.Annotations,
	}
}

// broadcastLoadBalancerEvent broadcasts LoadBalancer events to WebSocket clients
func (h *LoadBalancerEventHandler) broadcastLoadBalancerEvent(action string, data map[string]interface{}) {
	// Broadcast to "overview" room for unified resource monitoring
	h.hub.BroadcastToRoom("overview", action, data)
}
