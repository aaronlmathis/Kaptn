# Config Package Documentation

## Overview

The `internal/config` package provides comprehensive configuration management for the Kaptn Kubernetes admin dashboard. It implements a flexible configuration system supporting environment variables, YAML files, and intelligent defaults with complete validation and type safety.

## Package Architecture

```
internal/config/
├── config.go        # Core configuration structures and loading logic
└── config_test.go   # Configuration testing and validation tests
```

## Core Components

### 1. Configuration Structures

The config package defines a comprehensive configuration hierarchy covering all aspects of the Kaptn application:

#### Main Configuration (`Config`)
```go
type Config struct {
    Server       ServerConfig       // HTTP server configuration
    Security     SecurityConfig     // Authentication and security settings
    Authz        AuthzConfig        // Authorization configuration
    Bindings     BindingsConfig     // User role bindings source
    Kubernetes   KubernetesConfig   // Kubernetes client configuration
    Features     FeaturesConfig     // Feature flags and toggles
    RateLimits   RateLimitsConfig   // API rate limiting settings
    Logging      LoggingConfig      // Logging behavior configuration
    Integrations IntegrationsConfig // External service integrations
    Caching      CachingConfig      // Cache configuration for all services
    Jobs         JobsConfig         // Background job management
    Timeseries   TimeseriesConfig   // Time series collection and WebSocket
    Actions      ActionsConfig      // Action execution behavior
}
```

### 2. Configuration Loading

#### Environment-First Approach:
```go
// Load configuration with environment variables as primary source
cfg, err := config.Load()

// Load from YAML file with environment overrides
cfg, err := config.LoadFromFile("/path/to/config.yaml")
```

#### Merge Strategy:
1. **Default Values**: Sensible defaults for all configuration options
2. **YAML File**: Optional file-based configuration
3. **Environment Variables**: Highest priority, override all other sources

### 3. Configuration Sections

#### Server Configuration (`ServerConfig`)
```go
type ServerConfig struct {
    Addr         string     // Server listen address (default: "0.0.0.0:8080")
    BasePath     string     // Base path for all routes (default: "/")
    CORS         CORSConfig // Cross-origin request configuration
    CookieSecret string     // Session cookie encryption secret (required for OIDC)
}

type CORSConfig struct {
    AllowOrigins []string // Allowed origins for CORS (default: ["*"])
    AllowMethods []string // Allowed HTTP methods (default: ["GET", "POST", "PUT", "DELETE", "OPTIONS"])
}
```

#### Security Configuration (`SecurityConfig`)
```go
type SecurityConfig struct {
    AuthMode        string         // Authentication mode: "none", "header", "oidc"
    SessionTTL      string         // Session token TTL (default: "12h")
    RefreshTokenTTL string         // Refresh token TTL (default: "7d")
    OIDC            OIDCConfig     // OIDC provider configuration
    TLS             TLSConfig      // TLS/HTTPS configuration
    AuthKeys        AuthKeysConfig // Authentication key file paths
    UsernameFormat  string         // Username format template (default: "oidc:{sub}")
}

type OIDCConfig struct {
    Issuer       string   // OIDC issuer URL
    ClientID     string   // OIDC client ID
    ClientSecret string   // OIDC client secret
    RedirectURL  string   // OIDC redirect URL
    Scopes       []string // OIDC scopes (default: ["openid", "profile", "email", "groups"])
    Audience     string   // OIDC audience (optional)
    JWKSURL      string   // JWKS URL (optional, derived from issuer)
}
```

#### Authorization Configuration (`AuthzConfig`)
```go
type AuthzConfig struct {
    Mode                  string   // "idp_groups" or "user_bindings"
    GroupsFilter          []string // Filter allowed groups in idp_groups mode
    GroupsPrefixAllowlist []string // Allowed group prefixes (e.g., ["kaptn-", "oncall-"])
    DefaultGroups         []string // Default groups for new users
}
```

