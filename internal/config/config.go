package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Config represents the application configuration
type Config struct {
	Server       ServerConfig       `yaml:"server"`
	Security     SecurityConfig     `yaml:"security"`
	Authz        AuthzConfig        `yaml:"authz"`
	Bindings     BindingsConfig     `yaml:"bindings"`
	Kubernetes   KubernetesConfig   `yaml:"kubernetes"`
	Features     FeaturesConfig     `yaml:"features"`
	RateLimits   RateLimitsConfig   `yaml:"rate_limits"`
	Logging      LoggingConfig      `yaml:"logging"`
	Integrations IntegrationsConfig `yaml:"integrations"`
	Caching      CachingConfig      `yaml:"caching"`
	Jobs         JobsConfig         `yaml:"jobs"`
	Timeseries   TimeseriesConfig   `yaml:"timeseries"`
	Actions      ActionsConfig      `yaml:"actions"`
}

// ServerConfig represents the server configuration
type ServerConfig struct {
	Addr         string     `yaml:"addr"`
	BasePath     string     `yaml:"base_path"`
	CORS         CORSConfig `yaml:"cors"`
	CookieSecret string     `yaml:"cookie_secret"`
	SessionTTL   string     `yaml:"session_ttl"`
}

// CORSConfig represents the CORS configuration
type CORSConfig struct {
	AllowOrigins []string `yaml:"allow_origins"`
	AllowMethods []string `yaml:"allow_methods"`
}

// SecurityConfig represents the security configuration
type SecurityConfig struct {
	AuthMode       string     `yaml:"auth_mode"`
	OIDC           OIDCConfig `yaml:"oidc"`
	TLS            TLSConfig  `yaml:"tls"`
	UsernameFormat string     `yaml:"username_format"`
}

// OIDCConfig represents the OIDC configuration
type OIDCConfig struct {
	Issuer       string   `yaml:"issuer"`
	ClientID     string   `yaml:"client_id"`
	ClientSecret string   `yaml:"client_secret"`
	RedirectURL  string   `yaml:"redirect_url"`
	Scopes       []string `yaml:"scopes"`
	Audience     string   `yaml:"audience"`
	JWKSURL      string   `yaml:"jwks_url"`
}

// TLSConfig represents TLS configuration
type TLSConfig struct {
	Enabled  bool   `yaml:"enabled"`
	CertFile string `yaml:"cert_file"`
	KeyFile  string `yaml:"key_file"`
}

// AuthzConfig represents authorization configuration
type AuthzConfig struct {
	Mode                  string   `yaml:"mode"`                    // "idp_groups" or "user_bindings"
	GroupsFilter          []string `yaml:"groups_filter"`           // Filter allowed groups in idp_groups mode
	GroupsPrefixAllowlist []string `yaml:"groups_prefix_allowlist"` // e.g. ["kaptn-", "oncall-"]
	DefaultGroups         []string `yaml:"default_groups"`          // e.g. ["kaptn-viewers"] or empty for deny
}

// BindingsConfig represents user bindings configuration
type BindingsConfig struct {
	Source    string           `yaml:"source"` // "configmap" or "sqlite"
	ConfigMap ConfigMapBinding `yaml:"configmap"`
	SQLite    SQLiteBinding    `yaml:"sqlite"`
}

// ConfigMapBinding represents ConfigMap-based user bindings
type ConfigMapBinding struct {
	Namespace string `yaml:"namespace"`
	Name      string `yaml:"name"`
}

// SQLiteBinding represents SQLite-based user bindings
type SQLiteBinding struct {
	DSN string `yaml:"dsn"`
}

// KubernetesConfig represents the Kubernetes configuration
type KubernetesConfig struct {
	Mode             string  `yaml:"mode"`
	KubeconfigPath   string  `yaml:"kubeconfig_path"`
	NamespaceDefault string  `yaml:"namespace_default"`
	ClusterName      string  `yaml:"cluster_name"`
	InsecureTLS      bool    `yaml:"insecure_tls"` // Skip TLS verification for development environments
	QPS              float32 `yaml:"qps"`          // Queries per second allowed to API server
	Burst            int     `yaml:"burst"`        // Maximum burst for throttle
}

// FeaturesConfig represents the features configuration
type FeaturesConfig struct {
	EnableApply               bool `yaml:"enable_apply"`
	EnableNodeActions         bool `yaml:"enable_nodes_actions"`
	EnableOverview            bool `yaml:"enable_overview"`
	EnablePrometheusAnalytics bool `yaml:"enable_prometheus_analytics"`
}

// RateLimitsConfig represents the rate limits configuration
type RateLimitsConfig struct {
	ApplyPerMinute   int `yaml:"apply_per_minute"`
	ActionsPerMinute int `yaml:"actions_per_minute"`
}

