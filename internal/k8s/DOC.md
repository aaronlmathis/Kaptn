# K8s Package Documentation

## Overview

The `internal/k8s` package provides comprehensive Kubernetes integration for the Kaptn admin dashboard, serving as the central hub for all Kubernetes API interactions. It implements sophisticated client management, impersonation, permission checking, resource informers, and action execution with enterprise-grade security and performance features.

## Package Architecture

```
internal/k8s/
├── README.md                # Package scope and guardrails
├── context.go              # Context management for impersonated clients  
├── impersonation.go        # Impersonated client factory and management
├── ssar.go                 # SelfSubjectAccessReview helpers
├── permission_helper.go    # Simplified permission checking for UI gating
├── client/                 # Client factory and configuration
│   ├── factory.go          # Kubernetes client factory implementation
│   └── factory_test.go     # Client factory testing
├── actions/                # Action execution and coordination
│   ├── apply.go           # YAML apply functionality
│   ├── coordinator.go     # Action coordination and lifecycle
│   ├── dynamic_executor.go # Dynamic resource execution
│   ├── idempotency.go     # Idempotency management
│   ├── jobs.go            # Job management and tracking
│   ├── nodes.go           # Node-specific actions
│   ├── persistence.go     # Action result persistence
│   ├── safety.go          # Safety checks and guardrails
│   └── audit.go           # Action auditing
├── informers/             # Resource informers and event handling
│   ├── manager.go         # Informer manager and coordination
│   ├── pods.go            # Pod informer implementation
│   ├── deployments.go     # Deployment informer
│   ├── services.go        # Service informer
│   ├── nodes.go           # Node informer
│   ├── namespaces.go      # Namespace informer
│   ├── secrets.go         # Secret informer
│   ├── configmaps.go      # ConfigMap informer
│   ├── events.go          # Event informer
│   └── [30+ other resource informers]
├── logs/                  # Log streaming and collection
├── metrics/               # Metrics collection from Kubernetes
├── overview/              # Cluster overview and summary
├── resources/             # Resource operations and helpers
├── selectors/             # Label and field selectors
├── summaries/             # Resource summarization
├── ws/                    # WebSocket integration for real-time updates
└── exec/                  # Pod execution and terminal functionality
```

## Core Components

### 1. Client Factory (`client/factory.go`)

Enterprise-grade Kubernetes client factory supporting both in-cluster and kubeconfig modes with advanced configuration.

#### Client Modes:
```go
type ClientMode string

const (
    InClusterMode  ClientMode = "incluster"  // ServiceAccount-based
    KubeconfigMode ClientMode = "kubeconfig" // File-based configuration
)
```

#### Factory Features:
- **Multiple Client Types**: Standard clientset, dynamic client, discovery client
- **Rate Limiting**: Configurable QPS and burst limits
- **Connection Validation**: Built-in API server connectivity testing
- **Configuration Flexibility**: Support for custom kubeconfig paths

```go
type Factory struct {
    logger          *zap.Logger
    config          *rest.Config
    client          kubernetes.Interface
    dynamicClient   dynamic.Interface
    discoveryClient discovery.DiscoveryInterface
}
```

### 2. Impersonation System (`impersonation.go`)

Sophisticated user impersonation system enabling secure multi-user access with Kubernetes RBAC integration.

#### Impersonated Client Factory:
```go
type ImpersonatedClientFactory struct {
    logger     *zap.Logger
    baseConfig *rest.Config
}

type ImpersonatedClients struct {
    Config    *rest.Config                  // REST configuration with impersonation
    Clientset kubernetes.Interface          // Standard Kubernetes client
    Dynamic   dynamic.Interface             // Dynamic client for CRDs
    Discovery discovery.DiscoveryInterface  // Discovery client for API exploration
    logger    *zap.Logger
}
```

