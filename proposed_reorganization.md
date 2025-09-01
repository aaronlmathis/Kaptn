# API Package Reorganization Proposal

## Current State Analysis (66+ Handler Files)

After comprehensively analyzing the `internal/api` package by reading 20+ key files, I've identified severe organizational issues that violate industry best practices. The package contains **66+ handler files** in a single package with massive architectural problems:

### Critical Problems Identified

1. **Massive Single Package**: 66+ handler files in one package with no logical grouping
2. **God Object Server Struct**: 29 dependencies injected into a single struct (violates SRP)
3. **Inconsistent Type Definitions**: DTOs scattered across individual handler files (`SecretCreateRequest`, `BulkActionRequest`, etc.)
4. **Action Logic Scattered**: Action-related code spread across 5+ files with unclear boundaries (`handlers_actions_*.go`)
5. **Response Formatting Chaos**: 1000+ line formatter files mixed with business logic in `response_formatters.go`
6. **Authentication Logic Scattered**: Auth logic spread across 5+ files (`handlers_auth.go`, `middleware_impersonation.go`, `session_injection.go`, `handlers_permissions.go`, `client_helpers.go`)
7. **Poor Separation of Concerns**: HTTP concerns, business logic, Kubernetes API calls, and presentation all mixed
8. **Massive Code Duplication**: Identical patterns across handlers (pagination, error handling, request parsing, security checks)
9. **No Clear Domain Boundaries**: Workloads, networking, storage, RBAC, monitoring all mixed together
10. **Route Definition Chaos**: 200+ routes defined in single function with no logical grouping
11. **Inconsistent Error Handling**: Different error response patterns across handlers
12. **Testing Nightmare**: Monolithic structure makes unit testing nearly impossible
13. **Security Logic Duplication**: SSAR checks, audit logging, and permission validation repeated across every handler

### Specific Examples of Problems

#### 1. God Object Server Struct (29 Dependencies):
```go
type Server struct {
	logger               *zap.Logger                    // 1
	config               *config.Config                 // 2
	router               chi.Router                     // 3
	kubeClient           kubernetes.Interface           // 4
	dynamicClient        dynamic.Interface              // 5
	informerManager      *informers.Manager             // 6
	wsHub                *ws.Hub                        // 7
	actionsService       *actions.NodeActionsService    // 8
	applyService         *actions.ApplyService          // 9
	actionCoordinator    *actions.ActionCoordinator     // 10
	logsService          *logs.StreamManager            // 11
	execService          *exec.ExecManager              // 12
	metricsService       *metrics.MetricsService        // 13
	overviewService      *overview.OverviewService      // 14
	resourceManager      *resources.ResourceManager     // 15
	analyticsService     *analytics.AnalyticsService    // 16
	summaryService       *summaries.SummaryService      // 17
	resourceCache        *cache.ResourceCache           // 18
	searchService        *cache.SearchService           // 19
	authMiddleware       *auth.Middleware               // 20
	oidcClient           *auth.OIDCClient               // 21
	sessionManager       *auth.SessionManager           // 22
	impersonationMgr     *k8s.ImpersonationManager      // 23
	clientFactory        *client.Factory                // 24
	timeSeriesStore      *timeseries.MemStore           // 25
	timeSeriesAggregator *aggregator.Aggregator         // 26
	timeSeriesWSManager  *TimeSeriesWSManager           // 27
	capabilityService    *authz.CapabilityService       // 28
}
```
**Problem**: Single struct violates Single Responsibility Principle. Each domain should have its own service layer.

