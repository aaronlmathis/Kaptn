package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/aaronlmathis/kaptn/internal/analytics"
	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/k8s/actions"
	"github.com/aaronlmathis/kaptn/internal/k8s/client"
	"github.com/aaronlmathis/kaptn/internal/k8s/exec"
	"github.com/aaronlmathis/kaptn/internal/k8s/informers"
	"github.com/aaronlmathis/kaptn/internal/k8s/logs"
	"github.com/aaronlmathis/kaptn/internal/k8s/metrics"
	"github.com/aaronlmathis/kaptn/internal/k8s/overview"
	"github.com/aaronlmathis/kaptn/internal/k8s/resources"
	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	apimiddleware "github.com/aaronlmathis/kaptn/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
	"k8s.io/client-go/kubernetes"
	metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned"
	metricsv1beta1typed "k8s.io/metrics/pkg/client/clientset/versioned/typed/metrics/v1beta1"
)

// Server represents the API server
type Server struct {
	logger           *zap.Logger
	config           *config.Config
	router           chi.Router
	kubeClient       kubernetes.Interface
	informerManager  *informers.Manager
	wsHub            *ws.Hub
	actionsService   *actions.NodeActionsService
	applyService     *actions.ApplyService
	logsService      *logs.StreamManager
	execService      *exec.ExecManager
	metricsService   *metrics.MetricsService
	overviewService  *overview.OverviewService
	resourceManager  *resources.ResourceManager
	analyticsService *analytics.AnalyticsService
	authMiddleware   *auth.Middleware
	oidcClient       *auth.OIDCClient
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

	// Set WebSocket broadcaster for job progress streaming
	s.actionsService.SetWebSocketBroadcaster(s.wsHub)

	// Enable job persistence if configured
	if s.config.Jobs.PersistenceEnabled {
		if err := s.actionsService.EnableJobPersistence(s.config.Jobs.StorePath); err != nil {
			s.logger.Error("Failed to enable job persistence, continuing without persistence",
				zap.Error(err),
				zap.String("storePath", s.config.Jobs.StorePath))
		} else {
			s.logger.Info("Job persistence enabled",
				zap.String("storePath", s.config.Jobs.StorePath))
		}
	}

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

	// Initialize overview service
	s.overviewService = overview.NewOverviewService(s.logger, s.kubeClient, s.metricsService)
	s.overviewService.SetWebSocketHub(s.wsHub)

	// Initialize resource manager
	s.resourceManager = resources.NewResourceManager(s.logger, s.kubeClient, factory.DynamicClient())

	// Initialize analytics service
	if err := s.initAnalytics(); err != nil {
		return err
	}

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

	// Set authentication middleware on WebSocket hub
	s.wsHub.SetAuthMiddleware(s.authMiddleware)

	return nil
}

func (s *Server) initAnalytics() error {
	s.logger.Info("Initializing analytics service")

	// Parse cache TTL
	cacheTTL, err := time.ParseDuration(s.config.Caching.AnalyticsTTL)
	if err != nil {
		return fmt.Errorf("invalid analytics cache TTL: %w", err)
	}

	// Initialize Prometheus client
	prometheusConfig := analytics.PrometheusConfig{
		URL:     s.config.Integrations.Prometheus.URL,
		Timeout: s.config.Integrations.Prometheus.Timeout,
		Enabled: s.config.Integrations.Prometheus.Enabled && s.config.Features.EnablePrometheusAnalytics,
	}

	prometheusClient, err := analytics.NewPrometheusClient(s.logger, prometheusConfig)
	if err != nil {
		return fmt.Errorf("failed to create prometheus client: %w", err)
	}

	// Test connection if enabled
	if prometheusClient.IsEnabled() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := prometheusClient.TestConnection(ctx); err != nil {
			s.logger.Warn("Prometheus connection test failed, analytics will use mock data", zap.Error(err))
		} else {
			s.logger.Info("Prometheus connection successful")
		}
	}

	// Initialize analytics service
	s.analyticsService = analytics.NewAnalyticsService(s.logger, prometheusClient, cacheTTL)

	return nil
}

