package informers

import (
	"time"

	"go.uber.org/zap"
	storagev1 "k8s.io/api/storage/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// StorageClassEventHandler handles storage class events and broadcasts via WebSocket
type StorageClassEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewStorageClassEventHandler creates a new storage class event handler
func NewStorageClassEventHandler(logger *zap.Logger, hub *ws.Hub) *StorageClassEventHandler {
	return &StorageClassEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles storage class addition events
func (h *StorageClassEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	sc, ok := obj.(*storagev1.StorageClass)
	if !ok {
		h.logger.Error("Failed to cast object to StorageClass")
		return
	}

	h.logger.Info("StorageClass added", zap.String("name", sc.Name))

	summary := h.storageClassToSummary(sc)
	h.broadcastStorageClassEvent("storageclasses_added", summary)
}

// OnUpdate handles storage class update events
func (h *StorageClassEventHandler) OnUpdate(oldObj, newObj interface{}) {
	sc, ok := newObj.(*storagev1.StorageClass)
	if !ok {
		h.logger.Error("Failed to cast object to StorageClass")
		return
	}

	h.logger.Info("StorageClass updated", zap.String("name", sc.Name))

	summary := h.storageClassToSummary(sc)
	h.broadcastStorageClassEvent("storageclasses_updated", summary)
}

// OnDelete handles storage class deletion events
func (h *StorageClassEventHandler) OnDelete(obj interface{}) {
	sc, ok := obj.(*storagev1.StorageClass)
	if !ok {
		h.logger.Error("Failed to cast object to StorageClass")
		return
	}

	h.logger.Info("StorageClass deleted", zap.String("name", sc.Name))

	summary := h.storageClassToSummary(sc)
	h.broadcastStorageClassEvent("storageclasses_deleted", summary)
}

// storageClassToSummary converts a StorageClass to summary format
func (h *StorageClassEventHandler) storageClassToSummary(sc *storagev1.StorageClass) map[string]interface{} {
	// Calculate age
	age := time.Since(sc.CreationTimestamp.Time).Round(time.Second).String()
	if age == "0s" {
		age = "1s"
	}

	// Get provisioner
	provisioner := sc.Provisioner

	// Get reclaim policy
	reclaimPolicy := "Delete" // Default
	if sc.ReclaimPolicy != nil {
		reclaimPolicy = string(*sc.ReclaimPolicy)
	}

	// Get volume binding mode
	volumeBindingMode := "Immediate" // Default
	if sc.VolumeBindingMode != nil {
		volumeBindingMode = string(*sc.VolumeBindingMode)
	}

	// Get allow volume expansion
	allowVolumeExpansion := false
	if sc.AllowVolumeExpansion != nil {
		allowVolumeExpansion = *sc.AllowVolumeExpansion
	}

	// Count parameters
	parametersCount := len(sc.Parameters)

	// Check if it's the default storage class
	isDefault := false
	if sc.Annotations != nil {
		if value, exists := sc.Annotations["storageclass.kubernetes.io/is-default-class"]; exists && value == "true" {
			isDefault = true
		}
	}

	return map[string]interface{}{
		"name":                 sc.Name,
		"provisioner":          provisioner,
		"reclaimPolicy":        reclaimPolicy,
		"volumeBindingMode":    volumeBindingMode,
		"allowVolumeExpansion": allowVolumeExpansion,
		"parametersCount":      parametersCount,
		"age":                  age,
		"labelsCount":          len(sc.Labels),
		"annotationsCount":     len(sc.Annotations),
		"isDefault":            isDefault,
		"creationTimestamp":    sc.CreationTimestamp.Format(time.RFC3339),
	}
}

// broadcastStorageClassEvent broadcasts storage class events to WebSocket clients
func (h *StorageClassEventHandler) broadcastStorageClassEvent(action string, data map[string]interface{}) {
	// Broadcast to "overview" room for unified resource monitoring using the 3-parameter method
	h.hub.BroadcastToRoom("overview", action, data)
}
