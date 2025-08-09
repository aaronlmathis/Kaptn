package informers

import (
	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// DeploymentEventHandler handles deployment events and broadcasts them via WebSocket
type DeploymentEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewDeploymentEventHandler creates a new deployment event handler
func NewDeploymentEventHandler(logger *zap.Logger, hub *ws.Hub) *DeploymentEventHandler {
	return &DeploymentEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles deployment addition events
func (h *DeploymentEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	deployment, ok := obj.(*appsv1.Deployment)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "deployment"))
		return
	}

	h.logger.Debug("Deployment added", zap.String("name", deployment.Name), zap.String("namespace", deployment.Namespace))

	// Convert to summary and broadcast
	summary := h.deploymentToSummary(deployment)
	//h.hub.BroadcastToRoom("deployments", "deployment_added", summary)
	h.hub.BroadcastToRoom("overview", "deployment_added", summary)
}

// OnUpdate handles deployment update events
func (h *DeploymentEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newDeployment, ok := newObj.(*appsv1.Deployment)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "deployment"))
		return
	}

	h.logger.Debug("Deployment updated", zap.String("name", newDeployment.Name), zap.String("namespace", newDeployment.Namespace))

	// Convert to summary and broadcast
	summary := h.deploymentToSummary(newDeployment)
	//h.hub.BroadcastToRoom("deployments", "deployment_updated", summary)
	h.hub.BroadcastToRoom("overview", "deployment_updated", summary)

}

// OnDelete handles deployment deletion events
func (h *DeploymentEventHandler) OnDelete(obj interface{}) {
	deployment, ok := obj.(*appsv1.Deployment)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "deployment"))
		return
	}

	h.logger.Debug("Deployment deleted", zap.String("name", deployment.Name), zap.String("namespace", deployment.Namespace))
	// Create deletion event data
	deletionData := map[string]string{
		"name":      deployment.Name,
		"namespace": deployment.Namespace,
	}
	// Broadcast deletion event
	// h.hub.BroadcastToRoom("deployments", "deployment_deleted", map[string]string{
	// 	"name":      deployment.Name,
	// 	"namespace": deployment.Namespace,
	// })
	h.hub.BroadcastToRoom("overview", "deployment_deleted", deletionData)
}

// deploymentToSummary converts a deployment to a summary representation
func (h *DeploymentEventHandler) deploymentToSummary(deployment *appsv1.Deployment) map[string]interface{} {
	// Get replica counts
	desired := int32(0)
	if deployment.Spec.Replicas != nil {
		desired = *deployment.Spec.Replicas
	}
	ready := deployment.Status.ReadyReplicas
	available := deployment.Status.AvailableReplicas
	updated := deployment.Status.UpdatedReplicas

	// Get deployment status
	status := "Unknown"
	var conditions []map[string]interface{}

	for _, condition := range deployment.Status.Conditions {
		conditionMap := map[string]interface{}{
			"type":    string(condition.Type),
			"status":  string(condition.Status),
			"reason":  condition.Reason,
			"message": condition.Message,
		}
		conditions = append(conditions, conditionMap)

		// Determine overall status
		if condition.Type == appsv1.DeploymentProgressing {
			if condition.Status == "True" && condition.Reason == "NewReplicaSetAvailable" {
				status = "Available"
			} else if condition.Status == "False" {
				status = "Failed"
			} else {
				status = "Progressing"
			}
		}
	}

	// If we have ready replicas equal to desired, it's running
	if ready == desired && desired > 0 {
		status = "Running"
	} else if ready == 0 && desired > 0 {
		status = "Pending"
	}

	// Get strategy type
	strategyType := string(deployment.Spec.Strategy.Type)
	if strategyType == "" {
		strategyType = "RollingUpdate"
	}

	// Get selector
	selector := map[string]string{}
	if deployment.Spec.Selector != nil && deployment.Spec.Selector.MatchLabels != nil {
		selector = deployment.Spec.Selector.MatchLabels
	}

	// Get container images
	images := []string{}
	for _, container := range deployment.Spec.Template.Spec.Containers {
		images = append(images, container.Image)
	}

	return map[string]interface{}{
		"name":      deployment.Name,
		"namespace": deployment.Namespace,
		"replicas": map[string]interface{}{
			"desired":   desired,
			"ready":     ready,
			"available": available,
			"updated":   updated,
		},
		"status":             status,
		"conditions":         conditions,
		"strategy":           strategyType,
		"selector":           selector,
		"images":             images,
		"labels":             deployment.Labels,
		"annotations":        deployment.Annotations,
		"creationTimestamp":  deployment.CreationTimestamp.Time,
		"generation":         deployment.Generation,
		"observedGeneration": deployment.Status.ObservedGeneration,
	}
}