#### Key Features:
- **User Context Preservation**: Maintains user identity through request lifecycle
- **Group-Based Access**: Supports Kubernetes group-based permissions
- **Multiple Client Types**: All Kubernetes client types with impersonation
- **Secure Isolation**: Each user gets isolated client instances

### 3. Context Management (`context.go`)

Request-scoped context management for impersonated clients with lifecycle management.

#### Impersonation Manager:
```go
type ImpersonationManager struct {
    factory          *ImpersonatedClientFactory
    ssarHelper       *SSARHelper
    permissionHelper *PermissionHelper
    logger           *zap.Logger
}
```

#### Username Formatting:
```go
func formatUsername(user *auth.User, format string) string {
    // Supports templates: {sub}, {email}, {name}, {id}
    // Default: "oidc:{sub}" or fallbacks
    // Examples:
    // "oidc:{sub}" -> "oidc:user-12345"
    // "email:{email}" -> "email:user@example.com"
    // "k8s:{name}" -> "k8s:John Doe"
}
```

### 4. Permission System (`ssar.go`, `permission_helper.go`)

Comprehensive permission checking using Kubernetes SelfSubjectAccessReview with UI-focused helpers.

#### SSAR Helper:
```go
type SSARHelper struct {
    logger *zap.Logger
}

// Core permission checking
func (s *SSARHelper) CanPerformAction(ctx context.Context, client kubernetes.Interface, 
    verb, group, resource, namespace, name string) (bool, error)

// Subresource support (e.g., pods/log, deployments/scale)
func (s *SSARHelper) CanPerformActionWithSubresource(ctx context.Context, client kubernetes.Interface,
    verb, group, resource, subresource, namespace, name string) (bool, error)
```

#### Permission Helper (UI Gating):
```go
type PermissionHelper struct {
    ssarHelper *SSARHelper
}

// Simplified UI-focused permission checking
func (p *PermissionHelper) Can(ctx context.Context, client kubernetes.Interface,
    verb, resource, namespace, name string) (bool, error)

// Page-level access checking
func (p *PermissionHelper) CheckPageAccess(ctx context.Context, client kubernetes.Interface,
    primaryResource, namespace string) (bool, error)

// Common action helpers
func (p *PermissionHelper) CanDeploy(ctx context.Context, client kubernetes.Interface, namespace string) (bool, error)
func (p *PermissionHelper) CanScale(ctx context.Context, client kubernetes.Interface, namespace string) (bool, error)
func (p *PermissionHelper) CanEditSecrets(ctx context.Context, client kubernetes.Interface, namespace string) (bool, error)
```

### 5. Informer Manager (`informers/manager.go`)

Comprehensive informer management for real-time resource updates with tiered resource prioritization.

#### Informer Tiers:
- **Tier 1 (Critical)**: Pods, Nodes, Deployments, Services, Namespaces, Events
- **Tier 2 (Important)**: ReplicaSets, StatefulSets, ConfigMaps, Secrets, Jobs
- **Tier 3 (Optional)**: Ingresses, NetworkPolicies, Storage resources, RBAC

#### Manager Features:
```go
type Manager struct {
    logger  *zap.Logger
    client  kubernetes.Interface
    factory informers.SharedInformerFactory
    
    // Dynamic client for CRDs
    dynamicClient  dynamic.Interface
    dynamicFactory dynamicinformer.DynamicSharedInformerFactory
    
    // 30+ resource-specific informers
    NodesInformer       cache.SharedIndexInformer
    PodsInformer        cache.SharedIndexInformer
    DeploymentsInformer cache.SharedIndexInformer
    // ... many more
}
```

#### Supported Resources:
- **Core Resources**: Pods, Services, ConfigMaps, Secrets, Nodes, Namespaces
- **Workload Resources**: Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs
- **Storage Resources**: PersistentVolumes, PersistentVolumeClaims, StorageClasses, VolumeSnapshots
- **Network Resources**: Ingresses, NetworkPolicies, EndpointSlices
- **RBAC Resources**: Roles, RoleBindings, ClusterRoles, ClusterRoleBindings
- **Custom Resources**: Istio Gateways, VolumeSnapshots, CRDs
- **Autoscaling**: HorizontalPodAutoscalers