#### Kubernetes Configuration (`KubernetesConfig`)
```go
type KubernetesConfig struct {
    Mode             string  // "incluster" or "kubeconfig"
    KubeconfigPath   string  // Path to kubeconfig file
    NamespaceDefault string  // Default namespace (default: "default")
    ClusterName      string  // Cluster identifier (default: "default")
    InsecureTLS      bool    // Skip TLS verification (development only)
    QPS              float32 // API server queries per second (default: 100)
    Burst            int     // API server burst capacity (default: 200)
    LogsQPS          float32 // Separate QPS for logs collection (default: 20)
    LogsBurst        int     // Separate burst for logs collection (default: 40)
}
```

#### Features Configuration (`FeaturesConfig`)
```go
type FeaturesConfig struct {
    EnableApply               bool // Enable YAML apply functionality
    EnableNodeActions         bool // Enable node-level actions
    EnableOverview            bool // Enable cluster overview page
    EnablePrometheusAnalytics bool // Enable Prometheus analytics
}
```

#### Caching Configuration (`CachingConfig`)
```go
type CachingConfig struct {
    OverviewTTL    string // Overview cache TTL (default: "2s")
    AnalyticsTTL   string // Analytics cache TTL (default: "60s")
    SummaryTTL     string // Summary cache TTL (default: "30s")
    SearchCacheTTL string // Search cache TTL (default: "30s")
    SearchMaxSize  int    // Maximum search cache entries (default: 10000)
    LogsCache      LogsCacheConfig // Comprehensive logs cache configuration
}

type LogsCacheConfig struct {
    // Basic cache settings
    TTL            string // Cache entry TTL (default: "10m")
    MaxGlobal      int    // Global cache limit (default: 250000)
    MaxPerScope    int    // Per-scope cache limit (default: 20000)
    MaxSubscribers int    // Maximum WebSocket subscribers (default: 200)
    BufferSize     int    // WebSocket buffer size (default: 100)
    
    // Background collection
    BackgroundCollectionEnabled   bool   // Enable background log collection
    BackgroundCollectionRetention string // Background collection retention period
    
    // Operational limits
    MaxStreamsPerUser     int    // Maximum streams per user
    MaxQueryLimit         int    // Maximum log query limit
    MaxExportSize         int64  // Maximum export size in bytes
    MaxConcurrentQueries  int    // Maximum concurrent queries
    RateLimitPerSecond    int    // Rate limit per second
    BackpressureThreshold int    // Backpressure threshold percentage
    DegradedModeTimeout   string // Degraded mode timeout
}
```

#### Timeseries Configuration (`TimeseriesConfig`)
```go
type TimeseriesConfig struct {
    Enabled                 bool   // Enable timeseries collection
    Window                  string // Time window for data retention (default: "60m")
    TickInterval            string // Collection tick interval (default: "1s")
    CapacityRefreshInterval string // Capacity refresh interval (default: "30s")
    
    HiRes struct {
        Step string // High-resolution step (default: "1s")
    }
    LoRes struct {
        Step string // Low-resolution step (default: "5s")
    }
    
    // Performance limits
    MaxSeries          int // Maximum series count (default: 1000)
    MaxPointsPerSeries int // Maximum points per series (default: 10000)
    MaxWSClients       int // Maximum WebSocket clients (default: 500)
    WSReadLimit        int // WebSocket read buffer limit (default: 4096)
    WSWriteBufferSize  int // WebSocket write buffer size (default: 1024)
    
    // Feature flags
    DisableNetworkIfUnavailable bool // Disable network features if unavailable
}
```

#### Actions Configuration (`ActionsConfig`)
```go
type ActionsConfig struct {
    IdempotencyTTL     string            // Idempotency cache TTL (default: "10m")
    DefaultConcurrency int               // Default action concurrency (default: 8)
    MaxConcurrency     int               // Maximum action concurrency (default: 32)
    DeniedNamespaces   []string          // Namespaces where actions are denied
    DeniedLabels       map[string]string // Labels that deny actions
    ActionAllowlist    []string          // Explicitly allowed actions
    ActionDenylist     []string          // Explicitly denied actions
}
```