// LoggingConfig represents the logging configuration
type LoggingConfig struct {
	Level  string `yaml:"level"`
	File   string `yaml:"file"`   // Path to the log file. If empty, logs only to stdout.
	Format string `yaml:"format"` // "json" or "console"
}

// IntegrationsConfig represents external integrations configuration
type IntegrationsConfig struct {
	Prometheus PrometheusConfig `yaml:"prometheus"`
}

// PrometheusConfig represents Prometheus integration configuration
type PrometheusConfig struct {
	URL     string `yaml:"url"`
	Timeout string `yaml:"timeout"`
	Enabled bool   `yaml:"enabled"`
}

// CachingConfig represents caching configuration
type CachingConfig struct {
	OverviewTTL    string `yaml:"overview_ttl"`
	AnalyticsTTL   string `yaml:"analytics_ttl"`
	SummaryTTL     string `yaml:"summary_ttl"`
	SearchCacheTTL string `yaml:"search_cache_ttl"`
	SearchMaxSize  int    `yaml:"search_cache_max_size"`

	// Logs cache configuration
	LogsCache LogsCacheConfig `yaml:"logs_cache"`
}

// LogsCacheConfig represents the logs cache configuration
type LogsCacheConfig struct {
	// Basic cache settings
	TTL            string `yaml:"ttl"`
	MaxGlobal      int    `yaml:"max_global"`
	MaxPerScope    int    `yaml:"max_per_scope"`
	MaxSubscribers int    `yaml:"max_subscribers"`
	BufferSize     int    `yaml:"buffer_size"`

	// Cleanup intervals
	EvictionInterval string `yaml:"eviction_interval"`
	CleanupInterval  string `yaml:"cleanup_interval"`

	// Background log collection configuration
	BackgroundCollectionEnabled   bool   `yaml:"background_collection_enabled"`
	BackgroundCollectionRetention string `yaml:"background_collection_retention"`
	BackgroundCollectionInterval  string `yaml:"background_collection_interval"`

	// Operational limits (Phase 10)
	MaxStreamsPerUser     int    `yaml:"max_streams_per_user"`
	MaxQueryLimit         int    `yaml:"max_query_limit"`
	MaxExportSize         int64  `yaml:"max_export_size"`
	MaxConcurrentQueries  int    `yaml:"max_concurrent_queries"`
	RateLimitPerSecond    int    `yaml:"rate_limit_per_second"`
	BackpressureThreshold int    `yaml:"backpressure_threshold"`
	DegradedModeTimeout   string `yaml:"degraded_mode_timeout"`
}

// JobsConfig represents job management configuration
type JobsConfig struct {
	PersistenceEnabled bool   `yaml:"persistence_enabled"`
	StorePath          string `yaml:"store_path"`
	CleanupInterval    string `yaml:"cleanup_interval"`
	MaxAge             string `yaml:"max_age"`
}

// TimeseriesConfig represents time series collection configuration
type TimeseriesConfig struct {
	Enabled                 bool   `yaml:"enabled"`
	Window                  string `yaml:"window"`
	TickInterval            string `yaml:"tick_interval"`
	CapacityRefreshInterval string `yaml:"capacity_refresh_interval"`
	HiRes                   struct {
		Step string `yaml:"step"`
	} `yaml:"hi_res"`
	LoRes struct {
		Step string `yaml:"step"`
	} `yaml:"lo_res"`

	// Health and guardrails
	MaxSeries          int `yaml:"max_series"`
	MaxPointsPerSeries int `yaml:"max_points_per_series"`
	MaxWSClients       int `yaml:"max_ws_clients"`
	WSReadLimit        int `yaml:"ws_read_limit"`        // WebSocket read buffer limit in bytes
	WSWriteBufferSize  int `yaml:"ws_write_buffer_size"` // WebSocket write channel buffer size

	// Feature flags
	DisableNetworkIfUnavailable bool `yaml:"disable_network_if_unavailable"`
}

// ActionsConfig configures action execution behavior
type ActionsConfig struct {
	IdempotencyTTL     string `yaml:"idempotency_ttl"`
	DefaultConcurrency int    `yaml:"default_concurrency"`
	MaxConcurrency     int    `yaml:"max_concurrency"`
	// Safety + policy tuning
	DeniedNamespaces []string          `yaml:"denied_namespaces"`
	DeniedLabels     map[string]string `yaml:"denied_labels"`
	ActionAllowlist  []string          `yaml:"action_allowlist"` // entries like "delete:customresourcedefinitions"
	ActionDenylist   []string          `yaml:"action_denylist"`  // entries like "delete:namespaces"
}

// Load loads the configuration from environment variables and defaults
func Load() (*Config, error) {
	return loadWithDefaults("")
}

