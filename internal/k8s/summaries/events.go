package summaries

import (
	"context"
	"fmt"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	"go.uber.org/zap"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/client-go/tools/cache"
)

// SummaryEventHandler handles resource events and invalidates summary caches
type SummaryEventHandler struct {
	logger         *zap.Logger
	summaryService *SummaryService
	wsHub          *ws.Hub
	config         *SummaryConfig
}

// NewSummaryEventHandler creates a new summary event handler
func NewSummaryEventHandler(logger *zap.Logger, summaryService *SummaryService, wsHub *ws.Hub, config *SummaryConfig) *SummaryEventHandler {
	return &SummaryEventHandler{
		logger:         logger,
		summaryService: summaryService,
		wsHub:          wsHub,
		config:         config,
	}
}

// OnAdd handles resource addition events
func (h *SummaryEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	if isInInitialList {
		return // Skip initial sync events to avoid cache churn
	}
	h.handleResourceChange(obj, "added")
}

// OnUpdate handles resource update events
func (h *SummaryEventHandler) OnUpdate(oldObj, newObj interface{}) {
	h.handleResourceChange(newObj, "updated")
}

// OnDelete handles resource deletion events
func (h *SummaryEventHandler) OnDelete(obj interface{}) {
	h.handleResourceChange(obj, "deleted")
}

// handleResourceChange processes resource change events
func (h *SummaryEventHandler) handleResourceChange(obj interface{}, action string) {
	metaObj, err := meta.Accessor(obj)
	if err != nil {
		h.logger.Warn("Failed to get object metadata", zap.Error(err))
		return
	}

	resourceType := getResourceType(obj)
	namespace := metaObj.GetNamespace()

	h.logger.Debug("Resource change detected",
		zap.String("action", action),
		zap.String("resource", resourceType),
		zap.String("namespace", namespace),
		zap.String("name", metaObj.GetName()))

	// Invalidate cache for this resource type
	h.summaryService.InvalidateCache(resourceType, namespace)
	h.summaryService.InvalidateCache(resourceType, "") // Also invalidate cluster-wide cache

	// Broadcast real-time update if configured
	if h.config.IsRealtimeResource(resourceType) && h.wsHub != nil {
		go h.broadcastSummaryUpdate(resourceType, namespace, action)
	}
}

// broadcastSummaryUpdate sends real-time summary updates via WebSocket
func (h *SummaryEventHandler) broadcastSummaryUpdate(resourceType, namespace, action string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get updated summary
	summary, err := h.summaryService.GetResourceSummary(ctx, resourceType, namespace)
	if err != nil {
		h.logger.Warn("Failed to get summary for broadcast",
			zap.String("resource", resourceType),
			zap.String("namespace", namespace),
			zap.Error(err))
		return
	}

	// Create update event
	event := map[string]interface{}{
		"type":      "summaryUpdate",
		"action":    action,
		"resource":  resourceType,
		"namespace": namespace,
		"summary":   summary,
		"timestamp": time.Now(),
	}

	// Broadcast to appropriate room
	roomName := fmt.Sprintf("summaries:%s", resourceType)
	if namespace != "" {
		roomName = fmt.Sprintf("summaries:%s:%s", resourceType, namespace)
	}

	h.wsHub.BroadcastToRoom(roomName, "summaryUpdate", event)

	h.logger.Debug("Broadcasted summary update",
		zap.String("resource", resourceType),
		zap.String("namespace", namespace),
		zap.String("room", roomName))
}

// getResourceType determines the resource type from a Kubernetes object
func getResourceType(obj interface{}) string {
	switch obj := obj.(type) {
	case *cache.DeletedFinalStateUnknown:
		// Handle tombstone objects
		return getResourceType(obj.Obj)
	default:
		return getResourceTypeByStruct(obj)
	}
}

// getResourceTypeByStruct determines resource type by Go struct type
func getResourceTypeByStruct(obj interface{}) string {
	switch obj.(type) {
	case *corev1.Pod:
		return "pods"
	case *corev1.Node:
		return "nodes"
	case *corev1.Service:
		return "services"
	case *corev1.ConfigMap:
		return "configmaps"
	case *corev1.Secret:
		return "secrets"
	case *corev1.Endpoints:
		return "endpoints"
	case *appsv1.Deployment:
		return "deployments"
	case *appsv1.ReplicaSet:
		return "replicasets"
	case *appsv1.StatefulSet:
		return "statefulsets"
	case *appsv1.DaemonSet:
		return "daemonsets"
	default:
		// Fallback to string-based detection for unknown types
		return getResourceTypeByString(obj)
	}
}

// getResourceTypeByString detects resource types using string matching
func getResourceTypeByString(obj interface{}) string {
	// We need to import the apps/v1 types for this to work
	// For now, return a generic type
	typeName := fmt.Sprintf("%T", obj)

	// Simple string matching based on type name
	if contains(typeName, "Deployment") {
		return "deployments"
	} else if contains(typeName, "ReplicaSet") {
		return "replicasets"
	} else if contains(typeName, "StatefulSet") {
		return "statefulsets"
	} else if contains(typeName, "DaemonSet") {
		return "daemonsets"
	} else if contains(typeName, "Job") {
		return "jobs"
	} else if contains(typeName, "CronJob") {
		return "cronjobs"
	}

	return "unknown"
}

// contains checks if a string contains a substring (simple helper)
func contains(s, substr string) bool {
	return len(s) >= len(substr) &&
		(s == substr ||
			(len(s) > len(substr) &&
				(s[:len(substr)] == substr ||
					s[len(s)-len(substr):] == substr ||
					indexOf(s, substr) >= 0)))
}

// indexOf finds the index of a substring (simple implementation)
func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