## Configuration Loading Process

### 1. Default Configuration Generation
```go
func Load() (*Config, error) {
    // Generate configuration with intelligent defaults
    cfg := &Config{
        Server: ServerConfig{
            Addr:         getEnv("KAPTN_SERVER_ADDR", "0.0.0.0:8080"),
            BasePath:     getEnv("KAPTN_BASE_PATH", "/"),
            CookieSecret: getEnv("KAPTN_COOKIE_SECRET", ""),
        },
        Security: SecurityConfig{
            AuthMode:        getEnv("KAPTN_AUTH_MODE", "oidc"),
            SessionTTL:      getEnv("KAPTN_SESSION_TTL", "12h"),
            RefreshTokenTTL: getEnv("KAPTN_REFRESH_TOKEN_TTL", "7d"),
            UsernameFormat:  getEnv("KAPTN_USERNAME_FORMAT", "oidc:{sub}"),
        },
        // ... additional defaults
    }
    return cfg, nil
}
```

### 2. File-Based Configuration Loading
```go
func LoadFromFile(configPath string) (*Config, error) {
    // Load YAML configuration file
    data, err := os.ReadFile(configPath)
    if err != nil {
        return nil, fmt.Errorf("failed to read config file: %w", err)
    }
    
    var config Config
    if err := yaml.Unmarshal(data, &config); err != nil {
        return nil, fmt.Errorf("failed to unmarshal YAML: %w", err)
    }
    
    // Merge with environment variable overrides
    return mergeConfigs(envConfig, &config), nil
}
```

### 3. Environment Variable Parsing
```go
func getEnv(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
    if value := os.Getenv(key); value != "" {
        if parsed, err := strconv.ParseBool(value); err == nil {
            return parsed
        }
    }
    return defaultValue
}

func getEnvStringSlice(key string, defaultValue []string) []string {
    if value := os.Getenv(key); value != "" {
        parts := strings.Split(value, ",")
        var result []string
        for _, part := range parts {
            if trimmed := strings.TrimSpace(part); trimmed != "" {
                result = append(result, trimmed)
            }
        }
        return result
    }
    return defaultValue
}
```

## Environment Variables

### Core Server Settings
```bash
# Server configuration
KAPTN_SERVER_ADDR=0.0.0.0:8080          # Server listen address
KAPTN_BASE_PATH=/                        # Base path for all routes
KAPTN_COOKIE_SECRET=your-secret-key      # Session encryption secret (32+ chars)
PORT=8080                               # Alternative port setting (overrides KAPTN_SERVER_ADDR)

# TLS configuration
KAPTN_TLS_ENABLED=false                 # Enable HTTPS
KAPTN_TLS_CERT_FILE=/path/to/cert.pem   # TLS certificate file
KAPTN_TLS_KEY_FILE=/path/to/key.pem     # TLS private key file
```

### Authentication & Authorization
```bash
# Authentication mode
KAPTN_AUTH_MODE=oidc                    # "none", "header", or "oidc"
KAPTN_SESSION_TTL=12h                   # Session token lifetime
KAPTN_REFRESH_TOKEN_TTL=7d              # Refresh token lifetime
KAPTN_USERNAME_FORMAT=oidc:{sub}        # Username format template

# OIDC configuration
KAPTN_OIDC_ISSUER=https://idp.example.com/.well-known/openid-configuration
KAPTN_OIDC_CLIENT_ID=kaptn-client-id
KAPTN_OIDC_CLIENT_SECRET=secret
KAPTN_OIDC_REDIRECT_URL=https://kaptn.example.com/auth/callback
KAPTN_OIDC_SCOPES=openid,profile,email,groups
KAPTN_OIDC_AUDIENCE=kaptn-audience

# Authorization configuration
KAPTN_AUTHZ_MODE=idp_groups             # "idp_groups" or "user_bindings"
KAPTN_GROUPS_PREFIX_ALLOWLIST=kaptn-,oncall-  # Comma-separated prefixes
KAPTN_DEFAULT_GROUPS=kaptn-viewers      # Default groups for new users

# Authentication key file paths
KAPTN_OIDC_STATE_HASH_KEY_PATH=keys/oidc_state_hash.key
KAPTN_OIDC_STATE_BLOCK_KEY_PATH=keys/oidc_state_block.key
KAPTN_JWT_PRIVATE_KEY_PATH=keys/kaptn_jwt_private.pem
KAPTN_JWT_PUBLIC_KEY_PATH=keys/kaptn_jwt_public.pem
```