// LoadFromFile loads configuration from a YAML file, with environment variable overrides
func LoadFromFile(configPath string) (*Config, error) {
	return loadWithDefaults(configPath)
}

// loadWithDefaults loads configuration with defaults, optionally from a file
func loadWithDefaults(configPath string) (*Config, error) {
	cfg := &Config{
		Server: ServerConfig{
			Addr:         getEnv("KAPTN_SERVER_ADDR", "0.0.0.0:8080"),
			BasePath:     getEnv("KAPTN_BASE_PATH", "/"),
			CookieSecret: getEnv("KAPTN_COOKIE_SECRET", ""), // Required in production
			SessionTTL:   getEnv("KAPTN_SESSION_TTL", "12h"),
			CORS: CORSConfig{
				AllowOrigins: []string{"*"},
				AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			},
		},
		Security: SecurityConfig{
			AuthMode:       getEnv("KAPTN_AUTH_MODE", "oidc"),
			UsernameFormat: getEnv("KAPTN_USERNAME_FORMAT", "oidc:{sub}"), // prefer sub over email
			OIDC: OIDCConfig{
				Issuer:       getEnv("KAPTN_OIDC_ISSUER", ""),
				ClientID:     getEnv("KAPTN_OIDC_CLIENT_ID", ""),
				ClientSecret: getEnv("KAPTN_OIDC_CLIENT_SECRET", ""),
				RedirectURL:  getEnv("KAPTN_OIDC_REDIRECT_URL", ""),
				Audience:     getEnv("KAPTN_OIDC_AUDIENCE", ""),
				Scopes:       getEnvStringSlice("KAPTN_OIDC_SCOPES", []string{"openid", "profile", "email", "groups"}),
			},
			TLS: TLSConfig{
				Enabled:  getEnvBool("KAPTN_TLS_ENABLED", false),
				CertFile: getEnv("KAPTN_TLS_CERT_FILE", ""),
				KeyFile:  getEnv("KAPTN_TLS_KEY_FILE", ""),
			},
		},
		Authz: AuthzConfig{
			Mode:                  getEnv("KAPTN_AUTHZ_MODE", "idp_groups"),                       // idp_groups | user_bindings
			GroupsPrefixAllowlist: getEnvStringSlice("KAPTN_GROUPS_PREFIX_ALLOWLIST", []string{}), // e.g. ["kaptn-","oncall-"]
			DefaultGroups:         getEnvStringSlice("KAPTN_DEFAULT_GROUPS", []string{}),          // e.g. ["kaptn-viewers"] or empty for deny
		},
		Bindings: BindingsConfig{
			Source: getEnv("KAPTN_BINDINGS_SOURCE", "configmap"), // configmap | sqlite
			ConfigMap: ConfigMapBinding{
				Namespace: getEnv("KAPTN_BINDINGS_CONFIGMAP_NAMESPACE", "kaptn"),
				Name:      getEnv("KAPTN_BINDINGS_CONFIGMAP_NAME", "kaptn-authz"),
			},
			SQLite: SQLiteBinding{
				DSN: getEnv("KAPTN_BINDINGS_SQLITE_DSN", "file:/data/kaptn.db?_fk=1"),
			},
		},
		Kubernetes: KubernetesConfig{
			Mode:             getEnv("KAPTN_KUBE_MODE", "kubeconfig"),
			KubeconfigPath:   getEnv("KUBECONFIG", ""),
			NamespaceDefault: getEnv("KAPTN_NAMESPACE_DEFAULT", "default"),
			ClusterName:      getEnv("KAPTN_CLUSTER_NAME", "default"),
			InsecureTLS:      getEnvBool("KAPTN_KUBE_INSECURE_TLS", false),
			QPS:              float32(getEnvInt("KAPTN_KUBE_QPS", 100)), // Default 100 QPS
			Burst:            getEnvInt("KAPTN_KUBE_BURST", 200),        // Default 200 burst
		},
		Features: FeaturesConfig{
			EnableApply:               getEnvBool("KAPTN_ENABLE_APPLY", true),
			EnableNodeActions:         getEnvBool("KAPTN_ENABLE_NODE_ACTIONS", true),
			EnableOverview:            getEnvBool("KAPTN_ENABLE_OVERVIEW", true),
			EnablePrometheusAnalytics: getEnvBool("KAPTN_ENABLE_PROMETHEUS_ANALYTICS", true),
		},
		RateLimits: RateLimitsConfig{
			ApplyPerMinute:   getEnvInt("KAPTN_APPLY_PER_MINUTE", 10),
			ActionsPerMinute: getEnvInt("KAPTN_ACTIONS_PER_MINUTE", 20),
		},
		Logging: LoggingConfig{
			Level:  getEnv("LOG_LEVEL", "info"),
			File:   getEnv("KAPTN_LOG_FILE", ""),
			Format: getEnv("KAPTN_LOG_FORMAT", "json"),
		},
		Integrations: IntegrationsConfig{
			Prometheus: PrometheusConfig{
				URL:     getEnv("KAPTN_PROMETHEUS_URL", "http://prometheus.monitoring.svc:9090"),
				Timeout: getEnv("KAPTN_PROMETHEUS_TIMEOUT", "5s"),
				Enabled: getEnvBool("KAPTN_PROMETHEUS_ENABLED", true),
			},
		},
		Caching: CachingConfig{
			OverviewTTL:    getEnv("KAPTN_OVERVIEW_TTL", "2s"),
			AnalyticsTTL:   getEnv("KAPTN_ANALYTICS_TTL", "60s"),
			SummaryTTL:     getEnv("KAPTN_SUMMARY_TTL", "30s"),
			SearchCacheTTL: getEnv("KAPTN_SEARCH_CACHE_TTL", "30s"),
			SearchMaxSize:  getEnvInt("KAPTN_SEARCH_MAX_SIZE", 10000),

			LogsCache: LogsCacheConfig{
				TTL:              getEnv("KAPTN_LOGS_TTL", "10m"),
				MaxGlobal:        getEnvInt("KAPTN_LOGS_MAX_GLOBAL", 250000),
				MaxPerScope:      getEnvInt("KAPTN_LOGS_MAX_PER_SCOPE", 20000),
				MaxSubscribers:   getEnvInt("KAPTN_LOGS_MAX_SUBSCRIBERS", 200),
				BufferSize:       getEnvInt("KAPTN_LOGS_BUFFER_SIZE", 100),
				EvictionInterval: getEnv("KAPTN_LOGS_EVICTION_INTERVAL", "30s"),
				CleanupInterval:  getEnv("KAPTN_LOGS_CLEANUP_INTERVAL", "5m"),

				// Background collection settings
				BackgroundCollectionEnabled:   getEnvBool("KAPTN_LOGS_BACKGROUND_COLLECTION_ENABLED", true),
				BackgroundCollectionRetention: getEnv("KAPTN_LOGS_BACKGROUND_COLLECTION_RETENTION", "1h"),
				BackgroundCollectionInterval:  getEnv("KAPTN_LOGS_BACKGROUND_COLLECTION_INTERVAL", "30s"),

				MaxStreamsPerUser:     getEnvInt("KAPTN_LOGS_MAX_STREAMS_PER_USER", 50),
				MaxQueryLimit:         getEnvInt("KAPTN_LOGS_MAX_QUERY_LIMIT", 10000),
				MaxExportSize:         int64(getEnvInt("KAPTN_LOGS_MAX_EXPORT_SIZE", 100*1024*1024)), // 100MB
				MaxConcurrentQueries:  getEnvInt("KAPTN_LOGS_MAX_CONCURRENT_QUERIES", 20),
				RateLimitPerSecond:    getEnvInt("KAPTN_LOGS_RATE_LIMIT_PER_SECOND", 1000),
				BackpressureThreshold: getEnvInt("KAPTN_LOGS_BACKPRESSURE_THRESHOLD", 80),
				DegradedModeTimeout:   getEnv("KAPTN_LOGS_DEGRADED_MODE_TIMEOUT", "5m"),
			},
		},
		Jobs: JobsConfig{
			PersistenceEnabled: getEnvBool("KAPTN_JOBS_PERSISTENCE_ENABLED", true),
			StorePath:          getEnv("KAPTN_JOBS_STORE_PATH", "./data/jobs"),
			CleanupInterval:    getEnv("KAPTN_JOBS_CLEANUP_INTERVAL", "1h"),
			MaxAge:             getEnv("KAPTN_JOBS_MAX_AGE", "24h"),
		},
		Timeseries: TimeseriesConfig{
			Enabled:                 getEnvBool("KAPTN_TIMESERIES_ENABLED", true),
			Window:                  getEnv("KAPTN_TIMESERIES_WINDOW", "60m"),
			TickInterval:            getEnv("KAPTN_TIMESERIES_TICK_INTERVAL", "1s"),
			CapacityRefreshInterval: getEnv("KAPTN_TIMESERIES_CAPACITY_REFRESH_INTERVAL", "30s"),
			HiRes: struct {
				Step string `yaml:"step"`
			}{
				Step: getEnv("KAPTN_TIMESERIES_HI_RES_STEP", "1s"),
			},
			LoRes: struct {
				Step string `yaml:"step"`
			}{
				Step: getEnv("KAPTN_TIMESERIES_LO_RES_STEP", "5s"),
			},
			MaxSeries:                   getEnvInt("KAPTN_TIMESERIES_MAX_SERIES", 1000),
			MaxPointsPerSeries:          getEnvInt("KAPTN_TIMESERIES_MAX_POINTS_PER_SERIES", 10000),
			MaxWSClients:                getEnvInt("KAPTN_TIMESERIES_MAX_WS_CLIENTS", 500),
			WSReadLimit:                 getEnvInt("KAPTN_TIMESERIES_WS_READ_LIMIT", 4096),
			WSWriteBufferSize:           getEnvInt("KAPTN_TIMESERIES_WS_WRITE_BUFFER_SIZE", 1024),
			DisableNetworkIfUnavailable: getEnvBool("KAPTN_TIMESERIES_DISABLE_NETWORK_IF_UNAVAILABLE", true),
		},
		Actions: ActionsConfig{
			IdempotencyTTL:     getEnv("KAPTN_ACTIONS_IDEMPOTENCY_TTL", "10m"),
			DefaultConcurrency: getEnvInt("KAPTN_ACTIONS_DEFAULT_CONCURRENCY", 8),
			MaxConcurrency:     getEnvInt("KAPTN_ACTIONS_MAX_CONCURRENCY", 32),
			DeniedNamespaces:   []string{},
			DeniedLabels:       map[string]string{},
			ActionAllowlist:    []string{},
			ActionDenylist:     []string{},
		},
	}

	// If a config file path is provided, load and merge it
	if configPath != "" {
		fileConfig, err := loadFromYAMLFile(configPath)
		if err != nil {
			return nil, fmt.Errorf("failed to load config from file %s: %w", configPath, err)
		}
		// Merge file config with defaults, environment variables take precedence
		cfg = mergeConfigs(cfg, fileConfig)
	}

	// Override port if PORT env var is set
	if port := getEnv("PORT", ""); port != "" {
		cfg.Server.Addr = "0.0.0.0:" + port
	}

	return cfg, nil
}

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

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
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
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				result = append(result, trimmed)
			}
		}
		return result
	}
	return defaultValue
}

