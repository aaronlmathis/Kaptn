package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/yaml"
)

// Istio GroupVersionResources
var (
	virtualServiceGVR = schema.GroupVersionResource{
		Group:    "networking.istio.io",
		Version:  "v1beta1",
		Resource: "virtualservices",
	}
	gatewayGVR = schema.GroupVersionResource{
		Group:    "networking.istio.io",
		Version:  "v1beta1",
		Resource: "gateways",
	}
)

// IstioCapabilities represents Istio detection information
type IstioCapabilities struct {
	Installed bool           `json:"installed"`
	Used      bool           `json:"used"`
	CRDs      []string       `json:"crds"`
	Counts    map[string]int `json:"counts"`
}

// handleGetCapabilities handles GET /api/v1/capabilities
// @Summary Get cluster capabilities
// @Description Get information about cluster capabilities including Istio support
// @Tags Capabilities
// @Produce json
// @Success 200 {object} map[string]interface{} "Cluster capabilities"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/capabilities [get]
func (s *Server) handleGetCapabilities(w http.ResponseWriter, r *http.Request) {
	capabilities := map[string]interface{}{
		"istio": s.detectIstioCapabilities(r.Context()),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   capabilities,
		"status": "success",
	})
}

// detectIstioCapabilities detects if Istio is installed and used in the cluster
func (s *Server) detectIstioCapabilities(ctx context.Context) IstioCapabilities {
	capabilities := IstioCapabilities{
		Installed: false,
		Used:      false,
		CRDs:      []string{},
		Counts:    map[string]int{},
	}

	// Check if VirtualService CRD exists
	vsInstalled := s.checkCRDExists(ctx, "virtualservices.networking.istio.io")
	if vsInstalled {
		capabilities.CRDs = append(capabilities.CRDs, "virtualservices.networking.istio.io")
	}

	// Check if Gateway CRD exists
	gwInstalled := s.checkCRDExists(ctx, "gateways.networking.istio.io")
	if gwInstalled {
		capabilities.CRDs = append(capabilities.CRDs, "gateways.networking.istio.io")
	}

	capabilities.Installed = vsInstalled && gwInstalled

	if !capabilities.Installed {
		return capabilities
	}

	// Count VirtualServices
	vsCount := s.countResources(ctx, virtualServiceGVR)
	capabilities.Counts["virtualservices"] = vsCount

	// Count Gateways
	gwCount := s.countResources(ctx, gatewayGVR)
	capabilities.Counts["gateways"] = gwCount

	// Istio is considered "used" if there are any VirtualServices or Gateways
	capabilities.Used = vsCount > 0 || gwCount > 0

	return capabilities
}

// checkCRDExists checks if a specific CRD exists in the cluster
func (s *Server) checkCRDExists(ctx context.Context, crdName string) bool {
	gvr := schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}

	_, err := s.dynamicClient.Resource(gvr).Get(ctx, crdName, metav1.GetOptions{})
	return err == nil
}

// countResources counts the total number of resources of a given type across all namespaces
func (s *Server) countResources(ctx context.Context, gvr schema.GroupVersionResource) int {
	list, err := s.dynamicClient.Resource(gvr).List(ctx, metav1.ListOptions{})
	if err != nil {
		s.logger.Warn("Failed to count resources",
			zap.String("gvr", gvr.String()),
			zap.Error(err))
		return 0
	}
	s.logger.Debug("Counted resources",
		zap.String("gvr", gvr.String()),
		zap.Int("count", len(list.Items)),
		zap.Any("items", list.Items))
	return len(list.Items)
}

// handleListVirtualServices handles GET /api/v1/istio/virtualservices
// @Summary List VirtualServices
// @Description Lists all VirtualServices in the cluster or a specific namespace
// @Tags Istio
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Param limit query int false "Maximum number of results to return"
// @Param continue query string false "Continue token for pagination"
// @Success 200 {object} map[string]interface{} "List of VirtualServices"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/istio/virtualservices [get]
func (s *Server) handleListVirtualServices(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	limitStr := r.URL.Query().Get("limit")
	continueToken := r.URL.Query().Get("continue")

	listOptions := metav1.ListOptions{
		Continue: continueToken,
	}

	if limitStr != "" {
		if limit, err := strconv.ParseInt(limitStr, 10, 64); err == nil {
			listOptions.Limit = limit
		}
	}

	var list *unstructured.UnstructuredList
	var err error

	if namespace != "" {
		list, err = s.dynamicClient.Resource(virtualServiceGVR).Namespace(namespace).List(r.Context(), listOptions)
	} else {
		list, err = s.dynamicClient.Resource(virtualServiceGVR).List(r.Context(), listOptions)
	}

	if err != nil {
		s.handleIstioError(w, "Failed to list VirtualServices", err)
		return
	}

	// Convert to response format
	var items []map[string]interface{}
	for _, item := range list.Items {
		items = append(items, s.virtualServiceToResponse(&item))
	}

	response := map[string]interface{}{
		"items":    items,
		"continue": list.GetContinue(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   response,
		"status": "success",
	})
}

