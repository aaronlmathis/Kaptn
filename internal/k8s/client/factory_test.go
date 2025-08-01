package client

import (
	"os"
	"path/filepath"
	"testing"

	"go.uber.org/zap/zaptest"
)

func TestNewFactory(t *testing.T) {
	logger := zaptest.NewLogger(t)

	tests := []struct {
		name           string
		mode           ClientMode
		kubeconfigPath string
		expectError    bool
	}{
		{
			name:        "invalid mode",
			mode:        ClientMode("invalid"),
			expectError: true,
		},
		{
			name:           "kubeconfig mode with non-existent file",
			mode:           KubeconfigMode,
			kubeconfigPath: "/non/existent/kubeconfig",
			expectError:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewFactory(logger, tt.mode, tt.kubeconfigPath)
			if tt.expectError && err == nil {
				t.Errorf("expected error but got none")
			}
			if !tt.expectError && err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

func TestBuildKubeconfigFromPath(t *testing.T) {
	// Create a temporary kubeconfig file for testing
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "kubeconfig")

	// Write a minimal kubeconfig
	kubeconfigContent := `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://example.com
  name: test-cluster
contexts:
- context:
    cluster: test-cluster
    user: test-user
  name: test-context
current-context: test-context
users:
- name: test-user
  user:
    token: test-token`

	err := os.WriteFile(kubeconfigPath, []byte(kubeconfigContent), 0600)
	if err != nil {
		t.Fatalf("failed to write test kubeconfig: %v", err)
	}

	tests := []struct {
		name           string
		kubeconfigPath string
		expectError    bool
		skipTest       bool
	}{
		{
			name:           "valid kubeconfig",
			kubeconfigPath: kubeconfigPath,
			expectError:    false,
		},
		{
			name:           "non-existent kubeconfig",
			kubeconfigPath: "/non/existent/kubeconfig",
			expectError:    true,
		},
		{
			name:           "empty path - check for default",
			kubeconfigPath: "",
			expectError:    false, // This test might succeed if KUBECONFIG or ~/.kube/config exists
			skipTest:       true,  // Skip this test as it depends on environment
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.skipTest {
				t.Skip("Skipping test that depends on environment")
			}
			
			_, err := buildKubeconfigFromPath(tt.kubeconfigPath)
			if tt.expectError && err == nil {
				t.Errorf("expected error but got none")
			}
			if !tt.expectError && err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

func TestFactory_Methods(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create a factory with a test kubeconfig
	tmpDir := t.TempDir()
	kubeconfigPath := filepath.Join(tmpDir, "kubeconfig")
	kubeconfigContent := `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://example.com
  name: test-cluster
contexts:
- context:
    cluster: test-cluster
    user: test-user
  name: test-context
current-context: test-context
users:
- name: test-user
  user:
    token: test-token`

	err := os.WriteFile(kubeconfigPath, []byte(kubeconfigContent), 0600)
	if err != nil {
		t.Fatalf("failed to write test kubeconfig: %v", err)
	}

	factory, err := NewFactory(logger, KubeconfigMode, kubeconfigPath)
	if err != nil {
		t.Fatalf("failed to create factory: %v", err)
	}

	// Test Client() method
	client := factory.Client()
	if client == nil {
		t.Error("expected non-nil client")
	}

	// Test Config() method
	config := factory.Config()
	if config == nil {
		t.Error("expected non-nil config")
	}
	if config.Host != "https://example.com" {
		t.Errorf("expected host 'https://example.com', got '%s'", config.Host)
	}
}