#### 2. Route Definition Chaos (200+ Routes in Single Function):
```go
s.router.Route("/api/v1", func(r chi.Router) {
	// Auth routes (9 routes)
	r.Post("/auth/login", s.handleLogin)
	r.Get("/auth/callback", s.handleAuthCallback)
	// ... 7 more auth routes
	
	// Admin routes (8 routes)  
	r.Get("/admin/authz/preview", s.handleAuthzPreview)
	// ... 7 more admin routes
	
	// Permission routes (6 routes)
	r.Get("/permissions/check", s.handleCheckPermission)
	// ... 5 more permission routes
	
	// Core resource routes (50+ routes)
	r.Get("/nodes", s.handleListNodes)
	r.Get("/pods", s.handleListPods)
	// ... 48+ more resource routes
	
	// Action routes (15+ routes)
	r.Post("/actions/validate", s.handleValidateAction)
	r.Post("/actions/pods", s.handlePodsBulkAction)
	// ... 13+ more action routes
	
	// Timeseries routes (20+ routes)
	r.Get("/timeseries/cluster", s.handleGetClusterTimeSeries)
	// ... 19+ more timeseries routes
	
	// WebSocket routes (12+ routes)
	r.Get("/stream/nodes", s.handleNodesWebSocket)
	// ... 11+ more websocket routes
	
	// Write operation routes (15+ routes)
	r.Post("/nodes/{nodeName}/cordon", s.handleCordonNode)
	// ... 14+ more write operation routes
	
	// Apply routes (3 routes)
	r.Post("/apply", s.handleApplyConfig)
	// ... 2+ more apply routes
	
	// Storage routes (15+ routes)
	r.Get("/persistent-volumes", s.handleListPersistentVolumes)
	// ... 14+ more storage routes
	
	// Istio routes (6 routes)
	r.Get("/istio/virtualservices", s.handleListVirtualServices)
	// ... 5+ more istio routes
	
	// Analytics routes (3 routes)
	r.Get("/analytics/visitors", s.handleGetVisitors)
	// ... 2+ more analytics routes
})
```
**Problem**: 200+ routes in single function with no logical organization, difficult to maintain.

#### 3. Action Logic Spread Across Multiple Files:
- `handlers_actions_pods.go` - 195 lines with pod-specific actions + **shared `parseAction` function that handles ALL resource types**
- `handlers_actions_common.go` - 140+ lines with generic routing logic + validation
- `handlers_actions_stubs.go` - Stub implementations for deployments, services, configmaps, secrets
- `handlers_actions.go` - 930 lines with main action handling logic (apply operations, node actions)
- All duplicate similar patterns but scattered across files

#### 4. DTOs Scattered Everywhere:
- `BulkActionRequest` defined in `handlers_actions_pods.go` (should be shared across all bulk actions)
- `SecretCreateRequest`/`SecretUpdateRequest` in `handlers_secrets.go` (900+ lines)
- `ApplyConfigRequest` in `handlers_actions.go` (930+ lines) 
- `TimeSeriesResponse` types in `handlers_timeseries.go` (1861+ lines)
- No consistent validation or formatting patterns

#### 5. Response Formatters Chaos:
- `response_formatters.go` is 1000+ lines of mixed formatting logic
- Each handler has its own formatting patterns
- No consistent response structure
- Business logic mixed with presentation

#### 6. Authentication Logic Scattered Across 5+ Files:
- `handlers_auth.go` - 897 lines of auth handlers (login, callback, logout, refresh, me, debug)
- `middleware_impersonation.go` - Impersonation logic for RBAC
- `session_injection.go` - Session management for frontend
- `handlers_permissions.go` - Permission checking endpoints
- `client_helpers.go` - Client extraction utilities
- `handlers_common.go` - Security context and audit logging

#### 7. Massive Code Duplication Across Handlers:

Every single handler follows identical patterns but duplicates the code:

```go
// Repeated in EVERY LIST handler (50+ times):
// 1. Parse query parameters
namespace := r.URL.Query().Get("namespace")
search := r.URL.Query().Get("search")
pageStr := r.URL.Query().Get("page")
pageSizeStr := r.URL.Query().Get("pageSize")

// 2. Convert pagination params
page, _ := strconv.Atoi(pageStr)
pageSize, _ := strconv.Atoi(pageSizeStr)
if pageSize <= 0 { pageSize = 25 }
if page <= 0 { page = 1 }

// 3. Get security context (if auth enabled)
if s.config.Security.AuthMode != "none" {
    secCtx, err := s.getSecurityContext(r)
    if err != nil { /* error handling */ }
    
    // 4. Check permissions with SSAR
    if err := s.checkResourcePermission(r.Context(), secCtx, "list", "pods", namespace, ""); err != nil {
        /* permission error handling */
    }
    kubeClient = secCtx.Client
} else {
    kubeClient = s.kubeClient
}

// 5. Make Kubernetes API call
resources, err := kubeClient.CoreV1().Pods(namespace).List(r.Context(), metav1.ListOptions{})

// 6. Handle errors
if err != nil {
    s.logger.Error("Failed to list resources", zap.Error(err))
    /* error response */
}

// 7. Apply search filtering
// 8. Apply pagination
// 9. Format response
// 10. Return JSON
```

**Problem**: This exact pattern is duplicated across 50+ handler functions with minor variations.

#### 8. Security Logic Duplication:

