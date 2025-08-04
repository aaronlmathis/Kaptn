package informers

import (
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// NodeEventHandler handles node events and broadcasts them via WebSocket
type NodeEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewNodeEventHandler creates a new node event handler
func NewNodeEventHandler(logger *zap.Logger, hub *ws.Hub) *NodeEventHandler {
	return &NodeEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles node addition events
func (h *NodeEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	node, ok := obj.(*v1.Node)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "node"))
		return
	}

	h.logger.Debug("Node added", zap.String("name", node.Name))

	// Convert to summary and broadcast
	summary := h.nodeToSummary(node)
	h.hub.BroadcastToRoom("nodes", "node_added", summary)
}

// OnUpdate handles node update events
func (h *NodeEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newNode, ok := newObj.(*v1.Node)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "node"))
		return
	}

	h.logger.Debug("Node updated", zap.String("name", newNode.Name))

	// Convert to summary and broadcast
	summary := h.nodeToSummary(newNode)
	h.hub.BroadcastToRoom("nodes", "node_updated", summary)
}

// OnDelete handles node deletion events
func (h *NodeEventHandler) OnDelete(obj interface{}) {
	node, ok := obj.(*v1.Node)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "node"))
		return
	}

	h.logger.Debug("Node deleted", zap.String("name", node.Name))

	// Broadcast deletion event
	h.hub.BroadcastToRoom("nodes", "node_deleted", map[string]string{"name": node.Name})
}

// nodeToSummary converts a node to a summary representation
func (h *NodeEventHandler) nodeToSummary(node *v1.Node) map[string]interface{} {
	// Extract node roles from labels
	roles := []string{}
	if _, isMaster := node.Labels["node-role.kubernetes.io/master"]; isMaster {
		roles = append(roles, "master")
	}
	if _, isControlPlane := node.Labels["node-role.kubernetes.io/control-plane"]; isControlPlane {
		roles = append(roles, "control-plane")
	}
	if len(roles) == 0 {
		roles = append(roles, "worker")
	}

	// Check if node is ready
	ready := false
	for _, condition := range node.Status.Conditions {
		if condition.Type == v1.NodeReady && condition.Status == v1.ConditionTrue {
			ready = true
			break
		}
	}

	// Extract taints
	taints := []map[string]string{}
	for _, taint := range node.Spec.Taints {
		taints = append(taints, map[string]string{
			"key":    taint.Key,
			"value":  taint.Value,
			"effect": string(taint.Effect),
		})
	}

	return map[string]interface{}{
		"name":              node.Name,
		"roles":             roles,
		"kubeletVersion":    node.Status.NodeInfo.KubeletVersion,
		"ready":             ready,
		"unschedulable":     node.Spec.Unschedulable,
		"taints":            taints,
		"capacity":          node.Status.Capacity,
		"allocatable":       node.Status.Allocatable,
		"creationTimestamp": node.CreationTimestamp.Time,
	}
}
