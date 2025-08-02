package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/aaronlmathis/k8s-admin-dash/internal/auth"
	"github.com/aaronlmathis/k8s-admin-dash/internal/config"
	"github.com/aaronlmathis/k8s-admin-dash/internal/k8s/actions"
	"github.com/aaronlmathis/k8s-admin-dash/internal/k8s/client"
	"github.com/aaronlmathis/k8s-admin-dash/internal/k8s/exec"
	"github.com/aaronlmathis/k8s-admin-dash/internal/k8s/informers"
	"github.com/aaronlmathis/k8s-admin-dash/internal/k8s/logs"
	"github.com/aaronlmathis/k8s-admin-dash/internal/k8s/metrics"
	"github.com/aaronlmathis/k8s-admin-dash/internal/k8s/resources"
	"github.com/aaronlmathis/k8s-admin-dash/internal/k8s/selectors"
	"github.com/aaronlmathis/k8s-admin-dash/internal/k8s/ws"
	"github.com/aaronlmathis/k8s-admin-dash/internal/version"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned"
	metricsv1beta1typed "k8s.io/metrics/pkg/client/clientset/versioned/typed/metrics/v1beta1"
)

// Server represents the API server
type Server struct {
	logger          *zap.Logger
	config          *config.Config
	router          chi.Router
	kubeClient      kubernetes.Interface
	informerManager *informers.Manager
	wsHub           *ws.Hub
	actionsService  *actions.NodeActionsService
	applyService    *actions.ApplyService
	logsService     *logs.StreamManager
	execService     *exec.ExecManager
	metricsService  *metrics.MetricsService
	resourceManager *resources.ResourceManager
	authMiddleware  *auth.Middleware
	oidcClient      *auth.OIDCClient
}

// NewServer creates a new API server
func NewServer(logger *zap.Logger, cfg *config.Config) (*Server, error) {
	s := &Server{
		logger: logger,
		config: cfg,
		router: chi.NewRouter(),
		wsHub:  ws.NewHub(logger),
	}

	// Initialize Kubernetes client
	if err := s.initKubernetesClient(); err != nil {
		return nil, err
	}

	// Initialize informers
	if err := s.initInformers(); err != nil {
		return nil, err
	}

	// Initialize actions service
	s.actionsService = actions.NewNodeActionsService(s.kubeClient, s.logger)

	// Initialize authentication
	if err := s.initAuth(); err != nil {
		return nil, err
	}

	s.setupMiddleware()
	s.setupRoutes()

	return s, nil
}

func (s *Server) initKubernetesClient() error {
	s.logger.Info("Initializing Kubernetes client", zap.String("mode", s.config.Kubernetes.Mode))

	mode := client.ClientMode(s.config.Kubernetes.Mode)
	factory, err := client.NewFactory(s.logger, mode, s.config.Kubernetes.KubeconfigPath)
	if err != nil {
		return err
	}

	s.kubeClient = factory.Client()

	// Initialize apply service
	s.applyService = actions.NewApplyService(
		factory.Client(),
		factory.DynamicClient(),
		factory.DiscoveryClient(),
		s.logger,
	)

	// Initialize logs service
	s.logsService = logs.NewStreamManager(s.logger, s.kubeClient)

	// Initialize exec service
	s.execService = exec.NewExecManager(s.logger, s.kubeClient, factory.RESTConfig())

	// Initialize metrics service (try to create metrics client, fallback gracefully)
	var metricsClient *metricsv1beta1.Clientset
	if metricsClient, err = metricsv1beta1.NewForConfig(factory.RESTConfig()); err != nil {
		s.logger.Warn("Metrics server not available, metrics will be limited", zap.Error(err))
	}

	var metricsInterface metricsv1beta1typed.MetricsV1beta1Interface
	if metricsClient != nil {
		metricsInterface = metricsClient.MetricsV1beta1()
	}
	s.metricsService = metrics.NewMetricsService(s.logger, s.kubeClient, metricsInterface)

	// Initialize resource manager
	s.resourceManager = resources.NewResourceManager(s.logger, s.kubeClient, factory.DynamicClient())

	// Validate connection
	if err := factory.ValidateConnection(); err != nil {
		return err
	}

	return nil
}

