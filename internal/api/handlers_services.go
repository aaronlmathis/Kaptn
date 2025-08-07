package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/aaronlmathis/kaptn/internal/k8s/selectors"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// handleGetService handles GET /api/v1/namespaces/{namespace}/services/{name}
// @Summary Get Service details
// @Description Get details and summary for a specific Service.
// @Tags Services
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Service name"
// @Success 200 {object} map[string]interface{} "Service details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/services/{name} [get]
func (s *Server) handleGetService(w http.ResponseWriter, r *http.Request) {
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

	// Get service from Kubernetes API
	service, err := s.kubeClient.CoreV1().Services(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get service",
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
	summary := s.serviceToResponse(*service)

	// Add full service spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       service.Spec,
		"status":     service.Status,
		"metadata":   service.ObjectMeta,
		"kind":       "Service",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleGetEndpoints handles GET /api/v1/namespaces/{namespace}/endpoints/{name}
// @Summary Get Endpoints details
// @Description Get details and summary for a specific Endpoints resource.
// @Tags Endpoints
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Endpoints name"
// @Success 200 {object} map[string]interface{} "Endpoints details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/endpoints/{name} [get]
func (s *Server) handleGetEndpoints(w http.ResponseWriter, r *http.Request) {
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

	// Get endpoints from Kubernetes API
	endpoint, err := s.kubeClient.CoreV1().Endpoints(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get endpoints",
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
	summary := s.endpointsToResponse(*endpoint)

	// Add full endpoints spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"subsets":    endpoint.Subsets,
		"metadata":   endpoint.ObjectMeta,
		"kind":       "Endpoints",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListEndpointSlices handles GET /api/v1/endpointslices
// @Summary List EndpointSlices
// @Description Lists all EndpointSlices in the cluster or a specific namespace, with optional search and pagination.
// @Tags EndpointSlices
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Param search query string false "Search term for EndpointSlice name"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Success 200 {object} map[string]interface{} "Paginated list of EndpointSlices"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/endpointslices [get]
func (s *Server) handleListEndpointSlices(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	namespace := r.URL.Query().Get("namespace")
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

	// Get endpoint slices from resource manager
	endpointSlices, err := s.resourceManager.ListEndpointSlices(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list endpoint slices", zap.Error(err))
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
	totalBeforeFilter := len(endpointSlices)

	// Apply basic filtering (we'll need to add EndpointSlice filters to selectors package)
	var filteredEndpointSlices []interface{}
	for _, es := range endpointSlices {
		if endpointSliceMap, ok := es.(map[string]interface{}); ok {
			// Basic search filter
			if search != "" {
				if metadata, ok := endpointSliceMap["metadata"].(map[string]interface{}); ok {
					if name, ok := metadata["name"].(string); ok {
						if !strings.Contains(strings.ToLower(name), strings.ToLower(search)) {
							continue
						}
					}
				}
			}
			filteredEndpointSlices = append(filteredEndpointSlices, es)
		}
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, endpointSlice := range filteredEndpointSlices {
		responses = append(responses, s.endpointSliceToResponse(endpointSlice))
	}

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(responses) {
		responses = []map[string]interface{}{}
	} else if end > len(responses) {
		responses = responses[start:]
	} else {
		responses = responses[start:end]
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

// handleGetEndpointSlice handles GET /api/v1/namespaces/{namespace}/endpointslices/{name}
// @Summary Get EndpointSlice details
// @Description Get details and summary for a specific EndpointSlice.
// @Tags EndpointSlices
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "EndpointSlice name"
// @Success 200 {object} map[string]interface{} "EndpointSlice details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/endpointslices/{name} [get]
func (s *Server) handleGetEndpointSlice(w http.ResponseWriter, r *http.Request) {
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

	// Get endpoint slice from resource manager
	endpointSlice, err := s.resourceManager.GetEndpointSlice(r.Context(), namespace, name)
	if err != nil {
		s.logger.Error("Failed to get endpoint slice",
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
	summary := s.endpointSliceToResponse(endpointSlice)

	// Add full endpoint slice details for detailed view
	endpointSliceMap := endpointSlice.(map[string]interface{})
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       endpointSliceMap["spec"],
		"metadata":   endpointSliceMap["metadata"],
		"kind":       "EndpointSlice",
		"apiVersion": "discovery.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListNetworkPolicies handles GET /api/v1/networkpolicies
// @Summary List NetworkPolicies
// @Description Lists all NetworkPolicies in the cluster or a specific namespace, with filtering, sorting, and pagination.
// @Tags NetworkPolicies
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Param labelSelector query string false "Label selector to filter NetworkPolicies"
// @Param fieldSelector query string false "Field selector to filter NetworkPolicies"
// @Param sort query string false "Sort by field"
// @Param order query string false "Sort order (asc/desc)"
// @Param search query string false "Search term"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Success 200 {object} map[string]interface{} "Paginated list of NetworkPolicies"
// @Failure 400 {string} string "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/networkpolicies [get]
func (s *Server) handleListNetworkPolicies(w http.ResponseWriter, r *http.Request) {
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

	// Get network policies from resource manager
	networkPolicies, err := s.resourceManager.ListNetworkPolicies(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list network policies", zap.Error(err))
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
	totalBeforeFilter := len(networkPolicies)

	// Apply filters
	filterOpts := selectors.NetworkPolicyFilterOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredNetworkPolicies, err := selectors.FilterNetworkPolicies(networkPolicies, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter network policies", zap.Error(err))
		http.Error(w, "Failed to filter network policies", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, networkPolicy := range filteredNetworkPolicies {
		responses = append(responses, s.networkPolicyToResponse(networkPolicy))
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

// handleGetNetworkPolicy handles GET /api/v1/namespaces/{namespace}/networkpolicies/{name}
// @Summary Get NetworkPolicy details
// @Description Get details and summary for a specific NetworkPolicy.
// @Tags NetworkPolicies
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "NetworkPolicy name"
// @Success 200 {object} map[string]interface{} "NetworkPolicy details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/networkpolicies/{name} [get]
func (s *Server) handleGetNetworkPolicy(w http.ResponseWriter, r *http.Request) {
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

	// Get network policy from Kubernetes API
	networkPolicy, err := s.kubeClient.NetworkingV1().NetworkPolicies(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get network policy",
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
	summary := s.networkPolicyToResponse(*networkPolicy)

	// Add full network policy spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       networkPolicy.Spec,
		"metadata":   networkPolicy.ObjectMeta,
		"kind":       "NetworkPolicy",
		"apiVersion": "networking.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListServices handles GET /api/v1/services
// @Summary List Services
// @Description Lists all Services in the cluster or a specific namespace, with optional filtering, sorting, and pagination.
// @Tags Services
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Param search query string false "Search term for Service name"
// @Param sortBy query string false "Sort by field (default: name)"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 50, max: 100)"
// @Success 200 {object} map[string]interface{} "Paginated list of Services"
// @Failure 400 {string} string "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/services [get]
func (s *Server) handleListServices(w http.ResponseWriter, r *http.Request) {
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

	// List services from all namespaces (or specific namespace if provided)
	services, err := s.resourceManager.ListServices(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list services", zap.Error(err))
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
	totalBeforeFilter := len(services)

	// Apply filtering and pagination
	filterOptions := selectors.ServiceFilterOptions{
		Namespace: namespace,
		Search:    search,
		Sort:      sortBy,
		Page:      page,
		PageSize:  pageSize,
	}

	filteredServices, err := selectors.FilterServices(services, filterOptions)
	if err != nil {
		s.logger.Error("Failed to filter services", zap.Error(err))
		http.Error(w, "Failed to filter services", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responseItems []map[string]interface{}
	for _, service := range filteredServices {
		responseItems = append(responseItems, s.serviceToResponse(service))
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

// handleListServicesInNamespace handles GET /api/v1/namespaces/{namespace}/services
// @Summary List Services in Namespace
// @Description Lists all Services in a specific namespace.
// @Tags Services
// @Produce json
// @Param namespace path string true "Namespace"
// @Success 200 {array} map[string]interface{} "List of Services"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/services [get]
func (s *Server) handleListServicesInNamespace(w http.ResponseWriter, r *http.Request) {
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

	services, err := s.resourceManager.ListServices(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list services",
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
	for _, service := range services {
		responseItems = append(responseItems, s.serviceToResponse(service))
	}

	response := map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"items": responseItems,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleListAllIngresses handles GET /api/v1/ingresses
// @Summary List all Ingresses
// @Description Lists all Ingresses in the cluster or a specific namespace.
// @Tags Ingresses
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Success 200 {object} map[string]interface{} "List of Ingresses"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/ingresses [get]
func (s *Server) handleListAllIngresses(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters for filtering
	namespace := r.URL.Query().Get("namespace")

	// Get all ingresses from all namespaces if no specific namespace is requested
	var allIngresses []interface{}

	if namespace != "" {
		// Get ingresses from specific namespace
		ingresses, err := s.resourceManager.ListIngresses(r.Context(), namespace)
		if err != nil {
			s.logger.Error("Failed to list ingresses",
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
		allIngresses = ingresses
	} else {
		// Get ingresses from all namespaces
		// First get all namespaces
		namespaces, err := s.kubeClient.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
		if err != nil {
			s.logger.Error("Failed to list namespaces for ingresses", zap.Error(err))
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

		// Get ingresses from each namespace
		for _, ns := range namespaces.Items {
			ingresses, err := s.resourceManager.ListIngresses(r.Context(), ns.Name)
			if err != nil {
				s.logger.Warn("Failed to list ingresses from namespace",
					zap.String("namespace", ns.Name),
					zap.Error(err))
				continue // Skip this namespace but continue with others
			}
			allIngresses = append(allIngresses, ingresses...)
		}
	}

	// Convert to response format
	responses := make([]map[string]interface{}, 0, len(allIngresses))
	for _, ingress := range allIngresses {
		responses = append(responses, s.ingressToResponse(ingress))
	}

	// Create response
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items": responses,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleListIngresses handles GET /api/v1/namespaces/{namespace}/ingresses
// @Summary List Ingresses in Namespace
// @Description Lists all Ingresses in a specific namespace.
// @Tags Ingresses
// @Produce json
// @Param namespace path string true "Namespace"
// @Success 200 {object} map[string]interface{} "List of Ingresses"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/ingresses [get]
func (s *Server) handleListIngresses(w http.ResponseWriter, r *http.Request) {
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

	ingresses, err := s.resourceManager.ListIngresses(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list ingresses",
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
	responses := make([]map[string]interface{}, 0, len(ingresses))
	for _, ingress := range ingresses {
		responses = append(responses, s.ingressToResponse(ingress))
	}

	// Create response
	response := map[string]interface{}{
		"status": "success",
		"data": map[string]interface{}{
			"items": responses,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetIngress handles GET /api/v1/namespaces/{namespace}/ingresses/{name}
// @Summary Get Ingress details
// @Description Get details and summary for a specific Ingress.
// @Tags Ingresses
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Ingress name"
// @Success 200 {object} map[string]interface{} "Ingress details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/ingresses/{name} [get]
func (s *Server) handleGetIngress(w http.ResponseWriter, r *http.Request) {
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

	// Get ingress from resource manager
	ingressObj, err := s.resourceManager.GetIngress(r.Context(), namespace, name)
	if err != nil {
		s.logger.Error("Failed to get ingress",
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
	summary := s.ingressToResponse(ingressObj)

	// Add full ingress spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       ingressObj["spec"],
		"status":     ingressObj["status"],
		"metadata":   ingressObj["metadata"],
		"kind":       "Ingress",
		"apiVersion": ingressObj["apiVersion"],
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}