### Kubernetes Configuration
```bash
# Kubernetes client configuration
KAPTN_KUBE_MODE=kubeconfig              # "incluster" or "kubeconfig"
KUBECONFIG=/path/to/kubeconfig          # Kubeconfig file path
KAPTN_NAMESPACE_DEFAULT=default         # Default namespace
KAPTN_CLUSTER_NAME=production           # Cluster identifier
KAPTN_KUBE_INSECURE_TLS=false          # Skip TLS verification (dev only)

# Rate limiting
KAPTN_KUBE_QPS=100                     # API server queries per second
KAPTN_KUBE_BURST=200                   # API server burst capacity
KAPTN_LOGS_KUBE_QPS=20                 # Logs collection QPS
KAPTN_LOGS_KUBE_BURST=40               # Logs collection burst
```

### Features & Integrations
```bash
# Feature flags
KAPTN_ENABLE_APPLY=true                 # Enable YAML apply functionality
KAPTN_ENABLE_NODE_ACTIONS=true          # Enable node actions
KAPTN_ENABLE_OVERVIEW=true              # Enable overview page
KAPTN_ENABLE_PROMETHEUS_ANALYTICS=true  # Enable Prometheus integration

# Prometheus integration
KAPTN_PROMETHEUS_URL=http://prometheus.monitoring.svc:9090
KAPTN_PROMETHEUS_TIMEOUT=5s
KAPTN_PROMETHEUS_ENABLED=true

# Rate limiting
KAPTN_APPLY_PER_MINUTE=10              # YAML apply rate limit
KAPTN_ACTIONS_PER_MINUTE=20            # Actions rate limit
```

### Caching Configuration
```bash
# Cache TTL settings
KAPTN_OVERVIEW_TTL=2s                  # Overview cache TTL
KAPTN_ANALYTICS_TTL=60s                # Analytics cache TTL
KAPTN_SUMMARY_TTL=30s                  # Summary cache TTL
KAPTN_SEARCH_CACHE_TTL=30s             # Search cache TTL
KAPTN_SEARCH_MAX_SIZE=10000            # Search cache max entries

# Logs cache configuration
KAPTN_LOGS_TTL=10m                     # Log entries TTL
KAPTN_LOGS_MAX_GLOBAL=250000           # Global log entry limit
KAPTN_LOGS_MAX_PER_SCOPE=20000         # Per-scope log entry limit
KAPTN_LOGS_MAX_SUBSCRIBERS=200         # Max WebSocket subscribers
KAPTN_LOGS_BUFFER_SIZE=100             # WebSocket buffer size
KAPTN_LOGS_EVICTION_INTERVAL=30s       # Cache eviction interval
KAPTN_LOGS_CLEANUP_INTERVAL=5m         # Cache cleanup interval

# Background log collection
KAPTN_LOGS_BACKGROUND_COLLECTION_ENABLED=true
KAPTN_LOGS_BACKGROUND_COLLECTION_RETENTION=1h
```

### Logging Configuration
```bash
# Logging settings
LOG_LEVEL=info                         # Log level: debug, info, warn, error
KAPTN_LOG_FILE=/var/log/kaptn.log      # Log file path (empty = stdout only)
KAPTN_LOG_FORMAT=json                  # Log format: "json" or "console"
```

