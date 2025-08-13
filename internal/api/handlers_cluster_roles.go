package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	rbacv1 "k8s.io/api/rbac/v1"
)

// ClusterRoleResponse represents a cluster role in API responses
type ClusterRoleResponse struct {
	Name              string            `json:"name"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Rules             int               `json:"rules"`
	Labels            map[string]string `json:"labels,omitempty"`
	Annotations       map[string]string `json:"annotations,omitempty"`
	ResourceVersion   string            `json:"resourceVersion"`
	UID               string            `json:"uid"`
}

// ClusterRoleBindingResponse represents a cluster role binding in API responses
type ClusterRoleBindingResponse struct {
	Name              string            `json:"name"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	RoleRef           string            `json:"roleRef"`
	Subjects          int               `json:"subjects"`
	Labels            map[string]string `json:"labels,omitempty"`
	Annotations       map[string]string `json:"annotations,omitempty"`
	ResourceVersion   string            `json:"resourceVersion"`
	UID               string            `json:"uid"`
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
	return ClusterRoleResponse{
		Name:              clusterRole.Name,
		CreationTimestamp: clusterRole.CreationTimestamp.Time,
		Rules:             len(clusterRole.Rules),
		Labels:            clusterRole.Labels,
		Annotations:       clusterRole.Annotations,
		ResourceVersion:   clusterRole.ResourceVersion,
		UID:               string(clusterRole.UID),
	}
}

// transformClusterRoleBindingToResponse converts a Kubernetes ClusterRoleBinding to API response format
func transformClusterRoleBindingToResponse(clusterRoleBinding *rbacv1.ClusterRoleBinding) ClusterRoleBindingResponse {
	return ClusterRoleBindingResponse{
		Name:              clusterRoleBinding.Name,
		CreationTimestamp: clusterRoleBinding.CreationTimestamp.Time,
		RoleRef:           clusterRoleBinding.RoleRef.Name,
		Subjects:          len(clusterRoleBinding.Subjects),
		Labels:            clusterRoleBinding.Labels,
		Annotations:       clusterRoleBinding.Annotations,
		ResourceVersion:   clusterRoleBinding.ResourceVersion,
		UID:               string(clusterRoleBinding.UID),
	}
}

// handleListClusterRoles handles GET /api/cluster-roles
func (s *Server) handleListClusterRoles(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	// Parse query parameters
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 50
	}

	sortBy := r.URL.Query().Get("sortBy")
	if sortBy == "" {
		sortBy = "name"
	}

	sortOrder := r.URL.Query().Get("sortOrder")
	if sortOrder != "desc" {
		sortOrder = "asc"
	}

	search := r.URL.Query().Get("search")

	// Get cluster roles from Kubernetes
	clusterRoles, err := s.resourceManager.ListClusterRoles(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Transform to response format
	var items []ClusterRoleResponse
	for _, clusterRole := range clusterRoles {
		// Apply search filter
		if search != "" && !strings.Contains(strings.ToLower(clusterRole.Name), strings.ToLower(search)) {
			continue
		}

		items = append(items, transformClusterRoleToResponse(clusterRole))
	}

	// Sort items
	if err := sortClusterRoles(items, sortBy, sortOrder); err != nil {
		http.Error(w, "Invalid sort parameters", http.StatusBadRequest)
		return
	}

	// Apply pagination
	totalCount := len(items)
	start := (page - 1) * limit
	end := start + limit

	if start > totalCount {
		items = []ClusterRoleResponse{}
	} else {
		if end > totalCount {
			end = totalCount
		}
		items = items[start:end]
	}

	response := ClusterRolesListResponse{
		Items:      items,
		TotalCount: totalCount,
		Page:       page,
		Limit:      limit,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleGetClusterRole handles GET /api/cluster-roles/{name}
func (s *Server) handleGetClusterRole(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()
	name := chi.URLParam(r, "name")

	if name == "" {
		http.Error(w, "ClusterRole name is required", http.StatusBadRequest)
		return
	}

	clusterRole, err := s.resourceManager.GetClusterRole(ctx, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transformClusterRoleToResponse(clusterRole))
}

// handleListClusterRoleBindings handles GET /api/cluster-role-bindings
func (s *Server) handleListClusterRoleBindings(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	// Parse query parameters
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 100 {
		limit = 50
	}

	sortBy := r.URL.Query().Get("sortBy")
	if sortBy == "" {
		sortBy = "name"
	}

	sortOrder := r.URL.Query().Get("sortOrder")
	if sortOrder != "desc" {
		sortOrder = "asc"
	}

	search := r.URL.Query().Get("search")

	// Get cluster role bindings from Kubernetes
	clusterRoleBindings, err := s.resourceManager.ListClusterRoleBindings(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Transform to response format
	var items []ClusterRoleBindingResponse
	for _, clusterRoleBinding := range clusterRoleBindings {
		// Apply search filter
		if search != "" && !strings.Contains(strings.ToLower(clusterRoleBinding.Name), strings.ToLower(search)) {
			continue
		}

		items = append(items, transformClusterRoleBindingToResponse(clusterRoleBinding))
	}

	// Sort items
	if err := sortClusterRoleBindings(items, sortBy, sortOrder); err != nil {
		http.Error(w, "Invalid sort parameters", http.StatusBadRequest)
		return
	}

	// Apply pagination
	totalCount := len(items)
	start := (page - 1) * limit
	end := start + limit

	if start > totalCount {
		items = []ClusterRoleBindingResponse{}
	} else {
		if end > totalCount {
			end = totalCount
		}
		items = items[start:end]
	}

	response := ClusterRoleBindingsListResponse{
		Items:      items,
		TotalCount: totalCount,
		Page:       page,
		Limit:      limit,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleGetClusterRoleBinding handles GET /api/cluster-role-bindings/{name}
func (s *Server) handleGetClusterRoleBinding(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()
	name := chi.URLParam(r, "name")

	if name == "" {
		http.Error(w, "ClusterRoleBinding name is required", http.StatusBadRequest)
		return
	}

	clusterRoleBinding, err := s.resourceManager.GetClusterRoleBinding(ctx, name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transformClusterRoleBindingToResponse(clusterRoleBinding))
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
		case "roleRef":
			less = items[i].RoleRef < items[j].RoleRef
		case "subjects":
			less = items[i].Subjects < items[j].Subjects
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
