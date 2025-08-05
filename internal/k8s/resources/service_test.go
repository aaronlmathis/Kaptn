package resources

import (
	"context"
	"testing"

	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	kubefake "k8s.io/client-go/kubernetes/fake"
)

func TestListIngresses(t *testing.T) {
	// Create fake clients with proper GVR mappings
	scheme := runtime.NewScheme()

	// Register the GVRs we expect to use
	gvrToListKind := map[schema.GroupVersionResource]string{
		{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}:       "IngressList",
		{Group: "extensions", Version: "v1beta1", Resource: "ingresses"}:         "IngressList",
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "gateways"}: "GatewayList",
	}

	dynamicClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind)
	kubeClient := kubefake.NewSimpleClientset()
	logger := zap.NewNop()

	rm := NewResourceManager(logger, kubeClient, dynamicClient)

	ctx := context.Background()
	namespace := "test-namespace"

	// Test with empty results (should not fail even if Istio is not available)
	ingresses, err := rm.ListIngresses(ctx, namespace)
	if err != nil {
		t.Errorf("ListIngresses should not fail when no resources exist: %v", err)
	}

	if len(ingresses) != 0 {
		t.Errorf("Expected 0 ingresses, got %d", len(ingresses))
	}
}

func TestGetIngress(t *testing.T) {
	// Create fake clients with proper GVR mappings
	scheme := runtime.NewScheme()

	gvrToListKind := map[schema.GroupVersionResource]string{
		{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}:       "IngressList",
		{Group: "extensions", Version: "v1beta1", Resource: "ingresses"}:         "IngressList",
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "gateways"}: "GatewayList",
	}

	dynamicClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind)
	kubeClient := kubefake.NewSimpleClientset()
	logger := zap.NewNop()

	rm := NewResourceManager(logger, kubeClient, dynamicClient)

	ctx := context.Background()
	namespace := "test-namespace"
	name := "test-ingress"

	// Test with non-existent ingress
	_, err := rm.GetIngress(ctx, namespace, name)
	if err == nil {
		t.Error("GetIngress should fail when ingress doesn't exist")
	}

	if !errors.IsNotFound(err) {
		t.Errorf("Expected NotFound error, got: %v", err)
	}
}

func TestFetchStandardIngresses(t *testing.T) {
	// Create a simple fake ingress without complex nested structures
	ingress := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.k8s.io/v1",
			"kind":       "Ingress",
			"metadata": map[string]interface{}{
				"name":      "test-ingress",
				"namespace": "test-namespace",
			},
			"spec": map[string]interface{}{
				"defaultBackend": map[string]interface{}{
					"service": map[string]interface{}{
						"name": "test-service",
					},
				},
			},
		},
	}

	scheme := runtime.NewScheme()

	gvrToListKind := map[schema.GroupVersionResource]string{
		{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}: "IngressList",
		{Group: "extensions", Version: "v1beta1", Resource: "ingresses"}:   "IngressList",
	}

	dynamicClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind, ingress)
	kubeClient := kubefake.NewSimpleClientset()
	logger := zap.NewNop()

	rm := NewResourceManager(logger, kubeClient, dynamicClient)

	ctx := context.Background()
	namespace := "test-namespace"

	// Test fetching standard ingresses
	ingresses, err := rm.fetchStandardIngresses(ctx, namespace)
	if err != nil {
		t.Errorf("fetchStandardIngresses failed: %v", err)
	}

	if len(ingresses) != 1 {
		t.Errorf("Expected 1 ingress, got %d", len(ingresses))
	}

	// Check that the resource type annotation was added
	ingressObj := ingresses[0].(map[string]interface{})
	metadata := ingressObj["metadata"].(map[string]interface{})
	annotations := metadata["annotations"].(map[string]interface{})
	resourceType := annotations["kaptn.io/resource-type"]
	if resourceType != "ingress" {
		t.Errorf("Expected resource type annotation 'ingress', got '%v'", resourceType)
	}
}

func TestFetchIstioGateways(t *testing.T) {
	// Create a simple fake Istio Gateway
	gateway := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "Gateway",
			"metadata": map[string]interface{}{
				"name":      "test-gateway",
				"namespace": "test-namespace",
			},
			"spec": map[string]interface{}{
				"selector": map[string]interface{}{
					"istio": "ingressgateway",
				},
			},
		},
	}

	scheme := runtime.NewScheme()

	gvrToListKind := map[schema.GroupVersionResource]string{
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "gateways"}: "GatewayList",
	}

	dynamicClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind, gateway)
	kubeClient := kubefake.NewSimpleClientset()
	logger := zap.NewNop()

	rm := NewResourceManager(logger, kubeClient, dynamicClient)

	ctx := context.Background()
	namespace := "test-namespace"

	// Test fetching Istio gateways
	gateways, err := rm.fetchIstioGateways(ctx, namespace)
	if err != nil {
		t.Errorf("fetchIstioGateways failed: %v", err)
	}

	if len(gateways) != 1 {
		t.Errorf("Expected 1 gateway, got %d", len(gateways))
	}

	// Check that the resource type annotation was added
	gatewayObj := gateways[0].(map[string]interface{})
	metadata := gatewayObj["metadata"].(map[string]interface{})
	annotations := metadata["annotations"].(map[string]interface{})
	resourceType := annotations["kaptn.io/resource-type"]
	if resourceType != "istio-gateway" {
		t.Errorf("Expected resource type annotation 'istio-gateway', got '%v'", resourceType)
	}
}
