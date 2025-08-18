package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/aaronlmathis/kaptn/internal/analytics"
	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/cache"
	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"github.com/aaronlmathis/kaptn/internal/k8s/actions"
	"github.com/aaronlmathis/kaptn/internal/k8s/client"
	"github.com/aaronlmathis/kaptn/internal/k8s/exec"
	"github.com/aaronlmathis/kaptn/internal/k8s/informers"
	"github.com/aaronlmathis/kaptn/internal/k8s/logs"
	"github.com/aaronlmathis/kaptn/internal/k8s/metrics"
	"github.com/aaronlmathis/kaptn/internal/k8s/overview"
	"github.com/aaronlmathis/kaptn/internal/k8s/resources"
	"github.com/aaronlmathis/kaptn/internal/k8s/summaries"
	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	apimiddleware "github.com/aaronlmathis/kaptn/internal/middleware"
	"github.com/aaronlmathis/kaptn/internal/timeseries"
	"github.com/aaronlmathis/kaptn/internal/timeseries/aggregator"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned"
	metricsv1beta1typed "k8s.io/metrics/pkg/client/clientset/versioned/typed/metrics/v1beta1"
)

// Server represents the API server
type Server struct {
	logger               *zap.Logger
	config               *config.Config
	router               chi.Router
	kubeClient           kubernetes.Interface
	dynamicClient        dynamic.Interface
	informerManager      *informers.Manager
	wsHub                *ws.Hub
	actionsService       *actions.NodeActionsService
	applyService         *actions.ApplyService
	logsService          *logs.StreamManager
	execService          *exec.ExecManager
	metricsService       *metrics.MetricsService
	overviewService      *overview.OverviewService
	resourceManager      *resources.ResourceManager
	analyticsService     *analytics.AnalyticsService
	summaryService       *summaries.SummaryService
	resourceCache        *cache.ResourceCache
	searchService        *cache.SearchService
	authMiddleware       *auth.Middleware
	oidcClient           *auth.OIDCClient
	sessionManager       *auth.SessionManager
	impersonationMgr     *k8s.ImpersonationManager
	clientFactory        *client.Factory
	timeSeriesStore      *timeseries.MemStore
	timeSeriesAggregator *aggregator.Aggregator
	timeSeriesWSManager  *TimeSeriesWSManager
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

	// Initialize summary service
	if err := s.initSummaryService(); err != nil {
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

	// Store factory for impersonation
	s.clientFactory = factory
	s.kubeClient = factory.Client()
	s.dynamicClient = factory.DynamicClient()

	// Initialize impersonation manager
	impersonatedFactory := k8s.NewImpersonatedClientFactory(s.logger, factory.RESTConfig())
	s.impersonationMgr = k8s.NewImpersonationManager(impersonatedFactory, s.logger)
	s.logger.Info("Impersonation manager initialized")

	// Initialize apply service
	s.applyService = actions.NewApplyService(
		s.clientFactory.Client(),
		s.clientFactory.DynamicClient(),
		s.clientFactory.DiscoveryClient(),
		s.logger,
	)

	// Initialize logs service
	s.logsService = logs.NewStreamManager(s.logger, s.kubeClient)

	// Initialize exec service
	s.execService = exec.NewExecManager(s.logger, s.kubeClient, s.clientFactory.RESTConfig())

	// Initialize metrics service (try to create metrics client, fallback gracefully)
	var metricsClient *metricsv1beta1.Clientset
	if metricsClient, err = metricsv1beta1.NewForConfig(s.clientFactory.RESTConfig()); err != nil {
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
	s.resourceManager = resources.NewResourceManager(s.logger, s.kubeClient, s.clientFactory.DynamicClient())

	// Initialize analytics service
	if err := s.initAnalytics(); err != nil {
		return err
	}

	// Initialize timeseries service
	if err := s.initTimeSeries(); err != nil {
		return err
	}

	// Validate connection
	if err := s.clientFactory.ValidateConnection(); err != nil {
		return err
	}

	return nil
}

func (s *Server) initInformers() error {
	s.logger.Info("Initializing informers")

	s.informerManager = informers.NewManager(s.logger, s.kubeClient, s.dynamicClient)

	// Add event handlers
	nodeHandler := informers.NewNodeEventHandler(s.logger, s.wsHub)
	s.informerManager.AddNodeEventHandler(nodeHandler)

	podHandler := informers.NewPodEventHandler(s.logger, s.wsHub)
	s.informerManager.AddPodEventHandler(podHandler)

	serviceHandler := informers.NewServiceEventHandler(s.logger, s.wsHub)
	s.informerManager.AddServiceEventHandler(serviceHandler)

	eventHandler := informers.NewEventEventHandler(s.logger, s.wsHub)
	s.informerManager.AddEventEventHandler(eventHandler)

	// Setup CRD event handler
	crdHandler := informers.NewCustomResourceDefinitionEventHandler(s.logger, s.wsHub)
	s.informerManager.AddCustomResourceDefinitionEventHandler(crdHandler)

	namespaceHandler := informers.NewNamespaceEventHandler(s.logger, s.wsHub)
	s.informerManager.AddNamespaceEventHandler(namespaceHandler)

	resourceQuotaHandler := informers.NewResourceQuotaEventHandler(s.logger, s.wsHub)
	s.informerManager.AddResourceQuotaEventHandler(resourceQuotaHandler)

	deploymentHandler := informers.NewDeploymentEventHandler(s.logger, s.wsHub)
	s.informerManager.AddDeploymentEventHandler(deploymentHandler)

	replicaSetHandler := informers.NewReplicaSetEventHandler(s.logger, s.wsHub)
	s.informerManager.AddReplicaSetEventHandler(replicaSetHandler)

	statefulSetHandler := informers.NewStatefulSetEventHandler(s.logger, s.wsHub)
	s.informerManager.AddStatefulSetEventHandler(statefulSetHandler)

	jobHandler := informers.NewJobEventHandler(s.logger, s.wsHub)
	s.informerManager.AddJobEventHandler(jobHandler)

	configMapHandler := informers.NewConfigMapEventHandler(s.logger, s.wsHub)
	s.informerManager.AddConfigMapEventHandler(configMapHandler)

	secretHandler := informers.NewSecretEventHandler(s.logger, s.wsHub)
	s.informerManager.AddSecretEventHandler(secretHandler)

	endpointHandler := informers.NewEndpointEventHandler(s.logger, s.wsHub)
	s.informerManager.AddEndpointEventHandler(endpointHandler)

	daemonSetHandler := informers.NewDaemonSetEventHandler(s.logger, s.wsHub)
	s.informerManager.AddDaemonSetEventHandler(daemonSetHandler)

	cronJobHandler := informers.NewCronJobEventHandler(s.logger, s.wsHub)
	s.informerManager.AddCronJobEventHandler(cronJobHandler)

	endpointSliceHandler := informers.NewEndpointSliceEventHandler(s.logger, s.wsHub.BroadcastToRoom)
	s.informerManager.AddEndpointSliceEventHandler(endpointSliceHandler)

	ingressHandler := informers.NewIngressEventHandler(s.logger, s.wsHub.BroadcastToRoom)
	s.informerManager.AddIngressEventHandler(ingressHandler)

	ingressClassHandler := informers.NewIngressClassEventHandler(s.logger, s.wsHub.BroadcastToRoom)
	s.informerManager.AddIngressClassEventHandler(ingressClassHandler)

	networkPolicyHandler := informers.NewNetworkPolicyEventHandler(s.logger, s.wsHub)
	s.informerManager.AddNetworkPolicyEventHandler(networkPolicyHandler)

	loadBalancerHandler := informers.NewLoadBalancerEventHandler(s.logger, s.wsHub)
	s.informerManager.AddLoadBalancerEventHandler(loadBalancerHandler)

	persistentVolumeHandler := informers.NewPersistentVolumeEventHandler(s.logger, s.wsHub)
	s.informerManager.AddPersistentVolumeEventHandler(persistentVolumeHandler)

	persistentVolumeClaimHandler := informers.NewPersistentVolumeClaimEventHandler(s.logger, s.wsHub)
	s.informerManager.AddPersistentVolumeClaimEventHandler(persistentVolumeClaimHandler)

	storageClassHandler := informers.NewStorageClassEventHandler(s.logger, s.wsHub)
	s.informerManager.AddStorageClassEventHandler(storageClassHandler)

	s.logger.Info("Registering volume snapshot event handlers")
	volumeSnapshotHandler := informers.NewVolumeSnapshotEventHandler(s.logger, s.wsHub)
	s.informerManager.AddVolumeSnapshotEventHandler(volumeSnapshotHandler)

	volumeSnapshotClassHandler := informers.NewVolumeSnapshotClassEventHandler(s.logger, s.wsHub)
	s.informerManager.AddVolumeSnapshotClassEventHandler(volumeSnapshotClassHandler)
	s.logger.Info("Volume snapshot event handlers registered")

	s.logger.Info("Registering RBAC event handlers")
	roleHandler := informers.NewRoleEventHandler(s.logger, s.wsHub)
	s.informerManager.AddRoleEventHandler(roleHandler)

	roleBindingHandler := informers.NewRoleBindingEventHandler(s.logger, s.wsHub)
	s.informerManager.AddRoleBindingEventHandler(roleBindingHandler)

	clusterRoleHandler := informers.NewClusterRoleEventHandler(s.logger, s.wsHub)
	s.informerManager.AddClusterRoleEventHandler(clusterRoleHandler)

	clusterRoleBindingHandler := informers.NewClusterRoleBindingEventHandler(s.logger, s.wsHub)
	s.informerManager.AddClusterRoleBindingEventHandler(clusterRoleBindingHandler)
	s.logger.Info("RBAC event handlers registered")

	s.logger.Info("Registering Istio gateway event handler")
	gatewayHandler := informers.NewGatewayEventHandler(s.logger, s.wsHub)
	s.informerManager.AddGatewayEventHandler(gatewayHandler)
	s.logger.Info("Istio gateway event handler registered")

	return nil
}

func (s *Server) initSummaryService() error {
	s.logger.Info("Initializing summary service")

	// Create summary config from main config
	summaryConfigData := s.config.GetSummaryConfig()

	// Convert to SummaryConfig struct
	summaryConfig := &summaries.SummaryConfig{
		EnableWebSocketUpdates: summaryConfigData["enable_websocket_updates"].(bool),
		RealtimeResources:      summaryConfigData["realtime_resources"].([]string),
		CacheTTL:               summaryConfigData["cache_ttl"].(map[string]string),
		MaxCacheSize:           summaryConfigData["max_cache_size"].(int),
		BackgroundRefresh:      summaryConfigData["background_refresh"].(bool),
	}

	// Parse cache TTL durations
	if err := summaryConfig.ParseCacheTTLs(); err != nil {
		return fmt.Errorf("failed to parse summary cache TTL config: %w", err)
	}

	// Initialize summary service
	s.summaryService = summaries.NewSummaryService(
		s.logger,
		s.kubeClient,
		s.informerManager,
		summaryConfig,
	)

	// Set WebSocket hub for real-time updates
	s.summaryService.SetWebSocketHub(s.wsHub)

	return nil
}

func (s *Server) initAuth() error {
	authMode := auth.AuthMode(s.config.Security.AuthMode)

	// Initialize session manager if we have a cookie secret
	if s.config.Server.CookieSecret != "" {
		sessionTTL, err := time.ParseDuration(s.config.Server.SessionTTL)
		if err != nil {
			s.logger.Warn("Invalid session TTL, using default 12h", zap.String("ttl", s.config.Server.SessionTTL))
			sessionTTL = 12 * time.Hour
		}

		s.sessionManager, err = auth.NewSessionManager(s.logger, s.config.Server.CookieSecret, sessionTTL)
		if err != nil {
			return fmt.Errorf("failed to initialize session manager: %w", err)
		}

		s.logger.Info("Session manager initialized", zap.Duration("ttl", sessionTTL))
	}

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

	// Initialize authorization resolver
	var authzResolver *auth.AuthzResolver
	if authMode == auth.AuthModeOIDC && s.config.Authz.Mode != "" {
		authzResolver = auth.NewAuthzResolver(
			&s.config.Authz,
			&s.config.Bindings,
			s.kubeClient,
			s.logger,
		)
		s.logger.Info("Authorization resolver initialized",
			zap.String("mode", s.config.Authz.Mode),
			zap.String("bindings_source", s.config.Bindings.Source))
	}

	// Initialize authentication middleware
	s.authMiddleware = auth.NewMiddleware(s.logger, authMode, s.oidcClient, s.sessionManager, authzResolver, s.config.Security.UsernameFormat)

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

	// Initialize resource cache
	if err := s.initResourceCache(); err != nil {
		return err
	}

	return nil
}

func (s *Server) initResourceCache() error {
	s.logger.Info("Initializing resource cache")

	// Parse search cache refresh interval with fallback
	refreshTTLStr := s.config.Caching.SearchCacheTTL
	if refreshTTLStr == "" {
		refreshTTLStr = "30s"
	}

	refreshInterval, err := time.ParseDuration(refreshTTLStr)
	if err != nil {
		s.logger.Warn("Invalid search cache refresh TTL, using default",
			zap.String("ttl", refreshTTLStr),
			zap.Error(err))
		refreshInterval = 30 * time.Second
	}

	// Set max size with fallback
	maxSize := s.config.Caching.SearchMaxSize
	if maxSize <= 0 {
		maxSize = 10000
	}

	// Create cache configuration from main config
	cacheConfig := &cache.CacheConfig{
		RefreshInterval: refreshInterval,
		MaxSize:         maxSize,
		EnabledTypes: []string{
			"pods", "deployments", "services", "configmaps", "secrets",
			"nodes", "namespaces", "statefulsets", "daemonsets", "replicasets",
			"jobs", "cronjobs", "persistent-volumes", "persistent-volume-claims",
			"storage-classes", "ingresses", "network-policies", "endpoints",
			"service-accounts", "roles", "rolebindings", "clusterroles",
			"clusterrolebindings", "resource-quotas",
		},
	}

	// Create resource cache
	s.resourceCache = cache.NewResourceCache(s.logger, s.kubeClient, cacheConfig)

	// Create search service
	s.searchService = cache.NewSearchService(s.logger, s.resourceCache)

	s.logger.Info("Resource cache initialized",
		zap.Duration("refreshInterval", refreshInterval),
		zap.Int("maxSize", maxSize))
	return nil
}

func (s *Server) initTimeSeries() error {
	s.logger.Info("Initializing timeseries service")

	// Check if timeseries is enabled in configuration
	if !s.config.Timeseries.Enabled {
		s.logger.Info("TimeSeries service disabled in configuration")
		return nil
	}

	// Create timeseries store with configuration
	timeseriesConfig := timeseries.DefaultConfig()
	if s.config.Timeseries.Window != "" {
		if window, err := time.ParseDuration(s.config.Timeseries.Window); err == nil {
			timeseriesConfig.MaxWindow = window
		}
	}

	// Apply additional timeseries configuration from YAML
	if s.config.Timeseries.MaxSeries > 0 {
		timeseriesConfig.MaxSeries = s.config.Timeseries.MaxSeries
	}
	if s.config.Timeseries.MaxPointsPerSeries > 0 {
		timeseriesConfig.MaxPointsPerSeries = s.config.Timeseries.MaxPointsPerSeries
	}
	if s.config.Timeseries.MaxWSClients > 0 {
		timeseriesConfig.MaxWSClients = s.config.Timeseries.MaxWSClients
	}

	s.timeSeriesStore = timeseries.NewMemStore(timeseriesConfig)

	// Initialize TimeSeries WebSocket manager
	s.timeSeriesWSManager = newTimeSeriesWSManager()

	// Create metrics client for aggregator
	var metricsClient metricsv1beta1typed.MetricsV1beta1Interface
	if kubeMetricsClient, err := metricsv1beta1.NewForConfig(s.clientFactory.RESTConfig()); err == nil {
		metricsClient = kubeMetricsClient.MetricsV1beta1()
	}

	// Create aggregator configuration
	aggregatorConfig := aggregator.DefaultConfig()
	if s.config.Timeseries.TickInterval != "" {
		if interval, err := time.ParseDuration(s.config.Timeseries.TickInterval); err == nil {
			aggregatorConfig.TickInterval = interval
		}
	}
	if s.config.Timeseries.CapacityRefreshInterval != "" {
		if interval, err := time.ParseDuration(s.config.Timeseries.CapacityRefreshInterval); err == nil {
			aggregatorConfig.CapacityRefreshInterval = interval
		}
	}
	// Pass through TLS configuration from Kubernetes config
	aggregatorConfig.InsecureTLS = s.config.Kubernetes.InsecureTLS

	// Create timeseries aggregator
	s.timeSeriesAggregator = aggregator.NewAggregator(
		s.logger,
		s.timeSeriesStore,
		s.kubeClient,
		metricsClient,
		s.clientFactory.RESTConfig(),
		aggregatorConfig,
	)

	s.logger.Info("TimeSeries service initialized",
		zap.Duration("window", timeseriesConfig.MaxWindow),
		zap.Duration("tickInterval", aggregatorConfig.TickInterval))

	return nil
}

// Start starts the server components
func (s *Server) Start(ctx context.Context) error {
	// Start WebSocket hub
	go s.wsHub.Run()

	// Start overview streaming
	s.overviewService.StartStreaming()

	// Start summary service background processing
	if s.summaryService != nil {
		s.summaryService.StartBackgroundProcessing()
	}

	// Start resource cache
	if s.resourceCache != nil {
		if err := s.resourceCache.Start(ctx); err != nil {
			return fmt.Errorf("failed to start resource cache: %w", err)
		}
	}

	// Start timeseries aggregator
	if s.timeSeriesAggregator != nil {
		if err := s.timeSeriesAggregator.Start(ctx); err != nil {
			return fmt.Errorf("failed to start timeseries aggregator: %w", err)
		}
		// Start WebSocket broadcaster for timeseries
		s.startTimeSeriesWebSocketBroadcaster()
	}

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

	if s.summaryService != nil {
		s.summaryService.StopBackgroundProcessing()
	}

	if s.resourceCache != nil {
		s.resourceCache.Stop()
	}

	if s.timeSeriesAggregator != nil {
		s.timeSeriesAggregator.Stop()
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

// requestContextMiddleware adds the HTTP request to the context for audit logging
func (s *Server) requestContextMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), "http_request", r)

		// Extract trace ID from authenticated user's claims if available
		if user, ok := auth.UserFromContext(ctx); ok && user != nil {
			if traceID, exists := user.Claims["trace_id"].(string); exists && traceID != "" {
				// Add trace ID to response headers for correlation
				w.Header().Set("X-Trace-ID", traceID)
				ctx = context.WithValue(ctx, "trace_id", traceID)
			}
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// webSocketAwareTimeout applies timeout middleware but skips WebSocket upgrade requests
func (s *Server) webSocketAwareTimeout(timeout time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip timeout for WebSocket upgrade requests
			if r.Header.Get("Upgrade") == "websocket" {
				next.ServeHTTP(w, r)
				return
			}

			// Apply normal timeout for all other requests
			middleware.Timeout(timeout)(next).ServeHTTP(w, r)
		})
	}
}