// loadFromYAMLFile loads configuration from a YAML file
func loadFromYAMLFile(configPath string) (*Config, error) {
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to unmarshal YAML: %w", err)
	}

	return &config, nil
}

// mergeConfigs merges file config with environment-based config
// Environment variables take precedence over file values
func mergeConfigs(envConfig, fileConfig *Config) *Config {
	// Start with file config as base
	result := *fileConfig

	// Override with environment values if they are not defaults
	if envValue := os.Getenv("KAPTN_SERVER_ADDR"); envValue != "" {
		result.Server.Addr = envValue
	}
	if envValue := os.Getenv("KAPTN_BASE_PATH"); envValue != "" {
		result.Server.BasePath = envValue
	}
	if envValue := os.Getenv("KAPTN_COOKIE_SECRET"); envValue != "" {
		result.Server.CookieSecret = envValue
	}
	if envValue := os.Getenv("KAPTN_SESSION_TTL"); envValue != "" {
		result.Server.SessionTTL = envValue
	}
	if envValue := os.Getenv("KAPTN_AUTH_MODE"); envValue != "" {
		result.Security.AuthMode = envValue
	}
	if envValue := os.Getenv("KAPTN_USERNAME_FORMAT"); envValue != "" {
		result.Security.UsernameFormat = envValue
	}
	if envValue := os.Getenv("KAPTN_KUBE_MODE"); envValue != "" {
		result.Kubernetes.Mode = envValue
	}
	if envValue := os.Getenv("KUBECONFIG"); envValue != "" {
		result.Kubernetes.KubeconfigPath = envValue
	}
	if envValue := os.Getenv("KAPTN_NAMESPACE_DEFAULT"); envValue != "" {
		result.Kubernetes.NamespaceDefault = envValue
	}
	if envValue := os.Getenv("KAPTN_CLUSTER_NAME"); envValue != "" {
		result.Kubernetes.ClusterName = envValue
	}
	if envValue := os.Getenv("KAPTN_KUBE_INSECURE_TLS"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Kubernetes.InsecureTLS = parsed
		}
	}
	if envValue := os.Getenv("KAPTN_KUBE_QPS"); envValue != "" {
		if parsed, err := strconv.Atoi(envValue); err == nil {
			result.Kubernetes.QPS = float32(parsed)
		}
	}
	if envValue := os.Getenv("KAPTN_KUBE_BURST"); envValue != "" {
		if parsed, err := strconv.Atoi(envValue); err == nil {
			result.Kubernetes.Burst = parsed
		}
	}
	if envValue := os.Getenv("LOG_LEVEL"); envValue != "" {
		result.Logging.Level = envValue
	}
	if envValue := os.Getenv("KAPTN_LOG_FILE"); envValue != "" {
		result.Logging.File = envValue
	}
	if envValue := os.Getenv("KAPTN_LOG_FORMAT"); envValue != "" {
		result.Logging.Format = envValue
	}
	if envValue := os.Getenv("PORT"); envValue != "" {
		result.Server.Addr = "0.0.0.0:" + envValue
	}

	// Handle boolean environment variables
	if envValue := os.Getenv("KAPTN_ENABLE_APPLY"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Features.EnableApply = parsed
		}
	}
	if envValue := os.Getenv("KAPTN_ENABLE_NODE_ACTIONS"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Features.EnableNodeActions = parsed
		}
	}
	if envValue := os.Getenv("KAPTN_ENABLE_OVERVIEW"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Features.EnableOverview = parsed
		}
	}
	if envValue := os.Getenv("KAPTN_ENABLE_PROMETHEUS_ANALYTICS"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Features.EnablePrometheusAnalytics = parsed
		}
	}

	// Handle Prometheus configuration
	if envValue := os.Getenv("KAPTN_PROMETHEUS_URL"); envValue != "" {
		result.Integrations.Prometheus.URL = envValue
	}
	if envValue := os.Getenv("KAPTN_PROMETHEUS_TIMEOUT"); envValue != "" {
		result.Integrations.Prometheus.Timeout = envValue
	}
	if envValue := os.Getenv("KAPTN_PROMETHEUS_ENABLED"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Integrations.Prometheus.Enabled = parsed
		}
	}

	// Handle OIDC configuration
	if envValue := os.Getenv("KAPTN_OIDC_ISSUER"); envValue != "" {
		result.Security.OIDC.Issuer = envValue
	}
	if envValue := os.Getenv("KAPTN_OIDC_CLIENT_ID"); envValue != "" {
		result.Security.OIDC.ClientID = envValue
	}
	if envValue := os.Getenv("KAPTN_OIDC_CLIENT_SECRET"); envValue != "" {
		result.Security.OIDC.ClientSecret = envValue
	}
	if envValue := os.Getenv("KAPTN_OIDC_REDIRECT_URL"); envValue != "" {
		result.Security.OIDC.RedirectURL = envValue
	}
	if envValue := os.Getenv("KAPTN_OIDC_AUDIENCE"); envValue != "" {
		result.Security.OIDC.Audience = envValue
	}
	if envValue := os.Getenv("KAPTN_OIDC_SCOPES"); envValue != "" {
		parts := strings.Split(envValue, ",")
		var scopes []string
		for _, part := range parts {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				scopes = append(scopes, trimmed)
			}
		}
		result.Security.OIDC.Scopes = scopes
	}

	// Handle Authz configuration
	if envValue := os.Getenv("KAPTN_AUTHZ_MODE"); envValue != "" {
		result.Authz.Mode = envValue
	}
	if envValue := os.Getenv("KAPTN_GROUPS_PREFIX_ALLOWLIST"); envValue != "" {
		parts := strings.Split(envValue, ",")
		var prefixes []string
		for _, part := range parts {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				prefixes = append(prefixes, trimmed)
			}
		}
		result.Authz.GroupsPrefixAllowlist = prefixes
	}
	if envValue := os.Getenv("KAPTN_DEFAULT_GROUPS"); envValue != "" {
		parts := strings.Split(envValue, ",")
		var groups []string
		for _, part := range parts {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				groups = append(groups, trimmed)
			}
		}
		result.Authz.DefaultGroups = groups
	}

	// Handle Bindings configuration
	if envValue := os.Getenv("KAPTN_BINDINGS_SOURCE"); envValue != "" {
		result.Bindings.Source = envValue
	}
	if envValue := os.Getenv("KAPTN_BINDINGS_CONFIGMAP_NAMESPACE"); envValue != "" {
		result.Bindings.ConfigMap.Namespace = envValue
	}
	if envValue := os.Getenv("KAPTN_BINDINGS_CONFIGMAP_NAME"); envValue != "" {
		result.Bindings.ConfigMap.Name = envValue
	}
	if envValue := os.Getenv("KAPTN_BINDINGS_SQLITE_DSN"); envValue != "" {
		result.Bindings.SQLite.DSN = envValue
	}

	return &result
}

