package server

import (
	"context"
	"fmt"
	"net/http"

	"time"

	"github.com/aaronlmathis/kaptn/internal/analytics"
	"github.com/aaronlmathis/kaptn/internal/api/middleware"
	"github.com/aaronlmathis/kaptn/internal/api/routes"
	"github.com/aaronlmathis/kaptn/internal/auth"
	"github.com/aaronlmathis/kaptn/internal/authz"
	"github.com/aaronlmathis/kaptn/internal/cache"
	"github.com/aaronlmathis/kaptn/internal/config"
	"github.com/aaronlmathis/kaptn/internal/k8s"
	"github.com/aaronlmathis/kaptn/internal/k8s/actions"
	"github.com/aaronlmathis/kaptn/internal/k8s/client"
	"github.com/aaronlmathis/kaptn/internal/k8s/exec"
	"github.com/aaronlmathis/kaptn/internal/k8s/informers"
	k8slogs "github.com/aaronlmathis/kaptn/internal/k8s/logs"
	"github.com/aaronlmathis/kaptn/internal/k8s/metrics"
	"github.com/aaronlmathis/kaptn/internal/k8s/overview"
	"github.com/aaronlmathis/kaptn/internal/k8s/resources"
	"github.com/aaronlmathis/kaptn/internal/k8s/summaries"
	"github.com/aaronlmathis/kaptn/internal/k8s/ws"
	"github.com/aaronlmathis/kaptn/internal/logs"
	apimiddleware "github.com/aaronlmathis/kaptn/internal/middleware"
	"github.com/aaronlmathis/kaptn/internal/timeseries"
	"github.com/aaronlmathis/kaptn/internal/timeseries/aggregator"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"go.uber.org/zap"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
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
	actionCoordinator    *actions.ActionCoordinator
	logsService          *k8slogs.StreamManager     // Old streaming service
	logsCacheService     logs.LogService            // New cache service
	logsCoordinator      *k8slogs.StreamCoordinator // Multi-pod log coordinator
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
	oidcStateStore       *auth.OIDCStateStore
	loginNextStore       *auth.LoginNextStore
	sessionManager       *auth.SessionManager
	impersonationMgr     *k8s.ImpersonationManager
	clientFactory        *client.Factory
	timeSeriesStore      *timeseries.MemStore
	timeSeriesAggregator *aggregator.Aggregator
	timeSeriesWSManager  *TimeSeriesWSManager
	capabilityService    *authz.CapabilityService

	// New middleware components (PR 2)
	permissionMiddleware    *middleware.PermissionMiddleware
	impersonationMiddleware *middleware.ImpersonationMiddleware
}

