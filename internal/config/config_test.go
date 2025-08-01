package config

import (
	"os"
	"testing"
)

func TestLoad(t *testing.T) {
	// Test default configuration
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Failed to load default config: %v", err)
	}

	if cfg.Server.Addr != "0.0.0.0:8080" {
		t.Errorf("Expected default server addr to be '0.0.0.0:8080', got '%s'", cfg.Server.Addr)
	}

	if cfg.Logging.Level != "info" {
		t.Errorf("Expected default log level to be 'info', got '%s'", cfg.Logging.Level)
	}

	if cfg.Security.AuthMode != "none" {
		t.Errorf("Expected default auth mode to be 'none', got '%s'", cfg.Security.AuthMode)
	}
}

func TestLoadWithEnvironmentVariables(t *testing.T) {
	// Set environment variables
	os.Setenv("PORT", "9090")
	os.Setenv("LOG_LEVEL", "debug")
	os.Setenv("KAD_AUTH_MODE", "header")
	defer func() {
		os.Unsetenv("PORT")
		os.Unsetenv("LOG_LEVEL")
		os.Unsetenv("KAD_AUTH_MODE")
	}()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Failed to load config with env vars: %v", err)
	}

	if cfg.Server.Addr != "0.0.0.0:9090" {
		t.Errorf("Expected server addr to be '0.0.0.0:9090', got '%s'", cfg.Server.Addr)
	}

	if cfg.Logging.Level != "debug" {
		t.Errorf("Expected log level to be 'debug', got '%s'", cfg.Logging.Level)
	}

	if cfg.Security.AuthMode != "header" {
		t.Errorf("Expected auth mode to be 'header', got '%s'", cfg.Security.AuthMode)
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name      string
		config    Config
		wantError bool
	}{
		{
			name: "valid config",
			config: Config{
				Server:     ServerConfig{Addr: "0.0.0.0:8080"},
				Kubernetes: KubernetesConfig{Mode: "kubeconfig"},
				Security:   SecurityConfig{AuthMode: "none"},
			},
			wantError: false,
		},
		{
			name: "empty server addr",
			config: Config{
				Server:     ServerConfig{Addr: ""},
				Kubernetes: KubernetesConfig{Mode: "kubeconfig"},
				Security:   SecurityConfig{AuthMode: "none"},
			},
			wantError: true,
		},
		{
			name: "invalid kubernetes mode",
			config: Config{
				Server:     ServerConfig{Addr: "0.0.0.0:8080"},
				Kubernetes: KubernetesConfig{Mode: "invalid"},
				Security:   SecurityConfig{AuthMode: "none"},
			},
			wantError: true,
		},
		{
			name: "invalid auth mode",
			config: Config{
				Server:     ServerConfig{Addr: "0.0.0.0:8080"},
				Kubernetes: KubernetesConfig{Mode: "kubeconfig"},
				Security:   SecurityConfig{AuthMode: "invalid"},
			},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()
			if (err != nil) != tt.wantError {
				t.Errorf("Validate() error = %v, wantError %v", err, tt.wantError)
			}
		})
	}
}
