package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config represents the application configuration
type Config struct {
	Server     ServerConfig     `yaml:"server"`
	Security   SecurityConfig   `yaml:"security"`
	Kubernetes KubernetesConfig `yaml:"kubernetes"`
	Features   FeaturesConfig   `yaml:"features"`
	RateLimits RateLimitsConfig `yaml:"rate_limits"`
	Logging    LoggingConfig    `yaml:"logging"`
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
}

// OIDCConfig represents the OIDC configuration
type OIDCConfig struct {
	Issuer   string `yaml:"issuer"`
	ClientID string `yaml:"client_id"`
	Audience string `yaml:"audience"`
	JWKSURL  string `yaml:"jwks_url"`
}

// KubernetesConfig represents the Kubernetes configuration
type KubernetesConfig struct {
	Mode             string `yaml:"mode"`
	KubeconfigPath   string `yaml:"kubeconfig_path"`
	NamespaceDefault string `yaml:"namespace_default"`
}

// FeaturesConfig represents the features configuration
type FeaturesConfig struct {
	EnableApply       bool `yaml:"enable_apply"`
	EnableNodeActions bool `yaml:"enable_nodes_actions"`
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

// Load loads the configuration from environment variables and defaults
func Load() (*Config, error) {
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
		},
		Kubernetes: KubernetesConfig{
			Mode:             getEnv("KAD_KUBE_MODE", "kubeconfig"),
			KubeconfigPath:   getEnv("KUBECONFIG", ""),
			NamespaceDefault: getEnv("KAD_NAMESPACE_DEFAULT", "default"),
		},
		Features: FeaturesConfig{
			EnableApply:       getEnvBool("KAD_ENABLE_APPLY", true),
			EnableNodeActions: getEnvBool("KAD_ENABLE_NODE_ACTIONS", true),
		},
		RateLimits: RateLimitsConfig{
			ApplyPerMinute:   getEnvInt("KAD_APPLY_PER_MINUTE", 10),
			ActionsPerMinute: getEnvInt("KAD_ACTIONS_PER_MINUTE", 20),
		},
		Logging: LoggingConfig{
			Level: getEnv("LOG_LEVEL", "info"),
		},
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
	return nil
}