// New creates a new API server (renamed from NewServer)
func New(logger *zap.Logger, cfg *config.Config) (*Server, error) {
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
	// Note: SetupRoutes() is called explicitly from main.go to avoid duplicate mounting

	return s, nil
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

	// Start logs cache service
	if s.logsCacheService != nil {
		if err := s.logsCacheService.Start(ctx); err != nil {
			return fmt.Errorf("failed to start logs cache service: %w", err)
		}
		s.logger.Info("Logs cache service started")
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

	if s.logsCacheService != nil {
		s.logsCacheService.Stop()
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

// getAuthMiddleware returns the auth middleware based on auth mode
// Returns nil when auth_mode is "none" to disable authentication
func (s *Server) getAuthMiddleware() func(http.Handler) http.Handler {
	authMode := auth.AuthMode(s.config.Security.AuthMode)
	if authMode == auth.AuthModeNone {
		return nil
	}
	return s.authMiddleware.RequireAuth
}

// getImpersonationMiddleware returns the impersonation middleware based on auth mode
// Returns nil when auth_mode is "none" to disable impersonation requirements
func (s *Server) getImpersonationMiddleware() func(http.Handler) http.Handler {
	authMode := auth.AuthMode(s.config.Security.AuthMode)
	if authMode == auth.AuthModeNone {
		return nil
	}
	return s.impersonationMiddleware.RequireImpersonation
}

// SetupRoutes sets up all API routes using the contract-based architecture
func (s *Server) SetupRoutes() {
	// Create the tiers structure with the server implementing all interfaces
	tiers := routes.Tiers{
		Public: s, // Server implements PublicHandlers
		Admin:  s, // Server implements AdminHandlers
		Read:   s, // Server implements ReadHandlers
		Write:  s, // Server implements WriteHandlers
		Apply:  s, // Server implements ApplyHandlers
		System: s, // Server implements SystemHandlers
		Static: s, // Server implements StaticHandlers
		MW: routes.Middlewares{
			RequireAuth:          s.getAuthMiddleware(),
			RequireImpersonation: s.getImpersonationMiddleware(),
		},
	}

	// Mount all routes using the contracts-based approach
	routes.MountAll(s.router, tiers)
}

// All the missing initialization methods that were in the api package

func (s *Server) initKubernetesClient() error {
	s.logger.Info("Initializing Kubernetes client", zap.String("mode", s.config.Kubernetes.Mode))

	mode := client.ClientMode(s.config.Kubernetes.Mode)
	factory, err := client.NewFactory(s.logger, mode, s.config.Kubernetes.KubeconfigPath, s.config.Kubernetes.QPS, s.config.Kubernetes.Burst)
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

	// Initialize capability service with TTL from config (fallback to 30s)
	capTTL := 30 * time.Second
	if ttlStr := s.config.Caching.SummaryTTL; ttlStr != "" {
		if parsed, err := time.ParseDuration(ttlStr); err == nil {
			capTTL = parsed
		} else {
			s.logger.Warn("Invalid capability cache TTL, using default", zap.String("ttl", ttlStr), zap.Error(err))
		}
	}
	s.capabilityService = authz.NewCapabilityService(s.logger, capTTL)
	s.logger.Info("Capability service initialized", zap.Duration("ttl", capTTL))

	// Initialize apply service
	s.applyService = actions.NewApplyService(
		s.clientFactory.Client(),
		s.clientFactory.DynamicClient(),
		s.clientFactory.DiscoveryClient(),
		s.logger,
	)

	// Initialize enhanced actions system
	// Determine if this is production environment (simplified check)
	isProduction := s.config.Security.AuthMode != "none"

	safetyGuard := actions.NewSafetyGuard(s.logger, isProduction)
	// Apply safety guard config (namespaces/labels)
	if len(s.config.Actions.DeniedNamespaces) > 0 || len(s.config.Actions.DeniedLabels) > 0 {
		safetyGuard.UpdateSafetyConfig(s.config.Actions.DeniedNamespaces, s.config.Actions.DeniedLabels)
	}
	// Apply action allow/deny lists
	if len(s.config.Actions.ActionAllowlist) > 0 || len(s.config.Actions.ActionDenylist) > 0 {
		safetyGuard.UpdateActionPolicies(s.config.Actions.ActionAllowlist, s.config.Actions.ActionDenylist)
	}
	auditLogger := actions.NewAuditLogger(s.logger)
	ssarHelper := k8s.NewSSARHelper(s.logger)

	// Action coordinator options from config
	acOpts := &actions.CoordinatorOptions{}
	if dur, err := time.ParseDuration(s.config.Actions.IdempotencyTTL); err == nil {
		acOpts.IdempotencyTTL = dur
	} else {
		s.logger.Warn("Invalid actions idempotency TTL, using default", zap.String("ttl", s.config.Actions.IdempotencyTTL), zap.Error(err))
	}
	acOpts.DefaultConcurrency = s.config.Actions.DefaultConcurrency
	acOpts.MaxConcurrency = s.config.Actions.MaxConcurrency

	s.actionCoordinator = actions.NewActionCoordinator(
		s.logger,
		safetyGuard,
		auditLogger,
		ssarHelper,
		s.actionsService,
		s.applyService,
		s.impersonationMgr,
		acOpts,
	)
	s.logger.Info("Action coordinator initialized",
		zap.Int("default_concurrency", acOpts.DefaultConcurrency),
		zap.Int("max_concurrency", acOpts.MaxConcurrency),
		zap.Duration("idempotency_ttl", acOpts.IdempotencyTTL))

	// Initialize logs service
	s.logsService = k8slogs.NewStreamManager(s.logger, s.kubeClient)

	// Initialize logs cache service
	s.logger.Info("Initializing logs cache service")
	logsCacheConfig, err := s.config.GetLogsServiceConfig()
	if err != nil {
		return fmt.Errorf("failed to create logs cache config: %w", err)
	}

	s.logger.Info("Logs cache config loaded",
		zap.Bool("background_collection_enabled", logsCacheConfig.BackgroundCollectionEnabled),
		zap.String("background_collection_retention", logsCacheConfig.BackgroundCollectionRetention),
		zap.String("note", "Using reliable V3 collector with informer-based design"))

	// Use the new reliable service
	reliableService := logs.NewReliableLogService(logsCacheConfig, s.logger)
	s.logsCacheService = reliableService

	// Initialize logs coordinator (multi-pod streaming)
	clusterName := s.config.Kubernetes.ClusterName
	if clusterName == "" {
		clusterName = "default" // fallback if not configured
	}

	// Set up background log collection
	s.logger.Info("Setting up background log collection")

	// Use a separate, rate-limited Kubernetes client for the background log collector
	// to avoid starving interactive API requests (e.g., /authz/capabilities) under load.
	logsREST := rest.CopyConfig(s.clientFactory.RESTConfig())
	// Apply configured QPS/Burst for logs client, falling back to safe defaults
	logsREST.QPS = s.config.Kubernetes.LogsQPS
	logsREST.Burst = s.config.Kubernetes.LogsBurst
	if logsREST.QPS <= 0 {
		logsREST.QPS = 20
	}
	if logsREST.Burst <= 0 {
		logsREST.Burst = 40
	}
	var logsKubeClient kubernetes.Interface
	clientset, clientErr := kubernetes.NewForConfig(logsREST)
	if clientErr != nil {
		s.logger.Warn("Failed to create separate logs Kubernetes client; falling back to main client",
			zap.Error(clientErr))
		logsKubeClient = s.kubeClient
	} else {
		logsKubeClient = clientset
	}

	if err := reliableService.SetupLogCollector(logsKubeClient, clusterName); err != nil {
		return fmt.Errorf("failed to set up background log collector: %w", err)
	}
	s.logger.Info("Background log collector setup complete")

	s.logsCoordinator = k8slogs.NewStreamCoordinator(s.logger, s.kubeClient, s.logsCacheService, s.wsHub, clusterName)

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

	// HorizontalPodAutoscalers
	hpaHandler := informers.NewHPAEventHandler(s.logger, s.wsHub, s.timeSeriesStore)
	s.informerManager.AddHPAEventHandler(hpaHandler)

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
		sessionTTL, err := time.ParseDuration(s.config.Security.SessionTTL)
		if err != nil {
			s.logger.Warn("Invalid session TTL, using default 12h", zap.String("ttl", s.config.Security.SessionTTL))
			sessionTTL = 12 * time.Hour
		}

		refreshTokenTTL, err := time.ParseDuration(s.config.Security.RefreshTokenTTL)
		if err != nil {
			s.logger.Warn("Invalid refresh token TTL, using default 7d", zap.String("ttl", s.config.Security.RefreshTokenTTL))
			refreshTokenTTL = 7 * 24 * time.Hour
		}

		s.sessionManager, err = auth.NewSessionManagerWithAuthKeysAndRefreshTTL(
			s.logger,
			s.config.Server.CookieSecret,
			sessionTTL,
			refreshTokenTTL,
			s.config.Security.AuthKeys.JWTPrivateKeyPath,
			s.config.Security.AuthKeys.JWTPublicKeyPath,
		)
		if err != nil {
			return fmt.Errorf("failed to initialize session manager: %w", err)
		}

		s.logger.Info("Session manager initialized",
			zap.Duration("session_ttl", sessionTTL),
			zap.Duration("refresh_token_ttl", refreshTokenTTL))
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

		// Initialize OIDC state store for stateless authentication across replicas
		s.oidcStateStore, err = auth.NewOIDCStateStoreWithPaths(
			s.logger,
			s.config.Security.AuthKeys.OIDCStateHashKeyPath,
			s.config.Security.AuthKeys.OIDCStateBlockKeyPath,
		)
		if err != nil {
			return fmt.Errorf("failed to initialize OIDC state store: %w", err)
		}

		// Initialize login-next store (uses same keys) for safe post-login redirects
		s.loginNextStore, err = auth.NewLoginNextStoreWithPaths(
			s.logger,
			s.config.Security.AuthKeys.OIDCStateHashKeyPath,
			s.config.Security.AuthKeys.OIDCStateBlockKeyPath,
		)
		if err != nil {
			return fmt.Errorf("failed to initialize login-next store: %w", err)
		}

		s.logger.Info("OIDC authentication initialized with stateless state store")
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

	// Initialize new middleware components
	permissionChecker := middleware.NewSSARPermissionChecker(s.logger, s.config, s.impersonationMgr)
	s.permissionMiddleware = middleware.NewPermissionMiddleware(s.logger, s.config, permissionChecker)
	s.impersonationMiddleware = middleware.NewImpersonationMiddleware(s.logger, s.config, s.impersonationMgr, s.authMiddleware)

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
		s.analyticsService.GetPrometheusClient(),
		aggregatorConfig,
	)

	s.logger.Info("TimeSeries service initialized",
		zap.Duration("window", timeseriesConfig.MaxWindow),
		zap.Duration("tickInterval", aggregatorConfig.TickInterval))

	return nil
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
			chimiddleware.Timeout(timeout)(next).ServeHTTP(w, r)
		})
	}
}