### Timeseries Configuration
```bash
# Timeseries collection
KAPTN_TIMESERIES_ENABLED=true                    # Enable timeseries
KAPTN_TIMESERIES_WINDOW=60m                      # Data retention window
KAPTN_TIMESERIES_TICK_INTERVAL=1s                # Collection interval
KAPTN_TIMESERIES_CAPACITY_REFRESH_INTERVAL=30s   # Capacity refresh interval

# Resolution settings
KAPTN_TIMESERIES_HI_RES_STEP=1s                 # High-resolution step
KAPTN_TIMESERIES_LO_RES_STEP=5s                 # Low-resolution step

# Performance limits
KAPTN_TIMESERIES_MAX_SERIES=1000                # Maximum series count
KAPTN_TIMESERIES_MAX_POINTS_PER_SERIES=10000    # Maximum points per series
KAPTN_TIMESERIES_MAX_WS_CLIENTS=500             # Maximum WebSocket clients
```

## YAML Configuration

### Complete Configuration Example
```yaml
server:
  addr: "0.0.0.0:8080"
  base_path: "/"
  cookie_secret: "your-32-character-secret-key-here"
  cors:
    allow_origins: ["https://kaptn.example.com"]
    allow_methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]

security:
  auth_mode: "oidc"
  session_ttl: "12h"
  refresh_token_ttl: "7d"
  username_format: "oidc:{sub}"
  oidc:
    issuer: "https://idp.example.com/.well-known/openid-configuration"
    client_id: "kaptn-client"
    client_secret: "oidc-client-secret"
    redirect_url: "https://kaptn.example.com/auth/callback"
    scopes: ["openid", "profile", "email", "groups"]
    audience: "kaptn"
  tls:
    enabled: true
    cert_file: "/etc/ssl/certs/kaptn.crt"
    key_file: "/etc/ssl/private/kaptn.key"
  auth_keys:
    oidc_state_hash_key_path: "keys/oidc_state_hash.key"
    oidc_state_block_key_path: "keys/oidc_state_block.key"
    jwt_private_key_path: "keys/kaptn_jwt_private.pem"
    jwt_public_key_path: "keys/kaptn_jwt_public.pem"

authz:
  mode: "idp_groups"
  groups_prefix_allowlist: ["kaptn-", "oncall-"]
  default_groups: ["kaptn-viewers"]

kubernetes:
  mode: "incluster"
  namespace_default: "default"
  cluster_name: "production"
  qps: 100
  burst: 200
  logs_qps: 20
  logs_burst: 40

features:
  enable_apply: true
  enable_nodes_actions: true
  enable_overview: true
  enable_prometheus_analytics: true

rate_limits:
  apply_per_minute: 10
  actions_per_minute: 20

logging:
  level: "info"
  format: "json"
  file: "/var/log/kaptn.log"

integrations:
  prometheus:
    url: "http://prometheus.monitoring.svc:9090"
    timeout: "5s"
    enabled: true

caching:
  overview_ttl: "2s"
  analytics_ttl: "60s"
  summary_ttl: "30s"
  search_cache_ttl: "30s"
  search_cache_max_size: 10000
  logs_cache:
    ttl: "10m"
    max_global: 250000
    max_per_scope: 20000
    max_subscribers: 200
    buffer_size: 100
    eviction_interval: "30s"
    cleanup_interval: "5m"
    background_collection_enabled: true
    background_collection_retention: "1h"

timeseries:
  enabled: true
  window: "60m"
  tick_interval: "1s"
  capacity_refresh_interval: "30s"
  hi_res:
    step: "1s"
  lo_res:
    step: "5s"
  max_series: 1000
  max_points_per_series: 10000
  max_ws_clients: 500

actions:
  idempotency_ttl: "10m"
  default_concurrency: 8
  max_concurrency: 32
  denied_namespaces: []
  denied_labels: {}
  action_allowlist: []
  action_denylist: []
```

## Usage Examples

### Basic Configuration Loading
```go
package main

import (
    "log"
    "github.com/example/kaptn/internal/config"
)

func main() {
    // Load configuration from environment variables
    cfg, err := config.Load()
    if err != nil {
        log.Fatal("Failed to load config:", err)
    }
    
    // Validate configuration
    if err := cfg.Validate(); err != nil {
        log.Fatal("Invalid configuration:", err)
    }
    
    // Use configuration
    fmt.Printf("Starting server on %s\n", cfg.Server.Addr)
}
```

