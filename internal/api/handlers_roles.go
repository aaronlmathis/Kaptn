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

// handleListRoles handles GET /api/v1/roles
// @Summary List Roles
// @Description Lists all Roles in the cluster or a specific namespace, with optional filtering, sorting, and pagination.
// @Tags Roles
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Param search query string false "Search term for Role name"
// @Param sortBy query string false "Sort by field (default: name)"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 50, max: 100)"
// @Success 200 {object} map[string]interface{} "Paginated list of Roles"
// @Failure 400 {string} string "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/roles [get]
func (s *Server) handleListRoles(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	namespace := r.URL.Query().Get("namespace")
	search := r.URL.Query().Get("search")
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

	// List roles from resource manager
	roles, err := s.resourceManager.ListRoles(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list roles", zap.Error(err))
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
	totalBeforeFilter := len(roles)

	// Apply filtering
	var filteredRoles []interface{}
	for _, role := range roles {
		roleMap := s.roleToResponse(role)

		// Apply search filter
		if search != "" {
			searchLower := strings.ToLower(search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(roleMap["name"].(string)), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(roleMap["namespace"].(string)), searchLower) {
				found = true
			}

			if !found {
				continue
			}
		}

		filteredRoles = append(filteredRoles, roleMap)
	}

	// Apply sorting
	s.sortRoles(filteredRoles, sortBy)

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(filteredRoles) {
		filteredRoles = []interface{}{}
	} else if end > len(filteredRoles) {
		filteredRoles = filteredRoles[start:]
	} else {
		filteredRoles = filteredRoles[start:end]
	}

	response := map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"items":    filteredRoles,
			"total":    totalBeforeFilter,
			"page":     page,
			"pageSize": pageSize,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetRole handles GET /api/v1/roles/{namespace}/{name}
// @Summary Get Role details
// @Description Get details and summary for a specific Role.
// @Tags Roles
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Role name"
// @Success 200 {object} map[string]interface{} "Role details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/roles/{namespace}/{name} [get]
func (s *Server) handleGetRole(w http.ResponseWriter, r *http.Request) {
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

	// Get role from resource manager
	role, err := s.resourceManager.GetRole(r.Context(), namespace, name)
	if err != nil {
		s.logger.Error("Failed to get role",
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
	summary := s.roleToResponse(*role)

	// Add full role details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"rules":      role.Rules,
		"metadata":   role.ObjectMeta,
		"kind":       "Role",
		"apiVersion": "rbac.authorization.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListRoleBindings handles GET /api/v1/rolebindings
// @Summary List RoleBindings
// @Description Lists all RoleBindings in the cluster or a specific namespace, with optional filtering, sorting, and pagination.
// @Tags RoleBindings
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Param search query string false "Search term for RoleBinding name"
// @Param sortBy query string false "Sort by field (default: name)"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 50, max: 100)"
// @Success 200 {object} map[string]interface{} "Paginated list of RoleBindings"
// @Failure 400 {string} string "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/rolebindings [get]
func (s *Server) handleListRoleBindings(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	namespace := r.URL.Query().Get("namespace")
	search := r.URL.Query().Get("search")
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

	// List role bindings from resource manager
	roleBindings, err := s.resourceManager.ListRoleBindings(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list role bindings", zap.Error(err))
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
	totalBeforeFilter := len(roleBindings)

	// Apply filtering
	var filteredRoleBindings []interface{}
	for _, roleBinding := range roleBindings {
		roleBindingMap := s.roleBindingToResponse(roleBinding)

		// Apply search filter
		if search != "" {
			searchLower := strings.ToLower(search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(roleBindingMap["name"].(string)), searchLower) {
				found = true
			}

			// Search in namespace
			if !found && strings.Contains(strings.ToLower(roleBindingMap["namespace"].(string)), searchLower) {
				found = true
			}

			// Search in role name
			if !found && strings.Contains(strings.ToLower(roleBindingMap["roleName"].(string)), searchLower) {
				found = true
			}

			if !found {
				continue
			}
		}

		filteredRoleBindings = append(filteredRoleBindings, roleBindingMap)
	}

	// Apply sorting
	s.sortRoleBindings(filteredRoleBindings, sortBy)

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(filteredRoleBindings) {
		filteredRoleBindings = []interface{}{}
	} else if end > len(filteredRoleBindings) {
		filteredRoleBindings = filteredRoleBindings[start:]
	} else {
		filteredRoleBindings = filteredRoleBindings[start:end]
	}

	response := map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"items":    filteredRoleBindings,
			"total":    totalBeforeFilter,
			"page":     page,
			"pageSize": pageSize,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetRoleBinding handles GET /api/v1/rolebindings/{namespace}/{name}
// @Summary Get RoleBinding details
// @Description Get details and summary for a specific RoleBinding.
// @Tags RoleBindings
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "RoleBinding name"
// @Success 200 {object} map[string]interface{} "RoleBinding details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/rolebindings/{namespace}/{name} [get]
func (s *Server) handleGetRoleBinding(w http.ResponseWriter, r *http.Request) {
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

	// Get role binding from resource manager
	roleBinding, err := s.resourceManager.GetRoleBinding(r.Context(), namespace, name)
	if err != nil {
		s.logger.Error("Failed to get role binding",
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
	summary := s.roleBindingToResponse(*roleBinding)

	// Add full role binding details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"subjects":   roleBinding.Subjects,
		"roleRef":    roleBinding.RoleRef,
		"metadata":   roleBinding.ObjectMeta,
		"kind":       "RoleBinding",
		"apiVersion": "rbac.authorization.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// roleToResponse converts a Role to response format
func (s *Server) roleToResponse(role interface{}) map[string]interface{} {
	var roleObj map[string]interface{}

	// Handle both *rbacv1.Role and interface{} types
	switch r := role.(type) {
	case map[string]interface{}:
		roleObj = r
	default:
		// Convert to map using JSON marshaling/unmarshaling
		roleBytes, _ := json.Marshal(role)
		json.Unmarshal(roleBytes, &roleObj)
	}

	// Extract metadata
	metadata := roleObj["metadata"].(map[string]interface{})
	name := metadata["name"].(string)
	namespace := metadata["namespace"].(string)

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

	// Extract rules information
	rules := roleObj["rules"].([]interface{})
	ruleCount := len(rules)

	// Count unique verbs and resources across all rules
	verbSet := make(map[string]bool)
	resourceSet := make(map[string]bool)

	for _, rule := range rules {
		ruleMap := rule.(map[string]interface{})

		if verbs, ok := ruleMap["verbs"].([]interface{}); ok {
			for _, verb := range verbs {
				verbSet[verb.(string)] = true
			}
		}

		if resources, ok := ruleMap["resources"].([]interface{}); ok {
			for _, resource := range resources {
				resourceSet[resource.(string)] = true
			}
		}
	}

	// Create a meaningful summary of all rules
	var rulesDisplay string
	if ruleCount == 0 {
		rulesDisplay = "<none>"
	} else {
		// Get unique verbs and resources as slices for display
		var verbsList []string
		for verb := range verbSet {
			verbsList = append(verbsList, verb)
		}

		var resourcesList []string
		for resource := range resourceSet {
			resourcesList = append(resourcesList, resource)
		}

		// Create a concise summary
		if ruleCount == 1 {
			// For single rule, show the exact verbs and resources
			if len(verbsList) > 0 && len(resourcesList) > 0 {
				if len(verbsList) <= 3 && len(resourcesList) <= 3 {
					rulesDisplay = fmt.Sprintf("%s on %s", strings.Join(verbsList, ","), strings.Join(resourcesList, ","))
				} else {
					rulesDisplay = fmt.Sprintf("%d verbs on %d resources", len(verbsList), len(resourcesList))
				}
			} else {
				rulesDisplay = "1 rule"
			}
		} else {
			// For multiple rules, show a summary
			if len(verbsList) > 0 && len(resourcesList) > 0 {
				rulesDisplay = fmt.Sprintf("%d rules: %d verbs on %d resources", ruleCount, len(verbsList), len(resourcesList))
			} else {
				rulesDisplay = fmt.Sprintf("%d rules", ruleCount)
			}
		}
	}

	return map[string]interface{}{
		"id":                len(name), // Simple ID generation
		"name":              name,
		"namespace":         namespace,
		"age":               ageStr,
		"creationTimestamp": creationTime,
		"rules":             ruleCount,    // Frontend expects 'rules', not 'ruleCount'
		"rulesDisplay":      rulesDisplay, // Frontend expects this field
		"verbCount":         len(verbSet),
		"resourceCount":     len(resourceSet),
		"labels":            metadata["labels"],
		"annotations":       metadata["annotations"],
	}
}

// roleBindingToResponse converts a RoleBinding to response format
func (s *Server) roleBindingToResponse(roleBinding interface{}) map[string]interface{} {
	var roleBindingObj map[string]interface{}

	// Handle both *rbacv1.RoleBinding and interface{} types
	switch rb := roleBinding.(type) {
	case map[string]interface{}:
		roleBindingObj = rb
	default:
		// Convert to map using JSON marshaling/unmarshaling
		roleBindingBytes, _ := json.Marshal(roleBinding)
		json.Unmarshal(roleBindingBytes, &roleBindingObj)
	}

	// Extract metadata
	metadata := roleBindingObj["metadata"].(map[string]interface{})
	name := metadata["name"].(string)
	namespace := metadata["namespace"].(string)

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

	// Extract role reference
	roleRef := roleBindingObj["roleRef"].(map[string]interface{})
	roleName := roleRef["name"].(string)
	roleKind := roleRef["kind"].(string)

	// Extract subjects
	subjects := roleBindingObj["subjects"].([]interface{})
	subjectCount := len(subjects)

	// Count subjects by kind and create display list
	userCount := 0
	groupCount := 0
	serviceAccountCount := 0
	var subjectsDisplayList []string

	for _, subject := range subjects {
		subjectMap := subject.(map[string]interface{})
		kind := subjectMap["kind"].(string)
		name := subjectMap["name"].(string)

		switch kind {
		case "User":
			userCount++
			subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("User:%s", name))
		case "Group":
			groupCount++
			subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("Group:%s", name))
		case "ServiceAccount":
			serviceAccountCount++
			namespace := ""
			if ns, ok := subjectMap["namespace"]; ok {
				namespace = ns.(string)
			}
			if namespace != "" {
				subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("SA:%s/%s", namespace, name))
			} else {
				subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("SA:%s", name))
			}
		}
	}

	// Format subjects display
	var subjectsDisplay string
	if len(subjectsDisplayList) == 0 {
		subjectsDisplay = "<none>"
	} else if len(subjectsDisplayList) == 1 {
		subjectsDisplay = subjectsDisplayList[0]
	} else {
		subjectsDisplay = fmt.Sprintf("%s +%d more", subjectsDisplayList[0], len(subjectsDisplayList)-1)
	}

	// Create role reference string
	roleRefStr := fmt.Sprintf("%s/%s", roleKind, roleName)

	return map[string]interface{}{
		"id":                  len(name), // Simple ID generation
		"name":                name,
		"namespace":           namespace,
		"age":                 ageStr,
		"creationTimestamp":   creationTime,
		"roleName":            roleName,
		"roleKind":            roleKind,
		"roleRef":             roleRefStr,      // Frontend expects this field
		"subjects":            subjectCount,    // Frontend expects 'subjects', not 'subjectCount'
		"subjectsDisplay":     subjectsDisplay, // Frontend expects this field
		"subjectCount":        subjectCount,    // Keep for backward compatibility
		"userCount":           userCount,
		"groupCount":          groupCount,
		"serviceAccountCount": serviceAccountCount,
		"labels":              metadata["labels"],
		"annotations":         metadata["annotations"],
	}
}

// sortRoles sorts roles by the specified field
func (s *Server) sortRoles(roles []interface{}, sortBy string) {
	// Simple bubble sort for demonstration - in production, use a proper sorting algorithm
	// This is following the same pattern as the CRDs handler
	for i := 0; i < len(roles)-1; i++ {
		for j := 0; j < len(roles)-i-1; j++ {
			role1 := roles[j].(map[string]interface{})
			role2 := roles[j+1].(map[string]interface{})

			var val1, val2 string
			switch sortBy {
			case "name":
				val1 = role1["name"].(string)
				val2 = role2["name"].(string)
			case "namespace":
				val1 = role1["namespace"].(string)
				val2 = role2["namespace"].(string)
			case "age":
				// For age, we want newest first, so reverse comparison
				time1 := role1["creationTimestamp"].(time.Time)
				time2 := role2["creationTimestamp"].(time.Time)
				if time1.Before(time2) {
					roles[j], roles[j+1] = roles[j+1], roles[j]
				}
				continue
			default:
				val1 = role1["name"].(string)
				val2 = role2["name"].(string)
			}

			if val1 > val2 {
				roles[j], roles[j+1] = roles[j+1], roles[j]
			}
		}
	}
}

// sortRoleBindings sorts role bindings by the specified field
func (s *Server) sortRoleBindings(roleBindings []interface{}, sortBy string) {
	// Simple bubble sort for demonstration - in production, use a proper sorting algorithm
	for i := 0; i < len(roleBindings)-1; i++ {
		for j := 0; j < len(roleBindings)-i-1; j++ {
			rb1 := roleBindings[j].(map[string]interface{})
			rb2 := roleBindings[j+1].(map[string]interface{})

			var val1, val2 string
			switch sortBy {
			case "name":
				val1 = rb1["name"].(string)
				val2 = rb2["name"].(string)
			case "namespace":
				val1 = rb1["namespace"].(string)
				val2 = rb2["namespace"].(string)
			case "roleName":
				val1 = rb1["roleName"].(string)
				val2 = rb2["roleName"].(string)
			case "roleRef":
				val1 = rb1["roleRef"].(string)
				val2 = rb2["roleRef"].(string)
			case "age":
				// For age, we want newest first, so reverse comparison
				time1 := rb1["creationTimestamp"].(time.Time)
				time2 := rb2["creationTimestamp"].(time.Time)
				if time1.Before(time2) {
					roleBindings[j], roleBindings[j+1] = roleBindings[j+1], roleBindings[j]
				}
				continue
			case "subjects":
				// Compare subject counts
				subjects1 := rb1["subjects"].(int)
				subjects2 := rb2["subjects"].(int)
				if subjects1 > subjects2 {
					roleBindings[j], roleBindings[j+1] = roleBindings[j+1], roleBindings[j]
				}
				continue
			default:
				val1 = rb1["name"].(string)
				val2 = rb2["name"].(string)
			}

			if val1 > val2 {
				roleBindings[j], roleBindings[j+1] = roleBindings[j+1], roleBindings[j]
			}
		}
	}
}