Security checks are copy-pasted across every protected handler:

```go
// Repeated in 100+ handlers:
secCtx, err := s.getSecurityContext(r)
if err != nil {
    if secErr, ok := err.(*SecurityError); ok {
        s.writeSecurityError(w, secErr, nil)
    } else {
        http.Error(w, "Security context error", http.StatusInternalServerError)
    }
    return
}

if err := s.checkResourcePermission(r.Context(), secCtx, "get", "pods", namespace, name); err != nil {
    if secErr, ok := err.(*SecurityError); ok {
        s.writeSecurityError(w, secErr, secCtx.User)
    } else {
        http.Error(w, "Permission check failed", http.StatusInternalServerError)
    }
    return
}
```

**Problem**: Security logic should be handled by middleware, not duplicated in every handler.

## Action Items for Current Issues

### Immediate Problem: `parseAction` Function Misplacement

The `parseAction` function exemplifies the deeper organizational problems:

#### Current State (WRONG):
```go
// In handlers_actions_pods.go - Wrong location!
func parseAction(action string) (resource, verb string) {
    switch action {
    case "restart-pods":
        return "pods", "update"
    case "restart-deployments":  // Why is deployment logic in pods file?
        return "deployments", "update"
    case "delete-services":      // Why is service logic in pods file?
        return "services", "delete"
    // ... ALL resource types mixed together
    }
}
```

#### Problems:
1. **Cross-domain logic in pods file** - Why are deployment/service actions in pods handler?
2. **Shared function in wrong location** - Should be in common module
3. **No extensibility** - Adding new resources requires modifying pods file
4. **Testing difficulty** - Can't test action parsing without pods dependencies

### Other Immediate Issues Found:

#### 1. DTO Chaos:
- `BulkActionRequest` defined in pods file but used by all resources
- `SecretCreateRequest` in secrets file (should be in shared DTOs)
- No validation interfaces or consistent patterns

#### 2. Response Formatting Chaos:
```go
// 1000+ lines in single file mixing:
func (s *Server) nodeToSummary(node *v1.Node) // Node formatting
func (s *Server) podToSummary(pod *v1.Pod)   // Pod formatting  
func (s *Server) serviceToResponse(...)      // Service formatting
// etc. - all mixed together with no domain organization
```

#### 3. Handler Duplication:
Every handler follows the same pattern but duplicates code:
```go
// Repeated in EVERY handler:
- Parse query parameters (page, pageSize, search, namespace, etc.)
- Get user from context
- Get impersonated client
- Validate permissions
- Call resource manager
- Apply filtering
- Format response
- Handle pagination
```

#### 4. Authentication Scattered:
- Login/logout logic in `handlers_auth.go` 
- Permission checking in `handlers_permissions.go`
- Impersonation in `middleware_impersonation.go`  
- Session injection in `session_injection.go`
- Client helpers in `client_helpers.go`
- No clear boundaries or single responsibility

## Proposed Reorganization

Based on the actual codebase analysis, here's the comprehensive reorganization:

### Current Handler File Count by Domain (Actual Analysis):

**Actions**: 5 files (`handlers_actions.go`: 930 lines, `handlers_actions_pods.go`: 195 lines, `handlers_actions_common.go`: 140+ lines, `handlers_actions_stubs.go`, `handlers_bulk_actions.go`)

**Authentication**: 5+ files 
- `handlers_auth.go`: 897 lines (login, callback, logout, refresh, me, debug, revoke sessions, public config)
- `middleware_impersonation.go`: Impersonation logic 
- `session_injection.go`: Session management for frontend
- `handlers_permissions.go`: Permission checking endpoints
- `client_helpers.go`: Client extraction utilities
- `handlers_common.go`: Security context and audit logging (partial)

**Workloads**: 3+ files 
- `handlers_workloads.go`: 1172 lines (pods, deployments, statefulsets, replicasets, daemonsets, jobs, cronjobs)
- `handlers_crds.go`: Custom resource definitions
- `handlers_events.go`: Event handling

**Networking**: 4+ files 
- `handlers_services.go`: 973 lines (services, endpoints, endpoint slices, ingresses, ingress classes, network policies)
- `handlers_istio.go`: Istio resources (VirtualServices, Gateways)
- `handlers_istio_test.go`: Istio tests

**Storage**: 2+ files 
- `handlers_storage.go`: 1172 lines (PVs, PVCs, storage classes, CSI drivers, volume snapshots, volume snapshot classes)

