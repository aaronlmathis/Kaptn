package informers

import (
	"time"

	"go.uber.org/zap"
	networkingv1 "k8s.io/api/networking/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// NetworkPolicyEventHandler handles network policy events and broadcasts via WebSocket
type NetworkPolicyEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewNetworkPolicyEventHandler creates a new network policy event handler
func NewNetworkPolicyEventHandler(logger *zap.Logger, hub *ws.Hub) *NetworkPolicyEventHandler {
	return &NetworkPolicyEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles network policy addition events
func (h *NetworkPolicyEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	networkPolicy, ok := obj.(*networkingv1.NetworkPolicy)
	if !ok {
		h.logger.Error("Failed to cast object to NetworkPolicy")
		return
	}

	h.logger.Info("Network policy added", zap.String("name", networkPolicy.Name), zap.String("namespace", networkPolicy.Namespace))

	summary := h.networkPolicyToSummary(networkPolicy)
	h.broadcastNetworkPolicyEvent("networkpolicies_added", summary)
}

// OnUpdate handles network policy update events
func (h *NetworkPolicyEventHandler) OnUpdate(oldObj, newObj interface{}) {
	networkPolicy, ok := newObj.(*networkingv1.NetworkPolicy)
	if !ok {
		h.logger.Error("Failed to cast object to NetworkPolicy")
		return
	}

	h.logger.Info("Network policy updated", zap.String("name", networkPolicy.Name), zap.String("namespace", networkPolicy.Namespace))

	summary := h.networkPolicyToSummary(networkPolicy)
	h.broadcastNetworkPolicyEvent("networkpolicies_updated", summary)
}

// OnDelete handles network policy deletion events
func (h *NetworkPolicyEventHandler) OnDelete(obj interface{}) {
	networkPolicy, ok := obj.(*networkingv1.NetworkPolicy)
	if !ok {
		h.logger.Error("Failed to cast object to NetworkPolicy")
		return
	}

	h.logger.Info("Network policy deleted", zap.String("name", networkPolicy.Name), zap.String("namespace", networkPolicy.Namespace))

	summary := h.networkPolicyToSummary(networkPolicy)
	h.broadcastNetworkPolicyEvent("networkpolicies_deleted", summary)
}

// networkPolicyToSummary converts a Kubernetes network policy to summary format
func (h *NetworkPolicyEventHandler) networkPolicyToSummary(networkPolicy *networkingv1.NetworkPolicy) map[string]interface{} {
	// Format pod selector
	podSelector := "All Pods"
	if len(networkPolicy.Spec.PodSelector.MatchLabels) > 0 {
		podSelector = "Custom Selector"
	}

	// Count ingress and egress rules
	ingressRules := len(networkPolicy.Spec.Ingress)
	egressRules := len(networkPolicy.Spec.Egress)

	// Format policy types
	policyTypes := ""
	if len(networkPolicy.Spec.PolicyTypes) > 0 {
		for i, policyType := range networkPolicy.Spec.PolicyTypes {
			if i > 0 {
				policyTypes += ", "
			}
			policyTypes += string(policyType)
		}
	} else {
		policyTypes = "Ingress"
	}

	// For now, we'll set affectedPods to 0 as calculating this requires querying pods
	// This could be enhanced later with actual pod counting
	affectedPods := 0

	return map[string]interface{}{
		"name":              networkPolicy.Name,
		"namespace":         networkPolicy.Namespace,
		"creationTimestamp": networkPolicy.CreationTimestamp.Format(time.RFC3339),
		"podSelector":       podSelector,
		"ingressRules":      ingressRules,
		"egressRules":       egressRules,
		"policyTypes":       policyTypes,
		"affectedPods":      affectedPods,
		"labels":            networkPolicy.Labels,
		"annotations":       networkPolicy.Annotations,
	}
}

// broadcastNetworkPolicyEvent broadcasts network policy events to WebSocket clients
func (h *NetworkPolicyEventHandler) broadcastNetworkPolicyEvent(action string, data map[string]interface{}) {
	// Broadcast to "overview" room for unified resource monitoring
	h.hub.BroadcastToRoom("overview", action, data)
}
