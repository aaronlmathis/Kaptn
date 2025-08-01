package actions

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/discovery/fake"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func TestApplyService_ApplyYAML_SingleResource(t *testing.T) {
	// Setup
	logger := zap.NewNop()
	scheme := runtime.NewScheme()

	client := k8sfake.NewSimpleClientset()
	dynamicClient := dynamicfake.NewSimpleDynamicClient(scheme)
	discoveryClient := &fake.FakeDiscovery{}

	service := NewApplyService(client, dynamicClient, discoveryClient, logger)

	yamlContent := `apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
  namespace: default
data:
  key1: value1
  key2: value2`

	opts := ApplyOptions{
		DryRun:    false,
		Force:     false,
		Namespace: "default",
	}

	// Test
	result, err := service.ApplyYAML(context.Background(), "test-req-1", "test-user", yamlContent, opts)

	// Assertions
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Len(t, result.Resources, 1)
	assert.Equal(t, "test-config", result.Resources[0].Name)
	assert.Equal(t, "default", result.Resources[0].Namespace)
	assert.Equal(t, "ConfigMap", result.Resources[0].Kind)
	assert.Equal(t, "created", result.Resources[0].Action)
	assert.Contains(t, result.Message, "Successfully applied 1 resources")
}

func TestApplyService_ApplyYAML_DryRun(t *testing.T) {
	// Setup
	logger := zap.NewNop()
	scheme := runtime.NewScheme()

	client := k8sfake.NewSimpleClientset()
	dynamicClient := dynamicfake.NewSimpleDynamicClient(scheme)
	discoveryClient := &fake.FakeDiscovery{}

	service := NewApplyService(client, dynamicClient, discoveryClient, logger)

	yamlContent := `apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
  namespace: default
data:
  key1: value1`

	opts := ApplyOptions{
		DryRun:    true,
		Force:     false,
		Namespace: "default",
	}

	// Test
	result, err := service.ApplyYAML(context.Background(), "test-req-2", "test-user", yamlContent, opts)

	// Assertions
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Len(t, result.Resources, 1)
	assert.Equal(t, "created", result.Resources[0].Action)
	assert.Contains(t, result.Message, "Dry run completed successfully")
}

func TestApplyService_ApplyYAML_MultiDocument(t *testing.T) {
	// Setup
	logger := zap.NewNop()
	scheme := runtime.NewScheme()

	client := k8sfake.NewSimpleClientset()
	dynamicClient := dynamicfake.NewSimpleDynamicClient(scheme)
	discoveryClient := &fake.FakeDiscovery{}

	service := NewApplyService(client, dynamicClient, discoveryClient, logger)

	yamlContent := `apiVersion: v1
kind: ConfigMap
metadata:
  name: config1
  namespace: default
data:
  key1: value1
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: config2
  namespace: default
data:
  key2: value2`

	opts := ApplyOptions{
		DryRun:    true,
		Force:     false,
		Namespace: "default",
	}

	// Test
	result, err := service.ApplyYAML(context.Background(), "test-req-3", "test-user", yamlContent, opts)

	// Assertions
	require.NoError(t, err)
	assert.True(t, result.Success)
	assert.Len(t, result.Resources, 2)
	assert.Equal(t, "config1", result.Resources[0].Name)
	assert.Equal(t, "config2", result.Resources[1].Name)
}

func TestApplyService_ApplyYAML_InvalidYAML(t *testing.T) {
	// Setup
	logger := zap.NewNop()
	scheme := runtime.NewScheme()

	client := k8sfake.NewSimpleClientset()
	dynamicClient := dynamicfake.NewSimpleDynamicClient(scheme)
	discoveryClient := &fake.FakeDiscovery{}

	service := NewApplyService(client, dynamicClient, discoveryClient, logger)

	yamlContent := `invalid yaml content
	this is not valid
	[}}`

	opts := ApplyOptions{
		DryRun:    false,
		Force:     false,
		Namespace: "default",
	}

	// Test
	result, err := service.ApplyYAML(context.Background(), "test-req-4", "test-user", yamlContent, opts)

	// Assertions
	require.Error(t, err)
	assert.False(t, result.Success)
	assert.Contains(t, result.Errors[0], "Failed to parse YAML")
}

func TestApplyService_ApplyYAML_EmptyContent(t *testing.T) {
	// Setup
	logger := zap.NewNop()
	scheme := runtime.NewScheme()

	client := k8sfake.NewSimpleClientset()
	dynamicClient := dynamicfake.NewSimpleDynamicClient(scheme)
	discoveryClient := &fake.FakeDiscovery{}

	service := NewApplyService(client, dynamicClient, discoveryClient, logger)

	yamlContent := ""

	opts := ApplyOptions{
		DryRun:    false,
		Force:     false,
		Namespace: "default",
	}

	// Test
	result, err := service.ApplyYAML(context.Background(), "test-req-5", "test-user", yamlContent, opts)

	// Assertions
	require.Error(t, err)
	assert.False(t, result.Success)
	assert.Contains(t, result.Errors[0], "no valid resources found")
}

func TestApplyService_parseYAMLDocuments(t *testing.T) {
	// Setup
	logger := zap.NewNop()
	scheme := runtime.NewScheme()

	client := k8sfake.NewSimpleClientset()
	dynamicClient := dynamicfake.NewSimpleDynamicClient(scheme)
	discoveryClient := &fake.FakeDiscovery{}

	service := NewApplyService(client, dynamicClient, discoveryClient, logger)

	t.Run("Valid single document", func(t *testing.T) {
		yamlContent := `apiVersion: v1
kind: ConfigMap
metadata:
  name: test
data:
  key: value`

		docs, err := service.parseYAMLDocuments(yamlContent)
		require.NoError(t, err)
		assert.Len(t, docs, 1)
		assert.Equal(t, "ConfigMap", docs[0].GetKind())
		assert.Equal(t, "test", docs[0].GetName())
	})

	t.Run("Valid multi-document", func(t *testing.T) {
		yamlContent := `apiVersion: v1
kind: ConfigMap
metadata:
  name: test1
data:
  key: value1
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: test2
data:
  key: value2`

		docs, err := service.parseYAMLDocuments(yamlContent)
		require.NoError(t, err)
		assert.Len(t, docs, 2)
		assert.Equal(t, "test1", docs[0].GetName())
		assert.Equal(t, "test2", docs[1].GetName())
	})

	t.Run("Missing required fields", func(t *testing.T) {
		yamlContent := `apiVersion: v1
kind: ConfigMap
metadata:
  # name is missing
data:
  key: value`

		_, err := service.parseYAMLDocuments(yamlContent)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "missing metadata.name")
	})
}