// Validate validates the configuration
func (c *Config) Validate() error {
	if c.Server.Addr == "" {
		return fmt.Errorf("server address cannot be empty")
	}

	// Validate session configuration for OIDC auth
	if c.Security.AuthMode == "oidc" {
		if c.Server.CookieSecret == "" {
			return fmt.Errorf("cookie secret is required when auth mode is 'oidc'")
		}
		if len(c.Server.CookieSecret) < 32 {
			return fmt.Errorf("cookie secret must be at least 32 characters long")
		}
	}

	if c.Kubernetes.Mode != "incluster" && c.Kubernetes.Mode != "kubeconfig" {
		return fmt.Errorf("kubernetes mode must be 'incluster' or 'kubeconfig'")
	}

	// Validate Kubernetes rate limiting configuration
	if c.Kubernetes.QPS < 0 {
		return fmt.Errorf("kubernetes QPS must be non-negative")
	}
	if c.Kubernetes.Burst < 0 {
		return fmt.Errorf("kubernetes burst must be non-negative")
	}
	if c.Kubernetes.Burst > 0 && c.Kubernetes.QPS > 0 && float32(c.Kubernetes.Burst) < c.Kubernetes.QPS {
		return fmt.Errorf("kubernetes burst (%d) must be greater than or equal to QPS (%.1f)", c.Kubernetes.Burst, c.Kubernetes.QPS)
	}

	if c.Security.AuthMode != "none" && c.Security.AuthMode != "header" && c.Security.AuthMode != "oidc" {
		return fmt.Errorf("auth mode must be 'none', 'header', or 'oidc'")
	}

	// Validate username format
	if c.Security.UsernameFormat != "" {
		if !strings.Contains(c.Security.UsernameFormat, "{sub}") && !strings.Contains(c.Security.UsernameFormat, "{email}") {
			return fmt.Errorf("username format must contain '{sub}' or '{email}' placeholder")
		}
	}

	// Validate OIDC configuration if OIDC auth mode is enabled
	if c.Security.AuthMode == "oidc" {
		if c.Security.OIDC.Issuer == "" {
			return fmt.Errorf("OIDC issuer is required when auth mode is 'oidc'")
		}
		if c.Security.OIDC.ClientID == "" {
			return fmt.Errorf("OIDC client ID is required when auth mode is 'oidc'")
		}
	}

	// Validate authorization configuration
	if c.Authz.Mode != "idp_groups" && c.Authz.Mode != "user_bindings" {
		return fmt.Errorf("authz mode must be 'idp_groups' or 'user_bindings'")
	}

	// Validate bindings configuration if using user_bindings mode
	if c.Authz.Mode == "user_bindings" {
		if c.Bindings.Source != "configmap" && c.Bindings.Source != "sqlite" {
			return fmt.Errorf("bindings source must be 'configmap' or 'sqlite'")
		}

		if c.Bindings.Source == "configmap" {
			if c.Bindings.ConfigMap.Namespace == "" {
				return fmt.Errorf("bindings configmap namespace is required")
			}
			if c.Bindings.ConfigMap.Name == "" {
				return fmt.Errorf("bindings configmap name is required")
			}
		}

		if c.Bindings.Source == "sqlite" {
			if c.Bindings.SQLite.DSN == "" {
				return fmt.Errorf("bindings sqlite DSN is required")
			}
		}
	}

	// Validate TLS configuration
	if c.Security.TLS.Enabled {
		if c.Security.TLS.CertFile == "" {
			return fmt.Errorf("TLS cert file is required when TLS is enabled")
		}
		if c.Security.TLS.KeyFile == "" {
			return fmt.Errorf("TLS key file is required when TLS is enabled")
		}
	}

	return nil
}

