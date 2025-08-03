package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/aaronlmathis/k8s-admin-dash/internal/k8s/selectors"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// Resource listing handlers

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

func (s *Server) handleListPods(w http.ResponseWriter, r *http.Request) {
	// Get pods from informer cache
	indexer := s.informerManager.GetPodLister()
	podObjs := indexer.List()

	var pods []v1.Pod
	for _, obj := range podObjs {
		if pod, ok := obj.(*v1.Pod); ok {
			pods = append(pods, *pod)
		}
	}

	// Parse query parameters for enhanced filtering
	namespace := r.URL.Query().Get("namespace")
	nodeName := r.URL.Query().Get("node")
	phase := r.URL.Query().Get("phase")
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")
	search := r.URL.Query().Get("search")
	sort := r.URL.Query().Get("sort")
	order := r.URL.Query().Get("order")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	// Total count before filtering for pagination metadata
	totalBeforeFilter := len(pods)

	filterOpts := selectors.PodFilterOptions{
		Namespace:     namespace,
		NodeName:      nodeName,
		Phase:         phase,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredPods, err := selectors.FilterPods(pods, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter pods", zap.Error(err))
		http.Error(w, "Failed to filter pods", http.StatusBadRequest)
		return
	}

	// Get pod metrics for enrichment
	podMetricsMap := make(map[string]map[string]interface{})
	if metrics, err := s.metricsService.GetClusterMetrics(r.Context()); err == nil {
		for _, podMetric := range metrics.PodMetrics {
			key := podMetric.Namespace + "/" + podMetric.Name
			podMetricsMap[key] = map[string]interface{}{
				"cpu":    calculatePodCPUUsage(podMetric),
				"memory": calculatePodMemoryUsage(podMetric),
			}
		}
	}

	// Convert to enhanced summaries
	var items []map[string]interface{}
	for _, pod := range filteredPods {
		summary := s.enhancedPodToSummary(&pod, podMetricsMap)
		items = append(items, summary)
	}

	// Prepare response with pagination metadata
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    items,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalBeforeFilter,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleListDeployments(w http.ResponseWriter, r *http.Request) {
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

	// Get deployments from resource manager
	deployments, err := s.resourceManager.ListDeployments(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list deployments", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Store total count before filtering
	totalBeforeFilter := len(deployments)

	// Apply filters
	filterOpts := selectors.DeploymentFilterOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredDeployments, err := selectors.FilterDeployments(deployments, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter deployments", zap.Error(err))
		http.Error(w, "Failed to filter deployments", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, deployment := range filteredDeployments {
		responses = append(responses, s.deploymentToResponse(deployment))
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
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
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

func (s *Server) handleListServicesInNamespace(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	if namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace is required"})
		return
	}

	services, err := s.resourceManager.ListServices(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list services",
			zap.String("namespace", namespace),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(services)
}

func (s *Server) handleListNamespaces(w http.ResponseWriter, r *http.Request) {
	namespaces, err := s.kubeClient.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		s.logger.Error("Failed to list namespaces", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(namespaces.Items)
}

func (s *Server) handleListIngresses(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	if namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace is required"})
		return
	}

	ingresses, err := s.resourceManager.ListIngresses(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list ingresses",
			zap.String("namespace", namespace),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(ingresses)
}

func (s *Server) handleExportResource(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	kind := chi.URLParam(r, "kind")
	name := chi.URLParam(r, "name")

	if namespace == "" || kind == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace, kind, and name are required"})
		return
	}

	export, err := s.resourceManager.ExportResource(r.Context(), namespace, name, kind)
	if err != nil {
		s.logger.Error("Failed to export resource",
			zap.String("namespace", namespace),
			zap.String("kind", kind),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(export)
}

func (s *Server) handleGetPodLogs(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	podName := chi.URLParam(r, "podName")
	containerName := r.URL.Query().Get("container")

	if namespace == "" || podName == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace and podName are required"})
		return
	}

	var tailLines *int64
	if tail := r.URL.Query().Get("tailLines"); tail != "" {
		if lines, err := strconv.ParseInt(tail, 10, 64); err == nil {
			tailLines = &lines
		}
	}

	logs, err := s.resourceManager.GetPodLogs(r.Context(), namespace, podName, containerName, tailLines)
	if err != nil {
		s.logger.Error("Failed to get pod logs",
			zap.String("namespace", namespace),
			zap.String("pod", podName),
			zap.String("container", containerName),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(logs))
}

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

// Individual resource handlers

func (s *Server) handleGetPod(w http.ResponseWriter, r *http.Request) {
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

	// Get pod from Kubernetes API
	pod, err := s.kubeClient.CoreV1().Pods(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get pod",
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

	// Get pod metrics for enrichment
	podMetricsMap := make(map[string]map[string]interface{})
	if metrics, err := s.metricsService.GetClusterMetrics(r.Context()); err == nil {
		for _, podMetric := range metrics.PodMetrics {
			key := podMetric.Namespace + "/" + podMetric.Name
			if key == namespace+"/"+name {
				podMetricsMap[key] = map[string]interface{}{
					"cpu":    calculatePodCPUUsage(podMetric),
					"memory": calculatePodMemoryUsage(podMetric),
				}
				break
			}
		}
	}

	// Convert to enhanced summary with full details
	summary := s.enhancedPodToSummary(pod, podMetricsMap)

	// Add full pod spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       pod.Spec,
		"status":     pod.Status,
		"metadata":   pod.ObjectMeta,
		"kind":       "Pod",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

func (s *Server) handleGetDeployment(w http.ResponseWriter, r *http.Request) {
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

	// Get deployment from Kubernetes API
	deployment, err := s.kubeClient.AppsV1().Deployments(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get deployment",
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
	summary := s.deploymentToResponse(*deployment)

	// Add full deployment spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       deployment.Spec,
		"status":     deployment.Status,
		"metadata":   deployment.ObjectMeta,
		"kind":       "Deployment",
		"apiVersion": "apps/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}
