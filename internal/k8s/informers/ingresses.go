package informers

import (
	"time"

	"go.uber.org/zap"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/client-go/tools/cache"
)

// IngressEventHandler handles Ingress events and broadcasts via WebSocket
type IngressEventHandler struct {
	logger    *zap.Logger
	broadcast func(room string, event string, data interface{})
}

// NewIngressEventHandler creates a new ingress event handler
func NewIngressEventHandler(logger *zap.Logger, broadcast func(room string, event string, data interface{})) *IngressEventHandler {
	return &IngressEventHandler{
		logger:    logger,
		broadcast: broadcast,
	}
}

// OnAdd handles ingress addition events
func (h *IngressEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	ingress, ok := obj.(*networkingv1.Ingress)
	if !ok {
		h.logger.Error("Failed to cast object to Ingress")
		return
	}

	h.logger.Info("Ingress added",
		zap.String("name", ingress.Name),
		zap.String("namespace", ingress.Namespace))

	summary := h.ingressToSummary(ingress)
	h.broadcast("overview", "ingress_added", summary)
}

// OnUpdate handles ingress update events
func (h *IngressEventHandler) OnUpdate(oldObj, newObj interface{}) {
	ingress, ok := newObj.(*networkingv1.Ingress)
	if !ok {
		h.logger.Error("Failed to cast object to Ingress")
		return
	}

	h.logger.Info("Ingress updated",
		zap.String("name", ingress.Name),
		zap.String("namespace", ingress.Namespace))

	summary := h.ingressToSummary(ingress)
	h.broadcast("overview", "ingress_updated", summary)
}

// OnDelete handles ingress deletion events
func (h *IngressEventHandler) OnDelete(obj interface{}) {
	ingress, ok := obj.(*networkingv1.Ingress)
	if !ok {
		// Handle DeletedFinalStateUnknown
		if deletedObj, ok := obj.(cache.DeletedFinalStateUnknown); ok {
			ingress, ok = deletedObj.Obj.(*networkingv1.Ingress)
			if !ok {
				h.logger.Error("Failed to cast DeletedFinalStateUnknown object to Ingress")
				return
			}
		} else {
			h.logger.Error("Failed to cast object to Ingress")
			return
		}
	}

	h.logger.Info("Ingress deleted",
		zap.String("name", ingress.Name),
		zap.String("namespace", ingress.Namespace))

	summary := h.ingressToSummary(ingress)
	h.broadcast("overview", "ingress_deleted", summary)
}

// ingressToSummary converts a Kubernetes ingress to summary format
func (h *IngressEventHandler) ingressToSummary(ingress *networkingv1.Ingress) map[string]interface{} {
	// Extract ingress class
	ingressClass := ""
	if ingress.Spec.IngressClassName != nil {
		ingressClass = *ingress.Spec.IngressClassName
	} else if className, ok := ingress.Annotations["kubernetes.io/ingress.class"]; ok {
		ingressClass = className
	}

	// Extract hosts from ingress rules
	var hosts []string
	var paths []string
	for _, rule := range ingress.Spec.Rules {
		if rule.Host != "" {
			hosts = append(hosts, rule.Host)
		}

		if rule.HTTP != nil {
			for _, path := range rule.HTTP.Paths {
				if path.Path != "" {
					paths = append(paths, path.Path)
				}
			}
		}
	}

	// Extract external IPs from load balancer status
	var externalIPs []string
	for _, lbIngress := range ingress.Status.LoadBalancer.Ingress {
		if lbIngress.IP != "" {
			externalIPs = append(externalIPs, lbIngress.IP)
		} else if lbIngress.Hostname != "" {
			externalIPs = append(externalIPs, lbIngress.Hostname)
		}
	}

	// Create display strings
	hostsDisplay := ""
	if len(hosts) > 0 {
		if len(hosts) == 1 {
			hostsDisplay = hosts[0]
		} else {
			hostsDisplay = hosts[0] + " (+" + string(rune(len(hosts)-1)) + " more)"
		}
	}

	externalIPsDisplay := ""
	if len(externalIPs) > 0 {
		if len(externalIPs) == 1 {
			externalIPsDisplay = externalIPs[0]
		} else {
			externalIPsDisplay = externalIPs[0] + " (+" + string(rune(len(externalIPs)-1)) + " more)"
		}
	}

	return map[string]interface{}{
		"name":               ingress.Name,
		"namespace":          ingress.Namespace,
		"creationTimestamp":  ingress.CreationTimestamp.Format(time.RFC3339),
		"ingressClass":       ingressClass,
		"hosts":              hosts,
		"hostsDisplay":       hostsDisplay,
		"paths":              paths,
		"externalIPs":        externalIPs,
		"externalIPsDisplay": externalIPsDisplay,
		"rules":              len(ingress.Spec.Rules),
		"tlsHosts":           len(ingress.Spec.TLS),
	}
}
