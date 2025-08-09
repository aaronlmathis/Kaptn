package informers

import (
	"time"

	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// PersistentVolumeEventHandler handles persistent volume events and broadcasts via WebSocket
type PersistentVolumeEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewPersistentVolumeEventHandler creates a new persistent volume event handler
func NewPersistentVolumeEventHandler(logger *zap.Logger, hub *ws.Hub) *PersistentVolumeEventHandler {
	return &PersistentVolumeEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles persistent volume addition events
func (h *PersistentVolumeEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	pv, ok := obj.(*v1.PersistentVolume)
	if !ok {
		h.logger.Error("Failed to cast object to PersistentVolume")
		return
	}

	h.logger.Info("PersistentVolume added", zap.String("name", pv.Name))

	summary := h.persistentVolumeToSummary(pv)
	h.broadcastPersistentVolumeEvent("persistentvolumes_added", summary)
}

// OnUpdate handles persistent volume update events
func (h *PersistentVolumeEventHandler) OnUpdate(oldObj, newObj interface{}) {
	pv, ok := newObj.(*v1.PersistentVolume)
	if !ok {
		h.logger.Error("Failed to cast object to PersistentVolume")
		return
	}

	h.logger.Info("PersistentVolume updated", zap.String("name", pv.Name))

	summary := h.persistentVolumeToSummary(pv)
	h.broadcastPersistentVolumeEvent("persistentvolumes_updated", summary)
}

// OnDelete handles persistent volume deletion events
func (h *PersistentVolumeEventHandler) OnDelete(obj interface{}) {
	pv, ok := obj.(*v1.PersistentVolume)
	if !ok {
		h.logger.Error("Failed to cast object to PersistentVolume")
		return
	}

	h.logger.Info("PersistentVolume deleted", zap.String("name", pv.Name))

	summary := h.persistentVolumeToSummary(pv)
	h.broadcastPersistentVolumeEvent("persistentvolumes_deleted", summary)
}

// persistentVolumeToSummary converts a PersistentVolume to summary format
func (h *PersistentVolumeEventHandler) persistentVolumeToSummary(pv *v1.PersistentVolume) map[string]interface{} {
	// Calculate age
	age := time.Since(pv.CreationTimestamp.Time).Round(time.Second).String()
	if age == "0s" {
		age = "1s"
	}

	// Get capacity
	capacity := "Unknown"
	if pv.Spec.Capacity != nil {
		if storageQuantity, ok := pv.Spec.Capacity[v1.ResourceStorage]; ok {
			capacity = storageQuantity.String()
		}
	}

	// Get access modes
	accessModes := make([]string, len(pv.Spec.AccessModes))
	for i, mode := range pv.Spec.AccessModes {
		switch mode {
		case v1.ReadWriteOnce:
			accessModes[i] = "RWO"
		case v1.ReadOnlyMany:
			accessModes[i] = "ROX"
		case v1.ReadWriteMany:
			accessModes[i] = "RWX"
		case v1.ReadWriteOncePod:
			accessModes[i] = "RWOP"
		default:
			accessModes[i] = string(mode)
		}
	}

	// Get reclaim policy
	reclaimPolicy := "Unknown"
	if pv.Spec.PersistentVolumeReclaimPolicy != "" {
		reclaimPolicy = string(pv.Spec.PersistentVolumeReclaimPolicy)
	}

	// Get status/phase
	status := string(pv.Status.Phase)

	// Get claim reference
	claimRef := ""
	if pv.Spec.ClaimRef != nil {
		claimRef = pv.Spec.ClaimRef.Namespace + "/" + pv.Spec.ClaimRef.Name
	}

	// Get storage class
	storageClass := pv.Spec.StorageClassName
	if storageClass == "" {
		storageClass = "<none>"
	}

	// Get volume source type
	volumeSource := "Unknown"
	if pv.Spec.HostPath != nil {
		volumeSource = "HostPath"
	} else if pv.Spec.NFS != nil {
		volumeSource = "NFS"
	} else if pv.Spec.GCEPersistentDisk != nil {
		volumeSource = "GCE"
	} else if pv.Spec.AWSElasticBlockStore != nil {
		volumeSource = "AWS EBS"
	} else if pv.Spec.CSI != nil {
		volumeSource = "CSI (" + pv.Spec.CSI.Driver + ")"
	} else if pv.Spec.Local != nil {
		volumeSource = "Local"
	}

	return map[string]interface{}{
		"name":               pv.Name,
		"capacity":           capacity,
		"accessModes":        accessModes,
		"accessModesDisplay": "[" + joinStringSlice(accessModes, ",") + "]",
		"reclaimPolicy":      reclaimPolicy,
		"status":             status,
		"claim":              claimRef,
		"storageClass":       storageClass,
		"volumeSource":       volumeSource,
		"age":                age,
		"labelsCount":        len(pv.Labels),
		"annotationsCount":   len(pv.Annotations),
		"creationTimestamp":  pv.CreationTimestamp.Format(time.RFC3339),
	}
}

// broadcastPersistentVolumeEvent broadcasts persistent volume events to WebSocket clients
func (h *PersistentVolumeEventHandler) broadcastPersistentVolumeEvent(action string, data map[string]interface{}) {
	// Broadcast to "overview" room for unified resource monitoring using the 3-parameter method
	h.hub.BroadcastToRoom("overview", action, data)
}

// Helper function to join string slice
func joinStringSlice(slice []string, separator string) string {
	if len(slice) == 0 {
		return ""
	}

	result := slice[0]
	for i := 1; i < len(slice); i++ {
		result += separator + slice[i]
	}
	return result
}