// handleGetVirtualService handles GET /api/v1/istio/virtualservices/{namespace}/{name}
// @Summary Get VirtualService details
// @Description Get details for a specific VirtualService
// @Tags Istio
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "VirtualService name"
// @Success 200 {object} map[string]interface{} "VirtualService details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/istio/virtualservices/{namespace}/{name} [get]
func (s *Server) handleGetVirtualService(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	if namespace == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "namespace and name are required",
			"status": "error",
		})
		return
	}

	obj, err := s.dynamicClient.Resource(virtualServiceGVR).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.handleIstioError(w, "Failed to get VirtualService", err)
		return
	}

	// Convert to enhanced summary
	summary := s.virtualServiceToResponse(obj)

	// Add full spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       obj.Object["spec"],
		"status":     obj.Object["status"],
		"metadata":   obj.Object["metadata"],
		"kind":       obj.GetKind(),
		"apiVersion": obj.GetAPIVersion(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleGetVirtualServiceYAML handles GET /api/v1/istio/virtualservices/{namespace}/{name}/yaml
// @Summary Get VirtualService YAML
// @Description Get raw YAML manifest for a VirtualService
// @Tags Istio
// @Produce text/plain
// @Param namespace path string true "Namespace"
// @Param name path string true "VirtualService name"
// @Success 200 {string} string "VirtualService YAML"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/istio/virtualservices/{namespace}/{name}/yaml [get]
func (s *Server) handleGetVirtualServiceYAML(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	if namespace == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "namespace and name are required",
			"status": "error",
		})
		return
	}

	obj, err := s.dynamicClient.Resource(virtualServiceGVR).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.handleIstioError(w, "Failed to get VirtualService", err)
		return
	}

	yamlBytes, err := yaml.Marshal(obj.Object)
	if err != nil {
		s.logger.Error("Failed to marshal VirtualService to YAML",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "Failed to convert to YAML",
			"status": "error",
		})
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write(yamlBytes)
}

// handleListGateways handles GET /api/v1/istio/gateways
// @Summary List Gateways
// @Description Lists all Gateways in the cluster or a specific namespace
// @Tags Istio
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Param limit query int false "Maximum number of results to return"
// @Param continue query string false "Continue token for pagination"
// @Success 200 {object} map[string]interface{} "List of Gateways"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/istio/gateways [get]
func (s *Server) handleListGateways(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	limitStr := r.URL.Query().Get("limit")
	continueToken := r.URL.Query().Get("continue")

	listOptions := metav1.ListOptions{
		Continue: continueToken,
	}

	if limitStr != "" {
		if limit, err := strconv.ParseInt(limitStr, 10, 64); err == nil {
			listOptions.Limit = limit
		}
	}

	var list *unstructured.UnstructuredList
	var err error

	if namespace != "" {
		list, err = s.dynamicClient.Resource(gatewayGVR).Namespace(namespace).List(r.Context(), listOptions)
	} else {
		list, err = s.dynamicClient.Resource(gatewayGVR).List(r.Context(), listOptions)
	}

	if err != nil {
		s.handleIstioError(w, "Failed to list Gateways", err)
		return
	}

	// Convert to response format
	var items []map[string]interface{}
	for _, item := range list.Items {
		items = append(items, s.gatewayToResponse(&item))
	}

	response := map[string]interface{}{
		"items":    items,
		"continue": list.GetContinue(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   response,
		"status": "success",
	})
}

// handleGetGateway handles GET /api/v1/istio/gateways/{namespace}/{name}
// @Summary Get Gateway details
// @Description Get details for a specific Gateway
// @Tags Istio
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Gateway name"
// @Success 200 {object} map[string]interface{} "Gateway details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/istio/gateways/{namespace}/{name} [get]
func (s *Server) handleGetGateway(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	if namespace == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "namespace and name are required",
			"status": "error",
		})
		return
	}

	obj, err := s.dynamicClient.Resource(gatewayGVR).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.handleIstioError(w, "Failed to get Gateway", err)
		return
	}

	// Convert to enhanced summary
	summary := s.gatewayToResponse(obj)

	// Add full spec for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       obj.Object["spec"],
		"status":     obj.Object["status"],
		"metadata":   obj.Object["metadata"],
		"kind":       obj.GetKind(),
		"apiVersion": obj.GetAPIVersion(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleGetGatewayYAML handles GET /api/v1/istio/gateways/{namespace}/{name}/yaml
// @Summary Get Gateway YAML
// @Description Get raw YAML manifest for a Gateway
// @Tags Istio
// @Produce text/plain
// @Param namespace path string true "Namespace"
// @Param name path string true "Gateway name"
// @Success 200 {string} string "Gateway YAML"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/istio/gateways/{namespace}/{name}/yaml [get]
func (s *Server) handleGetGatewayYAML(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	if namespace == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "namespace and name are required",
			"status": "error",
		})
		return
	}

	obj, err := s.dynamicClient.Resource(gatewayGVR).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.handleIstioError(w, "Failed to get Gateway", err)
		return
	}

	yamlBytes, err := yaml.Marshal(obj.Object)
	if err != nil {
		s.logger.Error("Failed to marshal Gateway to YAML",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "Failed to convert to YAML",
			"status": "error",
		})
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write(yamlBytes)
}