// GetSummaryConfig creates a summary service configuration from the main config
func (c *Config) GetSummaryConfig() map[string]interface{} {
	return map[string]interface{}{
		"enable_websocket_updates": true,
		"realtime_resources":       []string{"pods", "nodes", "deployments", "services"},
		"cache_ttl": map[string]string{
			"pods":         "5s",
			"nodes":        "10s",
			"deployments":  "15s",
			"services":     "30s",
			"replicasets":  "30s",
			"statefulsets": "60s",
			"daemonsets":   "60s",
			"configmaps":   "60s",
			"secrets":      "60s",
			"endpoints":    "30s",
		},
		"max_cache_size":     1000,
		"background_refresh": true,
		"default_ttl":        c.Caching.SummaryTTL,
	}
}

// LogsServiceConfig represents the service configuration for logs cache
// This matches the structure expected by the logs package
type LogsServiceConfig struct {
	// Global ring configuration
	GlobalMaxEntries int           `yaml:"global_max_entries"`
	GlobalMaxAge     time.Duration `yaml:"global_max_age"`

	// Per-scope ring configuration
	ScopeMaxEntries int           `yaml:"scope_max_entries"`
	ScopeMaxAge     time.Duration `yaml:"scope_max_age"`

	// Pub/sub configuration
	MaxSubscribers int `yaml:"max_subscribers"`
	BufferSize     int `yaml:"buffer_size"`

	// Cleanup intervals
	EvictionInterval time.Duration `yaml:"eviction_interval"`
	CleanupInterval  time.Duration `yaml:"cleanup_interval"`

	// Background collection
	BackgroundCollectionEnabled   bool   `yaml:"background_collection_enabled"`
	BackgroundCollectionRetention string `yaml:"background_collection_retention"`
	BackgroundCollectionInterval  string `yaml:"background_collection_interval"`

	// Phase 10: Operational guardrails
	MaxStreamsPerUser     int           `yaml:"max_streams_per_user"`
	MaxQueryLimit         int           `yaml:"max_query_limit"`
	MaxExportSize         int64         `yaml:"max_export_size"`
	MaxConcurrentQueries  int           `yaml:"max_concurrent_queries"`
	RateLimitPerSecond    int           `yaml:"rate_limit_per_second"`
	BackpressureThreshold int           `yaml:"backpressure_threshold"`
	DegradedModeTimeout   time.Duration `yaml:"degraded_mode_timeout"`
}

