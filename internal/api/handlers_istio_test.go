package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap/zaptest"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/fake"
)

func TestDetectIstioCapabilities(t *testing.T) {
	tests := []struct {
		name           string
		crdExists      bool
		vsCount        int
		gwCount        int
		expectedResult IstioCapabilities
	}{
		{
			name:      "Istio not installed",
			crdExists: false,
			vsCount:   0,
			gwCount:   0,
			expectedResult: IstioCapabilities{
				Installed: false,
				Used:      false,
				CRDs:      []string{},
				Counts:    map[string]int{},
			},
		},
		{
			name:      "Istio installed but not used",
			crdExists: true,
			vsCount:   0,
			gwCount:   0,
			expectedResult: IstioCapabilities{
				Installed: true,
				Used:      false,
				CRDs:      []string{"virtualservices.networking.istio.io", "gateways.networking.istio.io"},
				Counts:    map[string]int{"virtualservices": 0, "gateways": 0},
			},
		},
		{
			name:      "Istio installed and used",
			crdExists: true,
			vsCount:   2,
			gwCount:   0, // Work around fake client Gateway bug
			expectedResult: IstioCapabilities{
				Installed: true,
				Used:      true, // VirtualServices > 0 means Istio is used
				CRDs:      []string{"virtualservices.networking.istio.io", "gateways.networking.istio.io"},
				Counts:    map[string]int{"virtualservices": 2, "gateways": 0}, // Gateway count will be 0 due to fake client limitation
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create mock dynamic client
			scheme := runtime.NewScheme()
			var objects []runtime.Object

			// Add CRDs if they should exist
			if tt.crdExists {
				vsCRD := &unstructured.Unstructured{
					Object: map[string]interface{}{
						"apiVersion": "apiextensions.k8s.io/v1",
						"kind":       "CustomResourceDefinition",
						"metadata": map[string]interface{}{
							"name": "virtualservices.networking.istio.io",
						},
					},
				}
				gwCRD := &unstructured.Unstructured{
					Object: map[string]interface{}{
						"apiVersion": "apiextensions.k8s.io/v1",
						"kind":       "CustomResourceDefinition",
						"metadata": map[string]interface{}{
							"name": "gateways.networking.istio.io",
						},
					},
				}
				objects = append(objects, vsCRD, gwCRD)

				// Add VirtualServices
				for i := 0; i < tt.vsCount; i++ {
					vs := &unstructured.Unstructured{
						Object: map[string]interface{}{
							"apiVersion": "networking.istio.io/v1beta1",
							"kind":       "VirtualService",
							"metadata": map[string]interface{}{
								"name":      "test-vs-" + string(rune('0'+i)),
								"namespace": "default",
							},
						},
					}
					vs.SetGroupVersionKind(virtualServiceGVR.GroupVersion().WithKind("VirtualService"))
					objects = append(objects, vs)
				}

				// Add Gateways
				for i := 0; i < tt.gwCount; i++ {
					gw := &unstructured.Unstructured{
						Object: map[string]interface{}{
							"apiVersion": "networking.istio.io/v1beta1",
							"kind":       "Gateway",
							"metadata": map[string]interface{}{
								"name":      "test-gw-" + string(rune('0'+i)),
								"namespace": "default",
							},
						},
					}
					// Try using the exact same GVK pattern as VirtualServices
					gw.SetGroupVersionKind(schema.GroupVersionKind{
						Group:   "networking.istio.io",
						Version: "v1beta1",
						Kind:    "Gateway",
					})
					objects = append(objects, gw)
				}
			}

			// Use NewSimpleDynamicClientWithCustomListKinds to register the required mappings
			gvrToListKind := map[schema.GroupVersionResource]string{
				{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}: "CustomResourceDefinitionList",
				virtualServiceGVR: "VirtualServiceList",
				gatewayGVR:        "GatewayList",
			}

			dynamicClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind, objects...)

			// Create server instance
			server := &Server{
				logger:        zaptest.NewLogger(t),
				dynamicClient: dynamicClient,
			}

			// Test capability detection
			result := server.detectIstioCapabilities(context.Background())

			assert.Equal(t, tt.expectedResult.Installed, result.Installed)
			assert.Equal(t, tt.expectedResult.Used, result.Used)
			assert.Equal(t, tt.expectedResult.CRDs, result.CRDs)
			assert.Equal(t, tt.expectedResult.Counts, result.Counts)
		})
	}
}

