package informers

import (
	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// ReplicaSetEventHandler handles replicaset events and broadcasts them via WebSocket
type ReplicaSetEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewReplicaSetEventHandler creates a new replicaset event handler
func NewReplicaSetEventHandler(logger *zap.Logger, hub *ws.Hub) *ReplicaSetEventHandler {
	return &ReplicaSetEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles replicaset addition events
func (h *ReplicaSetEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	replicaSet, ok := obj.(*appsv1.ReplicaSet)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "replicaset"))
		return
	}

	h.logger.Debug("ReplicaSet added", zap.String("name", replicaSet.Name), zap.String("namespace", replicaSet.Namespace))

	// Convert to summary and broadcast
	summary := h.replicaSetToSummary(replicaSet)
	h.hub.BroadcastToRoom("overview", "replicaset_added", summary)
}

// OnUpdate handles replicaset update events
func (h *ReplicaSetEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newReplicaSet, ok := newObj.(*appsv1.ReplicaSet)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "replicaset"))
		return
	}

	h.logger.Debug("ReplicaSet updated", zap.String("name", newReplicaSet.Name), zap.String("namespace", newReplicaSet.Namespace))

	// Convert to summary and broadcast
	summary := h.replicaSetToSummary(newReplicaSet)
	h.hub.BroadcastToRoom("overview", "replicaset_updated", summary)
}

// OnDelete handles replicaset deletion events
func (h *ReplicaSetEventHandler) OnDelete(obj interface{}) {
	replicaSet, ok := obj.(*appsv1.ReplicaSet)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "replicaset"))
		return
	}

	h.logger.Debug("ReplicaSet deleted", zap.String("name", replicaSet.Name), zap.String("namespace", replicaSet.Namespace))

	// Create deletion event data
	deletionData := map[string]string{
		"name":      replicaSet.Name,
		"namespace": replicaSet.Namespace,
	}
	// Broadcast deletion event
	h.hub.BroadcastToRoom("overview", "replicaset_deleted", deletionData)
}

// replicaSetToSummary converts a replicaset to a summary representation
func (h *ReplicaSetEventHandler) replicaSetToSummary(replicaSet *appsv1.ReplicaSet) map[string]interface{} {
	// Get replica counts
	desired := int32(0)
	if replicaSet.Spec.Replicas != nil {
		desired = *replicaSet.Spec.Replicas
	}
	ready := replicaSet.Status.ReadyReplicas
	available := replicaSet.Status.AvailableReplicas
	fullyLabeled := replicaSet.Status.FullyLabeledReplicas

	// Get container images
	images := []string{}
	for _, container := range replicaSet.Spec.Template.Spec.Containers {
		images = append(images, container.Image)
	}

	// Get replicaset status
	status := "Unknown"
	var conditions []map[string]interface{}

	for _, condition := range replicaSet.Status.Conditions {
		conditionMap := map[string]interface{}{
			"type":    string(condition.Type),
			"status":  string(condition.Status),
			"reason":  condition.Reason,
			"message": condition.Message,
		}
		conditions = append(conditions, conditionMap)

		// Determine overall status
		if condition.Type == appsv1.ReplicaSetReplicaFailure {
			if condition.Status == "True" {
				status = "Failed"
			}
		}
	}

	// If we have ready replicas equal to desired, it's running
	if ready == desired && desired > 0 {
		status = "Running"
	} else if ready == 0 && desired > 0 {
		status = "Pending"
	} else if ready > 0 && ready < desired {
		status = "Progressing"
	}

	// Get selector
	selector := map[string]string{}
	if replicaSet.Spec.Selector != nil && replicaSet.Spec.Selector.MatchLabels != nil {
		selector = replicaSet.Spec.Selector.MatchLabels
	}

	return map[string]interface{}{
		"name":      replicaSet.Name,
		"namespace": replicaSet.Namespace,
		"replicas": map[string]interface{}{
			"desired":      desired,
			"ready":        ready,
			"available":    available,
			"fullyLabeled": fullyLabeled,
		},
		"status":             status,
		"conditions":         conditions,
		"selector":           selector,
		"images":             images,
		"labels":             replicaSet.Labels,
		"annotations":        replicaSet.Annotations,
		"creationTimestamp":  replicaSet.CreationTimestamp.Time,
		"generation":         replicaSet.Generation,
		"observedGeneration": replicaSet.Status.ObservedGeneration,
	}
}
