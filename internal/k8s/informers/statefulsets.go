package informers

import (
	"fmt"
	"time"

	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// StatefulSetEventHandler handles statefulset events and broadcasts them via WebSocket
type StatefulSetEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewStatefulSetEventHandler creates a new statefulset event handler
func NewStatefulSetEventHandler(logger *zap.Logger, hub *ws.Hub) *StatefulSetEventHandler {
	return &StatefulSetEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles statefulset addition events
func (h *StatefulSetEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	statefulSet, ok := obj.(*appsv1.StatefulSet)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "statefulset"))
		return
	}

	h.logger.Info("StatefulSet added", zap.String("name", statefulSet.Name), zap.String("namespace", statefulSet.Namespace))

	// Convert to summary and broadcast
	summary := h.statefulSetToSummary(statefulSet)
	h.hub.BroadcastToRoom("overview", "statefulset_added", summary)
}

// OnUpdate handles statefulset update events
func (h *StatefulSetEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newStatefulSet, ok := newObj.(*appsv1.StatefulSet)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "statefulset"))
		return
	}

	h.logger.Info("StatefulSet updated", zap.String("name", newStatefulSet.Name), zap.String("namespace", newStatefulSet.Namespace))

	// Convert to summary and broadcast
	summary := h.statefulSetToSummary(newStatefulSet)
	h.hub.BroadcastToRoom("overview", "statefulset_updated", summary)
}

// OnDelete handles statefulset deletion events
func (h *StatefulSetEventHandler) OnDelete(obj interface{}) {
	statefulSet, ok := obj.(*appsv1.StatefulSet)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "statefulset"))
		return
	}

	h.logger.Info("StatefulSet deleted", zap.String("name", statefulSet.Name), zap.String("namespace", statefulSet.Namespace))

	// Convert to summary and broadcast
	summary := h.statefulSetToSummary(statefulSet)
	h.hub.BroadcastToRoom("overview", "statefulset_deleted", summary)
}

// statefulSetToSummary converts a statefulset to a summary representation
func (h *StatefulSetEventHandler) statefulSetToSummary(statefulSet *appsv1.StatefulSet) map[string]interface{} {
	// Get replica counts
	var replicas int32 = 0
	if statefulSet.Spec.Replicas != nil {
		replicas = *statefulSet.Spec.Replicas
	}

	ready := statefulSet.Status.ReadyReplicas
	current := statefulSet.Status.CurrentReplicas
	updated := statefulSet.Status.UpdatedReplicas

	// Format ready as "x/y"
	readyStr := fmt.Sprintf("%d/%d", ready, replicas)

	// Get container images
	images := []string{}
	for _, container := range statefulSet.Spec.Template.Spec.Containers {
		images = append(images, container.Image)
	}

	// Get the first image or empty string for the main image field
	image := ""
	if len(images) > 0 {
		image = images[0]
	}

	// Get service name
	serviceName := statefulSet.Spec.ServiceName

	// Get update strategy
	updateStrategy := string(statefulSet.Spec.UpdateStrategy.Type)

	// Get partition (for RollingUpdate strategy)
	var partition *int32
	if statefulSet.Spec.UpdateStrategy.RollingUpdate != nil &&
		statefulSet.Spec.UpdateStrategy.RollingUpdate.Partition != nil {
		partition = statefulSet.Spec.UpdateStrategy.RollingUpdate.Partition
	}

	return map[string]interface{}{
		"name":               statefulSet.Name,
		"namespace":          statefulSet.Namespace,
		"ready":              readyStr,
		"replicas":           replicas,
		"readyReplicas":      ready,
		"currentReplicas":    current,
		"updatedReplicas":    updated,
		"image":              image,
		"images":             images,
		"serviceName":        serviceName,
		"updateStrategy":     updateStrategy,
		"partition":          partition,
		"labels":             statefulSet.Labels,
		"annotations":        statefulSet.Annotations,
		"creationTimestamp":  statefulSet.CreationTimestamp.Time.Format(time.RFC3339),
		"generation":         statefulSet.Generation,
		"observedGeneration": statefulSet.Status.ObservedGeneration,
	}
}