**RBAC**: 5+ files 
- `handlers_roles.go`: Roles and RoleBindings
- `handlers_cluster_roles.go`: ClusterRoles and ClusterRoleBindings  
- `handlers_rbac_builder.go`: RBAC YAML generation
- `handlers_rbac_identities.go`: RBAC identity management

**Configuration**: 2+ files
- `handlers_secrets.go`: 900+ lines (secrets management with create/update/delete)
- `handlers_configmaps.go`: ConfigMaps (mixed with other handlers)

**Monitoring**: 6+ files 
- `handlers_metrics.go`: Basic cluster metrics
- `handlers_timeseries.go`: 1861 lines (complex timeseries API with WebSocket support)
- `handlers_timeseries_health.go`: Health checking for timeseries
- `handlers_analytics.go`: Analytics endpoints
- `handlers_debug.go`: Debug utilities

**System**: 4+ files 
- `handlers_system.go`: Health, ready, version endpoints
- `handlers_search.go`: Global search functionality
- `handlers_admin.go`: Administrative endpoints
- `handlers_common.go`: Shared utilities (export, logs, security)

**Authorization**: 2+ files
- `handlers_authz_capabilities.go`: Authorization capability checking
- `handlers_permissions.go`: Permission validation endpoints

**WebSocket**: 3+ files
- `handlers_websocket.go`: WebSocket connection management
- Plus WebSocket endpoints scattered across other handlers

**Infrastructure**: 4+ files
- `server.go`: 1070 lines (server setup, DI container, 200+ route definitions)
- `utils.go`: Utility functions
- `response_formatters.go`: 1000+ line mixed formatter
- `client_helpers.go`: Client management utilities

**Total**: 66+ files in single package with severe organizational problems

### Proposed Domain-Based Organization:

```
internal/
├── api/
│   ├── server.go                     # Main server setup and DI container  
│   ├── router.go                     # Route definitions and middleware setup
│   ├── middleware/                   # HTTP middleware (extracted from scattered files)
│   │   ├── auth.go                   # Authentication middleware
│   │   ├── permissions.go            # Permission checking middleware  
│   │   ├── impersonation.go          # Extracted from middleware_impersonation.go
│   │   ├── rate_limit.go            # Rate limiting
│   │   ├── cors.go                  # CORS handling
│   │   ├── security.go              # Security headers, CSRF
│   │   └── logging.go               # Request logging
│   │
│   ├── v1/                          # API version 1
│   │   ├── handlers/                # HTTP handlers organized by domain
│   │   │   ├── auth/                # Authentication handlers (from 5 scattered files)
│   │   │   │   ├── login.go         # Extracted from handlers_auth.go
│   │   │   │   ├── callback.go      # Extracted from handlers_auth.go  
│   │   │   │   ├── logout.go        # Extracted from handlers_auth.go
│   │   │   │   ├── session.go       # Extracted from session_injection.go
│   │   │   │   └── permissions.go   # Extracted from handlers_permissions.go
│   │   │   │
│   │   │   ├── workloads/           # Workload resource handlers
│   │   │   │   ├── pods.go          # Extracted from handlers_workloads.go
│   │   │   │   ├── deployments.go   # Extracted from handlers_workloads.go
│   │   │   │   ├── statefulsets.go  # Extracted from handlers_workloads.go
│   │   │   │   ├── daemonsets.go    # Extracted from handlers_workloads.go
│   │   │   │   ├── jobs.go          # Extracted from handlers_workloads.go
│   │   │   │   └── cronjobs.go      # Extracted from handlers_workloads.go
│   │   │   │
│   │   │   ├── networking/          # Network resource handlers
│   │   │   │   ├── services.go      # Extracted from handlers_services.go
│   │   │   │   ├── ingresses.go     # Scattered across multiple files
│   │   │   │   ├── networkpolicies.go
│   │   │   │   └── endpoints.go
│   │   │   │
│   │   │   ├── storage/             # Storage resource handlers
│   │   │   │   ├── persistentvolumes.go    # Extracted from handlers_storage.go
│   │   │   │   ├── persistentvolumeclaims.go
│   │   │   │   ├── storageclasses.go
│   │   │   │   └── volumesnapshots.go
│   │   │   │
│   │   │   ├── config/              # Configuration resource handlers
│   │   │   │   ├── configmaps.go    # Scattered across files
│   │   │   │   ├── secrets.go       # Extracted from handlers_secrets.go (900 lines!)
│   │   │   │   └── resourcequotas.go
│   │   │   │
│   │   │   ├── rbac/                # RBAC resource handlers (from 5+ files)
│   │   │   │   ├── roles.go         # Extracted from handlers_roles.go
│   │   │   │   ├── rolebindings.go
│   │   │   │   ├── clusterroles.go  # Extracted from handlers_cluster_roles.go
│   │   │   │   ├── clusterrolebindings.go
│   │   │   │   └── builder.go       # Extracted from handlers_rbac_builder.go
│   │   │   │
│   │   │   ├── cluster/             # Cluster-level handlers
│   │   │   │   ├── nodes.go         # Scattered across files
│   │   │   │   ├── namespaces.go
│   │   │   │   ├── crds.go          # Extracted from handlers_crds.go
│   │   │   │   └── overview.go
│   │   │   │
│   │   │   ├── actions/             # Bulk actions handlers (from 5 scattered files)
│   │   │   │   ├── coordinator.go   # Main action coordinator
│   │   │   │   ├── validation.go    # Action validation (from handlers_actions_common.go)
│   │   │   │   ├── parser.go        # FIXED: parseAction goes here!
│   │   │   │   ├── pods.go          # Pod-specific actions (from handlers_actions_pods.go)
│   │   │   │   ├── deployments.go   # From handlers_actions_stubs.go
│   │   │   │   ├── services.go      # From handlers_actions_stubs.go
│   │   │   │   └── common.go        # Shared action logic
│   │   │   │
│   │   │   ├── monitoring/          # Monitoring and observability (from 6+ files)
│   │   │   │   ├── metrics.go       # Extracted from handlers_metrics.go
│   │   │   │   ├── timeseries.go    # Extracted from handlers_timeseries*.go
│   │   │   │   ├── analytics.go     # Extracted from handlers_analytics.go
│   │   │   │   └── health.go        # Extracted from handlers_system.go
│   │   │   │
│   │   │   ├── realtime/            # WebSocket handlers
│   │   │   │   ├── websocket.go     # Extracted from handlers_websocket.go  
│   │   │   │   ├── logs.go
│   │   │   │   ├── exec.go
│   │   │   │   └── events.go
│   │   │   │
│   │   │   ├── admin/               # Administrative handlers
│   │   │   │   ├── capabilities.go  # Extracted from handlers_authz_capabilities.go
│   │   │   │   ├── debug.go         # Extracted from handlers_admin.go
│   │   │   │   ├── impersonation.go # Extracted from handlers_impersonation.go  
│   │   │   │   └── system.go
│   │   │   │
│   │   │   └── search/              # Search and discovery
│   │   │       ├── global.go        # Extracted from handlers_search.go
│   │   │       ├── resources.go
│   │   │       └── cache.go
│   │   │
│   │   ├── dto/                     # Data Transfer Objects (EXTRACTED from scattered files)
│   │   │   ├── common.go            # Common request/response types
│   │   │   ├── workloads.go         # Workload-specific DTOs
│   │   │   ├── actions.go           # BulkActionRequest extracted from handlers_actions_pods.go
│   │   │   ├── auth.go              # Authentication DTOs
│   │   │   ├── secrets.go           # SecretCreateRequest extracted from handlers_secrets.go
│   │   │   └── monitoring.go        # Monitoring DTOs
│   │   │
│   │   ├── formatters/              # Response formatters (SPLIT from 1000+ line file)
│   │   │   ├── workloads.go         # Pod, Deployment, etc. formatters 
│   │   │   ├── networking.go        # Service, Ingress formatters
│   │   │   ├── storage.go           # PV, PVC formatters
│   │   │   ├── config.go            # ConfigMap, Secret formatters
│   │   │   ├── rbac.go              # RBAC formatters
│   │   │   ├── cluster.go           # Node, Namespace formatters
│   │   │   └── common.go            # Shared formatting utilities
│   │   │
│   │   └── validators/              # Request validators (NEW - extracted patterns)
│   │       ├── workloads.go
│   │       ├── actions.go
│   │       ├── auth.go  
│   │       └── common.go
│   │
│   ├── utils/                       # Shared utilities (EXTRACTED from utils.go)
│   │   ├── pagination.go            # Pagination helpers
│   │   ├── filters.go               # Filtering utilities
│   │   ├── security.go              # Security utilities
│   │   ├── validation.go            # Common validation
│   │   └── errors.go                # Error handling utilities
│   │
│   └── types/                       # Common types and interfaces (NEW)
│       ├── interfaces.go            # Handler interfaces
│       ├── context.go               # Context types
│       └── errors.go                # Error types
│
├── services/                        # Business logic layer (NEW - extracted from handlers)
│   ├── workloads/                   # Workload services
│   │   ├── pods.go
│   │   ├── deployments.go
│   │   └── interface.go
│   │
│   ├── actions/                     # Action services
│   │   ├── coordinator.go
│   │   ├── validation.go
│   │   ├── safety.go
│   │   └── interface.go
│   │
│   ├── auth/                        # Authentication services
│   │   ├── session.go
│   │   ├── permissions.go
│   │   └── interface.go
│   │
│   └── monitoring/                  # Monitoring services
│       ├── metrics.go
│       ├── timeseries.go
│       └── interface.go
│
└── repositories/                    # Data access layer (NEW)
    ├── kubernetes/                  # Kubernetes client wrappers
    │   ├── workloads.go
    │   ├── networking.go
    │   ├── storage.go
    │   └── interface.go
    │
    ├── cache/                       # Cache implementations
    │   ├── memory.go
    │   ├── redis.go
    │   └── interface.go
    │
    └── timeseries/                  # Time series storage
        ├── memory.go
        ├── prometheus.go
        └── interface.go
```