### File-Based Configuration
```go
func loadProductionConfig() (*config.Config, error) {
    // Load from YAML file with environment overrides
    cfg, err := config.LoadFromFile("/etc/kaptn/config.yaml")
    if err != nil {
        return nil, fmt.Errorf("failed to load config file: %w", err)
    }
    
    // Validate configuration
    if err := cfg.Validate(); err != nil {
        return nil, fmt.Errorf("invalid configuration: %w", err)
    }
    
    return cfg, nil
}
```

### Service-Specific Configuration
```go
// Extract logs service configuration
logsConfig, err := cfg.GetLogsServiceConfig()
if err != nil {
    return fmt.Errorf("invalid logs config: %w", err)
}

// Create logs service with configuration
logsService := logs.NewService(logger, kubeClient, logsConfig)

// Extract summary service configuration
summaryConfig := cfg.GetSummaryConfig()
summaryService := summary.NewService(logger, kubeClient, summaryConfig)
```

### Configuration Debugging
```go
func debugConfiguration(cfg *config.Config) {
    fmt.Printf("Server: %s\n", cfg.Server.Addr)
    fmt.Printf("Auth Mode: %s\n", cfg.Security.AuthMode)
    fmt.Printf("Kubernetes Mode: %s\n", cfg.Kubernetes.Mode)
    fmt.Printf("Features: %+v\n", cfg.Features)
    fmt.Printf("Cache TTL: %s\n", cfg.Caching.OverviewTTL)
    
    if cfg.Security.AuthMode == "oidc" {
        fmt.Printf("OIDC Issuer: %s\n", cfg.Security.OIDC.Issuer)
        fmt.Printf("OIDC Scopes: %v\n", cfg.Security.OIDC.Scopes)
    }
}
```

## Configuration Validation

### Built-in Validation Rules
```go
func (c *Config) Validate() error {
    // Server validation
    if c.Server.Addr == "" {
        return fmt.Errorf("server address cannot be empty")
    }
    
    // OIDC validation
    if c.Security.AuthMode == "oidc" {
        if c.Server.CookieSecret == "" {
            return fmt.Errorf("cookie secret is required when auth mode is 'oidc'")
        }
        if len(c.Server.CookieSecret) < 32 {
            return fmt.Errorf("cookie secret must be at least 32 characters long")
        }
        if c.Security.OIDC.Issuer == "" {
            return fmt.Errorf("OIDC issuer is required when auth mode is 'oidc'")
        }
        if c.Security.OIDC.ClientID == "" {
            return fmt.Errorf("OIDC client ID is required when auth mode is 'oidc'")
        }
    }
    
    // Kubernetes validation
    if c.Kubernetes.Mode != "incluster" && c.Kubernetes.Mode != "kubeconfig" {
        return fmt.Errorf("kubernetes mode must be 'incluster' or 'kubeconfig'")
    }
    
    // Rate limiting validation
    if c.Kubernetes.QPS < 0 {
        return fmt.Errorf("kubernetes QPS must be non-negative")
    }
    if c.Kubernetes.Burst < 0 {
        return fmt.Errorf("kubernetes burst must be non-negative")
    }
    if c.Kubernetes.Burst > 0 && c.Kubernetes.QPS > 0 && 
       float32(c.Kubernetes.Burst) < c.Kubernetes.QPS {
        return fmt.Errorf("kubernetes burst (%d) must be >= QPS (%.1f)", 
            c.Kubernetes.Burst, c.Kubernetes.QPS)
    }
    
    return nil
}
```

### Custom Validation
```go
func validateProductionConfig(cfg *config.Config) error {
    // Production-specific validation
    if cfg.Security.AuthMode == "none" {
        return fmt.Errorf("authentication must be enabled in production")
    }
    
    if !cfg.Security.TLS.Enabled {
        return fmt.Errorf("TLS must be enabled in production")
    }
    
    if cfg.Server.CookieSecret == "" || len(cfg.Server.CookieSecret) < 32 {
        return fmt.Errorf("strong cookie secret required in production")
    }
    
    return nil
}
```

