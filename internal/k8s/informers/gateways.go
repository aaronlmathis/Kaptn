package informers

import (
	"fmt"
	"time"

	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// GatewayEventHandler handles gateway events and broadcasts them via WebSocket
type GatewayEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewGatewayEventHandler creates a new gateway event handler
func NewGatewayEventHandler(logger *zap.Logger, hub *ws.Hub) *GatewayEventHandler {
	return &GatewayEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles gateway addition events
func (h *GatewayEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	gateway, ok := obj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "gateway"))
		return
	}

	name := gateway.GetName()
	h.logger.Debug("Gateway added", zap.String("name", name))

	// Convert to summary and broadcast
	summary := h.gatewayToSummary(gateway)
	h.hub.BroadcastToRoom("overview", "gateway_added", summary)
}

// OnUpdate handles gateway update events
func (h *GatewayEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newGateway, ok := newObj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "gateway"))
		return
	}

	name := newGateway.GetName()
	h.logger.Debug("Gateway updated", zap.String("name", name))

	// Convert to summary and broadcast
	summary := h.gatewayToSummary(newGateway)
	h.hub.BroadcastToRoom("overview", "gateway_updated", summary)
}

// OnDelete handles gateway deletion events
func (h *GatewayEventHandler) OnDelete(obj interface{}) {
	gateway, ok := obj.(*unstructured.Unstructured)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "gateway"))
		return
	}

	name := gateway.GetName()
	h.logger.Debug("Gateway deleted", zap.String("name", name))

	// Broadcast deletion event
	h.hub.BroadcastToRoom("overview", "gateway_deleted", map[string]string{"name": name})
}

// gatewayToSummary converts a gateway to a summary representation
func (h *GatewayEventHandler) gatewayToSummary(gateway *unstructured.Unstructured) map[string]interface{} {
	metadata := gateway.Object["metadata"].(map[string]interface{})
	spec, _ := gateway.Object["spec"].(map[string]interface{})

	name := metadata["name"].(string)
	namespace := metadata["namespace"].(string)
	labels, _ := metadata["labels"].(map[string]interface{})
	annotations, _ := metadata["annotations"].(map[string]interface{})

	// Calculate age
	age := "Unknown"
	var creationTimestamp time.Time
	if creationTimestampStr, ok := metadata["creationTimestamp"].(string); ok {
		if createdTime, err := time.Parse(time.RFC3339, creationTimestampStr); err == nil {
			creationTimestamp = createdTime
			age = h.calculateAge(createdTime)
		}
	}

	// Extract addresses if present
	var addresses []string
	if addressesInterface, ok := spec["addresses"].([]interface{}); ok {
		for _, addressInterface := range addressesInterface {
			if address, ok := addressInterface.(string); ok {
				addresses = append(addresses, address)
			}
		}
	}

	// Extract ports from servers
	var ports []map[string]interface{}
	var servers []map[string]interface{}
	if serversInterface, ok := spec["servers"].([]interface{}); ok {
		for _, serverInterface := range serversInterface {
			if server, ok := serverInterface.(map[string]interface{}); ok {
				serverInfo := make(map[string]interface{})

				// Extract port information
				if portInterface, ok := server["port"].(map[string]interface{}); ok {
					port := map[string]interface{}{}
					if name, ok := portInterface["name"].(string); ok {
						port["name"] = name
						serverInfo["portName"] = name
					}
					if number, ok := portInterface["number"].(float64); ok {
						port["number"] = int(number)
						serverInfo["port"] = int(number)
					}
					if protocol, ok := portInterface["protocol"].(string); ok {
						port["protocol"] = protocol
						serverInfo["protocol"] = protocol
					}
					ports = append(ports, port)
				}

				// Extract hosts
				if hostsInterface, ok := server["hosts"].([]interface{}); ok {
					var hosts []string
					for _, hostInterface := range hostsInterface {
						if host, ok := hostInterface.(string); ok {
							hosts = append(hosts, host)
						}
					}
					serverInfo["hosts"] = hosts
				}

				servers = append(servers, serverInfo)
			}
		}
	}

	// Extract selector if present
	selector, _ := spec["selector"].(map[string]interface{})
	if selector == nil {
		selector = make(map[string]interface{})
	}

	return map[string]interface{}{
		"name":              name,
		"namespace":         namespace,
		"addresses":         addresses,
		"ports":             ports,
		"servers":           servers,
		"selector":          selector,
		"labels":            labels,
		"annotations":       annotations,
		"age":               age,
		"creationTimestamp": creationTimestamp,
	}
}

// calculateAge calculates the age of a resource
func (h *GatewayEventHandler) calculateAge(creationTime time.Time) string {
	now := time.Now()
	diff := now.Sub(creationTime)

	days := int(diff.Hours() / 24)
	if days > 0 {
		return fmt.Sprintf("%dd", days)
	}

	hours := int(diff.Hours())
	if hours > 0 {
		return fmt.Sprintf("%dh", hours)
	}

	minutes := int(diff.Minutes())
	return fmt.Sprintf("%dm", minutes)
}