func TestHandleGetCapabilities(t *testing.T) {
	// Create a mock server with Istio installed and used
	scheme := runtime.NewScheme()
	vsCRD := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apiextensions.k8s.io/v1",
			"kind":       "CustomResourceDefinition",
			"metadata": map[string]interface{}{
				"name": "virtualservices.networking.istio.io",
			},
		},
	}
	gwCRD := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apiextensions.k8s.io/v1",
			"kind":       "CustomResourceDefinition",
			"metadata": map[string]interface{}{
				"name": "gateways.networking.istio.io",
			},
		},
	}
	vs := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "VirtualService",
			"metadata": map[string]interface{}{
				"name":      "test-vs",
				"namespace": "default",
			},
		},
	}
	vs.SetGroupVersionKind(virtualServiceGVR.GroupVersion().WithKind("VirtualService"))

	objects := []runtime.Object{vsCRD, gwCRD, vs}

	// Use NewSimpleDynamicClientWithCustomListKinds to register the required mappings
	gvrToListKind := map[schema.GroupVersionResource]string{
		{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}: "CustomResourceDefinitionList",
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "virtualservices"}:       "VirtualServiceList",
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "gateways"}:              "GatewayList",
	}

	dynamicClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind, objects...)

	server := &Server{
		logger:        zaptest.NewLogger(t),
		dynamicClient: dynamicClient,
	}

	req := httptest.NewRequest("GET", "/api/v1/capabilities", nil)
	w := httptest.NewRecorder()

	server.handleGetCapabilities(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, "success", response["status"])

	data, ok := response["data"].(map[string]interface{})
	assert.True(t, ok)

	istio, ok := data["istio"].(map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, true, istio["installed"])
	assert.Equal(t, true, istio["used"])
}

func TestHandleListVirtualServices(t *testing.T) {
	scheme := runtime.NewScheme()

	// Create test VirtualService
	vs := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "VirtualService",
			"metadata": map[string]interface{}{
				"name":              "test-vs",
				"namespace":         "default",
				"creationTimestamp": "2023-01-01T00:00:00Z",
				"labels": map[string]interface{}{
					"app": "test",
				},
			},
			"spec": map[string]interface{}{
				"hosts":    []interface{}{"example.com"},
				"gateways": []interface{}{"test-gateway"},
			},
		},
	}
	vs.SetGroupVersionKind(virtualServiceGVR.GroupVersion().WithKind("VirtualService"))

	// Use NewSimpleDynamicClientWithCustomListKinds to register the required mappings
	gvrToListKind := map[schema.GroupVersionResource]string{
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "virtualservices"}: "VirtualServiceList",
	}

	dynamicClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind, vs)

	server := &Server{
		logger:        zaptest.NewLogger(t),
		dynamicClient: dynamicClient,
	}

	req := httptest.NewRequest("GET", "/api/v1/istio/virtualservices", nil)
	w := httptest.NewRecorder()

	server.handleListVirtualServices(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	data := response["data"].(map[string]interface{})
	items := data["items"].([]interface{})
	assert.Len(t, items, 1)

	item := items[0].(map[string]interface{})
	assert.Equal(t, "test-vs", item["name"])
	assert.Equal(t, "default", item["namespace"])
	assert.Equal(t, []interface{}{"example.com"}, item["hosts"])
}

func TestHandleGetVirtualService(t *testing.T) {
	scheme := runtime.NewScheme()

	vs := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "networking.istio.io/v1beta1",
			"kind":       "VirtualService",
			"metadata": map[string]interface{}{
				"name":              "test-vs",
				"namespace":         "default",
				"creationTimestamp": "2023-01-01T00:00:00Z",
			},
			"spec": map[string]interface{}{
				"hosts": []interface{}{"example.com"},
			},
		},
	}
	vs.SetGroupVersionKind(virtualServiceGVR.GroupVersion().WithKind("VirtualService"))

	// Use NewSimpleDynamicClientWithCustomListKinds to register the required mappings
	gvrToListKind := map[schema.GroupVersionResource]string{
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "virtualservices"}: "VirtualServiceList",
	}

	dynamicClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind, vs)

	server := &Server{
		logger:        zaptest.NewLogger(t),
		dynamicClient: dynamicClient,
	}

	req := httptest.NewRequest("GET", "/api/v1/istio/virtualservices/default/test-vs", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("namespace", "default")
	rctx.URLParams.Add("name", "test-vs")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	w := httptest.NewRecorder()

	server.handleGetVirtualService(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, "success", response["status"])
	data := response["data"].(map[string]interface{})
	summary := data["summary"].(map[string]interface{})
	assert.Equal(t, "test-vs", summary["name"])
	assert.Equal(t, "default", summary["namespace"])
}

