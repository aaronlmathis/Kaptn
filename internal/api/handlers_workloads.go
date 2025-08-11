package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/aaronlmathis/kaptn/internal/k8s/selectors"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

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

	// Only apply Phase 7 security checks if auth mode is not 'none'
	var kubeClient kubernetes.Interface
	if s.config.Security.AuthMode != "none" {
		// Phase 7: Get security context with impersonated client
		secCtx, err := s.getSecurityContext(r)
		if err != nil {
			if secErr, ok := err.(*SecurityError); ok {
				s.writeSecurityError(w, secErr, nil)
			} else {
				http.Error(w, "Security context error", http.StatusInternalServerError)
			}
			return
		}

		// Phase 7: Check permission to get this specific pod
		if err := s.checkResourcePermission(r.Context(), secCtx, "get", "pods", namespace, name); err != nil {
			if secErr, ok := err.(*SecurityError); ok {
				s.writeSecurityError(w, secErr, secCtx.User)
			} else {
				http.Error(w, "Permission check failed", http.StatusInternalServerError)
			}
			return
		}

		kubeClient = secCtx.Client
	} else {
		// Use default client when auth is disabled
		kubeClient = s.kubeClient
	}

	// Get pod from Kubernetes API using appropriate client
	pod, err := kubeClient.CoreV1().Pods(namespace).Get(r.Context(), name, metav1.GetOptions{})
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

	// Log successful operation for audit
	s.logger.Info("Pod retrieved successfully",
		zap.String("user", func() string {
			if s.config.Security.AuthMode == "none" {
				return "none-mode"
			}
			return "authenticated"
		}()),
		zap.String("namespace", namespace),
		zap.String("name", name),
		zap.String("pod_phase", string(pod.Status.Phase)))

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

func (s *Server) handleListPods(w http.ResponseWriter, r *http.Request) {
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

	// Only apply Phase 7 security checks if auth mode is not 'none'
	if s.config.Security.AuthMode != "none" {
		// Phase 7: Get security context with impersonated client
		secCtx, err := s.getSecurityContext(r)
		if err != nil {
			if secErr, ok := err.(*SecurityError); ok {
				s.writeSecurityError(w, secErr, nil)
			} else {
				http.Error(w, "Security context error", http.StatusInternalServerError)
			}
			return
		}

		// Phase 7: Check permission for listing pods
		// If namespace is specified, check that specific namespace
		// If no namespace, check cluster-wide list permission
		if namespace != "" {
			if err := s.checkResourcePermission(r.Context(), secCtx, "list", "pods", namespace, ""); err != nil {
				if secErr, ok := err.(*SecurityError); ok {
					s.writeSecurityError(w, secErr, secCtx.User)
				} else {
					http.Error(w, "Permission check failed", http.StatusInternalServerError)
				}
				return
			}
		} else {
			// For cluster-wide list, check with empty namespace (cluster scope)
			if err := s.checkResourcePermission(r.Context(), secCtx, "list", "pods", "", ""); err != nil {
				if secErr, ok := err.(*SecurityError); ok {
					s.writeSecurityError(w, secErr, secCtx.User)
				} else {
					http.Error(w, "Permission check failed", http.StatusInternalServerError)
				}
				return
			}
		}
	}

	// Get pods from informer cache
	indexer := s.informerManager.GetPodLister()
	podObjs := indexer.List()

	var pods []v1.Pod
	for _, obj := range podObjs {
		if pod, ok := obj.(*v1.Pod); ok {
			pods = append(pods, *pod)
		}
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

	// Log successful operation for audit
	if s.config.Security.AuthMode != "none" {
		// Log with user info when auth is enabled
		s.logger.Info("Pods listed successfully",
			zap.String("namespace", namespace),
			zap.Int("total_pods", len(filteredPods)),
			zap.Int("page", page),
			zap.Int("page_size", pageSize))
	} else {
		// Simple logging when auth is disabled
		s.logger.Info("Pods listed successfully",
			zap.String("user", "none-mode"),
			zap.String("namespace", namespace),
			zap.Int("total_pods", len(filteredPods)),
			zap.Int("page", page),
			zap.Int("page_size", pageSize))
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
