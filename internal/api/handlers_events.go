package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/selectors"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// handleGetEvent handles GET /api/v1/namespaces/{namespace}/events/{name}
// @Summary Get Event details
// @Description Get details and summary for a specific Event.
// @Tags Events
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Event name"
// @Success 200 {object} map[string]interface{} "Event details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/events/{name} [get]
func (s *Server) handleGetEvent(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	if namespace == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "namespace and name are required",
			"status": "error",
		})
		return
	}

	// Get event from Kubernetes API
	event, err := s.kubeClient.CoreV1().Events(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get event",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to enhanced summary
	summary := s.eventToResponse(*event)

	// Add full event details for detailed view
	fullDetails := map[string]interface{}{
		"summary":             summary,
		"metadata":            event.ObjectMeta,
		"kind":                "Event",
		"apiVersion":          "v1",
		"type":                event.Type,
		"reason":              event.Reason,
		"message":             event.Message,
		"source":              event.Source,
		"firstTimestamp":      event.FirstTimestamp.Time,
		"lastTimestamp":       event.LastTimestamp.Time,
		"count":               event.Count,
		"involvedObject":      event.InvolvedObject,
		"reportingController": event.ReportingController,
		"reportingInstance":   event.ReportingInstance,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListEvents handles GET /api/v1/events
// @Summary List Events
// @Description Lists all Events in the cluster or a specific namespace, with optional filtering, sorting, and pagination.
// @Tags Events
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Param search query string false "Search term for Event name or message"
// @Param sortBy query string false "Sort by field (default: lastTimestamp)"
// @Param sortOrder query string false "Sort order: asc or desc (default: desc)"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 50, max: 100)"
// @Success 200 {object} map[string]interface{} "Paginated list of Events"
// @Failure 400 {string} string "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/events [get]
func (s *Server) handleListEvents(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	sortBy := r.URL.Query().Get("sortBy")
	sortOrder := r.URL.Query().Get("sortOrder")

	// Parse pagination parameters
	page := 1
	pageSize := 50

	if pageParam := r.URL.Query().Get("page"); pageParam != "" {
		if p, err := strconv.Atoi(pageParam); err == nil && p > 0 {
			page = p
		}
	}

	if sizeParam := r.URL.Query().Get("pageSize"); sizeParam != "" {
		if s, err := strconv.Atoi(sizeParam); err == nil && s > 0 && s <= 100 {
			pageSize = s
		}
	}

	// Default sorting
	if sortBy == "" {
		sortBy = "lastTimestamp"
	}
	if sortOrder == "" {
		sortOrder = "desc"
	}

	// Get events from ResourceManager
	events, err := s.resourceManager.ListEvents(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list events", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": map[string]interface{}{
				"items":    []interface{}{},
				"total":    0,
				"page":     page,
				"pageSize": pageSize,
			},
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Store total count before filtering
	totalBeforeFilter := len(events)

	// Apply filtering and pagination
	filterOptions := selectors.EventFilterOptions{
		Namespace: namespace,
		Search:    search,
		Sort:      sortBy,
		SortOrder: sortOrder,
		Page:      page,
		PageSize:  pageSize,
	}

	filteredEvents, err := selectors.FilterEvents(events, filterOptions)
	if err != nil {
		s.logger.Error("Failed to filter events", zap.Error(err))
		http.Error(w, "Failed to filter events", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responseItems []map[string]interface{}
	for _, event := range filteredEvents {
		responseItems = append(responseItems, s.eventToResponse(event))
	}

	response := map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"items":    responseItems,
			"total":    totalBeforeFilter,
			"page":     page,
			"pageSize": pageSize,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleListEventsInNamespace handles GET /api/v1/namespaces/{namespace}/events
// @Summary List Events in Namespace
// @Description Lists all Events in a specific namespace.
// @Tags Events
// @Produce json
// @Param namespace path string true "Namespace"
// @Success 200 {array} map[string]interface{} "List of Events"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/events [get]
func (s *Server) handleListEventsInNamespace(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	if namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": map[string]interface{}{
				"items": []interface{}{},
			},
			"status": "error",
			"error":  "namespace is required",
		})
		return
	}

	events, err := s.resourceManager.ListEvents(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list events",
			zap.String("namespace", namespace),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": map[string]interface{}{
				"items": []interface{}{},
			},
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Convert to response format
	var responseItems []map[string]interface{}
	for _, event := range events {
		responseItems = append(responseItems, s.eventToResponse(event))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"items": responseItems,
		},
		"status": "success",
	})
}

// eventToResponse converts a Kubernetes Event to the response format
func (s *Server) eventToResponse(event v1.Event) map[string]interface{} {
	age := ""
	if !event.LastTimestamp.IsZero() {
		age = time.Since(event.LastTimestamp.Time).String()
	} else if !event.FirstTimestamp.IsZero() {
		age = time.Since(event.FirstTimestamp.Time).String()
	}

	// Format involved object reference
	involvedObject := fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name)
	if event.InvolvedObject.Namespace != "" {
		involvedObject = fmt.Sprintf("%s/%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Namespace, event.InvolvedObject.Name)
	}

	// Determine event severity/level
	eventLevel := "Info"
	if event.Type == "Warning" {
		eventLevel = "Warning"
	} else if event.Type == "Error" {
		eventLevel = "Error"
	}

	// Source information
	source := event.Source.Component
	if event.ReportingController != "" {
		source = event.ReportingController
	}

	return map[string]interface{}{
		"id":                  fmt.Sprintf("%s-%s", event.Namespace, event.Name),
		"name":                event.Name,
		"namespace":           event.Namespace,
		"type":                event.Type,
		"reason":              event.Reason,
		"message":             event.Message,
		"source":              source,
		"involvedObject":      involvedObject,
		"involvedObjectKind":  event.InvolvedObject.Kind,
		"involvedObjectName":  event.InvolvedObject.Name,
		"count":               event.Count,
		"firstTimestamp":      event.FirstTimestamp.Time,
		"lastTimestamp":       event.LastTimestamp.Time,
		"age":                 age,
		"level":               eventLevel,
		"labels":              event.Labels,
		"annotations":         event.Annotations,
		"creationTimestamp":   event.CreationTimestamp.Time,
		"reportingController": event.ReportingController,
		"reportingInstance":   event.ReportingInstance,
	}
}