// virtualServiceToResponse converts a VirtualService to response format
func (s *Server) virtualServiceToResponse(obj *unstructured.Unstructured) map[string]interface{} {
	metadata := obj.Object["metadata"].(map[string]interface{})
	spec := obj.Object["spec"].(map[string]interface{})

	name := metadata["name"].(string)
	namespace := metadata["namespace"].(string)
	labels, _ := metadata["labels"].(map[string]interface{})

	// Calculate age
	age := "Unknown"
	if creationTimestamp, ok := metadata["creationTimestamp"].(string); ok {
		if createdTime, err := time.Parse(time.RFC3339, creationTimestamp); err == nil {
			age = calculateAge(createdTime)
		}
	}

	// Extract hosts
	var hosts []string
	if hostsInterface, ok := spec["hosts"].([]interface{}); ok {
		for _, hostInterface := range hostsInterface {
			if host, ok := hostInterface.(string); ok {
				hosts = append(hosts, host)
			}
		}
	}

	// Extract gateways
	var gateways []string
	if gatewaysInterface, ok := spec["gateways"].([]interface{}); ok {
		for _, gatewayInterface := range gatewaysInterface {
			if gateway, ok := gatewayInterface.(string); ok {
				gateways = append(gateways, gateway)
			}
		}
	}

	return map[string]interface{}{
		"name":      name,
		"namespace": namespace,
		"age":       age,
		"hosts":     hosts,
		"gateways":  gateways,
		"labels":    labels,
	}
}

// gatewayToResponse converts a Gateway to response format
func (s *Server) gatewayToResponse(obj *unstructured.Unstructured) map[string]interface{} {
	metadata := obj.Object["metadata"].(map[string]interface{})
	spec := obj.Object["spec"].(map[string]interface{})

	name := metadata["name"].(string)
	namespace := metadata["namespace"].(string)
	labels, _ := metadata["labels"].(map[string]interface{})

	// Calculate age
	age := "Unknown"
	if creationTimestamp, ok := metadata["creationTimestamp"].(string); ok {
		if createdTime, err := time.Parse(time.RFC3339, creationTimestamp); err == nil {
			age = calculateAge(createdTime)
		}
	}

	// Extract addresses if present
	var addresses []string
	if addressesInterface, ok := spec["addresses"].([]interface{}); ok {
		for _, addressInterface := range addressesInterface {
			if address, ok := addressInterface.(string); ok {
				addresses = append(addresses, address)
			}
		}
	}

	// Extract ports from servers
	var ports []map[string]interface{}
	if serversInterface, ok := spec["servers"].([]interface{}); ok {
		for _, serverInterface := range serversInterface {
			if server, ok := serverInterface.(map[string]interface{}); ok {
				if portInterface, ok := server["port"].(map[string]interface{}); ok {
					port := map[string]interface{}{}
					if name, ok := portInterface["name"].(string); ok {
						port["name"] = name
					}
					if number, ok := portInterface["number"].(float64); ok {
						port["number"] = int(number)
					}
					if protocol, ok := portInterface["protocol"].(string); ok {
						port["protocol"] = protocol
					}
					ports = append(ports, port)
				}
			}
		}
	}

	return map[string]interface{}{
		"name":      name,
		"namespace": namespace,
		"age":       age,
		"addresses": addresses,
		"ports":     ports,
		"labels":    labels,
	}
}

// handleIstioError handles Istio-related errors and sends appropriate HTTP responses
func (s *Server) handleIstioError(w http.ResponseWriter, message string, err error) {
	s.logger.Error(message, zap.Error(err))

	status := http.StatusInternalServerError
	errorMessage := err.Error()

	if errors.IsNotFound(err) {
		status = http.StatusNotFound
		errorMessage = "Resource not found"
	}

	// Check if Istio CRDs are not installed
	if strings.Contains(err.Error(), "no matches for kind") ||
		strings.Contains(err.Error(), "the server could not find the requested resource") {
		status = http.StatusNotFound
		errorMessage = "Istio CRDs not found - Istio may not be installed"
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":  errorMessage,
		"status": "error",
	})
}
