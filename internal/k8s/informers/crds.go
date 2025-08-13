package informers

import (
	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// CustomResourceDefinitionEventHandler handles CRD events and broadcasts them via WebSocket
type CustomResourceDefinitionEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewCustomResourceDefinitionEventHandler creates a new CRD event handler
func NewCustomResourceDefinitionEventHandler(logger *zap.Logger, hub *ws.Hub) *CustomResourceDefinitionEventHandler {
	return &CustomResourceDefinitionEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles CRD addition events
func (h *CustomResourceDefinitionEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	crd, ok := obj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "customresourcedefinition"))
		return
	}

	h.logger.Debug("CustomResourceDefinition added", zap.String("name", crd.GetName()))

	// Convert to summary and broadcast
	summary := h.crdToSummary(crd)
	h.hub.BroadcastToRoom("overview", "crd_added", summary)
}

// OnUpdate handles CRD update events
func (h *CustomResourceDefinitionEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newCRD, ok := newObj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "customresourcedefinition"))
		return
	}

	h.logger.Debug("CustomResourceDefinition updated", zap.String("name", newCRD.GetName()))

	// Convert to summary and broadcast
	summary := h.crdToSummary(newCRD)
	h.hub.BroadcastToRoom("overview", "crd_updated", summary)
}

// OnDelete handles CRD deletion events
func (h *CustomResourceDefinitionEventHandler) OnDelete(obj interface{}) {
	crd, ok := obj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "customresourcedefinition"))
		return
	}

	h.logger.Debug("CustomResourceDefinition deleted", zap.String("name", crd.GetName()))

	// Broadcast deletion event
	h.hub.BroadcastToRoom("overview", "crd_deleted", map[string]string{"name": crd.GetName()})
}

// crdToSummary converts a CRD to a summary representation
func (h *CustomResourceDefinitionEventHandler) crdToSummary(crd *unstructured.Unstructured) map[string]interface{} {
	// Convert to map for easier access
	crdMap, err := runtime.DefaultUnstructuredConverter.ToUnstructured(crd)
	if err != nil {
		h.logger.Error("Failed to convert CRD to map", zap.Error(err))
		return map[string]interface{}{}
	}

	// Extract spec information
	spec, _ := crdMap["spec"].(map[string]interface{})
	group, _ := spec["group"].(string)
	scope, _ := spec["scope"].(string)

	// Extract kind information
	names, _ := spec["names"].(map[string]interface{})
	kind, _ := names["kind"].(string)
	plural, _ := names["plural"].(string)
	singular, _ := names["singular"].(string)

	// Extract versions
	var versions []string
	var storedVersions []string
	if versionsInterface, ok := spec["versions"]; ok {
		versionsList, _ := versionsInterface.([]interface{})
		for _, v := range versionsList {
			versionMap, _ := v.(map[string]interface{})
			if versionName, ok := versionMap["name"].(string); ok {
				versions = append(versions, versionName)
				if stored, ok := versionMap["storage"].(bool); ok && stored {
					storedVersions = append(storedVersions, versionName)
				}
			}
		}
	}

	// Extract status information
	var establishedCondition, namesAcceptedCondition bool
	if status, ok := crdMap["status"]; ok && status != nil {
		statusMap, _ := status.(map[string]interface{})
		if conditions, ok := statusMap["conditions"]; ok && conditions != nil {
			conditionsList, _ := conditions.([]interface{})
			for _, c := range conditionsList {
				conditionMap, _ := c.(map[string]interface{})
				condType, _ := conditionMap["type"].(string)
				condStatus, _ := conditionMap["status"].(string)

				if condType == "Established" && condStatus == "True" {
					establishedCondition = true
				}
				if condType == "NamesAccepted" && condStatus == "True" {
					namesAcceptedCondition = true
				}
			}
		}
	}

	// Determine overall status
	status := "Unknown"
	if establishedCondition && namesAcceptedCondition {
		status = "Established"
	} else if namesAcceptedCondition {
		status = "Terminating"
	} else {
		status = "Not Ready"
	}

	return map[string]interface{}{
		"name":              crd.GetName(),
		"group":             group,
		"kind":              kind,
		"plural":            plural,
		"singular":          singular,
		"scope":             scope,
		"versions":          versions,
		"storedVersions":    storedVersions,
		"status":            status,
		"established":       establishedCondition,
		"namesAccepted":     namesAcceptedCondition,
		"labels":            crd.GetLabels(),
		"annotations":       crd.GetAnnotations(),
		"creationTimestamp": crd.GetCreationTimestamp().Time,
	}
}