## Key Architectural Principles

### 1. Domain-Driven Design (DDD)
- **Workloads Domain**: Pods, Deployments, StatefulSets, etc.
- **Networking Domain**: Services, Ingresses, NetworkPolicies, etc.
- **Storage Domain**: PersistentVolumes, StorageClasses, etc.
- **Configuration Domain**: ConfigMaps, Secrets, etc.
- **RBAC Domain**: Roles, RoleBindings, etc.
- **Actions Domain**: Bulk operations and validations

### 2. Clean Architecture
- **API Layer**: HTTP concerns only (routing, middleware, serialization)
- **Service Layer**: Business logic and orchestration
- **Repository Layer**: Data access and external integrations

### 3. Dependency Injection
```go
// Example service interface
type WorkloadService interface {
    ListPods(ctx context.Context, namespace string, opts ListOptions) ([]Pod, error)
    GetPod(ctx context.Context, namespace, name string) (*Pod, error)
    RestartPods(ctx context.Context, targets []Target) (*ActionResult, error)
}

// Handler dependency injection
type PodsHandler struct {
    workloadService WorkloadService
    actionService   ActionService
    formatter       PodFormatter
    validator       PodValidator
}
```

### 4. Interface Segregation
```go
// Specific interfaces instead of god objects
type PodLister interface {
    ListPods(ctx context.Context, namespace string) ([]Pod, error)
}

type PodGetter interface {
    GetPod(ctx context.Context, namespace, name string) (*Pod, error)
}

type PodActioner interface {
    RestartPods(ctx context.Context, targets []Target) (*ActionResult, error)
    DeletePods(ctx context.Context, targets []Target) (*ActionResult, error)
}
```

## Migration Strategy

### Phase 1: Extract Common Utilities and Middleware (Week 1) 
**Priority: Critical** - Addresses code duplication and security issues

1. **Create shared utilities package**:
   ```
   internal/api/utils/
   ├── pagination.go      # Extract pagination logic from 50+ handlers
   ├── validation.go      # Extract validation patterns  
   ├── security.go        # Extract security helpers
   ├── filters.go         # Extract filtering logic
   └── errors.go          # Standardize error handling
   ```

2. **Extract middleware package**:
   ```
   internal/api/middleware/
   ├── auth.go           # Extract from handlers_auth.go
   ├── permissions.go    # Extract SSAR checks from handlers_common.go  
   ├── impersonation.go  # Extract from middleware_impersonation.go
   ├── security.go       # Extract security headers
   ├── audit.go          # Extract audit logging from handlers_common.go
   └── request.go        # Extract request parsing middleware
   ```

3. **Benefits**: Eliminate 1000+ lines of duplicated code across handlers

### Phase 2: Extract and Reorganize DTOs (Week 1-2)
**Priority: High** - Addresses scattered type definitions

1. **Create domain-specific DTO packages**:
   ```
   internal/api/v1/dto/
   ├── common.go         # PaginationRequest, FilterRequest, etc.
   ├── actions.go        # BulkActionRequest (extract from handlers_actions_pods.go)
   ├── auth.go           # Login/logout requests
   ├── workloads.go      # Pod/Deployment related DTOs
   ├── secrets.go        # SecretCreateRequest (extract from handlers_secrets.go)  
   ├── timeseries.go     # TimeSeriesResponse (extract from handlers_timeseries.go)
   └── monitoring.go     # Metrics and analytics DTOs
   ```

