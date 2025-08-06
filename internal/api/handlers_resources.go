package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/selectors"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	storagev1 "k8s.io/api/storage/v1"
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

func (s *Server) handleListStatefulSets(w http.ResponseWriter, r *http.Request) {
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

	// Get statefulsets from resource manager
	statefulSets, err := s.resourceManager.ListStatefulSets(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list statefulsets", zap.Error(err))
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
	totalBeforeFilter := len(statefulSets)

	// Apply filters
	filterOpts := selectors.StatefulSetFilterOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredStatefulSets, err := selectors.FilterStatefulSets(statefulSets, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter statefulsets", zap.Error(err))
		http.Error(w, "Failed to filter statefulsets", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, statefulSet := range filteredStatefulSets {
		responses = append(responses, s.statefulSetToResponse(statefulSet))
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

func (s *Server) handleListReplicaSets(w http.ResponseWriter, r *http.Request) {
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

	// Get replicasets from resource manager
	replicaSets, err := s.resourceManager.ListReplicaSets(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list replicasets", zap.Error(err))
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
	totalBeforeFilter := len(replicaSets)

	// Apply filters
	filterOpts := selectors.ReplicaSetFilterOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredReplicaSets, err := selectors.FilterReplicaSets(replicaSets, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter replicasets", zap.Error(err))
		http.Error(w, "Failed to filter replicasets", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, replicaSet := range filteredReplicaSets {
		responses = append(responses, s.replicaSetToResponse(replicaSet))
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

func (s *Server) handleListDaemonSets(w http.ResponseWriter, r *http.Request) {
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

	// Get daemonsets from resource manager
	daemonSets, err := s.resourceManager.ListDaemonSets(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list daemonsets", zap.Error(err))
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
	totalBeforeFilter := len(daemonSets)

	// Apply filters
	filterOpts := selectors.DaemonSetFilterOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredDaemonSets, err := selectors.FilterDaemonSets(daemonSets, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter daemonsets", zap.Error(err))
		http.Error(w, "Failed to filter daemonsets", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, daemonSet := range filteredDaemonSets {
		responses = append(responses, s.daemonSetToResponse(daemonSet))
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

func (s *Server) handleListJobs(w http.ResponseWriter, r *http.Request) {
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

	// Get jobs from resource manager
	jobs, err := s.resourceManager.ListJobs(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list jobs", zap.Error(err))
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
	totalBeforeFilter := len(jobs)

	// Apply filters
	filterOpts := selectors.JobFilterOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredJobs, err := selectors.FilterJobs(jobs, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter jobs", zap.Error(err))
		http.Error(w, "Failed to filter jobs", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, job := range filteredJobs {
		responses = append(responses, s.jobToResponse(job))
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

func (s *Server) handleListCronJobs(w http.ResponseWriter, r *http.Request) {
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

	// Get cronjobs from resource manager
	cronJobs, err := s.resourceManager.ListCronJobs(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list cronjobs", zap.Error(err))
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
	totalBeforeFilter := len(cronJobs)

	// Apply filters
	filterOpts := selectors.CronJobFilterOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredCronJobs, err := selectors.FilterCronJobs(cronJobs, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter cronjobs", zap.Error(err))
		http.Error(w, "Failed to filter cronjobs", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, cronJob := range filteredCronJobs {
		responses = append(responses, s.cronJobToResponse(cronJob))
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

func (s *Server) handleGetJob(w http.ResponseWriter, r *http.Request) {
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

	// Get job from Kubernetes API
	job, err := s.kubeClient.BatchV1().Jobs(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get job",
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
	summary := s.jobToResponse(*job)

	// Add full job spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       job.Spec,
		"status":     job.Status,
		"metadata":   job.ObjectMeta,
		"kind":       "Job",
		"apiVersion": "batch/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

func (s *Server) handleGetCronJob(w http.ResponseWriter, r *http.Request) {
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

	// Get cronjob from Kubernetes API
	cronJob, err := s.kubeClient.BatchV1().CronJobs(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get cronjob",
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
	summary := s.cronJobToResponse(*cronJob)

	// Add full cronjob spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       cronJob.Spec,
		"status":     cronJob.Status,
		"metadata":   cronJob.ObjectMeta,
		"kind":       "CronJob",
		"apiVersion": "batch/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
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
		"data": map[string]interface{}{
			"items": responses,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

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

func (s *Server) handleExportResource(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	kind := chi.URLParam(r, "kind")
	name := chi.URLParam(r, "name")

	if kind == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "kind and name are required"})
		return
	}

	// For cluster-scoped resources, namespace can be empty
	// Check if this is a cluster-scoped resource
	clusterScopedResources := map[string]bool{
		"StorageClass":       true,
		"PersistentVolume":   true,
		"ClusterRole":        true,
		"ClusterRoleBinding": true,
		"Node":               true,
		"CSIDriver":          true,
	}

	// If it's not a cluster-scoped resource, namespace is required
	if !clusterScopedResources[kind] && namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace is required for namespaced resources"})
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

func (s *Server) handleGetStatefulSet(w http.ResponseWriter, r *http.Request) {
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

	// Get statefulset from Kubernetes API
	statefulSet, err := s.kubeClient.AppsV1().StatefulSets(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get statefulset",
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
	summary := s.statefulSetToResponse(*statefulSet)

	// Add full statefulset spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       statefulSet.Spec,
		"status":     statefulSet.Status,
		"metadata":   statefulSet.ObjectMeta,
		"kind":       "StatefulSet",
		"apiVersion": "apps/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

func (s *Server) handleGetDaemonSet(w http.ResponseWriter, r *http.Request) {
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

	// Get daemonset from Kubernetes API
	daemonSet, err := s.kubeClient.AppsV1().DaemonSets(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get daemonset",
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
	summary := s.daemonSetToResponse(*daemonSet)

	// Add full daemonset spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       daemonSet.Spec,
		"status":     daemonSet.Status,
		"metadata":   daemonSet.ObjectMeta,
		"kind":       "DaemonSet",
		"apiVersion": "apps/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

func (s *Server) handleGetReplicaSet(w http.ResponseWriter, r *http.Request) {
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

	// Get replicaset from Kubernetes API
	replicaSet, err := s.kubeClient.AppsV1().ReplicaSets(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get replicaset",
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
	summary := s.replicaSetToResponse(*replicaSet)

	// Add full replicaset spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       replicaSet.Spec,
		"status":     replicaSet.Status,
		"metadata":   replicaSet.ObjectMeta,
		"kind":       "ReplicaSet",
		"apiVersion": "apps/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

func (s *Server) handleListEndpoints(w http.ResponseWriter, r *http.Request) {
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

	// Get endpoints from resource manager
	endpoints, err := s.resourceManager.ListEndpoints(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list endpoints", zap.Error(err))
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
	totalBeforeFilter := len(endpoints)

	// Apply filters
	filterOpts := selectors.EndpointsFilterOptions{
		Namespace:     namespace,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredEndpoints, err := selectors.FilterEndpoints(endpoints, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter endpoints", zap.Error(err))
		http.Error(w, "Failed to filter endpoints", http.StatusBadRequest)
		return
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, endpoint := range filteredEndpoints {
		responses = append(responses, s.endpointsToResponse(endpoint))
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

func (s *Server) handleListConfigMaps(w http.ResponseWriter, r *http.Request) {
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

	// Get config maps from resource manager
	configMaps, err := s.resourceManager.ListConfigMaps(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list config maps", zap.Error(err))
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
	totalBeforeFilter := len(configMaps)

	// Apply basic filtering
	var filteredConfigMaps []v1.ConfigMap
	for _, cm := range configMaps {
		// Basic search filter
		if search != "" {
			if !strings.Contains(strings.ToLower(cm.Name), strings.ToLower(search)) {
				continue
			}
		}
		filteredConfigMaps = append(filteredConfigMaps, cm)
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, configMap := range filteredConfigMaps {
		responses = append(responses, s.configMapToResponse(configMap))
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

func (s *Server) handleGetConfigMap(w http.ResponseWriter, r *http.Request) {
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

	// Get config map from resource manager
	configMap, err := s.resourceManager.GetConfigMap(r.Context(), namespace, name)
	if err != nil {
		s.logger.Error("Failed to get config map",
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

	// Convert unstructured to ConfigMap for enhanced summary
	configMapObj := &v1.ConfigMap{}
	if unstructuredMap, ok := configMap.(map[string]interface{}); ok {
		// Extract metadata
		if metadata, ok := unstructuredMap["metadata"].(map[string]interface{}); ok {
			if name, ok := metadata["name"].(string); ok {
				configMapObj.Name = name
			}
			if namespace, ok := metadata["namespace"].(string); ok {
				configMapObj.Namespace = namespace
			}
			if creationTimestamp, ok := metadata["creationTimestamp"].(string); ok {
				if ts, err := time.Parse(time.RFC3339, creationTimestamp); err == nil {
					configMapObj.CreationTimestamp = metav1.NewTime(ts)
				}
			}
		}
		// Extract data
		if data, ok := unstructuredMap["data"].(map[string]interface{}); ok {
			configMapObj.Data = make(map[string]string)
			for k, v := range data {
				if strVal, ok := v.(string); ok {
					configMapObj.Data[k] = strVal
				}
			}
		}
	}

	// Convert to enhanced summary
	summary := s.configMapToResponse(*configMapObj)

	// Add full config map details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       configMap.(map[string]interface{})["data"],
		"metadata":   configMap.(map[string]interface{})["metadata"],
		"kind":       "ConfigMap",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// Persistent Volume handlers

func (s *Server) handleListPersistentVolumes(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters for enhanced filtering
	search := r.URL.Query().Get("search")
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

	// Get PVs from Kubernetes API
	pvs, err := s.kubeClient.CoreV1().PersistentVolumes().List(
		r.Context(),
		metav1.ListOptions{},
	)
	if err != nil {
		s.logger.Error("Failed to list persistent volumes", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to slice for filtering
	pvList := append([]v1.PersistentVolume{}, pvs.Items...)

	// Store total count before filtering for pagination metadata
	totalBeforeFilter := len(pvList)

	// Apply basic filtering if search is provided
	if search != "" {
		var filteredPVs []v1.PersistentVolume
		searchLower := strings.ToLower(search)
		for _, pv := range pvList {
			if strings.Contains(strings.ToLower(pv.Name), searchLower) ||
				strings.Contains(strings.ToLower(string(pv.Status.Phase)), searchLower) {
				filteredPVs = append(filteredPVs, pv)
			}
		}
		pvList = filteredPVs
	}

	// Convert to enhanced summaries
	var items []map[string]interface{}
	for _, pv := range pvList {
		summary := s.persistentVolumeToResponse(&pv)
		items = append(items, summary)
	}

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize

	if start >= len(items) {
		items = []map[string]interface{}{}
	} else if end > len(items) {
		items = items[start:]
	} else {
		items = items[start:end]
	}

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
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleGetPersistentVolume(w http.ResponseWriter, r *http.Request) {
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

	// Get PV from Kubernetes API
	pv, err := s.kubeClient.CoreV1().PersistentVolumes().Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get persistent volume",
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
	summary := s.persistentVolumeToResponse(pv)

	// Add full PV details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       pv.Spec,
		"status":     pv.Status,
		"metadata":   pv.ObjectMeta,
		"kind":       "PersistentVolume",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// Persistent Volume Claim handlers

func (s *Server) handleListPersistentVolumeClaims(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters for enhanced filtering
	namespace := r.URL.Query().Get("namespace")
	search := r.URL.Query().Get("search")
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

	var pvcs *v1.PersistentVolumeClaimList
	var err error

	// Get PVCs from Kubernetes API - either all namespaces or specific namespace
	if namespace == "" || namespace == "all" {
		pvcs, err = s.kubeClient.CoreV1().PersistentVolumeClaims("").List(
			r.Context(),
			metav1.ListOptions{},
		)
	} else {
		pvcs, err = s.kubeClient.CoreV1().PersistentVolumeClaims(namespace).List(
			r.Context(),
			metav1.ListOptions{},
		)
	}

	if err != nil {
		s.logger.Error("Failed to list persistent volume claims", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to slice for filtering
	pvcList := append([]v1.PersistentVolumeClaim{}, pvcs.Items...)

	// Store total count before filtering for pagination metadata
	totalBeforeFilter := len(pvcList)

	// Apply basic filtering if search is provided
	if search != "" {
		var filteredPVCs []v1.PersistentVolumeClaim
		searchLower := strings.ToLower(search)
		for _, pvc := range pvcList {
			if strings.Contains(strings.ToLower(pvc.Name), searchLower) ||
				strings.Contains(strings.ToLower(pvc.Namespace), searchLower) ||
				strings.Contains(strings.ToLower(string(pvc.Status.Phase)), searchLower) {
				filteredPVCs = append(filteredPVCs, pvc)
			}
		}
		pvcList = filteredPVCs
	}

	// Convert to enhanced summaries
	var items []map[string]interface{}
	for _, pvc := range pvcList {
		summary := s.persistentVolumeClaimToResponse(&pvc)
		items = append(items, summary)
	}

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize

	if start >= len(items) {
		items = []map[string]interface{}{}
	} else if end > len(items) {
		items = items[start:]
	} else {
		items = items[start:end]
	}

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
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleGetPersistentVolumeClaim(w http.ResponseWriter, r *http.Request) {
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

	// Get PVC from Kubernetes API
	pvc, err := s.kubeClient.CoreV1().PersistentVolumeClaims(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get persistent volume claim",
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
	summary := s.persistentVolumeClaimToResponse(pvc)

	// Add full PVC details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       pvc.Spec,
		"status":     pvc.Status,
		"metadata":   pvc.ObjectMeta,
		"kind":       "PersistentVolumeClaim",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

func (s *Server) handleListStorageClasses(w http.ResponseWriter, r *http.Request) {
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

	// Get storage classes from resource manager
	storageClasses, err := s.resourceManager.ListStorageClasses(r.Context())
	if err != nil {
		s.logger.Error("Failed to list storage classes", zap.Error(err))
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
	totalBeforeFilter := len(storageClasses)

	// Apply basic search filtering
	var filteredStorageClasses []interface{}
	for _, sc := range storageClasses {
		if search != "" {
			if !strings.Contains(strings.ToLower(sc.Name), strings.ToLower(search)) {
				continue
			}
		}
		filteredStorageClasses = append(filteredStorageClasses, sc)
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, sc := range filteredStorageClasses {
		scTyped, ok := sc.(storagev1.StorageClass)
		if !ok {
			continue
		}
		responses = append(responses, s.storageClassToResponse(scTyped))
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

func (s *Server) handleGetStorageClass(w http.ResponseWriter, r *http.Request) {
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

	// Get storage class from resource manager
	storageClass, err := s.resourceManager.GetStorageClass(r.Context(), name)
	if err != nil {
		s.logger.Error("Failed to get storage class",
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
	summary := s.storageClassToResponse(*storageClass)

	// Add full storage class details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"parameters": storageClass.Parameters,
		"metadata":   storageClass.ObjectMeta,
		"kind":       "StorageClass",
		"apiVersion": "storage.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

func (s *Server) handleListVolumeSnapshots(w http.ResponseWriter, r *http.Request) {
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

	// Get volume snapshots from resource manager
	volumeSnapshots, err := s.resourceManager.ListVolumeSnapshots(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list volume snapshots", zap.Error(err))
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
	totalBeforeFilter := len(volumeSnapshots)

	// Apply basic filtering (search by name)
	var filteredVolumeSnapshots []interface{}
	for _, vs := range volumeSnapshots {
		if volumeSnapshotMap, ok := vs.(map[string]interface{}); ok {
			// Basic search filter
			if search != "" {
				if metadata, ok := volumeSnapshotMap["metadata"].(map[string]interface{}); ok {
					if name, ok := metadata["name"].(string); ok {
						if !strings.Contains(strings.ToLower(name), strings.ToLower(search)) {
							continue
						}
					}
				}
			}
			filteredVolumeSnapshots = append(filteredVolumeSnapshots, vs)
		}
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, volumeSnapshot := range filteredVolumeSnapshots {
		responses = append(responses, s.volumeSnapshotToResponse(volumeSnapshot))
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

func (s *Server) handleGetVolumeSnapshot(w http.ResponseWriter, r *http.Request) {
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

	// Get volume snapshot from resource manager
	volumeSnapshot, err := s.resourceManager.GetVolumeSnapshot(r.Context(), namespace, name)
	if err != nil {
		s.logger.Error("Failed to get volume snapshot",
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
	summary := s.volumeSnapshotToResponse(volumeSnapshot)

	// Add full volume snapshot details for detailed view
	volumeSnapshotMap := volumeSnapshot.(map[string]interface{})
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       volumeSnapshotMap["spec"],
		"status":     volumeSnapshotMap["status"],
		"metadata":   volumeSnapshotMap["metadata"],
		"kind":       "VolumeSnapshot",
		"apiVersion": "snapshot.storage.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

func (s *Server) handleListVolumeSnapshotClasses(w http.ResponseWriter, r *http.Request) {
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

	// Get volume snapshot classes from resource manager
	volumeSnapshotClasses, err := s.resourceManager.ListVolumeSnapshotClasses(r.Context())
	if err != nil {
		s.logger.Error("Failed to list volume snapshot classes", zap.Error(err))
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
	totalBeforeFilter := len(volumeSnapshotClasses)

	// Apply basic search filtering
	var filteredVolumeSnapshotClasses []interface{}
	for _, vsc := range volumeSnapshotClasses {
		if search != "" {
			vscMap, ok := vsc.(map[string]interface{})
			if !ok {
				continue
			}
			if metadata, ok := vscMap["metadata"].(map[string]interface{}); ok {
				if name, ok := metadata["name"].(string); ok {
					if !strings.Contains(strings.ToLower(name), strings.ToLower(search)) {
						continue
					}
				}
			}
		}
		filteredVolumeSnapshotClasses = append(filteredVolumeSnapshotClasses, vsc)
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, vsc := range filteredVolumeSnapshotClasses {
		responses = append(responses, s.volumeSnapshotClassToResponse(vsc))
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

func (s *Server) handleGetVolumeSnapshotClass(w http.ResponseWriter, r *http.Request) {
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

	// Get volume snapshot class from resource manager
	volumeSnapshotClass, err := s.resourceManager.GetVolumeSnapshotClass(r.Context(), name)
	if err != nil {
		s.logger.Error("Failed to get volume snapshot class",
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
	summary := s.volumeSnapshotClassToResponse(volumeSnapshotClass)

	// Add full volume snapshot class details for detailed view
	volumeSnapshotClassMap := volumeSnapshotClass.(map[string]interface{})
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       volumeSnapshotClassMap["spec"],
		"metadata":   volumeSnapshotClassMap["metadata"],
		"kind":       "VolumeSnapshotClass",
		"apiVersion": "snapshot.storage.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

func (s *Server) handleListCSIDrivers(w http.ResponseWriter, r *http.Request) {
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

	// Get CSI drivers from resource manager
	csiDrivers, err := s.resourceManager.ListCSIDrivers(r.Context())
	if err != nil {
		s.logger.Error("Failed to list CSI drivers", zap.Error(err))
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
	totalBeforeFilter := len(csiDrivers)

	// Apply basic search filtering
	var filteredCSIDrivers []interface{}
	for _, csi := range csiDrivers {
		if search != "" {
			if !strings.Contains(strings.ToLower(csi.Name), strings.ToLower(search)) {
				continue
			}
		}
		filteredCSIDrivers = append(filteredCSIDrivers, csi)
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, csi := range filteredCSIDrivers {
		csiTyped, ok := csi.(storagev1.CSIDriver)
		if !ok {
			continue
		}
		responses = append(responses, s.csiDriverToResponse(csiTyped))
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

func (s *Server) handleGetCSIDriver(w http.ResponseWriter, r *http.Request) {
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

	// Get CSI driver from resource manager
	csiDriver, err := s.resourceManager.GetCSIDriver(r.Context(), name)
	if err != nil {
		s.logger.Error("Failed to get CSI driver",
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
	summary := s.csiDriverToResponse(*csiDriver)

	// Add full CSI driver details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       csiDriver.Spec,
		"metadata":   csiDriver.ObjectMeta,
		"kind":       "CSIDriver",
		"apiVersion": "storage.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}