## Configuration Patterns

### Development Configuration
```bash
# Development environment variables
export KAPTN_AUTH_MODE=none
export KAPTN_KUBE_MODE=kubeconfig
export KUBECONFIG=$HOME/.kube/config
export KAPTN_KUBE_INSECURE_TLS=true
export LOG_LEVEL=debug
export KAPTN_LOG_FORMAT=console
```

### Production Configuration
```bash
# Production environment variables
export KAPTN_AUTH_MODE=oidc
export KAPTN_KUBE_MODE=incluster
export KAPTN_TLS_ENABLED=true
export KAPTN_TLS_CERT_FILE=/etc/ssl/certs/kaptn.crt
export KAPTN_TLS_KEY_FILE=/etc/ssl/private/kaptn.key
export KAPTN_COOKIE_SECRET="$(openssl rand -hex 32)"
export LOG_LEVEL=info
export KAPTN_LOG_FORMAT=json
```

### Container Configuration
```dockerfile
# Dockerfile environment defaults
ENV KAPTN_SERVER_ADDR=0.0.0.0:8080
ENV KAPTN_KUBE_MODE=incluster
ENV KAPTN_AUTH_MODE=oidc
ENV LOG_LEVEL=info
ENV KAPTN_LOG_FORMAT=json

# Mount configuration and secrets
VOLUME ["/etc/kaptn", "/var/log"]
```

## Advanced Features

### Service Configuration Extractors

#### Logs Service Configuration:
```go
func (c *Config) GetLogsServiceConfig() (LogsServiceConfig, error) {
    // Parse duration strings
    globalMaxAge, err := time.ParseDuration(c.Caching.LogsCache.TTL)
    if err != nil {
        return LogsServiceConfig{}, fmt.Errorf("invalid logs cache TTL: %w", err)
    }
    
    evictionInterval, err := time.ParseDuration(c.Caching.LogsCache.EvictionInterval)
    if err != nil {
        return LogsServiceConfig{}, fmt.Errorf("invalid eviction interval: %w", err)
    }
    
    return LogsServiceConfig{
        GlobalMaxEntries:      c.Caching.LogsCache.MaxGlobal,
        GlobalMaxAge:          globalMaxAge,
        ScopeMaxEntries:       c.Caching.LogsCache.MaxPerScope,
        MaxSubscribers:        c.Caching.LogsCache.MaxSubscribers,
        BufferSize:           c.Caching.LogsCache.BufferSize,
        EvictionInterval:     evictionInterval,
        // ... additional fields
    }, nil
}
```

#### Summary Service Configuration:
```go
func (c *Config) GetSummaryConfig() map[string]interface{} {
    return map[string]interface{}{
        "enable_websocket_updates": true,
        "realtime_resources":       []string{"pods", "nodes", "deployments", "services"},
        "cache_ttl": map[string]string{
            "pods":         "5s",
            "nodes":        "10s",
            "deployments":  "15s",
            "services":     "30s",
        },
        "max_cache_size":     1000,
        "background_refresh": true,
        "default_ttl":        c.Caching.SummaryTTL,
    }
}
```

### Configuration Merging

The config package implements sophisticated merging logic where environment variables take precedence over file configuration:

```go
func mergeConfigs(envConfig, fileConfig *Config) *Config {
    // Start with file config as base
    result := *fileConfig
    
    // Override with environment values
    if envValue := os.Getenv("KAPTN_SERVER_ADDR"); envValue != "" {
        result.Server.Addr = envValue
    }
    
    // Handle boolean variables
    if envValue := os.Getenv("KAPTN_ENABLE_APPLY"); envValue != "" {
        if parsed, err := strconv.ParseBool(envValue); err == nil {
            result.Features.EnableApply = parsed
        }
    }
    
    // Handle slice variables
    if envValue := os.Getenv("KAPTN_OIDC_SCOPES"); envValue != "" {
        scopes := strings.Split(envValue, ",")
        result.Security.OIDC.Scopes = scopes
    }
    
    return &result
}
```

