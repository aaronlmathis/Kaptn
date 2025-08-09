package informers

import (
	"time"

	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// ConfigMapEventHandler handles configmap events and broadcasts via WebSocket
type ConfigMapEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewConfigMapEventHandler creates a new configmap event handler
func NewConfigMapEventHandler(logger *zap.Logger, hub *ws.Hub) *ConfigMapEventHandler {
	return &ConfigMapEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles configmap addition events
func (h *ConfigMapEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	configMap, ok := obj.(*v1.ConfigMap)
	if !ok {
		h.logger.Error("Failed to cast object to ConfigMap")
		return
	}
	
	h.logger.Debug("ConfigMap added", zap.String("name", configMap.Name), zap.String("namespace", configMap.Namespace))
	
	summary := h.configMapToSummary(configMap)
	h.hub.BroadcastToRoom("overview", "configmap_added", summary)
}

// OnUpdate handles configmap update events  
func (h *ConfigMapEventHandler) OnUpdate(oldObj, newObj interface{}) {
	configMap, ok := newObj.(*v1.ConfigMap)
	if !ok {
		h.logger.Error("Failed to cast object to ConfigMap")
		return
	}
	
	h.logger.Debug("ConfigMap updated", zap.String("name", configMap.Name), zap.String("namespace", configMap.Namespace))
	
	summary := h.configMapToSummary(configMap)
	h.hub.BroadcastToRoom("overview", "configmap_updated", summary)
}

// OnDelete handles configmap deletion events
func (h *ConfigMapEventHandler) OnDelete(obj interface{}) {
	configMap, ok := obj.(*v1.ConfigMap)
	if !ok {
		h.logger.Error("Failed to cast object to ConfigMap")
		return
	}
	
	h.logger.Debug("ConfigMap deleted", zap.String("name", configMap.Name), zap.String("namespace", configMap.Namespace))
	
	// Broadcast deletion event with basic identifiers
	h.hub.BroadcastToRoom("overview", "configmap_deleted", map[string]string{
		"name":      configMap.Name,
		"namespace": configMap.Namespace,
	})
}

// configMapToSummary converts a Kubernetes ConfigMap to summary format
func (h *ConfigMapEventHandler) configMapToSummary(configMap *v1.ConfigMap) map[string]interface{} {
	// Count data keys
	dataKeysCount := len(configMap.Data)
	binaryDataKeysCount := len(configMap.BinaryData)
	totalKeys := dataKeysCount + binaryDataKeysCount

	// Calculate approximate data size
	var dataSize int
	for _, value := range configMap.Data {
		dataSize += len(value)
	}
	for _, value := range configMap.BinaryData {
		dataSize += len(value)
	}

	// Format data size
	dataSizeStr := "0 B"
	if dataSize > 0 {
		if dataSize < 1024 {
			dataSizeStr = "< 1 KB"
		} else if dataSize < 1024*1024 {
			dataSizeStr = "< 1 MB"
		} else {
			dataSizeStr = "> 1 MB"
		}
	}

	// Get data keys for display
	var dataKeys []string
	for key := range configMap.Data {
		dataKeys = append(dataKeys, key)
	}
	for key := range configMap.BinaryData {
		dataKeys = append(dataKeys, key+" (binary)")
	}

	// Count labels and annotations
	labelsCount := len(configMap.Labels)
	annotationsCount := len(configMap.Annotations)

	return map[string]interface{}{
		"name":              configMap.Name,
		"namespace":         configMap.Namespace,
		"creationTimestamp": configMap.CreationTimestamp.Format(time.RFC3339),
		"dataKeysCount":     totalKeys,
		"dataSize":          dataSizeStr,
		"dataSizeBytes":     dataSize,
		"dataKeys":          dataKeys,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
	}
}