## Usage Examples

### Basic Client Factory Setup
```go
package main

import (
    "github.com/example/kaptn/internal/k8s/client"
    "go.uber.org/zap"
)

func main() {
    logger := zap.NewProduction()
    
    // Create client factory
    factory, err := client.NewFactory(
        logger,
        client.KubeconfigMode,
        "/path/to/kubeconfig",
        100.0, // QPS
        200,   // Burst
    )
    if err != nil {
        log.Fatal("Failed to create client factory:", err)
    }
    
    // Validate connection
    if err := factory.ValidateConnection(); err != nil {
        log.Fatal("Failed to validate Kubernetes connection:", err)
    }
    
    // Get clients
    k8sClient := factory.Client()
    dynamicClient := factory.DynamicClient()
    discoveryClient := factory.DiscoveryClient()
}
```

### Impersonation Manager Usage
```go
// Create impersonation manager
impersonationFactory := k8s.NewImpersonatedClientFactory(logger, factory.Config())
impersonationManager := k8s.NewImpersonationManager(impersonationFactory, logger)

// Build clients from authenticated user
func handleRequest(w http.ResponseWriter, r *http.Request) {
    // Extract user from auth middleware
    user, ok := auth.UserFromContext(r.Context())
    if !ok {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }
    
    // Create impersonated clients
    clients, err := impersonationManager.BuildClientsFromUser(user, "oidc:{sub}")
    if err != nil {
        http.Error(w, "Failed to create clients", http.StatusInternalServerError)
        return
    }
    
    // Add to request context
    ctx := k8s.WithImpersonatedClients(r.Context(), clients)
    
    // Use clients for Kubernetes operations
    pods, err := clients.Client().CoreV1().Pods("default").List(ctx, metav1.ListOptions{})
    if err != nil {
        http.Error(w, "Failed to list pods", http.StatusInternalServerError)
        return
    }
    
    // Return response
    json.NewEncoder(w).Encode(pods)
}
```

### Permission Checking
```go
// Permission helper usage in handlers
func checkUserPermissions(ctx context.Context, clients *k8s.ImpersonatedClients) {
    permissionHelper := k8s.NewPermissionHelper(k8s.NewSSARHelper(logger))
    
    // Check if user can list pods
    canListPods, err := permissionHelper.CanListResources(
        ctx, 
        clients.Client(), 
        "pods", 
        "default",
    )
    if err != nil {
        log.Printf("Permission check failed: %v", err)
        return
    }
    
    if canListPods {
        log.Println("User can list pods in default namespace")
    }
    
    // Check page-level access
    hasPageAccess, err := permissionHelper.CheckPageAccess(
        ctx,
        clients.Client(),
        "deployments",
        "production",
    )
    
    // Get comprehensive action permissions
    actionPerms, err := permissionHelper.GetActionPermissions(
        ctx,
        clients.Client(),
        "production",
    )
    if err == nil {
        fmt.Printf("Can deploy: %v\n", actionPerms.CanDeploy)
        fmt.Printf("Can scale: %v\n", actionPerms.CanScale)
        fmt.Printf("Can edit secrets: %v\n", actionPerms.CanEditSecrets)
    }
}
```