func (s *Server) initInformers() error {
	s.logger.Info("Initializing informers")

	s.informerManager = informers.NewManager(s.logger, s.kubeClient)

	// Add event handlers
	nodeHandler := informers.NewNodeEventHandler(s.logger, s.wsHub)
	s.informerManager.AddNodeEventHandler(nodeHandler)

	podHandler := informers.NewPodEventHandler(s.logger, s.wsHub)
	s.informerManager.AddPodEventHandler(podHandler)

	return nil
}

func (s *Server) initAuth() error {
	authMode := auth.AuthMode(s.config.Security.AuthMode)

	// Initialize OIDC client if auth mode is OIDC
	if authMode == auth.AuthModeOIDC {
		oidcConfig := auth.OIDCConfig{
			Issuer:       s.config.Security.OIDC.Issuer,
			ClientID:     s.config.Security.OIDC.ClientID,
			ClientSecret: s.config.Security.OIDC.ClientSecret,
			RedirectURL:  s.config.Security.OIDC.RedirectURL,
			Scopes:       s.config.Security.OIDC.Scopes,
			Audience:     s.config.Security.OIDC.Audience,
			JWKSURL:      s.config.Security.OIDC.JWKSURL,
		}

		var err error
		s.oidcClient, err = auth.NewOIDCClient(s.logger, oidcConfig)
		if err != nil {
			return err
		}

		s.logger.Info("OIDC authentication initialized")
	}

	// Initialize authentication middleware
	s.authMiddleware = auth.NewMiddleware(s.logger, authMode, s.oidcClient)

	return nil
}

// Start starts the server components
func (s *Server) Start(ctx context.Context) error {
	// Start WebSocket hub
	go s.wsHub.Run()

	// Start informers
	if err := s.informerManager.Start(); err != nil {
		return err
	}

	return nil
}

// Stop stops the server components
func (s *Server) Stop() {
	s.logger.Info("Stopping server components")

	if s.informerManager != nil {
		s.informerManager.Stop()
	}

	if s.wsHub != nil {
		s.wsHub.Stop()
	}
}

// Handler returns the HTTP handler
func (s *Server) Handler() http.Handler {
	return s.router
}

func (s *Server) setupMiddleware() {
	s.router.Use(middleware.RequestID)
	s.router.Use(middleware.RealIP)
	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(middleware.Timeout(60 * time.Second))

	// Security headers middleware
	s.router.Use(s.authMiddleware.SecureHeaders)

	// Authentication middleware (always applied, handles different auth modes)
	s.router.Use(s.authMiddleware.Authenticate)

	// CORS middleware
	s.router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-CSRF-Token")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})
}

