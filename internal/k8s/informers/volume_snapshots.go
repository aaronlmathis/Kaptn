package informers

import (
	"fmt"
	"time"

	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// VolumeSnapshotEventHandler handles volume snapshot events and broadcasts them via WebSocket
type VolumeSnapshotEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewVolumeSnapshotEventHandler creates a new volume snapshot event handler
func NewVolumeSnapshotEventHandler(logger *zap.Logger, hub *ws.Hub) *VolumeSnapshotEventHandler {
	return &VolumeSnapshotEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles volume snapshot addition events
func (h *VolumeSnapshotEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	h.logger.Info("Volume snapshot OnAdd called", zap.Bool("isInInitialList", isInInitialList))

	unstructuredObj, ok := obj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "volumesnapshot"))
		return
	}

	h.logger.Info("VolumeSnapshot added",
		zap.String("name", unstructuredObj.GetName()),
		zap.String("namespace", unstructuredObj.GetNamespace()))

	// Convert to summary and broadcast
	summary := h.volumeSnapshotToSummary(unstructuredObj)
	h.logger.Info("Broadcasting volume snapshot added event",
		zap.String("name", unstructuredObj.GetName()),
		zap.Any("summary", summary))
	h.hub.BroadcastToRoom("overview", "volumesnapshots_added", summary)
}

// OnUpdate handles volume snapshot update events
func (h *VolumeSnapshotEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newUnstructuredObj, ok := newObj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "volumesnapshot"))
		return
	}

	h.logger.Debug("VolumeSnapshot updated",
		zap.String("name", newUnstructuredObj.GetName()),
		zap.String("namespace", newUnstructuredObj.GetNamespace()))

	// Convert to summary and broadcast
	summary := h.volumeSnapshotToSummary(newUnstructuredObj)
	h.hub.BroadcastToRoom("overview", "volumesnapshots_updated", summary)
}

// OnDelete handles volume snapshot deletion events
func (h *VolumeSnapshotEventHandler) OnDelete(obj interface{}) {
	h.logger.Info("Volume snapshot OnDelete called")

	unstructuredObj, ok := obj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "volumesnapshot"))
		return
	}

	h.logger.Info("VolumeSnapshot deleted",
		zap.String("name", unstructuredObj.GetName()),
		zap.String("namespace", unstructuredObj.GetNamespace()))

	summary := h.volumeSnapshotToSummary(unstructuredObj)
	h.logger.Info("Broadcasting volume snapshot deleted event",
		zap.String("name", unstructuredObj.GetName()),
		zap.Any("summary", summary))
	h.hub.BroadcastToRoom("overview", "volumesnapshots_deleted", summary)
}

// volumeSnapshotToSummary converts a volume snapshot to summary format for WebSocket broadcast
func (h *VolumeSnapshotEventHandler) volumeSnapshotToSummary(obj *unstructured.Unstructured) map[string]interface{} {
	name := obj.GetName()
	namespace := obj.GetNamespace()
	creationTimestamp := obj.GetCreationTimestamp().Format(time.RFC3339)

	// Extract spec fields
	spec, _, _ := unstructured.NestedMap(obj.Object, "spec")
	sourcePVC := ""
	volumeSnapshotClassName := ""

	if spec != nil {
		if source, exists := spec["source"]; exists {
			if sourceMap, ok := source.(map[string]interface{}); ok {
				if pvcName, exists := sourceMap["persistentVolumeClaimName"]; exists {
					if pvcNameStr, ok := pvcName.(string); ok {
						sourcePVC = pvcNameStr
					}
				}
			}
		}

		if className, exists := spec["volumeSnapshotClassName"]; exists {
			if classNameStr, ok := className.(string); ok {
				volumeSnapshotClassName = classNameStr
			}
		}
	}

	// Extract status fields
	status, _, _ := unstructured.NestedMap(obj.Object, "status")
	readyToUse := false
	restoreSize := ""
	creationTime := ""
	snapshotHandle := ""

	if status != nil {
		if ready, exists := status["readyToUse"]; exists {
			if readyBool, ok := ready.(bool); ok {
				readyToUse = readyBool
			}
		}

		if size, exists := status["restoreSize"]; exists {
			if sizeStr, ok := size.(string); ok {
				restoreSize = sizeStr
			}
		}

		if creationTimeVal, exists := status["creationTime"]; exists {
			if creationTimeStr, ok := creationTimeVal.(string); ok {
				creationTime = creationTimeStr
			}
		}

		if handle, exists := status["snapshotHandle"]; exists {
			if handleStr, ok := handle.(string); ok {
				snapshotHandle = handleStr
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
		"name":                    name,
		"namespace":               namespace,
		"sourcePVC":               sourcePVC,
		"volumeSnapshotClassName": volumeSnapshotClassName,
		"readyToUse":              readyToUse,
		"restoreSize":             restoreSize,
		"creationTime":            creationTime,
		"snapshotHandle":          snapshotHandle,
		"age":                     age,
		"labelsCount":             labelsCount,
		"annotationsCount":        annotationsCount,
		"creationTimestamp":       creationTimestamp,
	}
}