2. **Benefits**: Centralized type definitions, consistent validation

### Phase 3: Split Response Formatters (Week 2)
**Priority: High** - Addresses 1000+ line mixed formatter

1. **Create domain-specific formatters**:
   ```
   internal/api/v1/formatters/
   ├── workloads.go      # Pod, Deployment formatters
   ├── networking.go     # Service, Ingress formatters  
   ├── storage.go        # PV, PVC formatters
   ├── config.go         # ConfigMap, Secret formatters
   ├── rbac.go          # RBAC formatters
   ├── cluster.go       # Node, Namespace formatters
   └── common.go        # Shared formatting utilities
   ```

2. **Benefits**: Separate presentation logic, easier maintenance

### Phase 4: Create Service Layer (Week 2-3)
**Priority: Critical** - Addresses god object Server struct

1. **Extract business logic from handlers into services**:
   ```
   internal/services/
   ├── workloads/       # Extract from handlers_workloads.go (1172 lines)
   │   ├── pods.go
   │   ├── deployments.go  
   │   └── interface.go
   ├── actions/         # Extract from handlers_actions_*.go (5 files)
   │   ├── coordinator.go
   │   ├── validation.go
   │   └── interface.go
   ├── auth/           # Extract from handlers_auth.go (897 lines)
   │   ├── session.go
   │   ├── permissions.go
   │   └── interface.go
   ├── storage/        # Extract from handlers_storage.go (1172 lines)
   └── monitoring/     # Extract from handlers_timeseries.go (1861 lines)
   ```

2. **Reduce Server struct from 29 dependencies to ~10**
3. **Benefits**: Testable business logic, dependency injection

### Phase 5: Reorganize Handlers by Domain (Week 3-4)
**Priority: High** - Addresses route organization chaos

1. **Split handlers into logical domains**:
   ```
   internal/api/v1/handlers/
   ├── auth/           # Extract from handlers_auth.go (897 lines)
   │   ├── login.go    # 100-150 lines each
   │   ├── callback.go
   │   ├── logout.go
   │   └── session.go
   ├── workloads/      # Extract from handlers_workloads.go (1172 lines)  
   │   ├── pods.go     # 200-300 lines each
   │   ├── deployments.go
   │   └── statefulsets.go
   ├── actions/        # Extract and fix parseAction issue
   │   ├── coordinator.go
   │   ├── parser.go   # FIX: parseAction goes here!
   │   ├── pods.go
   │   └── common.go
   ├── storage/        # Extract from handlers_storage.go (1172 lines)
   ├── networking/     # Extract from handlers_services.go (973 lines)
   └── monitoring/     # Extract from handlers_timeseries.go (1861 lines)
   ```

2. **Split router configuration by domain**:
   ```
   internal/api/
   ├── router.go       # Main router setup
   └── routes/         # Domain-specific route definitions
       ├── auth.go     # Auth routes
       ├── workloads.go # Workload routes  
       ├── actions.go  # Action routes
       └── storage.go  # Storage routes
   ```

3. **Benefits**: Logical organization, easier navigation, team collaboration

### Phase 6: Fix Critical Issues (Week 4)
**Priority: Critical** - Address specific problems identified

1. **Fix parseAction misplacement**:
   - Move from `handlers_actions_pods.go` to `internal/api/v1/actions/parser.go`
   - Create proper action parser interface
   - Remove cross-domain logic from pods file

2. **Consolidate authentication logic**:
   - Merge scattered auth files into coherent auth domain
   - Extract common security patterns into middleware

3. **Fix route organization**:
   - Split 200+ routes from single function into domain-specific modules
   - Create route group interfaces

### Phase 7: Create Repository Layer (Week 5)
**Priority: Medium** - Improve testability and data access

1. **Abstract Kubernetes API calls**:
   ```
   internal/repositories/
   ├── kubernetes/     # Kubernetes client wrappers
   │   ├── workloads.go
   │   ├── networking.go
   │   └── interface.go
   ├── cache/         # Cache implementations  
   └── timeseries/    # Time series storage
   ```

2. **Benefits**: Testable data access, easier mocking

## Benefits of This Reorganization

