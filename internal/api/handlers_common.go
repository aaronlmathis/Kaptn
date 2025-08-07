package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

// handleExportResource handles GET /api/v1/namespaces/{namespace}/{kind}/{name}/export
// @Summary Export resource
// @Description Export a resource (namespaced or cluster-scoped) as YAML/JSON.
// @Tags Resources
// @Produce json
// @Param namespace path string true "Namespace (empty for cluster-scoped resources)"
// @Param kind path string true "Resource kind (e.g., Pod, Deployment, Node, etc.)"
// @Param name path string true "Resource name"
// @Success 200 {object} interface{} "Exported resource object"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/namespaces/{namespace}/{kind}/{name}/export [get]
func (s *Server) handleExportResource(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	kind := chi.URLParam(r, "kind")
	name := chi.URLParam(r, "name")

	if kind == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "kind and name are required"})
		return
	}

	// For cluster-scoped resources, namespace can be empty
	// Check if this is a cluster-scoped resource
	clusterScopedResources := map[string]bool{
		"StorageClass":       true,
		"PersistentVolume":   true,
		"ClusterRole":        true,
		"ClusterRoleBinding": true,
		"Node":               true,
		"CSIDriver":          true,
		"Namespace":          true,
	}

	// If it's not a cluster-scoped resource, namespace is required
	if !clusterScopedResources[kind] && namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace is required for namespaced resources"})
		return
	}

	export, err := s.resourceManager.ExportResource(r.Context(), namespace, name, kind)
	if err != nil {
		s.logger.Error("Failed to export resource",
			zap.String("namespace", namespace),
			zap.String("kind", kind),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(export)
}

// handleExportClusterScopedResource handles GET /api/v1/{kind}/{name}/export
// @Summary Export cluster-scoped resource
// @Description Export a cluster-scoped resource as YAML/JSON.
// @Tags Resources
// @Produce json
// @Param kind path string true "Resource kind (e.g., Node, ClusterRole, etc.)"
// @Param name path string true "Resource name"
// @Success 200 {object} interface{} "Exported resource object"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/{kind}/{name}/export [get]
func (s *Server) handleExportClusterScopedResource(w http.ResponseWriter, r *http.Request) {
	kind := chi.URLParam(r, "kind")
	name := chi.URLParam(r, "name")

	if kind == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "kind and name are required"})
		return
	}

	// This endpoint is specifically for cluster-scoped resources, so pass empty namespace
	export, err := s.resourceManager.ExportResource(r.Context(), "", name, kind)
	if err != nil {
		s.logger.Error("Failed to export cluster-scoped resource",
			zap.String("kind", kind),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(export)
}

// handleGetPodLogs handles GET /api/v1/namespaces/{namespace}/pods/{podName}/logs
// @Summary Get pod logs
// @Description Get logs for a specific pod and (optionally) container.
// @Tags Pods
// @Produce plain
// @Param namespace path string true "Namespace"
// @Param podName path string true "Pod name"
// @Param container query string false "Container name (optional)"
// @Param tailLines query int false "Number of lines from the end of the logs"
// @Success 200 {string} string "Pod logs"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/namespaces/{namespace}/pods/{podName}/logs [get]
func (s *Server) handleGetPodLogs(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	podName := chi.URLParam(r, "podName")
	containerName := r.URL.Query().Get("container")

	if namespace == "" || podName == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace and podName are required"})
		return
	}

	var tailLines *int64
	if tail := r.URL.Query().Get("tailLines"); tail != "" {
		if lines, err := strconv.ParseInt(tail, 10, 64); err == nil {
			tailLines = &lines
		}
	}

	logs, err := s.resourceManager.GetPodLogs(r.Context(), namespace, podName, containerName, tailLines)
	if err != nil {
		s.logger.Error("Failed to get pod logs",
			zap.String("namespace", namespace),
			zap.String("pod", podName),
			zap.String("container", containerName),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(logs))
}