// GetLogsServiceConfig converts the config to a logs service config
func (c *Config) GetLogsServiceConfig() (LogsServiceConfig, error) {
	// Debug: Log what we're reading from config
	fmt.Printf("🔍 [DEBUG] Reading logs config: background_collection_enabled=%v, interval=%s, retention=%s\n",
		c.Caching.LogsCache.BackgroundCollectionEnabled,
		c.Caching.LogsCache.BackgroundCollectionInterval,
		c.Caching.LogsCache.BackgroundCollectionRetention)

	// Set defaults for empty values
	ttl := c.Caching.LogsCache.TTL
	if ttl == "" {
		ttl = "1h" // Default 1 hour
	}

	evictionIntervalStr := c.Caching.LogsCache.EvictionInterval
	if evictionIntervalStr == "" {
		evictionIntervalStr = "5m" // Default 5 minutes
	}

	cleanupIntervalStr := c.Caching.LogsCache.CleanupInterval
	if cleanupIntervalStr == "" {
		cleanupIntervalStr = "10m" // Default 10 minutes
	}

	degradedModeTimeoutStr := c.Caching.LogsCache.DegradedModeTimeout
	if degradedModeTimeoutStr == "" {
		degradedModeTimeoutStr = "30s" // Default 30 seconds
	}

	// Parse duration strings
	globalMaxAge, err := time.ParseDuration(ttl)
	if err != nil {
		return LogsServiceConfig{}, fmt.Errorf("invalid logs cache TTL: %w", err)
	}

	evictionInterval, err := time.ParseDuration(evictionIntervalStr)
	if err != nil {
		return LogsServiceConfig{}, fmt.Errorf("invalid logs cache eviction interval: %w", err)
	}

	cleanupInterval, err := time.ParseDuration(cleanupIntervalStr)
	if err != nil {
		return LogsServiceConfig{}, fmt.Errorf("invalid logs cache cleanup interval: %w", err)
	}

	degradedModeTimeout, err := time.ParseDuration(degradedModeTimeoutStr)
	if err != nil {
		return LogsServiceConfig{}, fmt.Errorf("invalid logs cache degraded mode timeout: %w", err)
	}

	// Set default values for numeric fields if they're zero
	maxGlobal := c.Caching.LogsCache.MaxGlobal
	if maxGlobal == 0 {
		maxGlobal = 250000 // Default
	}

	maxPerScope := c.Caching.LogsCache.MaxPerScope
	if maxPerScope == 0 {
		maxPerScope = 20000 // Default
	}

	maxSubscribers := c.Caching.LogsCache.MaxSubscribers
	if maxSubscribers == 0 {
		maxSubscribers = 200 // Default
	}

	bufferSize := c.Caching.LogsCache.BufferSize
	if bufferSize == 0 {
		bufferSize = 100 // Default
	}

	return LogsServiceConfig{
		GlobalMaxEntries: maxGlobal,
		GlobalMaxAge:     globalMaxAge,
		ScopeMaxEntries:  maxPerScope,
		ScopeMaxAge:      globalMaxAge, // Use same TTL for scoped rings
		MaxSubscribers:   maxSubscribers,
		BufferSize:       bufferSize,
		EvictionInterval: evictionInterval,
		CleanupInterval:  cleanupInterval,

		// Background collection
		BackgroundCollectionEnabled:   c.Caching.LogsCache.BackgroundCollectionEnabled,
		BackgroundCollectionRetention: c.Caching.LogsCache.BackgroundCollectionRetention,
		BackgroundCollectionInterval:  c.Caching.LogsCache.BackgroundCollectionInterval,

		// Phase 10: Operational guardrails
		MaxStreamsPerUser:     c.Caching.LogsCache.MaxStreamsPerUser,
		MaxQueryLimit:         c.Caching.LogsCache.MaxQueryLimit,
		MaxExportSize:         c.Caching.LogsCache.MaxExportSize,
		MaxConcurrentQueries:  c.Caching.LogsCache.MaxConcurrentQueries,
		RateLimitPerSecond:    c.Caching.LogsCache.RateLimitPerSecond,
		BackpressureThreshold: c.Caching.LogsCache.BackpressureThreshold,
		DegradedModeTimeout:   degradedModeTimeout,
	}, nil
}