func (s *Server) setupRoutes() {
	// Health endpoints
	s.router.Get("/healthz", s.handleHealth)
	s.router.Get("/readyz", s.handleReady)

	// Version endpoint
	s.router.Get("/version", s.handleVersion)

	// API routes
	s.router.Route("/api/v1", func(r chi.Router) {
		// Basic info endpoint (public)
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"message": "Kubernetes Admin Dashboard API v1",
				"status":  "ready",
			})
		})

		// Authentication endpoints (public)
		r.Post("/auth/login", s.handleLogin)
		r.Post("/auth/callback", s.handleAuthCallback)
		r.Post("/auth/logout", s.handleLogout)
		r.Get("/auth/me", s.handleMe)

		// Read-only endpoints (require read permissions)
		r.Group(func(r chi.Router) {
			if s.config.Security.AuthMode != "none" {
				r.Use(s.authMiddleware.RequireAuth)
			}

			r.Get("/nodes", s.handleListNodes)
			r.Get("/pods", s.handleListPods)
			r.Get("/jobs/{jobId}", s.handleGetJob)

			// M5: Advanced read-only endpoints
			r.Get("/metrics", s.handleGetMetrics)
			r.Get("/metrics/namespace/{namespace}", s.handleGetNamespaceMetrics)
			r.Get("/namespaces", s.handleListNamespaces)
			r.Get("/services", s.handleListServices)
			r.Get("/services/{namespace}", s.handleListServicesInNamespace)
			r.Get("/ingresses/{namespace}", s.handleListIngresses)
			r.Get("/export/{namespace}/{kind}/{name}", s.handleExportResource)
			r.Get("/pods/{namespace}/{podName}/logs", s.handleGetPodLogs)

			// WebSocket endpoints (require authentication for real-time data)
			r.Get("/stream/nodes", s.handleNodesWebSocket)
			r.Get("/stream/pods", s.handlePodsWebSocket)
			r.Get("/stream/logs/{streamId}", s.handleLogsWebSocket)
		})

		// Write endpoints (require write permissions)
		r.Group(func(r chi.Router) {
			if s.config.Security.AuthMode != "none" {
				r.Use(s.authMiddleware.RequireAuth)
				r.Use(s.authMiddleware.RequireWrite)
			}
			r.Use(s.authMiddleware.RateLimit(s.config.RateLimits.ActionsPerMinute))

			r.Post("/nodes/{nodeName}/cordon", s.handleCordonNode)
			r.Post("/nodes/{nodeName}/uncordon", s.handleUncordonNode)
			r.Post("/nodes/{nodeName}/drain", s.handleDrainNode)

			// M5: Advanced write endpoints
			r.Post("/scale", s.handleScaleResource)
			r.Delete("/resources", s.handleDeleteResource)
			r.Post("/namespaces", s.handleCreateNamespace)
			r.Delete("/namespaces/{namespace}", s.handleDeleteNamespace)
			r.Get("/exec/{sessionId}", s.handleExecWebSocket)
			r.Post("/logs/stream", s.handleStartLogStream)
			r.Delete("/logs/stream/{streamId}", s.handleStopLogStream)
		})

		// Apply endpoints (require write permissions with higher rate limits)
		r.Group(func(r chi.Router) {
			if s.config.Security.AuthMode != "none" {
				r.Use(s.authMiddleware.RequireAuth)
				r.Use(s.authMiddleware.RequireWrite)
			}
			r.Use(s.authMiddleware.RateLimit(s.config.RateLimits.ApplyPerMinute))

			r.Post("/namespaces/{namespace}/apply", s.handleApplyYAML)
		})
	})

	// Serve static files from frontend/dist directory
	filesDir := http.Dir("./frontend/dist/")
	s.router.Handle("/*", http.FileServer(filesDir))
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
}

func (s *Server) handleVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(version.Get())
}

func (s *Server) handleListNodes(w http.ResponseWriter, r *http.Request) {
	// Get nodes from informer cache
	indexer := s.informerManager.GetNodeLister()
	nodeObjs := indexer.List()

	var nodes []v1.Node
	for _, obj := range nodeObjs {
		if node, ok := obj.(*v1.Node); ok {
			nodes = append(nodes, *node)
		}
	}

	// Apply filters
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	filterOpts := selectors.NodeFilterOptions{
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredNodes, err := selectors.FilterNodes(nodes, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter nodes", zap.Error(err))
		http.Error(w, "Failed to filter nodes", http.StatusBadRequest)
		return
	}

	// Convert to summaries
	var summaries []map[string]interface{}
	for _, node := range filteredNodes {
		summary := s.nodeToSummary(&node)
		summaries = append(summaries, summary)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summaries)
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

	// Apply filters
	namespace := r.URL.Query().Get("namespace")
	nodeName := r.URL.Query().Get("node")
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	filterOpts := selectors.PodFilterOptions{
		Namespace:     namespace,
		NodeName:      nodeName,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredPods, err := selectors.FilterPods(pods, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter pods", zap.Error(err))
		http.Error(w, "Failed to filter pods", http.StatusBadRequest)
		return
	}

	// Convert to summaries
	var summaries []map[string]interface{}
	for _, pod := range filteredPods {
		summary := s.podToSummary(&pod)
		summaries = append(summaries, summary)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summaries)
}

func (s *Server) handleNodesWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "nodes")
}

