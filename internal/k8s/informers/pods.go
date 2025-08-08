package informers

import (
	"fmt"
	"time"

	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// PodEventHandler handles pod events and broadcasts them via WebSocket
type PodEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewPodEventHandler creates a new pod event handler
func NewPodEventHandler(logger *zap.Logger, hub *ws.Hub) *PodEventHandler {
	return &PodEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles pod addition events
func (h *PodEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	pod, ok := obj.(*v1.Pod)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "pod"))
		return
	}

	h.logger.Debug("Pod added", zap.String("name", pod.Name), zap.String("namespace", pod.Namespace))

	// Convert to summary and broadcast in Stage 2 format
	summary := h.podToSummary(pod)
	h.hub.BroadcastToRoom("pods", "podUpdate", map[string]interface{}{
		"action": "added",
		"data":   summary,
	})
	
	// Also broadcast to overview room for unified WebSocket support
	h.hub.BroadcastToRoom("overview", "pod_added", summary)
}

// OnUpdate handles pod update events
func (h *PodEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newPod, ok := newObj.(*v1.Pod)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "pod"))
		return
	}

	h.logger.Debug("Pod updated", zap.String("name", newPod.Name), zap.String("namespace", newPod.Namespace))

	// Convert to summary and broadcast in Stage 2 format
	summary := h.podToSummary(newPod)
	h.hub.BroadcastToRoom("pods", "podUpdate", map[string]interface{}{
		"action": "modified",
		"data":   summary,
	})
	
	// Also broadcast to overview room for unified WebSocket support
	h.hub.BroadcastToRoom("overview", "pod_updated", summary)
}

// OnDelete handles pod deletion events
func (h *PodEventHandler) OnDelete(obj interface{}) {
	pod, ok := obj.(*v1.Pod)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "pod"))
		return
	}

	h.logger.Debug("Pod deleted", zap.String("name", pod.Name), zap.String("namespace", pod.Namespace))

	// Broadcast deletion event in Stage 2 format
	h.hub.BroadcastToRoom("pods", "podUpdate", map[string]interface{}{
		"action": "deleted",
		"data": map[string]interface{}{
			"name":      pod.Name,
			"namespace": pod.Namespace,
		},
	})
	
	// Also broadcast to overview room for unified WebSocket support
	h.hub.BroadcastToRoom("overview", "pod_deleted", map[string]interface{}{
		"name":      pod.Name,
		"namespace": pod.Namespace,
	})
}

// podToSummary converts a pod to a summary representation matching Stage 2 format
func (h *PodEventHandler) podToSummary(pod *v1.Pod) map[string]interface{} {
	// Check if all containers are ready
	readyContainers := 0
	totalContainers := len(pod.Spec.Containers)

	for _, containerStatus := range pod.Status.ContainerStatuses {
		if containerStatus.Ready {
			readyContainers++
		}
	}

	// Calculate restart count
	var restartCount int32
	for _, containerStatus := range pod.Status.ContainerStatuses {
		restartCount += containerStatus.RestartCount
	}

	// Format ready as "x/y"
	readyStr := fmt.Sprintf("%d/%d", readyContainers, totalContainers)

	// Calculate age
	age := calculateAge(pod.CreationTimestamp.Time)

	// Get status reason
	statusReason := getStatusReason(pod)

	return map[string]interface{}{
		"name":         pod.Name,
		"namespace":    pod.Namespace,
		"phase":        string(pod.Status.Phase),
		"ready":        readyStr,
		"restartCount": restartCount,
		"age":          age,
		"node":         pod.Spec.NodeName,
		"cpu": map[string]interface{}{
			"milli":          0,
			"ofLimitPercent": nil,
		},
		"memory": map[string]interface{}{
			"bytes":          0,
			"ofLimitPercent": nil,
		},
		"statusReason": statusReason,
		// Additional fields for compatibility
		"podIP":             pod.Status.PodIP,
		"labels":            pod.Labels,
		"creationTimestamp": pod.CreationTimestamp.Time,
	}
}

// calculateAge calculates a human-readable age string
func calculateAge(creationTime time.Time) string {
	duration := time.Since(creationTime)

	days := int(duration.Hours() / 24)
	if days > 0 {
		return fmt.Sprintf("%dd", days)
	}

	hours := int(duration.Hours())
	if hours > 0 {
		return fmt.Sprintf("%dh", hours)
	}

	minutes := int(duration.Minutes())
	if minutes > 0 {
		return fmt.Sprintf("%dm", minutes)
	}

	return fmt.Sprintf("%ds", int(duration.Seconds()))
}

// getStatusReason gets the reason for a pod's current status
func getStatusReason(pod *v1.Pod) *string {
	// Check for container states that indicate issues
	for _, containerStatus := range pod.Status.ContainerStatuses {
		if containerStatus.State.Waiting != nil {
			reason := containerStatus.State.Waiting.Reason
			return &reason
		}
		if containerStatus.State.Terminated != nil && containerStatus.State.Terminated.Reason != "Completed" {
			reason := containerStatus.State.Terminated.Reason
			return &reason
		}
	}

	// Check pod conditions for issues
	for _, condition := range pod.Status.Conditions {
		if condition.Status == v1.ConditionFalse && condition.Reason != "" {
			reason := condition.Reason
			return &reason
		}
	}

	return nil
}
