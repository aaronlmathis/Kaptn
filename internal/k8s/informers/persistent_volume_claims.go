package informers

import (
	"time"

	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// PersistentVolumeClaimEventHandler handles persistent volume claim events and broadcasts via WebSocket
type PersistentVolumeClaimEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewPersistentVolumeClaimEventHandler creates a new persistent volume claim event handler
func NewPersistentVolumeClaimEventHandler(logger *zap.Logger, hub *ws.Hub) *PersistentVolumeClaimEventHandler {
	return &PersistentVolumeClaimEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles persistent volume claim addition events
func (h *PersistentVolumeClaimEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	pvc, ok := obj.(*v1.PersistentVolumeClaim)
	if !ok {
		h.logger.Error("Failed to cast object to PersistentVolumeClaim")
		return
	}

	h.logger.Info("PersistentVolumeClaim added", zap.String("name", pvc.Name), zap.String("namespace", pvc.Namespace))

	summary := h.pvcToSummary(pvc)
	h.broadcastPVCEvent("persistentvolumeclaims_added", summary)
}

// OnUpdate handles persistent volume claim update events
func (h *PersistentVolumeClaimEventHandler) OnUpdate(oldObj, newObj interface{}) {
	pvc, ok := newObj.(*v1.PersistentVolumeClaim)
	if !ok {
		h.logger.Error("Failed to cast object to PersistentVolumeClaim")
		return
	}

	h.logger.Info("PersistentVolumeClaim updated", zap.String("name", pvc.Name), zap.String("namespace", pvc.Namespace))

	summary := h.pvcToSummary(pvc)
	h.broadcastPVCEvent("persistentvolumeclaims_updated", summary)
}

// OnDelete handles persistent volume claim deletion events
func (h *PersistentVolumeClaimEventHandler) OnDelete(obj interface{}) {
	pvc, ok := obj.(*v1.PersistentVolumeClaim)
	if !ok {
		h.logger.Error("Failed to cast object to PersistentVolumeClaim")
		return
	}

	h.logger.Info("PersistentVolumeClaim deleted", zap.String("name", pvc.Name), zap.String("namespace", pvc.Namespace))

	summary := h.pvcToSummary(pvc)
	h.broadcastPVCEvent("persistentvolumeclaims_deleted", summary)
}

// pvcToSummary converts a Kubernetes persistent volume claim to summary format
func (h *PersistentVolumeClaimEventHandler) pvcToSummary(pvc *v1.PersistentVolumeClaim) map[string]interface{} {
	// Calculate age
	age := time.Since(pvc.CreationTimestamp.Time).String()

	// Get storage class name
	storageClassName := ""
	if pvc.Spec.StorageClassName != nil {
		storageClassName = *pvc.Spec.StorageClassName
	}

	// Get access modes
	accessModes := make([]string, len(pvc.Spec.AccessModes))
	for i, mode := range pvc.Spec.AccessModes {
		accessModes[i] = string(mode)
	}

	// Get storage request
	storage := ""
	if requests := pvc.Spec.Resources.Requests; requests != nil {
		if storageQuantity, exists := requests[v1.ResourceStorage]; exists {
			storage = storageQuantity.String()
		}
	}

	// Get volume name
	volumeName := ""
	if pvc.Spec.VolumeName != "" {
		volumeName = pvc.Spec.VolumeName
	}

	// Get status
	status := string(pvc.Status.Phase)

	return map[string]interface{}{
		"name":               pvc.Name,
		"namespace":          pvc.Namespace,
		"creationTimestamp":  pvc.CreationTimestamp.Format(time.RFC3339),
		"status":             status,
		"storageClass":       storageClassName,
		"accessModes":        accessModes,
		"accessModesDisplay": "[" + joinStringSlice(accessModes, ",") + "]",
		"storage":            storage,
		"volumeName":         volumeName,
		"age":                age,
		"labelsCount":        len(pvc.Labels),
		"annotationsCount":   len(pvc.Annotations),
	}
}

// broadcastPVCEvent broadcasts persistent volume claim events to WebSocket clients
func (h *PersistentVolumeClaimEventHandler) broadcastPVCEvent(action string, data map[string]interface{}) {
	// Broadcast to "overview" room for unified resource monitoring using the 3-parameter method
	h.hub.BroadcastToRoom("overview", action, data)
}
