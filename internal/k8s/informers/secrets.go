package informers

import (
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
)

// SecretEventHandler handles secret events and broadcasts via WebSocket
type SecretEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewSecretEventHandler creates a new secret event handler
func NewSecretEventHandler(logger *zap.Logger, hub *ws.Hub) *SecretEventHandler {
	return &SecretEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles secret addition events
func (h *SecretEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	secret, ok := obj.(*v1.Secret)
	if !ok {
		h.logger.Error("Failed to cast object to Secret")
		return
	}

	h.logger.Debug("Secret added", zap.String("name", secret.Name), zap.String("namespace", secret.Namespace))

	summary := h.secretToSummary(secret)
	h.hub.BroadcastToRoom("overview", "secret_added", summary)
}

// OnUpdate handles secret update events
func (h *SecretEventHandler) OnUpdate(oldObj, newObj interface{}) {
	secret, ok := newObj.(*v1.Secret)
	if !ok {
		h.logger.Error("Failed to cast object to Secret")
		return
	}

	h.logger.Debug("Secret updated", zap.String("name", secret.Name), zap.String("namespace", secret.Namespace))

	summary := h.secretToSummary(secret)
	h.hub.BroadcastToRoom("overview", "secret_updated", summary)
}

// OnDelete handles secret deletion events
func (h *SecretEventHandler) OnDelete(obj interface{}) {
	secret, ok := obj.(*v1.Secret)
	if !ok {
		h.logger.Error("Failed to cast object to Secret")
		return
	}

	h.logger.Debug("Secret deleted", zap.String("name", secret.Name), zap.String("namespace", secret.Namespace))

	// Broadcast deletion event with basic identifiers
	h.hub.BroadcastToRoom("overview", "secret_deleted", map[string]string{
		"name":      secret.Name,
		"namespace": secret.Namespace,
	})
}

// secretToSummary converts a Kubernetes Secret to summary format
func (h *SecretEventHandler) secretToSummary(secret *v1.Secret) map[string]interface{} {
	// Count data keys (do not expose key names for security)
	dataKeysCount := len(secret.Data)

	// Get data keys for display (keys only, not values)
	var dataKeys []string
	for key := range secret.Data {
		dataKeys = append(dataKeys, key)
	}

	// Calculate approximate data size (for metrics, not exposing actual data)
	var dataSize int
	for _, value := range secret.Data {
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

	// Count labels and annotations
	labelsCount := len(secret.Labels)
	annotationsCount := len(secret.Annotations)

	// Determine if it's a system secret
	isSystemSecret := false
	if secret.Namespace == "kube-system" ||
		(secret.Type == v1.SecretTypeServiceAccountToken) ||
		(secret.Labels != nil && secret.Labels["kubernetes.io/managed-by"] != "") {
		isSystemSecret = true
	}

	return map[string]interface{}{
		"name":              secret.Name,
		"namespace":         secret.Namespace,
		"type":              string(secret.Type),
		"creationTimestamp": secret.CreationTimestamp.Format(time.RFC3339),
		"dataKeysCount":     dataKeysCount,
		"dataSize":          dataSizeStr,
		"dataSizeBytes":     dataSize,
		"dataKeys":          dataKeys,
		"labelsCount":       labelsCount,
		"annotationsCount":  annotationsCount,
		"isSystemSecret":    isSystemSecret,
		"immutable":         secret.Immutable != nil && *secret.Immutable,
	}
}