func (s *Server) setupMiddleware() {
	s.router.Use(chimiddleware.RequestID)
	s.router.Use(apimiddleware.RequestIDResponseMiddleware) // Add request ID to response headers
	s.router.Use(s.requestContextMiddleware)                // Add request to context for audit logging
	s.router.Use(chimiddleware.RealIP)
	s.router.Use(chimiddleware.Logger)
	s.router.Use(chimiddleware.Recoverer)
	s.router.Use(s.webSocketAwareTimeout(60 * time.Second))

	// Prometheus metrics middleware
	s.router.Use(apimiddleware.PrometheusMiddleware)

	// Security headers middleware
	s.router.Use(s.authMiddleware.SecureHeaders)

	// Authentication middleware (always applied, handles different auth modes)
	s.router.Use(s.authMiddleware.Authenticate)

	// Impersonation middleware (adds impersonated K8s clients to context)
	s.router.Use(s.impersonationMiddleware.Middleware)

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

// (Removed) Lowercase adapter methods that duplicated exported HandleXxx methods
// Routes directly bind to exported handlers via contracts in internal/api/routes.

// Static handler method for routes compatibility
func (s *Server) GetStaticHandler() http.Handler {
	// Serve static files with session injection into HTML shell
	files := http.Dir("frontend/dist")
	return NewSessionInjectionHandler(
		s.logger,
		files,
		s.config.Security.AuthMode,
		s.sessionManager,
		s.authMiddleware,
	)
}