func (s *Server) setupMiddleware() {
	s.router.Use(middleware.RequestID)
	s.router.Use(apimiddleware.RequestIDResponseMiddleware) // Add request ID to response headers
	s.router.Use(s.requestContextMiddleware)                // Add request to context for audit logging
	s.router.Use(middleware.RealIP)
	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(s.webSocketAwareTimeout(60 * time.Second))

	// Prometheus metrics middleware
	s.router.Use(apimiddleware.PrometheusMiddleware)

	// Security headers middleware
	s.router.Use(s.authMiddleware.SecureHeaders)

	// Authentication middleware (always applied, handles different auth modes)
	s.router.Use(s.authMiddleware.Authenticate)

	// Impersonation middleware (adds impersonated K8s clients to context)
	s.router.Use(s.ImpersonationMiddleware)

	// ETag middleware for cacheable GET requests
	etagMiddleware := apimiddleware.NewETagMiddleware(s.logger)
	s.router.Use(etagMiddleware.Middleware)

	// Error sanitization middleware
	errorSanitizer := apimiddleware.NewErrorSanitizer(s.logger)
	s.router.Use(errorSanitizer.Middleware)

	// CORS middleware - removed wildcard, same-origin only for security
	s.router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// For same-origin deployment, we disable CORS entirely
			// All requests should come from the same origin that serves the static files

			// Set credentials flag for cookie-based auth
			w.Header().Set("Access-Control-Allow-Credentials", "true")

			// Handle preflight OPTIONS requests
			if r.Method == "OPTIONS" {
				// Only allow same-origin requests
				origin := r.Header.Get("Origin")
				if origin == "" {
					// Same-origin requests don't send Origin header
					w.WriteHeader(http.StatusOK)
					return
				}

				// Reject cross-origin preflight requests
				w.WriteHeader(http.StatusForbidden)
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

	// // OAuth callback route - redirect to test page with parameters
	// s.router.Get("/callback", func(w http.ResponseWriter, r *http.Request) {
	// 	// Get the query parameters from the OAuth callback
	// 	code := r.URL.Query().Get("code")
	// 	state := r.URL.Query().Get("state")

	// 	if code == "" || state == "" {
	// 		http.Error(w, "Missing code or state parameter", http.StatusBadRequest)
	// 		return
	// 	}

	// 	// Redirect to test page with parameters
	// 	redirectURL := fmt.Sprintf("/test-login?code=%s&state=%s", code, state)
	// 	http.Redirect(w, r, redirectURL, http.StatusFound)
	// })

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
		r.Get("/auth/callback", s.handleAuthCallback) // Changed to GET for OAuth
		r.Post("/auth/logout", s.handleLogout)
		r.Post("/auth/refresh", s.handleRefresh) // New refresh endpoint
		r.Get("/auth/me", s.handleMe)
		r.Get("/auth/jwks", s.handleJWKS)            // New JWKS endpoint
		r.Get("/auth/csrf-token", s.handleCSRFToken) // CSRF token endpoint

		// Debug endpoint for authentication state
		r.Get("/auth/debug", s.handleDebugUser)

		// Public configuration endpoint
		r.Get("/config", s.handlePublicConfig)

		// Admin endpoints (require authentication)
		r.Group(func(r chi.Router) {
			if s.config.Security.AuthMode != "none" {
				r.Use(s.authMiddleware.RequireAuth)
			}
			r.Get("/admin/authz/preview", s.handleAuthzPreview)
			r.Get("/admin/authz/preview-enhanced", s.handleAuthzPreviewEnhanced)
			r.Get("/admin/authz/ssar-test", s.handleSSARTest)
			r.Get("/admin/authz/permissions-check", s.handlePermissionsCheck)
			r.Post("/auth/revoke-user-sessions", s.handleRevokeUserSessions) // Admin endpoint to revoke user sessions

			// Phase 8: Admin Utilities & Observability
			r.Post("/admin/authz/reload", s.handleBindingsReload) // Force reload bindings store
			r.Get("/admin/authz/sar", s.handleGenericSAR)         // Generic SAR runner for debugging
		})

		// Permission checking endpoints for UI gating (Phase 6)
		r.Group(func(r chi.Router) {
			if s.config.Security.AuthMode != "none" {
				r.Use(s.authMiddleware.RequireAuth)
			}
			r.Get("/permissions/check", s.handleCheckPermission)
			r.Get("/permissions/actions", s.handleGetActionPermissions)
			r.Get("/permissions/actions/{namespace}", s.handleGetActionPermissions)
			r.Get("/permissions/page-access", s.handleCheckPageAccess)
			r.Get("/permissions/namespaces", s.handleGetUserNamespacePermissions)
			r.Post("/permissions/bulk", s.handleBulkPermissionCheck)
		})

		// Permission checking endpoints for Phase 6 UI gating
		r.Group(func(r chi.Router) {
			if s.config.Security.AuthMode != "none" {
				r.Use(s.authMiddleware.RequireAuth)
			}
			r.Get("/permissions/check", s.handleCheckPermission)
			r.Get("/permissions/actions", s.handleGetActionPermissions)
			r.Get("/permissions/actions/{namespace}", s.handleGetActionPermissions)
			r.Get("/permissions/page-access", s.handleCheckPageAccess)
			r.Post("/permissions/bulk-check", s.handleBulkPermissionCheck)
		})

		// Read-only endpoints (require read permissions)
		r.Group(func(r chi.Router) {
			if s.config.Security.AuthMode != "none" {
				r.Use(s.authMiddleware.RequireAuth)
			}

			// Capabilities endpoint
			r.Get("/capabilities", s.handleGetCapabilities)

			// Search endpoints
			r.Get("/search", s.handleSearch)
			r.Get("/search/stats", s.handleSearchStats)
			r.Post("/search/refresh", s.handleRefreshSearchCache)

			// TimeSeries endpoints
			r.Get("/timeseries/cluster", s.handleGetClusterTimeSeries)
			r.Get("/timeseries/health", s.handleTimeSeriesHealth)
			r.Get("/timeseries/capabilities", s.handleGetTimeSeriesCapabilities)

			// New entity-specific endpoints
			r.Get("/timeseries/nodes", s.handleGetNodesTimeSeries)
			r.Get("/timeseries/nodes/{nodeName}", s.handleGetNodeTimeSeries)
			r.Get("/timeseries/pods", s.handleGetPodsTimeSeries)
			r.Get("/timeseries/pods/{namespace}/{podName}", s.handleGetPodTimeSeries)
			r.Get("/timeseries/namespaces", s.handleGetNamespacesTimeSeries)
			r.Get("/timeseries/namespaces/{namespace}", s.handleGetNamespaceTimeSeries)

			r.Get("/nodes", s.handleListNodes)
			r.Get("/nodes/{name}", s.handleGetNode)
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

			r.Get("/metrics", s.handleGetMetrics)
			r.Get("/metrics/namespace/{namespace}", s.handleGetNamespaceMetrics)
			r.Get("/namespaces", s.handleListNamespaces)
			r.Get("/namespaces/{name}", s.handleGetNamespace)
			r.Get("/services", s.handleListServices)
			r.Get("/services/{namespace}", s.handleListServicesInNamespace)
			r.Get("/services/{namespace}/{name}", s.handleGetService)
			r.Get("/events", s.handleListEvents)
			r.Get("/events/{namespace}", s.handleListEventsInNamespace)
			r.Get("/events/{namespace}/{name}", s.handleGetEvent)
			r.Get("/ingresses", s.handleListAllIngresses)
			r.Get("/ingresses/{namespace}", s.handleListIngresses)
			r.Get("/ingresses/{namespace}/{name}", s.handleGetIngress)
			r.Get("/ingress-classes", s.handleListIngressClasses)
			r.Get("/ingress-classes/{name}", s.handleGetIngressClass)
			r.Get("/endpoints", s.handleListEndpoints)
			r.Get("/endpoints/{namespace}/{name}", s.handleGetEndpoints)
			r.Get("/endpoint-slices", s.handleListEndpointSlices)
			r.Get("/endpoint-slices/{namespace}/{name}", s.handleGetEndpointSlice)
			r.Get("/config-maps", s.handleListConfigMaps)
			r.Get("/config-maps/{namespace}/{name}", s.handleGetConfigMap)
			r.Get("/secrets", s.handleListSecrets)
			r.Get("/secrets/types", s.handleListSecretTypes)
			r.Get("/secrets/{namespace}/{name}", s.handleGetSecret)
			r.Get("/secrets/{namespace}/{name}/data/{key}", s.handleGetSecretData)
			r.Get("/secrets/{namespace}/{name}/usage", s.handleGetSecretUsageExamples)
			r.Get("/network-policies", s.handleListNetworkPolicies)
			r.Get("/network-policies/{namespace}/{name}", s.handleGetNetworkPolicy)
			r.Get("/roles", s.handleListRoles)
			r.Get("/roles/{namespace}/{name}", s.handleGetRole)
			r.Get("/role-bindings", s.handleListRoleBindings)
			r.Get("/role-bindings/{namespace}/{name}", s.handleGetRoleBinding)
			r.Get("/cluster-roles", s.handleListClusterRoles)
			r.Get("/cluster-roles/{name}", s.handleGetClusterRole)
			r.Get("/cluster-role-bindings", s.handleListClusterRoleBindings)
			r.Get("/cluster-role-bindings/{name}", s.handleGetClusterRoleBinding)
			r.Get("/identities", s.handleListRBACIdentities)
			r.Get("/persistent-volumes", s.handleListPersistentVolumes)
			r.Get("/persistent-volumes/{name}", s.handleGetPersistentVolume)
			r.Get("/persistent-volume-claims", s.handleListPersistentVolumeClaims)
			r.Get("/persistent-volume-claims/{namespace}/{name}", s.handleGetPersistentVolumeClaim)
			r.Get("/storage-classes", s.handleListStorageClasses)
			r.Get("/storage-classes/{name}", s.handleGetStorageClass)
			r.Get("/csi-drivers", s.handleListCSIDrivers)
			r.Get("/csi-drivers/{name}", s.handleGetCSIDriver)
			r.Get("/volume-snapshots", s.handleListVolumeSnapshots)
			r.Get("/volume-snapshots/{namespace}/{name}", s.handleGetVolumeSnapshot)
			r.Get("/volume-snapshot-classes", s.handleListVolumeSnapshotClasses)
			r.Get("/volume-snapshot-classes/{name}", s.handleGetVolumeSnapshotClass)
			r.Get("/resource-quotas", s.handleListResourceQuotas)
			r.Get("/resource-quotas/{namespace}/{name}", s.handleGetResourceQuota)
			r.Get("/api-resources", s.handleListAPIResources)
			r.Get("/api-resources/{name}", s.handleGetAPIResource)
			r.Get("/crds", s.handleListCustomResourceDefinitions)
			r.Get("/crds/{name}", s.handleGetCustomResourceDefinition)
			r.Get("/export/{namespace}/{kind}/{name}", s.handleExportResource)
			r.Get("/export/{kind}/{name}", s.handleExportClusterScopedResource)
			r.Get("/pods/{namespace}/{podName}/logs", s.handleGetPodLogs)

			// Analytics endpoints
			r.Get("/analytics/visitors", s.handleGetVisitors)

			// Istio endpoints
			r.Get("/istio/virtualservices", s.handleListVirtualServices)
			r.Get("/istio/virtualservices/{namespace}/{name}", s.handleGetVirtualService)
			r.Get("/istio/virtualservices/{namespace}/{name}/yaml", s.handleGetVirtualServiceYAML)
			r.Get("/istio/gateways", s.handleListGateways)
			r.Get("/istio/gateways/{namespace}/{name}", s.handleGetGateway)
			r.Get("/istio/gateways/{namespace}/{name}/yaml", s.handleGetGatewayYAML)

			// Summary endpoints
			r.Get("/summaries/cards", s.handleGetSummaryCards)
			r.Get("/summaries/{resource}", s.handleGetResourceSummary)
			r.Get("/summaries/{resource}/namespaces/{namespace}", s.handleGetNamespacedResourceSummary)

			// WebSocket endpoints (require authentication for real-time data)
			r.Get("/stream/nodes", s.handleNodesWebSocket)
			r.Get("/stream/pods", s.handlePodsWebSocket)
			r.Get("/stream/services", s.handleServicesWebSocket)
			r.Get("/stream/deployments", s.handleDeploymentsWebSocket)
			r.Get("/stream/secrets", s.handleSecretsWebSocket)
			r.Get("/stream/overview", s.handleOverviewWebSocket)
			r.Get("/stream/jobs/{jobId}", s.handleJobWebSocket)
			r.Get("/stream/logs/{streamId}", s.handleLogsWebSocket)

			// TimeSeries WebSocket endpoints
			r.Get("/timeseries/live", s.handleTimeSeriesLiveWebSocket)
			r.Get("/timeseries/cluster/live", s.handleClusterTimeSeriesLiveWebSocket)
		})

		// Write endpoints (require write permissions)
		r.Group(func(r chi.Router) {
			if s.config.Security.AuthMode != "none" {
				r.Use(s.authMiddleware.RequireAuth)
				r.Use(s.authMiddleware.RequireWrite)
			}
			r.Use(s.authMiddleware.RateLimit(s.config.RateLimits.ActionsPerMinute))

			// Add idempotency middleware for state-changing operations
			idempotencyMiddleware := apimiddleware.NewIdempotencyMiddleware(s.logger, 15*time.Minute)
			r.Use(idempotencyMiddleware.Middleware)

			// Add CSRF protection for high-risk operations (double-submit cookie pattern)
			csrfMiddleware := auth.NewCSRFMiddleware(s.logger)
			r.Use(csrfMiddleware.Middleware)

			r.Post("/nodes/{nodeName}/cordon", s.handleCordonNode)
			r.Post("/nodes/{nodeName}/uncordon", s.handleUncordonNode)
			r.Post("/nodes/{nodeName}/drain", s.handleDrainNode)

			// M5: Advanced write endpoints
			r.Post("/scale", s.handleScaleResource)
			r.Delete("/resources", s.handleDeleteResource)
			r.Delete("/resource-quotas/{namespace}/{name}", s.handleDeleteResourceQuota)
			r.Post("/namespaces", s.handleCreateNamespace)
			r.Delete("/namespaces/{namespace}", s.handleDeleteNamespace)
			r.Get("/exec/{sessionId}", s.handleExecWebSocket)
			r.Post("/logs/stream", s.handleStartLogStream)
			r.Delete("/logs/stream/{streamId}", s.handleStopLogStream)

			// Secrets management endpoints
			r.Post("/secrets", s.handleCreateSecret)
			r.Put("/secrets/{namespace}/{name}", s.handleUpdateSecret)
			r.Delete("/secrets/{namespace}/{name}", s.handleDeleteSecret)

			// RBAC builder endpoints
			r.Post("/rbac/generate", s.handleGenerateRBACYAML)
			r.Post("/rbac/dry-run", s.handleDryRunRBAC)
			r.Post("/rbac/apply", s.handleApplyRBAC)
		})

		// Apply endpoints (require write permissions with higher rate limits)
		r.Group(func(r chi.Router) {
			if s.config.Security.AuthMode != "none" {
				r.Use(s.authMiddleware.RequireAuth)
				r.Use(s.authMiddleware.RequireWrite)
			}
			r.Use(s.authMiddleware.RateLimit(s.config.RateLimits.ApplyPerMinute))

			// Add idempotency middleware for apply operations
			idempotencyMiddleware := apimiddleware.NewIdempotencyMiddleware(s.logger, 30*time.Minute)
			r.Use(idempotencyMiddleware.Middleware)

			// Add CSRF protection for high-risk operations (double-submit cookie pattern)
			csrfMiddleware2 := auth.NewCSRFMiddleware(s.logger)
			r.Use(csrfMiddleware2.Middleware)

			// Enhanced apply endpoint for Apply Config drawer
			r.Post("/apply", s.handleApplyConfig)
			// Existing namespace-specific apply endpoint
			r.Post("/namespaces/{namespace}/apply", s.handleApplyYAML)
		})
	})

	// Serve static files from frontend/dist directory with session injection
	filesDir := http.Dir("./frontend/dist/")
	sessionHandler := NewSessionInjectionHandler(s.logger, filesDir, s.config.Security.AuthMode, s.sessionManager, s.authMiddleware)
	s.router.Handle("/*", sessionHandler)
}