### Informer Manager Setup
```go
// Create and start informer manager
func setupInformers(factory *client.Factory) {
    logger := zap.NewProduction()
    
    // Create informer manager
    informerManager := informers.NewManager(
        logger,
        factory.Client(),
        factory.DynamicClient(),
    )
    
    // Add event handlers for real-time updates
    informerManager.AddPodEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: func(obj interface{}) {
            pod := obj.(*corev1.Pod)
            log.Printf("Pod created: %s/%s", pod.Namespace, pod.Name)
            // Broadcast to WebSocket clients
            broadcast.SendPodUpdate("create", pod)
        },
        UpdateFunc: func(oldObj, newObj interface{}) {
            pod := newObj.(*corev1.Pod)
            log.Printf("Pod updated: %s/%s", pod.Namespace, pod.Name)
            broadcast.SendPodUpdate("update", pod)
        },
        DeleteFunc: func(obj interface{}) {
            pod := obj.(*corev1.Pod)
            log.Printf("Pod deleted: %s/%s", pod.Namespace, pod.Name)
            broadcast.SendPodUpdate("delete", pod)
        },
    })
    
    // Add handlers for other resources
    informerManager.AddDeploymentEventHandler(deploymentHandler)
    informerManager.AddServiceEventHandler(serviceHandler)
    informerManager.AddNodeEventHandler(nodeHandler)
    
    // Start informers
    if err := informerManager.Start(); err != nil {
        log.Fatal("Failed to start informers:", err)
    }
    
    // Graceful shutdown
    defer informerManager.Stop()
}
```

### Middleware Integration
```go
// Middleware for adding impersonated clients to context
func ImpersonationMiddleware(impersonationManager *k8s.ImpersonationManager) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // Extract user from auth context
            user, ok := auth.UserFromContext(r.Context())
            if !ok {
                http.Error(w, "User not found in context", http.StatusUnauthorized)
                return
            }
            
            // Build impersonated clients
            clients, err := impersonationManager.BuildClientsFromUser(user, "oidc:{sub}")
            if err != nil {
                http.Error(w, "Failed to create impersonated clients", http.StatusInternalServerError)
                return
            }
            
            // Add clients to context
            ctx := k8s.WithImpersonatedClients(r.Context(), clients)
            
            // Continue with request
            next.ServeHTTP(w, r.WithContext(ctx))
        })
    }
}
```

## Advanced Features

### 1. Multiple Permission Checking
```go
// Efficient batch permission checking
func checkMultiplePermissions(ctx context.Context, client kubernetes.Interface) {
    ssarHelper := k8s.NewSSARHelper(logger)
    
    checks := []k8s.PermissionCheck{
        {Verb: "get", Resource: "pods", Namespace: "default", Name: "my-pod"},
        {Verb: "list", Resource: "deployments", Namespace: "default", Name: ""},
        {Verb: "create", Resource: "services", Namespace: "default", Name: ""},
        {Verb: "delete", Resource: "configmaps", Namespace: "default", Name: "my-config"},
    }
    
    results, err := ssarHelper.CheckMultiplePermissions(ctx, client, checks)
    if err != nil {
        log.Printf("Batch permission check failed: %v", err)
        return
    }
    
    for key, allowed := range results {
        fmt.Printf("Permission %s: %v\n", key, allowed)
    }
}
```

### 2. Subresource Permissions
```go
// Check subresource permissions (logs, exec, scale, etc.)
func checkSubresourcePermissions(ctx context.Context, client kubernetes.Interface) {
    ssarHelper := k8s.NewSSARHelper(logger)
    
    // Check if user can view pod logs
    canViewLogs, err := ssarHelper.CanPerformActionWithSubresource(
        ctx, client, "get", "", "pods", "log", "default", "my-pod")
    
    // Check if user can exec into pods
    canExec, err := ssarHelper.CanPerformActionWithSubresource(
        ctx, client, "create", "", "pods", "exec", "default", "my-pod")
    
    // Check if user can scale deployments
    canScale, err := ssarHelper.CanPerformActionWithSubresource(
        ctx, client, "update", "apps", "deployments", "scale", "default", "my-deployment")
}
```