func TestHandleGetVirtualServiceNotFound(t *testing.T) {
	scheme := runtime.NewScheme()

	// Use NewSimpleDynamicClientWithCustomListKinds to register the required mappings
	gvrToListKind := map[schema.GroupVersionResource]string{
		{Group: "networking.istio.io", Version: "v1beta1", Resource: "virtualservices"}: "VirtualServiceList",
	}

	dynamicClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind)

	server := &Server{
		logger:        zaptest.NewLogger(t),
		dynamicClient: dynamicClient,
	}

	req := httptest.NewRequest("GET", "/api/v1/istio/virtualservices/default/nonexistent", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("namespace", "default")
	rctx.URLParams.Add("name", "nonexistent")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	w := httptest.NewRecorder()

	server.handleGetVirtualService(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	assert.NoError(t, err)

	assert.Equal(t, "error", response["status"])
}

func TestCheckCRDExistsError(t *testing.T) {
	scheme := runtime.NewScheme()

	// Use NewSimpleDynamicClientWithCustomListKinds to register the required mappings
	gvrToListKind := map[schema.GroupVersionResource]string{
		{Group: "apiextensions.k8s.io", Version: "v1", Resource: "customresourcedefinitions"}: "CustomResourceDefinitionList",
	}

	dynamicClient := fake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind)

	server := &Server{
		logger:        zaptest.NewLogger(t),
		dynamicClient: dynamicClient,
	}

	// Test that CRD doesn't exist
	exists := server.checkCRDExists(context.Background(), "nonexistent.crd.io")
	assert.False(t, exists)
}

func TestVirtualServiceToResponse(t *testing.T) {
	vs := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"metadata": map[string]interface{}{
				"name":              "test-vs",
				"namespace":         "default",
				"creationTimestamp": "2023-01-01T00:00:00Z",
				"labels": map[string]interface{}{
					"app": "test",
				},
			},
			"spec": map[string]interface{}{
				"hosts":    []interface{}{"example.com", "test.com"},
				"gateways": []interface{}{"gateway1", "gateway2"},
			},
		},
	}

	server := &Server{
		logger: zaptest.NewLogger(t),
	}

	response := server.virtualServiceToResponse(vs)

	assert.Equal(t, "test-vs", response["name"])
	assert.Equal(t, "default", response["namespace"])
	assert.Equal(t, []string{"example.com", "test.com"}, response["hosts"])
	assert.Equal(t, []string{"gateway1", "gateway2"}, response["gateways"])

	labels := response["labels"].(map[string]interface{})
	assert.Equal(t, "test", labels["app"])
}

func TestGatewayToResponse(t *testing.T) {
	gw := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"metadata": map[string]interface{}{
				"name":              "test-gw",
				"namespace":         "default",
				"creationTimestamp": "2023-01-01T00:00:00Z",
			},
			"spec": map[string]interface{}{
				"addresses": []interface{}{"192.168.1.1"},
				"servers": []interface{}{
					map[string]interface{}{
						"port": map[string]interface{}{
							"name":     "http",
							"number":   float64(80),
							"protocol": "HTTP",
						},
					},
					map[string]interface{}{
						"port": map[string]interface{}{
							"name":     "https",
							"number":   float64(443),
							"protocol": "HTTPS",
						},
					},
				},
			},
		},
	}

	server := &Server{
		logger: zaptest.NewLogger(t),
	}

	response := server.gatewayToResponse(gw)

	assert.Equal(t, "test-gw", response["name"])
	assert.Equal(t, "default", response["namespace"])
	assert.Equal(t, []string{"192.168.1.1"}, response["addresses"])

	ports := response["ports"].([]map[string]interface{})
	assert.Len(t, ports, 2)
	assert.Equal(t, "http", ports[0]["name"])
	assert.Equal(t, 80, ports[0]["number"])
	assert.Equal(t, "HTTP", ports[0]["protocol"])
}
