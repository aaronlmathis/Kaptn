package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/k8s/selectors"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// handleGetOverview handles GET /api/v1/overview
// @Summary Get cluster overview
// @Description Provides a high-level overview of the cluster, including node counts, namespace counts, and other summary statistics.
// @Tags Cluster
// @Produce json
// @Success 200 {object} map[string]interface{} "Cluster overview data"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/overview [get]
func (s *Server) handleGetOverview(w http.ResponseWriter, r *http.Request) {
	overview, err := s.overviewService.GetOverview(r.Context())
	if err != nil {
		s.logger.Error("Failed to get cluster overview", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   overview,
		"status": "success",
	})
}

// handleListNamespaces handles GET /api/v1/namespaces
// @Summary List namespaces
// @Description Lists all namespaces in the cluster.
// @Tags Namespaces
// @Produce json
// @Success 200 {array} v1.Namespace "List of namespaces"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/namespaces [get]
func (s *Server) handleListNamespaces(w http.ResponseWriter, r *http.Request) {
	namespaces, err := s.kubeClient.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		s.logger.Error("Failed to list namespaces", zap.Error(err))
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

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"items": namespaces.Items,
		},
	})
}

// handleGetNamespace handles GET /api/v1/namespaces/{name}
// @Summary Get namespace details
// @Description Get details and summary for a specific namespace.
// @Tags Namespaces
// @Produce json
// @Param name path string true "Namespace name"
// @Success 200 {object} map[string]interface{} "Namespace details"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{name} [get]
func (s *Server) handleGetNamespace(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace name is required"})
		return
	}

	namespace, err := s.kubeClient.CoreV1().Namespaces().Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get namespace",
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Create namespace summary
	summary := formatNamespaceSummary(namespace)

	response := map[string]interface{}{
		"data": map[string]interface{}{
			"summary":    summary,
			"spec":       namespace.Spec,
			"status":     namespace.Status,
			"metadata":   namespace.ObjectMeta,
			"kind":       "Namespace",
			"apiVersion": "v1",
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleListNodes handles GET /api/v1/nodes
// @Summary List nodes
// @Description Lists all nodes in the cluster with optional filtering, sorting, and pagination.
// @Tags Nodes
// @Produce json
// @Param search query string false "Search term for node name or labels"
// @Param sortBy query string false "Sort by field (default: name)"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 50, max: 100)"
// @Param labelSelector query string false "Label selector to filter nodes"
// @Param fieldSelector query string false "Field selector to filter nodes"
// @Success 200 {object} map[string]interface{} "Paginated list of nodes"
// @Failure 400 {string} string "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/nodes [get]
func (s *Server) handleListNodes(w http.ResponseWriter, r *http.Request) {
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

	// Get nodes from informer cache
	indexer := s.informerManager.GetNodeLister()
	nodeObjs := indexer.List()

	var nodes []v1.Node
	for _, obj := range nodeObjs {
		if node, ok := obj.(*v1.Node); ok {
			nodes = append(nodes, *node)
		}
	}

	// Store total count before filtering
	totalBeforeFilter := len(nodes)

	// Apply filters
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")

	filterOpts := selectors.NodeFilterOptions{
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sortBy,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredNodes, err := selectors.FilterNodes(nodes, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter nodes", zap.Error(err))
		http.Error(w, "Failed to filter nodes", http.StatusBadRequest)
		return
	}

	// Convert to enriched response format
	var responseItems []map[string]interface{}
	for _, node := range filteredNodes {
		responseItems = append(responseItems, s.nodeToEnrichedResponse(&node))
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

// handleGetNode handles GET /api/v1/nodes/{name}
// @Summary Get node details
// @Description Get details and summary for a specific node.
// @Tags Nodes
// @Produce json
// @Param name path string true "Node name"
// @Success 200 {object} map[string]interface{} "Node details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/nodes/{name} [get]
func (s *Server) handleGetNode(w http.ResponseWriter, r *http.Request) {
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

	// Get node from Kubernetes API
	node, err := s.kubeClient.CoreV1().Nodes().Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get node",
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
	summary := s.nodeToEnrichedResponse(node)

	// Add full node details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       node.Spec,
		"status":     node.Status,
		"metadata":   node.ObjectMeta,
		"kind":       "Node",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListResourceQuotas handles GET /api/v1/resource-quotas
// @Summary List resource quotas
// @Description Lists all resource quotas in the cluster or a specific namespace, with filtering, sorting, and pagination.
// @Tags ResourceQuotas
// @Produce json
// @Param namespace query string false "Namespace to filter by"
// @Param labelSelector query string false "Label selector to filter resource quotas"
// @Param fieldSelector query string false "Field selector to filter resource quotas"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Param sort query string false "Sort by field"
// @Param order query string false "Sort order (asc/desc)"
// @Param search query string false "Search term"
// @Success 200 {object} map[string]interface{} "Paginated list of resource quotas"
// @Failure 400 {string} string "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/resource-quotas [get]
func (s *Server) handleListResourceQuotas(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	namespace := r.URL.Query().Get("namespace")
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")
	sort := r.URL.Query().Get("sort")
	order := r.URL.Query().Get("order")
	search := r.URL.Query().Get("search")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	// Get resource quotas from resource manager
	resourceQuotas, err := s.resourceManager.ListResourceQuotas(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list resource quotas", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": map[string]interface{}{
				"items":    []interface{}{},
				"page":     page,
				"pageSize": pageSize,
				"total":    0,
			},
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Store total count before filtering
	totalBeforeFilter := len(resourceQuotas)

	// Apply filters
	filterOpts := selectors.ResourceQuotaFilterOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredResourceQuotas, err := selectors.FilterResourceQuotas(resourceQuotas, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter resource quotas", zap.Error(err))
		http.Error(w, "Failed to filter resource quotas", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, resourceQuota := range filteredResourceQuotas {
		responses = append(responses, s.resourceQuotaToResponse(resourceQuota))
	}

	// Create paginated response
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    responses,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalBeforeFilter,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetResourceQuota handles GET /api/v1/resource-quotas/{namespace}/{name}
// @Summary Get resource quota details
// @Description Get details and summary for a specific resource quota.
// @Tags ResourceQuotas
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "ResourceQuota name"
// @Success 200 {object} map[string]interface{} "ResourceQuota details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/resource-quotas/{namespace}/{name} [get]
func (s *Server) handleGetResourceQuota(w http.ResponseWriter, r *http.Request) {
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

	// Get resource quota from Kubernetes API
	resourceQuota, err := s.kubeClient.CoreV1().ResourceQuotas(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get resource quota",
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
	summary := s.resourceQuotaToResponse(*resourceQuota)

	// Add full resource quota spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       resourceQuota.Spec,
		"status":     resourceQuota.Status,
		"metadata":   resourceQuota.ObjectMeta,
		"kind":       "ResourceQuota",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleDeleteResourceQuota handles DELETE /api/v1/resource-quotas/{namespace}/{name}
// @Summary Delete resource quota
// @Description Delete a specific resource quota in a namespace.
// @Tags ResourceQuotas
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "ResourceQuota name"
// @Success 200 {object} map[string]interface{} "ResourceQuota deleted"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/resource-quotas/{namespace}/{name} [delete]
func (s *Server) handleDeleteResourceQuota(w http.ResponseWriter, r *http.Request) {
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

	// Delete the resource quota
	err := s.resourceManager.DeleteResourceQuota(r.Context(), namespace, name, metav1.DeleteOptions{})
	if err != nil {
		s.logger.Error("Failed to delete resource quota",
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

	s.logger.Info("Resource quota deleted successfully",
		zap.String("namespace", namespace),
		zap.String("name", name))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "Resource quota deleted successfully",
		"status":  "success",
	})
}

// handleListAPIResources handles GET /api/v1/api-resources
// @Summary List API resources
// @Description Lists all API resources available in the cluster, with optional search and pagination.
// @Tags APIResources
// @Produce json
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Param search query string false "Search term"
// @Success 200 {object} map[string]interface{} "Paginated list of API resources"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/api-resources [get]
func (s *Server) handleListAPIResources(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")
	search := r.URL.Query().Get("search")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	// Get API resources from resource manager
	apiResources, err := s.resourceManager.ListAPIResources(r.Context())
	if err != nil {
		s.logger.Error("Failed to list API resources", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": map[string]interface{}{
				"items":    []interface{}{},
				"page":     page,
				"pageSize": pageSize,
				"total":    0,
			},
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Store total count before filtering
	totalBeforeFilter := len(apiResources)

	// Apply basic filtering if search is provided
	if search != "" {
		var filteredResources []interface{}
		searchLower := strings.ToLower(search)
		for _, resource := range apiResources {
			if strings.Contains(strings.ToLower(resource.Name), searchLower) ||
				strings.Contains(strings.ToLower(resource.Kind), searchLower) ||
				strings.Contains(strings.ToLower(resource.Group), searchLower) ||
				strings.Contains(strings.ToLower(resource.APIVersion), searchLower) {
				filteredResources = append(filteredResources, s.apiResourceToResponse(resource))
			}
		}

		// Apply pagination to filtered results
		start := (page - 1) * pageSize
		end := start + pageSize
		if start > len(filteredResources) {
			start = len(filteredResources)
		}
		if end > len(filteredResources) {
			end = len(filteredResources)
		}

		pagedItems := filteredResources[start:end]

		response := map[string]interface{}{
			"data": map[string]interface{}{
				"items":    pagedItems,
				"page":     page,
				"pageSize": pageSize,
				"total":    len(filteredResources),
			},
			"status": "success",
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(response)
		return
	}

	// No filtering - apply pagination directly
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(apiResources) {
		start = len(apiResources)
	}
	if end > len(apiResources) {
		end = len(apiResources)
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, resource := range apiResources[start:end] {
		responses = append(responses, s.apiResourceToResponse(resource))
	}

	// Create paginated response
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    responses,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalBeforeFilter,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetAPIResource handles GET /api/v1/api-resources/{name}
// @Summary Get API resource details
// @Description Get details for a specific API resource by name and optional group.
// @Tags APIResources
// @Produce json
// @Param name path string true "API resource name"
// @Param group query string false "API resource group"
// @Success 200 {object} map[string]interface{} "API resource details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/api-resources/{name} [get]
func (s *Server) handleGetAPIResource(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	group := r.URL.Query().Get("group") // Group can be empty for core resources

	if name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "name is required",
			"status": "error",
		})
		return
	}

	// Get API resource from resource manager
	apiResource, err := s.resourceManager.GetAPIResource(r.Context(), name, group)
	if err != nil {
		s.logger.Error("Failed to get API resource",
			zap.String("name", name),
			zap.String("group", group),
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
	summary := s.apiResourceToEnrichedResponse(*apiResource)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   summary,
		"status": "success",
	})
}
