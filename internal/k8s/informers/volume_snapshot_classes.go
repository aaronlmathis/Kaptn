package informers

import (
	"fmt"
	"time"

	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/tools/cache"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// VolumeSnapshotClassEventHandler handles volume snapshot class events and broadcasts them via WebSocket
type VolumeSnapshotClassEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewVolumeSnapshotClassEventHandler creates a new volume snapshot class event handler
func NewVolumeSnapshotClassEventHandler(logger *zap.Logger, hub *ws.Hub) *VolumeSnapshotClassEventHandler {
	return &VolumeSnapshotClassEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles volume snapshot class addition events
func (h *VolumeSnapshotClassEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	unstructuredObj, ok := obj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "volumesnapshotclass"))
		return
	}

	h.logger.Debug("VolumeSnapshotClass added",
		zap.String("name", unstructuredObj.GetName()))

	// Convert to summary and broadcast
	summary := h.volumeSnapshotClassToSummary(unstructuredObj)
	h.hub.BroadcastToRoom("overview", "volumesnapshotclasses_added", summary)
}

// OnUpdate handles volume snapshot class update events
func (h *VolumeSnapshotClassEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newUnstructuredObj, ok := newObj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "volumesnapshotclass"))
		return
	}

	h.logger.Debug("VolumeSnapshotClass updated",
		zap.String("name", newUnstructuredObj.GetName()))

	// Convert to summary and broadcast
	summary := h.volumeSnapshotClassToSummary(newUnstructuredObj)
	h.hub.BroadcastToRoom("overview", "volumesnapshotclasses_updated", summary)
}

// OnDelete handles volume snapshot class deletion events
func (h *VolumeSnapshotClassEventHandler) OnDelete(obj interface{}) {
	var unstructuredObj *unstructured.Unstructured
	var ok bool

	// Handle DeletedFinalStateUnknown
	if deleteState, isDeleteState := obj.(cache.DeletedFinalStateUnknown); isDeleteState {
		unstructuredObj, ok = deleteState.Obj.(*unstructured.Unstructured)
		if !ok {
			h.logger.Error("Unexpected object type in DeletedFinalStateUnknown", zap.String("type", "volumesnapshotclass"))
			return
		}
	} else {
		unstructuredObj, ok = obj.(*unstructured.Unstructured)
		if !ok {
			h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "volumesnapshotclass"))
			return
		}
	}

	h.logger.Debug("VolumeSnapshotClass deleted",
		zap.String("name", unstructuredObj.GetName()))

	// For delete events, we just need basic info
	summary := map[string]interface{}{
		"name": unstructuredObj.GetName(),
	}

	h.hub.BroadcastToRoom("overview", "volumesnapshotclasses_deleted", summary)
}

// volumeSnapshotClassToSummary converts a volume snapshot class to summary format for WebSocket broadcast
func (h *VolumeSnapshotClassEventHandler) volumeSnapshotClassToSummary(obj *unstructured.Unstructured) map[string]interface{} {
	name := obj.GetName()
	creationTimestamp := obj.GetCreationTimestamp().Format(time.RFC3339)

	// Extract driver and deletion policy from spec
	driver := "unknown"
	deletionPolicy := "unknown"
	parametersCount := 0

	if spec, exists, _ := unstructured.NestedMap(obj.Object, "spec"); exists && spec != nil {
		if driverVal, exists := spec["driver"]; exists {
			if driverStr, ok := driverVal.(string); ok {
				driver = driverStr
			}
		}

		if deletionPolicyVal, exists := spec["deletionPolicy"]; exists {
			if deletionPolicyStr, ok := deletionPolicyVal.(string); ok {
				deletionPolicy = deletionPolicyStr
			}
		}

		if parameters, exists := spec["parameters"]; exists {
			if parametersMap, ok := parameters.(map[string]interface{}); ok {
				parametersCount = len(parametersMap)
			}
		}
	}

	// Calculate age
	age := ""
	creationTimeObj := obj.GetCreationTimestamp()
	if !creationTimeObj.Time.IsZero() {
		duration := time.Since(creationTimeObj.Time)
		days := int(duration.Hours() / 24)
		hours := int(duration.Hours()) % 24
		minutes := int(duration.Minutes()) % 60

		if days > 0 {
			age = fmt.Sprintf("%dd", days)
		} else if hours > 0 {
			age = fmt.Sprintf("%dh", hours)
		} else {
			age = fmt.Sprintf("%dm", minutes)
		}
	}

	// Count labels and annotations
	labels := obj.GetLabels()
	annotations := obj.GetAnnotations()
	labelsCount := 0
	annotationsCount := 0

	if labels != nil {
		labelsCount = len(labels)
	}
	if annotations != nil {
		annotationsCount = len(annotations)
	}

	return map[string]interface{}{
		"name":              name,
		"driver":            driver,
		"deletionPolicy":    deletionPolicy,
		"age":               age,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"parametersCount":   parametersCount,
		"creationTimestamp": creationTimestamp,
	}
}