## Testing

### Configuration Testing
```go
func TestLoad(t *testing.T) {
    // Test default configuration
    cfg, err := config.Load()
    assert.NoError(t, err)
    assert.Equal(t, "0.0.0.0:8080", cfg.Server.Addr)
    assert.Equal(t, "info", cfg.Logging.Level)
}

func TestLoadWithEnvironmentVariables(t *testing.T) {
    // Set test environment variables
    os.Setenv("PORT", "9090")
    os.Setenv("LOG_LEVEL", "debug")
    defer func() {
        os.Unsetenv("PORT")
        os.Unsetenv("LOG_LEVEL")
    }()
    
    cfg, err := config.Load()
    assert.NoError(t, err)
    assert.Equal(t, "0.0.0.0:9090", cfg.Server.Addr)
    assert.Equal(t, "debug", cfg.Logging.Level)
}

func TestValidate(t *testing.T) {
    tests := []struct {
        name      string
        config    config.Config
        wantError bool
    }{
        {
            name: "valid config",
            config: config.Config{
                Server:     config.ServerConfig{Addr: "0.0.0.0:8080"},
                Kubernetes: config.KubernetesConfig{Mode: "kubeconfig"},
                Security:   config.SecurityConfig{AuthMode: "none"},
            },
            wantError: false,
        },
        {
            name: "invalid auth mode",
            config: config.Config{
                Server:     config.ServerConfig{Addr: "0.0.0.0:8080"},
                Kubernetes: config.KubernetesConfig{Mode: "kubeconfig"},
                Security:   config.SecurityConfig{AuthMode: "invalid"},
            },
            wantError: true,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := tt.config.Validate()
            assert.Equal(t, tt.wantError, err != nil)
        })
    }
}
```

## Security Considerations

### Sensitive Configuration
- **Cookie Secret**: Must be at least 32 characters for cryptographic security
- **OIDC Client Secret**: Store in secure environment variable or secret manager
- **TLS Certificates**: Proper file permissions and secure storage
- **Authentication Keys**: Secure file system permissions and rotation procedures

### Configuration Security Best Practices
- **Environment Variables**: Use for sensitive values rather than config files
- **File Permissions**: Restrict config file access (600 or 640)
- **Secret Rotation**: Regular rotation of authentication keys and secrets
- **Validation**: Comprehensive validation prevents misconfigurations

## Best Practices

### Configuration Management
- **Environment-Specific**: Use different configuration strategies for dev/staging/prod
- **Documentation**: Document all configuration options and their effects
- **Validation**: Always validate configuration before service startup
- **Monitoring**: Monitor configuration changes and their effects

### Deployment Patterns
- **ConfigMaps**: Use Kubernetes ConfigMaps for non-sensitive configuration
- **Secrets**: Use Kubernetes Secrets for sensitive configuration values
- **Init Containers**: Use init containers for configuration file generation
- **Health Checks**: Include configuration validation in readiness probes

## Future Enhancements

### Planned Features
- **Configuration Hot Reload**: Runtime configuration updates without restart
- **Configuration Validation API**: Endpoint for validating configuration before deployment
- **Configuration Templates**: Template-based configuration generation
- **Dynamic Feature Flags**: Runtime feature flag toggling

### Extensibility Points
- **Custom Validators**: Pluggable configuration validation rules
- **Configuration Sources**: Additional configuration sources (Consul, etcd)
- **Configuration Encryption**: Encrypted configuration file support
- **Configuration Versioning**: Configuration schema versioning and migration

## Dependencies

### External Dependencies
- `gopkg.in/yaml.v3` - YAML configuration file parsing
- Standard library packages: `os`, `strconv`, `strings`, `time`, `fmt`

### Internal Dependencies
- No dependencies on other internal packages (foundational package)

This documentation provides comprehensive coverage of the config package, serving as both a developer reference for configuration management and an operational guide for deploying and configuring Kaptn in various environments.