func (s *Server) handlePodsWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "pods")
}

func (s *Server) nodeToSummary(node *v1.Node) map[string]interface{} {
	// Extract node roles from labels
	roles := []string{}
	if _, isMaster := node.Labels["node-role.kubernetes.io/master"]; isMaster {
		roles = append(roles, "master")
	}
	if _, isControlPlane := node.Labels["node-role.kubernetes.io/control-plane"]; isControlPlane {
		roles = append(roles, "control-plane")
	}
	if len(roles) == 0 {
		roles = append(roles, "worker")
	}

	// Check if node is ready
	ready := false
	for _, condition := range node.Status.Conditions {
		if condition.Type == v1.NodeReady && condition.Status == v1.ConditionTrue {
			ready = true
			break
		}
	}

	// Extract taints
	taints := []map[string]string{}
	for _, taint := range node.Spec.Taints {
		taints = append(taints, map[string]string{
			"key":    taint.Key,
			"value":  taint.Value,
			"effect": string(taint.Effect),
		})
	}

	return map[string]interface{}{
		"name":              node.Name,
		"roles":             roles,
		"kubeletVersion":    node.Status.NodeInfo.KubeletVersion,
		"ready":             ready,
		"unschedulable":     node.Spec.Unschedulable,
		"taints":            taints,
		"capacity":          node.Status.Capacity,
		"allocatable":       node.Status.Allocatable,
		"creationTimestamp": node.CreationTimestamp.Time,
	}
}

func (s *Server) podToSummary(pod *v1.Pod) map[string]interface{} {
	// Determine pod status
	phase := string(pod.Status.Phase)
	ready := false

	// Check if all containers are ready
	readyContainers := 0
	totalContainers := len(pod.Spec.Containers)

	for _, condition := range pod.Status.Conditions {
		if condition.Type == v1.PodReady && condition.Status == v1.ConditionTrue {
			ready = true
			break
		}
	}

	for _, containerStatus := range pod.Status.ContainerStatuses {
		if containerStatus.Ready {
			readyContainers++
		}
	}

	return map[string]interface{}{
		"name":              pod.Name,
		"namespace":         pod.Namespace,
		"phase":             phase,
		"ready":             ready,
		"readyContainers":   readyContainers,
		"totalContainers":   totalContainers,
		"nodeName":          pod.Spec.NodeName,
		"podIP":             pod.Status.PodIP,
		"hostIP":            pod.Status.HostIP,
		"labels":            pod.Labels,
		"creationTimestamp": pod.CreationTimestamp.Time,
		"deletionTimestamp": pod.DeletionTimestamp,
		"restartPolicy":     string(pod.Spec.RestartPolicy),
	}
}

// Node action handlers

