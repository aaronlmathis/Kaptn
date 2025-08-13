package informers

import (
	"fmt"
	"time"

	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
)

// EventEventHandler handles event events and broadcasts them via WebSocket
type EventEventHandler struct {
	logger *zap.Logger
	hub    *ws.Hub
}

// NewEventEventHandler creates a new event event handler
func NewEventEventHandler(logger *zap.Logger, hub *ws.Hub) *EventEventHandler {
	return &EventEventHandler{
		logger: logger,
		hub:    hub,
	}
}

// OnAdd handles event addition events
func (h *EventEventHandler) OnAdd(obj interface{}, isInInitialList bool) {
	event, ok := obj.(*v1.Event)
	if !ok {
		h.logger.Error("Unexpected object type in OnAdd", zap.String("type", "event"))
		return
	}

	h.logger.Debug("Event added", zap.String("name", event.Name), zap.String("reason", event.Reason))

	// Convert to summary and broadcast
	summary := h.eventToSummary(event)
	h.hub.BroadcastToRoom("overview", "event_added", summary)
}

// OnUpdate handles event update events
func (h *EventEventHandler) OnUpdate(oldObj, newObj interface{}) {
	newEvent, ok := newObj.(*v1.Event)
	if !ok {
		h.logger.Error("Unexpected object type in OnUpdate", zap.String("type", "event"))
		return
	}

	h.logger.Debug("Event updated", zap.String("name", newEvent.Name), zap.String("reason", newEvent.Reason))

	// Convert to summary and broadcast
	summary := h.eventToSummary(newEvent)
	h.hub.BroadcastToRoom("overview", "event_updated", summary)
}

// OnDelete handles event deletion events
func (h *EventEventHandler) OnDelete(obj interface{}) {
	event, ok := obj.(*v1.Event)
	if !ok {
		h.logger.Error("Unexpected object type in OnDelete", zap.String("type", "event"))
		return
	}

	h.logger.Debug("Event deleted", zap.String("name", event.Name), zap.String("reason", event.Reason))

	// Broadcast deletion event
	h.hub.BroadcastToRoom("overview", "event_deleted", map[string]string{
		"name":      event.Name,
		"namespace": event.Namespace,
	})
}

// eventToSummary converts an event to a summary representation
func (h *EventEventHandler) eventToSummary(event *v1.Event) map[string]interface{} {
	// Determine event level for UI display
	eventLevel := "Info"
	if event.Type == "Warning" {
		eventLevel = "Warning"
	} else if event.Type == "Error" {
		eventLevel = "Error"
	}

	// Source information - prefer ReportingController over Source.Component
	source := event.Source.Component
	if event.ReportingController != "" {
		source = event.ReportingController
	}

	// Handle timestamps - prefer LastTimestamp, fallback to FirstTimestamp
	var lastTimestamp time.Time
	if !event.LastTimestamp.Time.IsZero() {
		lastTimestamp = event.LastTimestamp.Time
	} else if !event.FirstTimestamp.Time.IsZero() {
		lastTimestamp = event.FirstTimestamp.Time
	} else {
		lastTimestamp = event.CreationTimestamp.Time
	}

	// Format involved object for display
	involvedObjectName := fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name)
	if event.InvolvedObject.Namespace != "" {
		involvedObjectName = fmt.Sprintf("%s/%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Namespace, event.InvolvedObject.Name)
	}

	return map[string]interface{}{
		"id":                 fmt.Sprintf("%s-%s", event.Namespace, event.Name),
		"name":               event.Name,
		"namespace":          event.Namespace,
		"type":               event.Type,
		"reason":             event.Reason,
		"message":            event.Message,
		"source":             source,
		"involvedObject":     involvedObjectName,
		"involvedObjectKind": event.InvolvedObject.Kind,
		"involvedObjectName": event.InvolvedObject.Name,
		"count":              event.Count,
		"firstTimestamp":     event.FirstTimestamp.Time,
		"lastTimestamp":      lastTimestamp,
		"level":              eventLevel,
		"age":                time.Since(lastTimestamp).String(),
		"labels":             event.Labels,
		"annotations":        event.Annotations,
		"creationTimestamp":  event.CreationTimestamp.Time,
	}
}