### 3. Custom Resource Support
```go
// Working with custom resources through informers
func setupCustomResourceInformers(manager *informers.Manager) {
    // Volume snapshots (CRD)
    manager.AddVolumeSnapshotEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: func(obj interface{}) {
            // Handle volume snapshot creation
            log.Println("Volume snapshot created")
        },
    })
    
    // Istio gateways (CRD)
    manager.AddGatewayEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: func(obj interface{}) {
            // Handle gateway creation
            log.Println("Istio gateway created")
        },
    })
    
    // Custom Resource Definitions
    manager.AddCustomResourceDefinitionEventHandler(cache.ResourceEventHandlerFuncs{
        AddFunc: func(obj interface{}) {
            // Handle CRD registration
            log.Println("New CRD registered")
        },
    })
}
```

### 4. Context Extraction in Handlers
```go
// Handler pattern for extracting impersonated clients
func handleResourceOperation(w http.ResponseWriter, r *http.Request) {
    // Extract impersonated clients from context
    clients, ok := k8s.ImpersonatedClientsFromContext(r.Context())
    if !ok {
        http.Error(w, "No kubernetes access", http.StatusInternalServerError)
        return
    }
    
    // Use clients for operations
    pods, err := clients.Client().CoreV1().Pods("default").List(r.Context(), metav1.ListOptions{})
    if err != nil {
        http.Error(w, "Failed to list pods", http.StatusInternalServerError)
        return
    }
    
    // Return results
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(pods)
}
```

## Configuration

### Client Factory Configuration
```go
// Environment variables for client configuration
KAPTN_KUBE_MODE=kubeconfig              // "incluster" or "kubeconfig"
KUBECONFIG=/path/to/kubeconfig          // Kubeconfig file path
KAPTN_KUBE_QPS=100                     // API server QPS limit
KAPTN_KUBE_BURST=200                   // API server burst limit
KAPTN_KUBE_INSECURE_TLS=false          // Skip TLS verification (dev only)

// Programmatic configuration
factory, err := client.NewFactory(
    logger,
    client.KubeconfigMode,
    "/home/user/.kube/config",
    100.0, // QPS
    200,   // Burst
)
```

### Username Format Configuration
```go
// Username format templates
KAPTN_USERNAME_FORMAT=oidc:{sub}        // Use OIDC subject
KAPTN_USERNAME_FORMAT=email:{email}     // Use email address
KAPTN_USERNAME_FORMAT=k8s:{name}        // Use display name
KAPTN_USERNAME_FORMAT={sub}@{email}     // Custom combination

// Format processing in impersonation manager
username := formatUsername(user, "oidc:{sub}")
// Result: "oidc:auth0|abc123def456"
```

### Informer Configuration
```go
// Informer factory with custom resync period
factory := informers.NewSharedInformerFactory(client, 30*time.Second)

// Dynamic informer factory for CRDs
dynamicFactory := dynamicinformer.NewDynamicSharedInformerFactory(dynamicClient, 30*time.Second)
```

## Security Considerations

### Impersonation Security
- **User Isolation**: Each user gets completely isolated client instances
- **Group Validation**: Groups are validated against OIDC claims
- **RBAC Integration**: All permissions enforced through Kubernetes RBAC
- **Audit Trail**: All impersonated actions logged with user context

### Permission Checking Security
- **Real-Time Validation**: Permissions checked on every request
- **Subresource Support**: Granular permissions for operations like logs/exec
- **Fallback Behavior**: Secure defaults when permission checks fail
- **Caching Considerations**: No caching of permission results for security

### Context Security
- **Request Scoping**: Clients tied to specific request contexts
- **Memory Safety**: Proper cleanup of client instances
- **Error Handling**: Secure error messages without information disclosure

## Performance Optimization

### Client Reuse
```go
// Shared base configuration
baseConfig := factory.Config()

// Efficient impersonated client creation
impersonatedConfig := rest.CopyConfig(baseConfig)
impersonatedConfig.Impersonate = rest.ImpersonationConfig{
    UserName: username,
    Groups:   groups,
}
```

### Informer Efficiency
- **Shared Informers**: Single informer per resource type across all users
- **Event Filtering**: Efficient event handler registration
- **Memory Management**: Automatic cache cleanup and eviction
- **Tiered Priorities**: Critical resources get higher priority