func (s *Server) handleCordonNode(w http.ResponseWriter, r *http.Request) {
	nodeName := chi.URLParam(r, "nodeName")
	requestID := middleware.GetReqID(r.Context())
	user := s.getUserFromContext(r.Context())

	s.logger.Info("Received cordon request",
		zap.String("requestId", requestID),
		zap.String("user", user),
		zap.String("node", nodeName))

	err := s.actionsService.CordonNode(r.Context(), requestID, user, nodeName)
	if err != nil {
		s.logger.Error("Failed to cordon node",
			zap.String("node", nodeName),
			zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUncordonNode(w http.ResponseWriter, r *http.Request) {
	nodeName := chi.URLParam(r, "nodeName")
	requestID := middleware.GetReqID(r.Context())
	user := s.getUserFromContext(r.Context())

	s.logger.Info("Received uncordon request",
		zap.String("requestId", requestID),
		zap.String("user", user),
		zap.String("node", nodeName))

	err := s.actionsService.UncordonNode(r.Context(), requestID, user, nodeName)
	if err != nil {
		s.logger.Error("Failed to uncordon node",
			zap.String("node", nodeName),
			zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDrainNode(w http.ResponseWriter, r *http.Request) {
	nodeName := chi.URLParam(r, "nodeName")
	requestID := middleware.GetReqID(r.Context())
	user := s.getUserFromContext(r.Context())

	s.logger.Info("Received drain request",
		zap.String("requestId", requestID),
		zap.String("user", user),
		zap.String("node", nodeName))

	// Parse drain options from request body
	var opts actions.DrainOptions
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&opts); err != nil {
			s.logger.Error("Failed to parse drain options", zap.Error(err))
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
	}

	jobID, err := s.actionsService.DrainNode(r.Context(), requestID, user, nodeName, opts)
	if err != nil {
		s.logger.Error("Failed to start drain operation",
			zap.String("node", nodeName),
			zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"jobId": jobID})
}

func (s *Server) handleGetJob(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobId")

	job, exists := s.actionsService.GetJob(jobID)
	if !exists {
		http.Error(w, "Job not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(job)
}

// getUserFromContext extracts user from request context and returns user ID string
func (s *Server) getUserFromContext(ctx context.Context) string {
	if user, ok := auth.UserFromContext(ctx); ok && user != nil {
		if user.Email != "" {
			return user.Email
		}
		return user.ID
	}
	return ""
}

// Authentication handlers

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	// If auth mode is none, provide a development response
	if s.config.Security.AuthMode == "none" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"authMode": "none",
			"message":  "Authentication disabled in development mode",
			"devMode":  true,
		})
		return
	}

	if s.oidcClient == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "OIDC not configured",
			"code":  "OIDC_NOT_CONFIGURED",
		})
		return
	}

	// Generate state parameter for security
	state := "kad_" + middleware.GetReqID(r.Context())

	// Get authorization URL
	authURL := s.oidcClient.GetAuthURL(state)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"authUrl": authURL,
		"state":   state,
	})
}

func (s *Server) handleAuthCallback(w http.ResponseWriter, r *http.Request) {
	if s.oidcClient == nil {
		http.Error(w, "OIDC not configured", http.StatusBadRequest)
		return
	}

	// Parse callback parameters
	var callbackData struct {
		Code  string `json:"code"`
		State string `json:"state"`
	}

	if err := json.NewDecoder(r.Body).Decode(&callbackData); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Exchange code for tokens
	token, err := s.oidcClient.ExchangeCode(r.Context(), callbackData.Code)
	if err != nil {
		s.logger.Error("Failed to exchange code for token", zap.Error(err))
		http.Error(w, "Failed to exchange code", http.StatusBadRequest)
		return
	}

	// Extract ID token
	idToken, ok := token.Extra("id_token").(string)
	if !ok {
		http.Error(w, "No ID token in response", http.StatusBadRequest)
		return
	}

	// Verify the ID token and get user info
	user, err := s.oidcClient.VerifyToken(r.Context(), idToken)
	if err != nil {
		s.logger.Error("Failed to verify ID token", zap.Error(err))
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	s.logger.Info("User authenticated via OIDC",
		zap.String("userId", user.ID),
		zap.String("email", user.Email),
		zap.Strings("groups", user.Groups))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"user":         user,
		"access_token": token.AccessToken,
		"id_token":     idToken,
		"expires_at":   token.Expiry,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	// For stateless JWT tokens, logout is handled client-side
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"success": "true",
		"message": "Logged out successfully",
	})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok || user == nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"authenticated": true,
		"user":          user,
	})
}