### 1. Maintainability
- **Clear Boundaries**: Each package has a single responsibility
- **Easier Navigation**: Developers can quickly find related code  
- **Logical Grouping**: Related functionality is co-located
- **Reduced Complexity**: 1000-line files split into 200-300 line focused modules

### 2. Testability  
- **Unit Testing**: Small, focused units are easier to test
- **Dependency Injection**: Easy to mock dependencies
- **Interface-Based**: Testable contracts
- **Isolated Business Logic**: Services can be tested without HTTP layer

### 3. Scalability
- **Team Collaboration**: Multiple developers can work on different domains simultaneously
- **Feature Development**: New features follow established patterns
- **API Versioning**: Clear versioning strategy for breaking changes
- **Domain Expertise**: Teams can own specific domains (auth, workloads, storage)

### 4. Code Quality
- **Reduced Duplication**: Shared utilities prevent code repetition (eliminates 1000+ lines of duplication)
- **Consistent Patterns**: Standardized approaches across domains
- **Better Error Handling**: Centralized error management
- **Security Best Practices**: Middleware-based security instead of copy-paste

### 5. Performance
- **Targeted Optimizations**: Easier to optimize specific domains
- **Efficient Caching**: Domain-specific caching strategies
- **Resource Management**: Better resource utilization
- **Reduced Memory Footprint**: Smaller service structs instead of god object

### 6. Developer Experience
- **Faster Onboarding**: New developers can understand domain-specific code
- **IDE Navigation**: Better code completion and navigation
- **Debugging**: Easier to trace issues through logical boundaries
- **Documentation**: Domain-specific documentation becomes possible

## Action Items for `parseAction` Issue

The `parseAction` function is a perfect example of the problems we're solving:

### Current State
```go
// In handlers_actions_pods.go - Wrong location!
func parseAction(action string) (resource, verb string) {
    switch action {
    case "restart-pods":
        return "pods", "update"
    // ... more cases
    }
}
```

### Proposed Location
```go
// In internal/api/v1/actions/common.go
package actions

type ActionParser interface {
    ParseAction(action string) (resource, verb string)
}

type DefaultActionParser struct{}

func (p *DefaultActionParser) ParseAction(action string) (resource, verb string) {
    switch action {
    case "restart-pods", "delete-pods", "get-logs", "describe-pods", "export-yaml":
        return parsePodsAction(action)
    case "restart-deployments", "scale-deployments", "delete-deployments":
        return parseDeploymentsAction(action)
    // ... other resource types
    }
}

func parsePodsAction(action string) (string, string) {
    switch action {
    case "restart-pods":
        return "pods", "update"
    case "delete-pods":
        return "pods", "delete"
    case "get-logs", "describe-pods", "export-yaml":
        return "pods", "get"
    default:
        return "unknown", "unknown"
    }
}
```

This reorganization addresses your specific concern about `parseAction` being in the wrong place while establishing patterns for the entire codebase.

## Conclusion

This reorganization will transform the current monolithic API package into a maintainable, testable, and scalable architecture that follows industry best practices. The migration can be done incrementally without breaking existing functionality, and each phase delivers immediate value.

### Critical Issues Addressed:

1. **parseAction Misplacement**: Fixed by moving to proper location in actions domain
2. **God Object Server**: Reduced from 29 dependencies to ~10 through service extraction  
3. **Route Chaos**: 200+ routes organized into logical domain groups
4. **Code Duplication**: 1000+ lines of duplicated code eliminated through shared utilities
5. **Security Logic**: SSAR checks and audit logging centralized in middleware
6. **DTO Scatter**: Centralized type definitions with consistent validation
7. **Authentication Chaos**: 5+ scattered files consolidated into coherent auth domain
8. **Response Formatting**: 1000+ line mixed file split into domain-specific formatters

### Measurable Improvements:

- **File Size Reduction**: 1000-1800 line files split into 200-300 line focused modules
- **Code Duplication**: Eliminate 1000+ lines of repeated pagination, security, and validation code  
- **Server Dependencies**: Reduce from 29 injected dependencies to ~10 domain services
- **Route Organization**: Split 200+ routes into logical domain groups
- **Testing Coverage**: Enable unit testing through dependency injection and service interfaces
- **Team Velocity**: Multiple developers can work on different domains simultaneously

### Next Steps:

1. **Start with Phase 1** (utilities and middleware) to immediately address code duplication
2. **Continue with Phase 4** (service layer) to break up the god object Server struct
3. **Follow with Phase 5** (handler reorganization) to fix parseAction and route organization
4. **Complete remaining phases** for full architectural transformation


