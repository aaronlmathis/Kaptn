package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// handleListCustomResourceDefinitions handles GET /api/v1/crds
// @Summary List CustomResourceDefinitions
// @Description Lists all CustomResourceDefinitions in the cluster, with optional filtering, sorting, and pagination.
// @Tags CustomResourceDefinitions
// @Produce json
// @Param search query string false "Search term for CRD name"
// @Param sortBy query string false "Sort by field (default: name)"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 50, max: 100)"
// @Param group query string false "Filter by API group"
// @Param version query string false "Filter by version"
// @Param scope query string false "Filter by scope (Namespaced or Cluster)"
// @Success 200 {object} map[string]interface{} "Paginated list of CustomResourceDefinitions"
// @Failure 400 {string} string "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/crds [get]
func (s *Server) handleListCustomResourceDefinitions(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	search := r.URL.Query().Get("search")
	group := r.URL.Query().Get("group")
	version := r.URL.Query().Get("version")
	scope := r.URL.Query().Get("scope")
	sortBy := r.URL.Query().Get("sortBy")
	if sortBy == "" {
		sortBy = "name"
	}

	page := 1
	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	pageSize := 50
	if pageSizeStr := r.URL.Query().Get("pageSize"); pageSizeStr != "" {
		if ps, err := strconv.Atoi(pageSizeStr); err == nil && ps > 0 && ps <= 100 {
			pageSize = ps
		}
	}

	// List CRDs from Kubernetes API
	crds, err := s.resourceManager.ListCustomResourceDefinitions(r.Context())
	if err != nil {
		s.logger.Error("Failed to list custom resource definitions", zap.Error(err))
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
	totalBeforeFilter := len(crds)

	// Apply filtering
	var filteredCRDs []interface{}
	for _, crd := range crds {
		// Convert CRD to map for easier filtering
		crdMap := s.crdToResponse(crd)

		// Apply search filter
		if search != "" {
			searchLower := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(crdMap["name"].(string)), searchLower) &&
				!strings.Contains(strings.ToLower(crdMap["group"].(string)), searchLower) &&
				!strings.Contains(strings.ToLower(crdMap["kind"].(string)), searchLower) {
				continue
			}
		}

		// Apply group filter
		if group != "" && crdMap["group"].(string) != group {
			continue
		}

		// Apply version filter
		if version != "" {
			versions, ok := crdMap["versions"].([]string)
			if !ok || !contains(versions, version) {
				continue
			}
		}

		// Apply scope filter
		if scope != "" && crdMap["scope"].(string) != scope {
			continue
		}

		filteredCRDs = append(filteredCRDs, crdMap)
	}

	// Apply sorting
	sortCRDs(filteredCRDs, sortBy)

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(filteredCRDs) {
		filteredCRDs = []interface{}{}
	} else if end > len(filteredCRDs) {
		filteredCRDs = filteredCRDs[start:]
	} else {
		filteredCRDs = filteredCRDs[start:end]
	}

	response := map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"items":    filteredCRDs,
			"total":    totalBeforeFilter,
			"page":     page,
			"pageSize": pageSize,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetCustomResourceDefinition handles GET /api/v1/crds/{name}
// @Summary Get CustomResourceDefinition details
// @Description Get details and summary for a specific CustomResourceDefinition.
// @Tags CustomResourceDefinitions
// @Produce json
// @Param name path string true "CRD name"
// @Success 200 {object} map[string]interface{} "CRD details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/crds/{name} [get]
func (s *Server) handleGetCustomResourceDefinition(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	if name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "name is required",
			"status": "error",
		})
		return
	}

	// Get CRD from Kubernetes API
	crd, err := s.resourceManager.GetCustomResourceDefinition(r.Context(), name)
	if err != nil {
		s.logger.Error("Failed to get custom resource definition",
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
	summary := s.crdToResponse(crd)

	// Add full CRD spec for detailed view
	crdMap := crd.(map[string]interface{})
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       crdMap["spec"],
		"status":     crdMap["status"],
		"metadata":   crdMap["metadata"],
		"kind":       "CustomResourceDefinition",
		"apiVersion": crdMap["apiVersion"],
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// crdToResponse converts a CRD object to response format
func (s *Server) crdToResponse(crdObj interface{}) map[string]interface{} {
	crd := crdObj.(map[string]interface{})

	// Extract metadata
	metadata := crd["metadata"].(map[string]interface{})
	name := metadata["name"].(string)

	// Calculate age
	creationTime, _ := time.Parse(time.RFC3339, metadata["creationTimestamp"].(string))
	age := time.Since(creationTime)

	var ageStr string
	if age < time.Minute {
		ageStr = fmt.Sprintf("%ds", int(age.Seconds()))
	} else if age < time.Hour {
		ageStr = fmt.Sprintf("%dm", int(age.Minutes()))
	} else if age < 24*time.Hour {
		ageStr = fmt.Sprintf("%dh", int(age.Hours()))
	} else {
		ageStr = fmt.Sprintf("%dd", int(age.Hours()/24))
	}

	// Extract spec information
	spec := crd["spec"].(map[string]interface{})
	group := spec["group"].(string)
	scope := spec["scope"].(string)

	// Extract kind information
	names := spec["names"].(map[string]interface{})
	kind := names["kind"].(string)
	plural := names["plural"].(string)
	singular := names["singular"].(string)

	// Extract versions
	var versions []string
	var storedVersions []string
	if versionsInterface, ok := spec["versions"]; ok {
		versionsList := versionsInterface.([]interface{})
		for _, v := range versionsList {
			versionMap := v.(map[string]interface{})
			versionName := versionMap["name"].(string)
			versions = append(versions, versionName)
			if stored, ok := versionMap["storage"].(bool); ok && stored {
				storedVersions = append(storedVersions, versionName)
			}
		}
	}

	// Extract status information
	var establishedCondition, namesAcceptedCondition bool
	if status, ok := crd["status"]; ok && status != nil {
		statusMap := status.(map[string]interface{})
		if conditions, ok := statusMap["conditions"]; ok && conditions != nil {
			conditionsList := conditions.([]interface{})
			for _, c := range conditionsList {
				conditionMap := c.(map[string]interface{})
				condType := conditionMap["type"].(string)
				condStatus := conditionMap["status"].(string)

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

	response := map[string]interface{}{
		"name":              name,
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
		"age":               ageStr,
		"creationTimestamp": creationTime,
		"labels":            metadata["labels"],
		"annotations":       metadata["annotations"],
	}

	return response
}

// sortCRDs sorts CRDs by the specified field
func sortCRDs(crds []interface{}, sortBy string) {
	// Simple bubble sort for demonstration - in production, use a proper sorting algorithm
	for i := 0; i < len(crds)-1; i++ {
		for j := 0; j < len(crds)-i-1; j++ {
			crd1 := crds[j].(map[string]interface{})
			crd2 := crds[j+1].(map[string]interface{})

			var val1, val2 string
			switch sortBy {
			case "name":
				val1 = crd1["name"].(string)
				val2 = crd2["name"].(string)
			case "group":
				val1 = crd1["group"].(string)
				val2 = crd2["group"].(string)
			case "kind":
				val1 = crd1["kind"].(string)
				val2 = crd2["kind"].(string)
			case "scope":
				val1 = crd1["scope"].(string)
				val2 = crd2["scope"].(string)
			case "status":
				val1 = crd1["status"].(string)
				val2 = crd2["status"].(string)
			default:
				val1 = crd1["name"].(string)
				val2 = crd2["name"].(string)
			}

			if strings.ToLower(val1) > strings.ToLower(val2) {
				crds[j], crds[j+1] = crds[j+1], crds[j]
			}
		}
	}
}

// contains checks if a slice contains a string
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
