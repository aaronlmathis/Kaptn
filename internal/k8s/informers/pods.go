package informers

import (
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"

	"github.com/acme/kad/internal/k8s/ws"
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

	// Convert to summary and broadcast
	summary := h.podToSummary(pod)
	h.hub.BroadcastToRoom("pods", "pod_added", summary)
}

// OnUpdate handles pod update events
func (h *PodEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newPod, ok := newObj.(*v1.Pod)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "pod"))
		return
	}

	h.logger.Debug("Pod updated", zap.String("name", newPod.Name), zap.String("namespace", newPod.Namespace))

	// Convert to summary and broadcast
	summary := h.podToSummary(newPod)
	h.hub.BroadcastToRoom("pods", "pod_updated", summary)
}

// OnDelete handles pod deletion events
func (h *PodEventHandler) OnDelete(obj interface{}) {
	pod, ok := obj.(*v1.Pod)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "pod"))
		return
	}

	h.logger.Debug("Pod deleted", zap.String("name", pod.Name), zap.String("namespace", pod.Namespace))

	// Broadcast deletion event
	h.hub.BroadcastToRoom("pods", "pod_deleted", map[string]string{
		"name":      pod.Name,
		"namespace": pod.Namespace,
	})
}

// podToSummary converts a pod to a summary representation
func (h *PodEventHandler) podToSummary(pod *v1.Pod) map[string]interface{} {
	// Determine pod status
	phase := string(pod.Status.Phase)
	ready := false

	// Check if all containers are ready
	readyContainers := 0
	totalContainers := len(pod.Spec.Containers)

	for _, condition := range pod.Status.Conditions {
		if condition.Type == v1.PodReady && condition.Status == v1.ConditionTrue {
			ready = true
			break
		}
	}

	for _, containerStatus := range pod.Status.ContainerStatuses {
		if containerStatus.Ready {
			readyContainers++
		}
	}

	return map[string]interface{}{
		"name":              pod.Name,
		"namespace":         pod.Namespace,
		"phase":             phase,
		"ready":             ready,
		"readyContainers":   readyContainers,
		"totalContainers":   totalContainers,
		"nodeName":          pod.Spec.NodeName,
		"podIP":             pod.Status.PodIP,
		"hostIP":            pod.Status.HostIP,
		"labels":            pod.Labels,
		"creationTimestamp": pod.CreationTimestamp.Time,
		"deletionTimestamp": pod.DeletionTimestamp,
		"restartPolicy":     string(pod.Spec.RestartPolicy),
	}
}
