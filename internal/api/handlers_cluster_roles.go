package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	rbacv1 "k8s.io/api/rbac/v1"
)

// ClusterRoleResponse represents a cluster role in API responses
type ClusterRoleResponse struct {
	Name              string            `json:"name"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Rules             int               `json:"rules"`
	RulesDisplay      string            `json:"rulesDisplay"` // Detailed rules display
	Age               string            `json:"age"`          // Human-readable age
	Labels            map[string]string `json:"labels,omitempty"`
	Annotations       map[string]string `json:"annotations,omitempty"`
	ResourceVersion   string            `json:"resourceVersion"`
	UID               string            `json:"uid"`
}

// ClusterRoleBindingResponse represents a cluster role binding in API responses
type ClusterRoleBindingResponse struct {
	Name                string            `json:"name"`
	CreationTimestamp   time.Time         `json:"creationTimestamp"`
	RoleName            string            `json:"roleName"`
	RoleKind            string            `json:"roleKind"`
	RoleRef             string            `json:"roleRef"` // Formatted role reference
	SubjectCount        int               `json:"subjectCount"`
	Subjects            int               `json:"subjects"`        // Alternative field name
	SubjectsDisplay     string            `json:"subjectsDisplay"` // Detailed subjects display
	Age                 string            `json:"age"`             // Human-readable age
	UserCount           int               `json:"userCount"`
	GroupCount          int               `json:"groupCount"`
	ServiceAccountCount int               `json:"serviceAccountCount"`
	Labels              map[string]string `json:"labels,omitempty"`
	Annotations         map[string]string `json:"annotations,omitempty"`
}

// ClusterRolesListResponse represents the response for listing cluster roles
type ClusterRolesListResponse struct {
	Items      []ClusterRoleResponse `json:"items"`
	TotalCount int                   `json:"totalCount"`
	Page       int                   `json:"page"`
	Limit      int                   `json:"limit"`
}

// ClusterRoleBindingsListResponse represents the response for listing cluster role bindings
type ClusterRoleBindingsListResponse struct {
	Items      []ClusterRoleBindingResponse `json:"items"`
	TotalCount int                          `json:"totalCount"`
	Page       int                          `json:"page"`
	Limit      int                          `json:"limit"`
}

// transformClusterRoleToResponse converts a Kubernetes ClusterRole to API response format
func transformClusterRoleToResponse(clusterRole *rbacv1.ClusterRole) ClusterRoleResponse {
	// Calculate age
	age := time.Since(clusterRole.CreationTimestamp.Time)
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

	// Count unique verbs and resources across all rules
	verbSet := make(map[string]bool)
	resourceSet := make(map[string]bool)
	ruleCount := len(clusterRole.Rules)

	for _, rule := range clusterRole.Rules {
		for _, verb := range rule.Verbs {
			verbSet[verb] = true
		}
		for _, resource := range rule.Resources {
			resourceSet[resource] = true
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

	return ClusterRoleResponse{
		Name:              clusterRole.Name,
		CreationTimestamp: clusterRole.CreationTimestamp.Time,
		Rules:             len(clusterRole.Rules),
		RulesDisplay:      rulesDisplay,
		Age:               ageStr,
		Labels:            clusterRole.Labels,
		Annotations:       clusterRole.Annotations,
		ResourceVersion:   clusterRole.ResourceVersion,
		UID:               string(clusterRole.UID),
	}
}

// transformClusterRoleBindingToResponse converts a Kubernetes ClusterRoleBinding to API response format
func transformClusterRoleBindingToResponse(clusterRoleBinding *rbacv1.ClusterRoleBinding) ClusterRoleBindingResponse {
	// Calculate age
	age := time.Since(clusterRoleBinding.CreationTimestamp.Time)
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
	roleName := clusterRoleBinding.RoleRef.Name
	roleKind := clusterRoleBinding.RoleRef.Kind

	// Extract subjects
	subjectCount := len(clusterRoleBinding.Subjects)

	// Count subjects by kind and create display list
	userCount := 0
	groupCount := 0
	serviceAccountCount := 0
	var subjectsDisplayList []string

	for _, subject := range clusterRoleBinding.Subjects {
		switch subject.Kind {
		case "User":
			userCount++
			subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("User:%s", subject.Name))
		case "Group":
			groupCount++
			subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("Group:%s", subject.Name))
		case "ServiceAccount":
			serviceAccountCount++
			if subject.Namespace != "" {
				subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("SA:%s/%s", subject.Namespace, subject.Name))
			} else {
				subjectsDisplayList = append(subjectsDisplayList, fmt.Sprintf("SA:%s", subject.Name))
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

	return ClusterRoleBindingResponse{
		Name:                clusterRoleBinding.Name,
		CreationTimestamp:   clusterRoleBinding.CreationTimestamp.Time,
		RoleName:            roleName,
		RoleKind:            roleKind,
		RoleRef:             roleRefStr,
		SubjectCount:        subjectCount,
		Subjects:            subjectCount, // Same as SubjectCount for frontend compatibility
		SubjectsDisplay:     subjectsDisplay,
		Age:                 ageStr,
		UserCount:           userCount,
		GroupCount:          groupCount,
		ServiceAccountCount: serviceAccountCount,
		Labels:              clusterRoleBinding.Labels,
		Annotations:         clusterRoleBinding.Annotations,
	}
}

// handleListClusterRoles handles GET /api/cluster-roles
func (s *Server) handleListClusterRoles(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
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

	// Get cluster roles from Kubernetes
	clusterRoles, err := s.resourceManager.ListClusterRoles(r.Context())
	if err != nil {
		s.logger.Error("Failed to list cluster roles", zap.Error(err))
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
	totalBeforeFilter := len(clusterRoles)

	// Transform to response format
	var filteredClusterRoles []interface{}
	for _, clusterRole := range clusterRoles {
		clusterRoleMap := s.clusterRoleToResponse(clusterRole)

		// Apply search filter
		if search != "" {
			searchLower := strings.ToLower(search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(clusterRoleMap["name"].(string)), searchLower) {
				found = true
			}

			if !found {
				continue
			}
		}

		filteredClusterRoles = append(filteredClusterRoles, clusterRoleMap)
	}

	// Apply sorting
	s.sortClusterRoles(filteredClusterRoles, sortBy)

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(filteredClusterRoles) {
		filteredClusterRoles = []interface{}{}
	} else if end > len(filteredClusterRoles) {
		filteredClusterRoles = filteredClusterRoles[start:]
	} else {
		filteredClusterRoles = filteredClusterRoles[start:end]
	}

	response := map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"items":    filteredClusterRoles,
			"total":    totalBeforeFilter,
			"page":     page,
			"pageSize": pageSize,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetClusterRole handles GET /api/cluster-roles/{name}
func (s *Server) handleGetClusterRole(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	if name == "" {
		http.Error(w, "ClusterRole name is required", http.StatusBadRequest)
		return
	}

	clusterRole, err := s.resourceManager.GetClusterRole(r.Context(), name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	response := map[string]interface{}{
		"status": "success",
		"data":   s.clusterRoleToResponse(clusterRole),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleListClusterRoleBindings handles GET /api/cluster-role-bindings
func (s *Server) handleListClusterRoleBindings(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
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

	// Get cluster role bindings from Kubernetes
	clusterRoleBindings, err := s.resourceManager.ListClusterRoleBindings(r.Context())
	if err != nil {
		s.logger.Error("Failed to list cluster role bindings", zap.Error(err))
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
	totalBeforeFilter := len(clusterRoleBindings)

	// Apply filtering
	var filteredClusterRoleBindings []interface{}
	for _, clusterRoleBinding := range clusterRoleBindings {
		clusterRoleBindingMap := s.clusterRoleBindingToResponse(clusterRoleBinding)

		// Apply search filter
		if search != "" {
			searchLower := strings.ToLower(search)
			found := false

			// Search in name
			if strings.Contains(strings.ToLower(clusterRoleBindingMap["name"].(string)), searchLower) {
				found = true
			}

			// Search in role reference
			if !found && strings.Contains(strings.ToLower(clusterRoleBindingMap["roleRef"].(string)), searchLower) {
				found = true
			}

			if !found {
				continue
			}
		}

		filteredClusterRoleBindings = append(filteredClusterRoleBindings, clusterRoleBindingMap)
	}

	// Apply sorting
	s.sortClusterRoleBindings(filteredClusterRoleBindings, sortBy)

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(filteredClusterRoleBindings) {
		filteredClusterRoleBindings = []interface{}{}
	} else if end > len(filteredClusterRoleBindings) {
		filteredClusterRoleBindings = filteredClusterRoleBindings[start:]
	} else {
		filteredClusterRoleBindings = filteredClusterRoleBindings[start:end]
	}

	response := map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"items":    filteredClusterRoleBindings,
			"total":    totalBeforeFilter,
			"page":     page,
			"pageSize": pageSize,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetClusterRoleBinding handles GET /api/cluster-role-bindings/{name}
func (s *Server) handleGetClusterRoleBinding(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	if name == "" {
		http.Error(w, "ClusterRoleBinding name is required", http.StatusBadRequest)
		return
	}

	clusterRoleBinding, err := s.resourceManager.GetClusterRoleBinding(r.Context(), name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	response := map[string]interface{}{
		"status": "success",
		"data":   s.clusterRoleBindingToResponse(clusterRoleBinding),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// sortClusterRoles sorts cluster roles by the specified field and order
func sortClusterRoles(items []ClusterRoleResponse, sortBy, sortOrder string) error {
	sort.Slice(items, func(i, j int) bool {
		var less bool
		switch sortBy {
		case "name":
			less = items[i].Name < items[j].Name
		case "creationTimestamp":
			less = items[i].CreationTimestamp.Before(items[j].CreationTimestamp)
		case "rules":
			less = items[i].Rules < items[j].Rules
		default:
			less = items[i].Name < items[j].Name // fallback to name sorting
		}

		if sortOrder == "desc" {
			return !less
		}
		return less
	})
	return nil
}

// sortClusterRoleBindings sorts cluster role bindings by the specified field and order
func sortClusterRoleBindings(items []ClusterRoleBindingResponse, sortBy, sortOrder string) error {
	sort.Slice(items, func(i, j int) bool {
		var less bool
		switch sortBy {
		case "name":
			less = items[i].Name < items[j].Name
		case "creationTimestamp":
			less = items[i].CreationTimestamp.Before(items[j].CreationTimestamp)
		case "roleName":
			less = items[i].RoleName < items[j].RoleName
		case "subjectCount":
			less = items[i].SubjectCount < items[j].SubjectCount
		default:
			less = items[i].Name < items[j].Name // fallback to name sorting
		}

		if sortOrder == "desc" {
			return !less
		}
		return less
	})
	return nil
}

// clusterRoleToResponse converts a ClusterRole to response format
func (s *Server) clusterRoleToResponse(clusterRole interface{}) map[string]interface{} {
	var clusterRoleObj map[string]interface{}

	// Handle both *rbacv1.ClusterRole and interface{} types
	switch cr := clusterRole.(type) {
	case map[string]interface{}:
		clusterRoleObj = cr
	default:
		// Convert to map using JSON marshaling/unmarshaling
		clusterRoleBytes, _ := json.Marshal(clusterRole)
		json.Unmarshal(clusterRoleBytes, &clusterRoleObj)
	}

	// Extract metadata
	metadata := clusterRoleObj["metadata"].(map[string]interface{})
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

	// Extract rules information
	rules := clusterRoleObj["rules"].([]interface{})
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

// clusterRoleBindingToResponse converts a ClusterRoleBinding to response format
func (s *Server) clusterRoleBindingToResponse(clusterRoleBinding interface{}) map[string]interface{} {
	var clusterRoleBindingObj map[string]interface{}

	// Handle both *rbacv1.ClusterRoleBinding and interface{} types
	switch crb := clusterRoleBinding.(type) {
	case map[string]interface{}:
		clusterRoleBindingObj = crb
	default:
		// Convert to map using JSON marshaling/unmarshaling
		clusterRoleBindingBytes, _ := json.Marshal(clusterRoleBinding)
		json.Unmarshal(clusterRoleBindingBytes, &clusterRoleBindingObj)
	}

	// Extract metadata
	metadata := clusterRoleBindingObj["metadata"].(map[string]interface{})
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

	// Extract role reference
	roleRef := clusterRoleBindingObj["roleRef"].(map[string]interface{})
	roleName := roleRef["name"].(string)
	roleKind := roleRef["kind"].(string)

	// Extract subjects information
	var subjects []interface{}
	if subjectsInterface := clusterRoleBindingObj["subjects"]; subjectsInterface != nil {
		subjects = subjectsInterface.([]interface{})
	}
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

// sortClusterRoles sorts cluster roles by the specified field
func (s *Server) sortClusterRoles(clusterRoles []interface{}, sortBy string) {
	// Simple bubble sort for demonstration - in production, use a proper sorting algorithm
	// This is following the same pattern as the roles handler
	for i := 0; i < len(clusterRoles)-1; i++ {
		for j := 0; j < len(clusterRoles)-i-1; j++ {
			clusterRole1 := clusterRoles[j].(map[string]interface{})
			clusterRole2 := clusterRoles[j+1].(map[string]interface{})

			var val1, val2 string
			switch sortBy {
			case "name":
				val1 = clusterRole1["name"].(string)
				val2 = clusterRole2["name"].(string)
			case "age":
				// For age, we want newest first, so reverse comparison
				time1 := clusterRole1["creationTimestamp"].(time.Time)
				time2 := clusterRole2["creationTimestamp"].(time.Time)
				if time1.Before(time2) {
					clusterRoles[j], clusterRoles[j+1] = clusterRoles[j+1], clusterRoles[j]
				}
				continue
			case "rules":
				// Compare rule counts
				rules1 := clusterRole1["rules"].(int)
				rules2 := clusterRole2["rules"].(int)
				if rules1 > rules2 {
					clusterRoles[j], clusterRoles[j+1] = clusterRoles[j+1], clusterRoles[j]
				}
				continue
			default:
				val1 = clusterRole1["name"].(string)
				val2 = clusterRole2["name"].(string)
			}

			if val1 > val2 {
				clusterRoles[j], clusterRoles[j+1] = clusterRoles[j+1], clusterRoles[j]
			}
		}
	}
}

// sortClusterRoleBindings sorts cluster role bindings by the specified field
func (s *Server) sortClusterRoleBindings(clusterRoleBindings []interface{}, sortBy string) {
	// Simple bubble sort for demonstration - in production, use a proper sorting algorithm
	// This is following the same pattern as the roles handler
	for i := 0; i < len(clusterRoleBindings)-1; i++ {
		for j := 0; j < len(clusterRoleBindings)-i-1; j++ {
			crb1 := clusterRoleBindings[j].(map[string]interface{})
			crb2 := clusterRoleBindings[j+1].(map[string]interface{})

			var val1, val2 string
			switch sortBy {
			case "name":
				val1 = crb1["name"].(string)
				val2 = crb2["name"].(string)
			case "age":
				// For age, we want newest first, so reverse comparison
				time1 := crb1["creationTimestamp"].(time.Time)
				time2 := crb2["creationTimestamp"].(time.Time)
				if time1.Before(time2) {
					clusterRoleBindings[j], clusterRoleBindings[j+1] = clusterRoleBindings[j+1], clusterRoleBindings[j]
				}
				continue
			case "roleRef":
				val1 = crb1["roleRef"].(string)
				val2 = crb2["roleRef"].(string)
			case "subjects":
				// Compare subject counts
				subjects1 := crb1["subjects"].(int)
				subjects2 := crb2["subjects"].(int)
				if subjects1 > subjects2 {
					clusterRoleBindings[j], clusterRoleBindings[j+1] = clusterRoleBindings[j+1], clusterRoleBindings[j]
				}
				continue
			default:
				val1 = crb1["name"].(string)
				val2 = crb2["name"].(string)
			}

			if val1 > val2 {
				clusterRoleBindings[j], clusterRoleBindings[j+1] = clusterRoleBindings[j+1], clusterRoleBindings[j]
			}
		}
	}
}
