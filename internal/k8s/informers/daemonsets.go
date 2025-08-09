package informers

import (
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"
)

// DaemonSetEventHandler handles daemonset events and broadcasts via WebSocket
type DaemonSetEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewDaemonSetEventHandler creates a new daemonset event handler
func NewDaemonSetEventHandler(logger *zap.Logger, hub *ws.Hub) *DaemonSetEventHandler {
	return &DaemonSetEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles daemonset addition events
func (h *DaemonSetEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	daemonSet, ok := obj.(*appsv1.DaemonSet)
	if !ok {
		h.logger.Error("Failed to cast object to DaemonSet")
		return
	}

	h.logger.Debug("DaemonSet added", zap.String("name", daemonSet.Name), zap.String("namespace", daemonSet.Namespace))

	summary := h.daemonSetToSummary(daemonSet)
	h.hub.BroadcastToRoom("overview", "daemonsets_added", summary)
}

// OnUpdate handles daemonset update events
func (h *DaemonSetEventHandler) OnUpdate(oldObj, newObj interface{}) {
	daemonSet, ok := newObj.(*appsv1.DaemonSet)
	if !ok {
		h.logger.Error("Failed to cast object to DaemonSet")
		return
	}

	h.logger.Debug("DaemonSet updated", zap.String("name", daemonSet.Name), zap.String("namespace", daemonSet.Namespace))

	summary := h.daemonSetToSummary(daemonSet)
	h.hub.BroadcastToRoom("overview", "daemonsets_updated", summary)
}

// OnDelete handles daemonset deletion events
func (h *DaemonSetEventHandler) OnDelete(obj interface{}) {
	daemonSet, ok := obj.(*appsv1.DaemonSet)
	if !ok {
		h.logger.Error("Failed to cast object to DaemonSet")
		return
	}

	h.logger.Debug("DaemonSet deleted", zap.String("name", daemonSet.Name), zap.String("namespace", daemonSet.Namespace))

	// Broadcast deletion event with basic identifiers
	h.hub.BroadcastToRoom("overview", "daemonsets_deleted", map[string]string{
		"name":      daemonSet.Name,
		"namespace": daemonSet.Namespace,
	})
}

// daemonSetToSummary converts a Kubernetes DaemonSet to summary format
func (h *DaemonSetEventHandler) daemonSetToSummary(daemonSet *appsv1.DaemonSet) map[string]interface{} {
	// Get status information
	desiredNodes := daemonSet.Status.DesiredNumberScheduled
	currentNodes := daemonSet.Status.CurrentNumberScheduled
	readyNodes := daemonSet.Status.NumberReady
	availableNodes := daemonSet.Status.NumberAvailable
	updatedNodes := daemonSet.Status.UpdatedNumberScheduled
	misscheduledNodes := daemonSet.Status.NumberMisscheduled

	// Calculate health status
	var healthStatus string
	if readyNodes == desiredNodes && desiredNodes > 0 {
		healthStatus = "Healthy"
	} else if readyNodes > 0 {
		healthStatus = "Partial"
	} else {
		healthStatus = "Unhealthy"
	}

	// Get update strategy
	updateStrategy := string(daemonSet.Spec.UpdateStrategy.Type)
	if daemonSet.Spec.UpdateStrategy.RollingUpdate != nil {
		maxUnavailable := "1"
		if daemonSet.Spec.UpdateStrategy.RollingUpdate.MaxUnavailable != nil {
			maxUnavailable = daemonSet.Spec.UpdateStrategy.RollingUpdate.MaxUnavailable.String()
		}
		updateStrategy += " (maxUnavailable: " + maxUnavailable + ")"
	}

	// Get node selector information
	var nodeSelector []string
	for key, value := range daemonSet.Spec.Template.Spec.NodeSelector {
		nodeSelector = append(nodeSelector, key+"="+value)
	}

	// Count labels and annotations
	labelsCount := len(daemonSet.Labels)
	annotationsCount := len(daemonSet.Annotations)

	// Get container information
	containers := len(daemonSet.Spec.Template.Spec.Containers)
	initContainers := len(daemonSet.Spec.Template.Spec.InitContainers)

	return map[string]interface{}{
		"name":              daemonSet.Name,
		"namespace":         daemonSet.Namespace,
		"creationTimestamp": daemonSet.CreationTimestamp.Format(time.RFC3339),
		"desiredNodes":      desiredNodes,
		"currentNodes":      currentNodes,
		"readyNodes":        readyNodes,
		"availableNodes":    availableNodes,
		"updatedNodes":      updatedNodes,
		"misscheduledNodes": misscheduledNodes,
		"healthStatus":      healthStatus,
		"updateStrategy":    updateStrategy,
		"nodeSelector":      nodeSelector,
		"containers":        containers,
		"initContainers":    initContainers,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
	}
}
