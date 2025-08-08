package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config represents the application configuration
type Config struct {
	Server       ServerConfig       `yaml:"server"`
	Security     SecurityConfig     `yaml:"security"`
	Kubernetes   KubernetesConfig   `yaml:"kubernetes"`
	Features     FeaturesConfig     `yaml:"features"`
	RateLimits   RateLimitsConfig   `yaml:"rate_limits"`
	Logging      LoggingConfig      `yaml:"logging"`
	Integrations IntegrationsConfig `yaml:"integrations"`
	Caching      CachingConfig      `yaml:"caching"`
	Jobs         JobsConfig         `yaml:"jobs"`
}

// ServerConfig represents the server configuration
type ServerConfig struct {
	Addr     string     `yaml:"addr"`
	BasePath string     `yaml:"base_path"`
	CORS     CORSConfig `yaml:"cors"`
}

// CORSConfig represents the CORS configuration
type CORSConfig struct {
	AllowOrigins []string `yaml:"allow_origins"`
	AllowMethods []string `yaml:"allow_methods"`
}

// SecurityConfig represents the security configuration
type SecurityConfig struct {
	AuthMode string     `yaml:"auth_mode"`
	OIDC     OIDCConfig `yaml:"oidc"`
	TLS      TLSConfig  `yaml:"tls"`
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

// KubernetesConfig represents the Kubernetes configuration
type KubernetesConfig struct {
	Mode             string `yaml:"mode"`
	KubeconfigPath   string `yaml:"kubeconfig_path"`
	NamespaceDefault string `yaml:"namespace_default"`
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
	Level string `yaml:"level"`
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
	OverviewTTL  string `yaml:"overview_ttl"`
	AnalyticsTTL string `yaml:"analytics_ttl"`
	SummaryTTL   string `yaml:"summary_ttl"`
}

// JobsConfig represents job management configuration
type JobsConfig struct {
	PersistenceEnabled bool   `yaml:"persistence_enabled"`
	StorePath          string `yaml:"store_path"`
	CleanupInterval    string `yaml:"cleanup_interval"`
	MaxAge             string `yaml:"max_age"`
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
			Addr:     getEnv("KAD_SERVER_ADDR", "0.0.0.0:8080"),
			BasePath: getEnv("KAD_BASE_PATH", "/"),
			CORS: CORSConfig{
				AllowOrigins: []string{"*"},
				AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			},
		},
		Security: SecurityConfig{
			AuthMode: getEnv("KAD_AUTH_MODE", "none"),
			OIDC: OIDCConfig{
				Issuer:       getEnv("KAD_OIDC_ISSUER", ""),
				ClientID:     getEnv("KAD_OIDC_CLIENT_ID", ""),
				ClientSecret: getEnv("KAD_OIDC_CLIENT_SECRET", ""),
				RedirectURL:  getEnv("KAD_OIDC_REDIRECT_URL", ""),
				Audience:     getEnv("KAD_OIDC_AUDIENCE", ""),
				Scopes:       getEnvStringSlice("KAD_OIDC_SCOPES", []string{"openid", "profile", "email", "groups"}),
			},
			TLS: TLSConfig{
				Enabled:  getEnvBool("KAD_TLS_ENABLED", false),
				CertFile: getEnv("KAD_TLS_CERT_FILE", ""),
				KeyFile:  getEnv("KAD_TLS_KEY_FILE", ""),
			},
		},
		Kubernetes: KubernetesConfig{
			Mode:             getEnv("KAD_KUBE_MODE", "kubeconfig"),
			KubeconfigPath:   getEnv("KUBECONFIG", ""),
			NamespaceDefault: getEnv("KAD_NAMESPACE_DEFAULT", "default"),
		},
		Features: FeaturesConfig{
			EnableApply:               getEnvBool("KAD_ENABLE_APPLY", true),
			EnableNodeActions:         getEnvBool("KAD_ENABLE_NODE_ACTIONS", true),
			EnableOverview:            getEnvBool("KAD_ENABLE_OVERVIEW", true),
			EnablePrometheusAnalytics: getEnvBool("KAD_ENABLE_PROMETHEUS_ANALYTICS", true),
		},
		RateLimits: RateLimitsConfig{
			ApplyPerMinute:   getEnvInt("KAD_APPLY_PER_MINUTE", 10),
			ActionsPerMinute: getEnvInt("KAD_ACTIONS_PER_MINUTE", 20),
		},
		Logging: LoggingConfig{
			Level: getEnv("LOG_LEVEL", "info"),
		},
		Integrations: IntegrationsConfig{
			Prometheus: PrometheusConfig{
				URL:     getEnv("KAD_PROMETHEUS_URL", "http://prometheus.monitoring.svc:9090"),
				Timeout: getEnv("KAD_PROMETHEUS_TIMEOUT", "5s"),
				Enabled: getEnvBool("KAD_PROMETHEUS_ENABLED", true),
			},
		},
		Caching: CachingConfig{
			OverviewTTL:  getEnv("KAD_OVERVIEW_TTL", "2s"),
			AnalyticsTTL: getEnv("KAD_ANALYTICS_TTL", "60s"),
			SummaryTTL:   getEnv("KAD_SUMMARY_TTL", "30s"),
		},
		Jobs: JobsConfig{
			PersistenceEnabled: getEnvBool("KAD_JOBS_PERSISTENCE_ENABLED", true),
			StorePath:          getEnv("KAD_JOBS_STORE_PATH", "./data/jobs"),
			CleanupInterval:    getEnv("KAD_JOBS_CLEANUP_INTERVAL", "1h"),
			MaxAge:             getEnv("KAD_JOBS_MAX_AGE", "24h"),
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
	if envValue := os.Getenv("KAD_SERVER_ADDR"); envValue != "" {
		result.Server.Addr = envValue
	}
	if envValue := os.Getenv("KAD_BASE_PATH"); envValue != "" {
		result.Server.BasePath = envValue
	}
	if envValue := os.Getenv("KAD_AUTH_MODE"); envValue != "" {
		result.Security.AuthMode = envValue
	}
	if envValue := os.Getenv("KAD_KUBE_MODE"); envValue != "" {
		result.Kubernetes.Mode = envValue
	}
	if envValue := os.Getenv("KUBECONFIG"); envValue != "" {
		result.Kubernetes.KubeconfigPath = envValue
	}
	if envValue := os.Getenv("KAD_NAMESPACE_DEFAULT"); envValue != "" {
		result.Kubernetes.NamespaceDefault = envValue
	}
	if envValue := os.Getenv("LOG_LEVEL"); envValue != "" {
		result.Logging.Level = envValue
	}
	if envValue := os.Getenv("PORT"); envValue != "" {
		result.Server.Addr = "0.0.0.0:" + envValue
	}

	// Handle boolean environment variables
	if envValue := os.Getenv("KAD_ENABLE_APPLY"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Features.EnableApply = parsed
		}
	}
	if envValue := os.Getenv("KAD_ENABLE_NODE_ACTIONS"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Features.EnableNodeActions = parsed
		}
	}
	if envValue := os.Getenv("KAD_ENABLE_OVERVIEW"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Features.EnableOverview = parsed
		}
	}
	if envValue := os.Getenv("KAD_ENABLE_PROMETHEUS_ANALYTICS"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Features.EnablePrometheusAnalytics = parsed
		}
	}

	// Handle Prometheus configuration
	if envValue := os.Getenv("KAD_PROMETHEUS_URL"); envValue != "" {
		result.Integrations.Prometheus.URL = envValue
	}
	if envValue := os.Getenv("KAD_PROMETHEUS_TIMEOUT"); envValue != "" {
		result.Integrations.Prometheus.Timeout = envValue
	}
	if envValue := os.Getenv("KAD_PROMETHEUS_ENABLED"); envValue != "" {
		if parsed, err := strconv.ParseBool(envValue); err == nil {
			result.Integrations.Prometheus.Enabled = parsed
		}
	}

	// Handle OIDC configuration
	if envValue := os.Getenv("KAD_OIDC_ISSUER"); envValue != "" {
		result.Security.OIDC.Issuer = envValue
	}
	if envValue := os.Getenv("KAD_OIDC_CLIENT_ID"); envValue != "" {
		result.Security.OIDC.ClientID = envValue
	}
	if envValue := os.Getenv("KAD_OIDC_CLIENT_SECRET"); envValue != "" {
		result.Security.OIDC.ClientSecret = envValue
	}
	if envValue := os.Getenv("KAD_OIDC_REDIRECT_URL"); envValue != "" {
		result.Security.OIDC.RedirectURL = envValue
	}
	if envValue := os.Getenv("KAD_OIDC_AUDIENCE"); envValue != "" {
		result.Security.OIDC.Audience = envValue
	}
	if envValue := os.Getenv("KAD_OIDC_SCOPES"); envValue != "" {
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

	return &result
}

// Validate validates the configuration
func (c *Config) Validate() error {
	if c.Server.Addr == "" {
		return fmt.Errorf("server address cannot be empty")
	}
	if c.Kubernetes.Mode != "incluster" && c.Kubernetes.Mode != "kubeconfig" {
		return fmt.Errorf("kubernetes mode must be 'incluster' or 'kubeconfig'")
	}
	if c.Security.AuthMode != "none" && c.Security.AuthMode != "header" && c.Security.AuthMode != "oidc" {
		return fmt.Errorf("auth mode must be 'none', 'header', or 'oidc'")
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