// Start starts the server components
func (s *Server) Start(ctx context.Context) error {
	// Start WebSocket hub
	go s.wsHub.Run()

	// Start overview streaming
	s.overviewService.StartStreaming()

	// Start informers
	if err := s.informerManager.Start(); err != nil {
		return err
	}

	return nil
}

// Stop stops the server components
func (s *Server) Stop() {
	s.logger.Info("Stopping server components")

	if s.overviewService != nil {
		s.overviewService.StopStreaming()
	}

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
	s.router.Use(apimiddleware.RequestIDResponseMiddleware) // Add request ID to response headers
	s.router.Use(middleware.RealIP)
	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(middleware.Timeout(60 * time.Second))

	// Prometheus metrics middleware
	s.router.Use(apimiddleware.PrometheusMiddleware)

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

	// Prometheus metrics endpoint
	s.router.Handle("/metrics", promhttp.Handler())

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
			r.Get("/pods/{namespace}/{name}", s.handleGetPod)
			r.Get("/deployments", s.handleListDeployments)
			r.Get("/deployments/{namespace}/{name}", s.handleGetDeployment)
			r.Get("/statefulsets", s.handleListStatefulSets)
			r.Get("/statefulsets/{namespace}/{name}", s.handleGetStatefulSet)
			r.Get("/replicasets", s.handleListReplicaSets)
			r.Get("/replicasets/{namespace}/{name}", s.handleGetReplicaSet)
			r.Get("/daemonsets", s.handleListDaemonSets)
			r.Get("/daemonsets/{namespace}/{name}", s.handleGetDaemonSet)
			r.Get("/k8s-jobs", s.handleListJobs)
			r.Get("/k8s-jobs/{namespace}/{name}", s.handleGetJob)
			r.Get("/cronjobs", s.handleListCronJobs)
			r.Get("/cronjobs/{namespace}/{name}", s.handleGetCronJob)
			r.Get("/overview", s.handleGetOverview)
			r.Get("/jobs", s.handleListActionJobs)
			r.Get("/jobs/{jobId}", s.handleGetActionJob)

			// M5: Advanced read-only endpoints
			r.Get("/metrics", s.handleGetMetrics)
			r.Get("/metrics/namespace/{namespace}", s.handleGetNamespaceMetrics)
			r.Get("/namespaces", s.handleListNamespaces)
			r.Get("/services", s.handleListServices)
			r.Get("/services/{namespace}", s.handleListServicesInNamespace)
			r.Get("/services/{namespace}/{name}", s.handleGetService)
			r.Get("/ingresses", s.handleListAllIngresses)
			r.Get("/ingresses/{namespace}", s.handleListIngresses)
			r.Get("/ingresses/{namespace}/{name}", s.handleGetIngress)
			r.Get("/endpoints", s.handleListEndpoints)
			r.Get("/endpoints/{namespace}/{name}", s.handleGetEndpoints)
			r.Get("/endpoint-slices", s.handleListEndpointSlices)
			r.Get("/endpoint-slices/{namespace}/{name}", s.handleGetEndpointSlice)
			r.Get("/config-maps", s.handleListConfigMaps)
			r.Get("/config-maps/{namespace}/{name}", s.handleGetConfigMap)
			r.Get("/network-policies", s.handleListNetworkPolicies)
			r.Get("/network-policies/{namespace}/{name}", s.handleGetNetworkPolicy)
			r.Get("/export/{namespace}/{kind}/{name}", s.handleExportResource)
			r.Get("/pods/{namespace}/{podName}/logs", s.handleGetPodLogs)

			// Analytics endpoints
			r.Get("/analytics/visitors", s.handleGetVisitors)

			// WebSocket endpoints (require authentication for real-time data)
			r.Get("/stream/nodes", s.handleNodesWebSocket)
			r.Get("/stream/pods", s.handlePodsWebSocket)
			r.Get("/stream/overview", s.handleOverviewWebSocket)
			r.Get("/stream/jobs/{jobId}", s.handleJobWebSocket)
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