// handleApplyYAML handles YAML apply operations
func (s *Server) handleApplyYAML(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	requestID := middleware.GetReqID(r.Context())
	user := s.getUserFromContext(r.Context())

	// Parse query parameters
	dryRun := r.URL.Query().Get("dryRun") == "true"
	force := r.URL.Query().Get("force") == "true"

	s.logger.Info("Received apply request",
		zap.String("requestId", requestID),
		zap.String("user", user),
		zap.String("namespace", namespace),
		zap.Bool("dryRun", dryRun),
		zap.Bool("force", force))

	// Read YAML content from request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		s.logger.Error("Failed to read request body", zap.Error(err))
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	yamlContent := string(body)
	if yamlContent == "" {
		s.logger.Error("Empty YAML content")
		http.Error(w, "Empty YAML content", http.StatusBadRequest)
		return
	}

	// Validate content type
	contentType := r.Header.Get("Content-Type")
	if contentType != "application/yaml" && contentType != "text/yaml" {
		s.logger.Warn("Unexpected content type", zap.String("contentType", contentType))
	}

	// Create apply options
	opts := actions.ApplyOptions{
		DryRun:    dryRun,
		Force:     force,
		Namespace: namespace,
	}

	// Apply the YAML
	result, err := s.applyService.ApplyYAML(r.Context(), requestID, user, yamlContent, opts)
	if err != nil {
		s.logger.Error("Failed to apply YAML",
			zap.String("requestId", requestID),
			zap.Error(err))

		// Check if it's a validation error (return 400) or server error (return 500)
		statusCode := http.StatusInternalServerError
		if result != nil && len(result.Errors) > 0 {
			// If we have structured errors, it's likely a validation issue
			statusCode = http.StatusBadRequest
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)

		if result != nil {
			json.NewEncoder(w).Encode(result)
		} else {
			json.NewEncoder(w).Encode(map[string]string{
				"error":   err.Error(),
				"success": "false",
			})
		}
		return
	}

	// Return successful result
	w.Header().Set("Content-Type", "application/json")
	if dryRun {
		w.WriteHeader(http.StatusOK)
	} else {
		if result.Success {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusBadRequest)
		}
	}

	json.NewEncoder(w).Encode(result)
}

// M5 Advanced Features Handler Methods