### Permission Checking Optimization
- **Batch Operations**: Multiple permission checks in single operations
- **Minimal API Calls**: Efficient SSAR usage patterns
- **Early Returns**: Fast failure for obviously denied operations

## Testing

### Unit Testing
```go
func TestImpersonationManager(t *testing.T) {
    logger := zaptest.NewLogger(t)
    baseConfig := &rest.Config{}
    
    factory := k8s.NewImpersonatedClientFactory(logger, baseConfig)
    manager := k8s.NewImpersonationManager(factory, logger)
    
    user := &auth.User{
        Sub:    "user123",
        Email:  "user@example.com",
        Groups: []string{"developers", "admins"},
    }
    
    clients, err := manager.BuildClientsFromUser(user, "oidc:{sub}")
    assert.NoError(t, err)
    assert.NotNil(t, clients)
    assert.Equal(t, "oidc:user123", clients.Config.Impersonate.UserName)
    assert.Equal(t, []string{"developers", "admins"}, clients.Config.Impersonate.Groups)
}
```

### Integration Testing
```go
func TestPermissionHelper(t *testing.T) {
    // Create test client
    client := fake.NewSimpleClientset()
    
    // Create permission helper
    ssarHelper := k8s.NewSSARHelper(logger)
    permissionHelper := k8s.NewPermissionHelper(ssarHelper)
    
    // Test permission checking
    canList, err := permissionHelper.CanListResources(
        context.Background(),
        client,
        "pods",
        "default",
    )
    
    assert.NoError(t, err)
    // Note: fake client typically allows all operations
    assert.True(t, canList)
}
```

## Best Practices

### Client Management
- **Lifecycle Management**: Proper creation and cleanup of client instances
- **Resource Limits**: Configure appropriate QPS and burst limits
- **Connection Validation**: Always validate connections before use
- **Error Handling**: Comprehensive error handling for API failures

### Impersonation Best Practices
- **Username Consistency**: Use consistent username formatting across the application
- **Group Management**: Validate groups against external identity providers
- **Context Propagation**: Always propagate clients through request contexts
- **Security Logging**: Log all impersonation activities for audit

### Permission Checking Best Practices
- **Defense in Depth**: Check permissions at multiple levels (page, action, resource)
- **Graceful Degradation**: Handle permission failures gracefully in UI
- **Batch Operations**: Use batch permission checking for efficiency
- **Error Transparency**: Provide clear feedback on permission denials

## Future Enhancements

### Planned Features
- **Client Connection Pooling**: Advanced connection pooling for better performance
- **Permission Caching**: Intelligent caching of permission results with TTL
- **Multi-Cluster Support**: Support for multiple Kubernetes clusters
- **Custom Resource Discovery**: Automatic discovery and registration of CRDs

### Extensibility Points
- **Custom Informers**: Support for custom resource informers
- **Authentication Providers**: Pluggable authentication provider support
- **Permission Providers**: Alternative permission checking mechanisms
- **Client Interceptors**: Middleware for client operations

## Dependencies

### External Dependencies
- `k8s.io/client-go/kubernetes` - Standard Kubernetes client
- `k8s.io/client-go/dynamic` - Dynamic client for CRDs
- `k8s.io/client-go/discovery` - API discovery client
- `k8s.io/client-go/tools/cache` - Informer and caching utilities
- `k8s.io/client-go/rest` - REST client configuration
- `k8s.io/api/authorization/v1` - Authorization API types
- `go.uber.org/zap` - Structured logging

### Internal Dependencies
- `internal/auth` - User authentication and context
- Standard library packages: `context`, `fmt`, `time`

This documentation provides comprehensive coverage of the k8s package, serving as both a developer guide for extending Kubernetes functionality and an operational reference for deploying and maintaining Kaptn's Kubernetes integration layer. The package serves as the foundation for all Kubernetes operations in Kaptn, providing secure, performant, and scalable access to Kubernetes APIs.