// handleGetMetrics handles cluster metrics requests
func (s *Server) handleGetMetrics(w http.ResponseWriter, r *http.Request) {
	metrics, err := s.metricsService.GetClusterMetrics(r.Context())
	if err != nil {
		s.logger.Error("Failed to get cluster metrics", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(metrics)
}

// handleGetNamespaceMetrics handles namespace-specific metrics requests
func (s *Server) handleGetNamespaceMetrics(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	if namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace is required"})
		return
	}

	metrics, err := s.metricsService.GetNamespaceMetrics(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to get namespace metrics",
			zap.String("namespace", namespace),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(metrics)
}

// handleListNamespaces handles namespace listing requests
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

// handleListServices handles service listing requests (all namespaces)
func (s *Server) handleListServices(w http.ResponseWriter, r *http.Request) {
	services, err := s.resourceManager.ListServices(r.Context(), "")
	if err != nil {
		s.logger.Error("Failed to list services", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(services)
}

// handleListServicesInNamespace handles service listing requests for a specific namespace
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

// handleListIngresses handles ingress listing requests
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

// handleExportResource handles resource export requests
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

// handleGetPodLogs handles pod logs retrieval requests
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

// handleScaleResource handles resource scaling requests
func (s *Server) handleScaleResource(w http.ResponseWriter, r *http.Request) {
	var req resources.ScaleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	err := s.resourceManager.ScaleResource(r.Context(), req)
	if err != nil {
		s.logger.Error("Failed to scale resource",
			zap.String("namespace", req.Namespace),
			zap.String("name", req.Name),
			zap.String("kind", req.Kind),
			zap.Int32("replicas", req.Replicas),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"success": "true"})
}

// handleDeleteResource handles resource deletion requests
func (s *Server) handleDeleteResource(w http.ResponseWriter, r *http.Request) {
	var req resources.DeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	err := s.resourceManager.DeleteResource(r.Context(), req)
	if err != nil {
		s.logger.Error("Failed to delete resource",
			zap.String("namespace", req.Namespace),
			zap.String("name", req.Name),
			zap.String("kind", req.Kind),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"success": "true"})
}

// handleCreateNamespace handles namespace creation requests
func (s *Server) handleCreateNamespace(w http.ResponseWriter, r *http.Request) {
	var req resources.NamespaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	err := s.resourceManager.CreateNamespace(r.Context(), req)
	if err != nil {
		s.logger.Error("Failed to create namespace",
			zap.String("name", req.Name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"success": "true"})
}

// handleDeleteNamespace handles namespace deletion requests
func (s *Server) handleDeleteNamespace(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	if namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace is required"})
		return
	}

	err := s.resourceManager.DeleteNamespace(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to delete namespace",
			zap.String("namespace", namespace),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"success": "true"})
}

// handleLogsWebSocket handles log streaming WebSocket connections
func (s *Server) handleLogsWebSocket(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamId")
	if streamID == "" {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("streamId is required"))
		return
	}

	// Get the stream
	stream, exists := s.logsService.GetStream(streamID)
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte("stream not found"))
		return
	}

	// Create a simple WebSocket upgrader for logs
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins for now
		},
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.logger.Error("Failed to upgrade log stream connection", zap.Error(err))
		return
	}
	defer conn.Close()

	// Stream logs to WebSocket
	for {
		select {
		case entry := <-stream.Events():
			if err := conn.WriteJSON(entry); err != nil {
				s.logger.Error("Failed to write log entry to WebSocket", zap.Error(err))
				return
			}
		case err := <-stream.Errors():
			s.logger.Error("Log stream error", zap.Error(err))
			conn.WriteJSON(map[string]string{"error": err.Error()})
			return
		case <-stream.Done():
			return
		case <-r.Context().Done():
			return
		}
	}
}

// handleStartLogStream handles log stream initiation requests
func (s *Server) handleStartLogStream(w http.ResponseWriter, r *http.Request) {
	var req struct {
		StreamID  string         `json:"streamId"`
		Namespace string         `json:"namespace"`
		Pod       string         `json:"pod"`
		Filter    logs.LogFilter `json:"filter"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	stream, err := s.logsService.StartStream(r.Context(), req.StreamID, req.Namespace, req.Pod, req.Filter)
	if err != nil {
		s.logger.Error("Failed to start log stream",
			zap.String("streamId", req.StreamID),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"streamId": stream.ID,
		"success":  true,
	})
}

// handleStopLogStream handles log stream termination requests
func (s *Server) handleStopLogStream(w http.ResponseWriter, r *http.Request) {
	streamID := chi.URLParam(r, "streamId")
	if streamID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "streamId is required"})
		return
	}

	s.logsService.StopStream(streamID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"success": "true"})
}

// handleExecWebSocket handles pod exec WebSocket connections
func (s *Server) handleExecWebSocket(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionId")
	if sessionID == "" {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("sessionId is required"))
		return
	}

	// Parse exec request from query parameters
	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	container := r.URL.Query().Get("container")
	command := r.URL.Query()["command"] // Support multiple command parameters
	tty := r.URL.Query().Get("tty") == "true"

	if namespace == "" || pod == "" {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("namespace and pod are required"))
		return
	}

	if len(command) == 0 {
		command = []string{"/bin/sh"} // Default command
	}

	execReq := exec.ExecRequest{
		Namespace: namespace,
		Pod:       pod,
		Container: container,
		Command:   command,
		TTY:       tty,
	}

	err := s.execService.StartExecSession(w, r, sessionID, execReq)
	if err != nil {
		s.logger.Error("Failed to start exec session",
			zap.String("sessionId", sessionID),
			zap.Error(err))
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}
}
