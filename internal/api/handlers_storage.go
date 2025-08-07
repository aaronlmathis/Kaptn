package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	storagev1 "k8s.io/api/storage/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// handleListPersistentVolumeClaims handles GET /api/v1/persistentvolumeclaims
// @Summary List PersistentVolumeClaims
// @Description Lists all PersistentVolumeClaims in the cluster or a specific namespace, with optional search and pagination.
// @Tags PersistentVolumeClaims
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty or 'all' for all namespaces)"
// @Param search query string false "Search term for PVC name, namespace, or status"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Success 200 {object} map[string]interface{} "Paginated list of PersistentVolumeClaims"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/persistentvolumeclaims [get]
func (s *Server) handleListPersistentVolumeClaims(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters for enhanced filtering
	namespace := r.URL.Query().Get("namespace")
	search := r.URL.Query().Get("search")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	var pvcs *v1.PersistentVolumeClaimList
	var err error

	// Get PVCs from Kubernetes API - either all namespaces or specific namespace
	if namespace == "" || namespace == "all" {
		pvcs, err = s.kubeClient.CoreV1().PersistentVolumeClaims("").List(
			r.Context(),
			metav1.ListOptions{},
		)
	} else {
		pvcs, err = s.kubeClient.CoreV1().PersistentVolumeClaims(namespace).List(
			r.Context(),
			metav1.ListOptions{},
		)
	}

	if err != nil {
		s.logger.Error("Failed to list persistent volume claims", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to slice for filtering
	pvcList := append([]v1.PersistentVolumeClaim{}, pvcs.Items...)

	// Store total count before filtering for pagination metadata
	totalBeforeFilter := len(pvcList)

	// Apply basic filtering if search is provided
	if search != "" {
		var filteredPVCs []v1.PersistentVolumeClaim
		searchLower := strings.ToLower(search)
		for _, pvc := range pvcList {
			if strings.Contains(strings.ToLower(pvc.Name), searchLower) ||
				strings.Contains(strings.ToLower(pvc.Namespace), searchLower) ||
				strings.Contains(strings.ToLower(string(pvc.Status.Phase)), searchLower) {
				filteredPVCs = append(filteredPVCs, pvc)
			}
		}
		pvcList = filteredPVCs
	}

	// Convert to enhanced summaries
	var items []map[string]interface{}
	for _, pvc := range pvcList {
		summary := s.persistentVolumeClaimToResponse(&pvc)
		items = append(items, summary)
	}

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize

	if start >= len(items) {
		items = []map[string]interface{}{}
	} else if end > len(items) {
		items = items[start:]
	} else {
		items = items[start:end]
	}

	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    items,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalBeforeFilter,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetPersistentVolumeClaim handles GET /api/v1/namespaces/{namespace}/persistentvolumeclaims/{name}
// @Summary Get PersistentVolumeClaim details
// @Description Get details and summary for a specific PersistentVolumeClaim.
// @Tags PersistentVolumeClaims
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "PersistentVolumeClaim name"
// @Success 200 {object} map[string]interface{} "PersistentVolumeClaim details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/persistentvolumeclaims/{name} [get]
func (s *Server) handleGetPersistentVolumeClaim(w http.ResponseWriter, r *http.Request) {
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

	// Get PVC from Kubernetes API
	pvc, err := s.kubeClient.CoreV1().PersistentVolumeClaims(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get persistent volume claim",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to enhanced summary
	summary := s.persistentVolumeClaimToResponse(pvc)

	// Add full PVC details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       pvc.Spec,
		"status":     pvc.Status,
		"metadata":   pvc.ObjectMeta,
		"kind":       "PersistentVolumeClaim",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListStorageClasses handles GET /api/v1/storageclasses
// @Summary List StorageClasses
// @Description Lists all StorageClasses with optional search and pagination.
// @Tags StorageClasses
// @Produce json
// @Param search query string false "Search term for StorageClass name"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Success 200 {object} map[string]interface{} "Paginated list of StorageClasses"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/storageclasses [get]
func (s *Server) handleListStorageClasses(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")
	search := r.URL.Query().Get("search")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	// Get storage classes from resource manager
	storageClasses, err := s.resourceManager.ListStorageClasses(r.Context())
	if err != nil {
		s.logger.Error("Failed to list storage classes", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": map[string]interface{}{
				"items":    []interface{}{},
				"page":     page,
				"pageSize": pageSize,
				"total":    0,
			},
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Store total count before filtering
	totalBeforeFilter := len(storageClasses)

	// Apply basic search filtering
	var filteredStorageClasses []interface{}
	for _, sc := range storageClasses {
		if search != "" {
			if !strings.Contains(strings.ToLower(sc.Name), strings.ToLower(search)) {
				continue
			}
		}
		filteredStorageClasses = append(filteredStorageClasses, sc)
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, sc := range filteredStorageClasses {
		scTyped, ok := sc.(storagev1.StorageClass)
		if !ok {
			continue
		}
		responses = append(responses, s.storageClassToResponse(scTyped))
	}

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(responses) {
		responses = []map[string]interface{}{}
	} else if end > len(responses) {
		responses = responses[start:]
	} else {
		responses = responses[start:end]
	}

	// Create paginated response
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    responses,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalBeforeFilter,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetStorageClass handles GET /api/v1/storageclasses/{name}
// @Summary Get StorageClass details
// @Description Get details and summary for a specific StorageClass.
// @Tags StorageClasses
// @Produce json
// @Param name path string true "StorageClass name"
// @Success 200 {object} map[string]interface{} "StorageClass details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/storageclasses/{name} [get]
func (s *Server) handleGetStorageClass(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	if name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "name is required",
			"status": "error",
		})
		return
	}

	// Get storage class from resource manager
	storageClass, err := s.resourceManager.GetStorageClass(r.Context(), name)
	if err != nil {
		s.logger.Error("Failed to get storage class",
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to enhanced summary
	summary := s.storageClassToResponse(*storageClass)

	// Add full storage class details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"parameters": storageClass.Parameters,
		"metadata":   storageClass.ObjectMeta,
		"kind":       "StorageClass",
		"apiVersion": "storage.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListVolumeSnapshots handles GET /api/v1/volumesnapshots
// @Summary List VolumeSnapshots
// @Description Lists all VolumeSnapshots in the cluster or a specific namespace, with optional search and pagination.
// @Tags VolumeSnapshots
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Param search query string false "Search term for VolumeSnapshot name"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Success 200 {object} map[string]interface{} "Paginated list of VolumeSnapshots"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/volumesnapshots [get]
func (s *Server) handleListVolumeSnapshots(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	namespace := r.URL.Query().Get("namespace")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")
	search := r.URL.Query().Get("search")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	// Get volume snapshots from resource manager
	volumeSnapshots, err := s.resourceManager.ListVolumeSnapshots(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list volume snapshots", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": map[string]interface{}{
				"items":    []interface{}{},
				"page":     page,
				"pageSize": pageSize,
				"total":    0,
			},
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Store total count before filtering
	totalBeforeFilter := len(volumeSnapshots)

	// Apply basic filtering (search by name)
	var filteredVolumeSnapshots []interface{}
	for _, vs := range volumeSnapshots {
		if volumeSnapshotMap, ok := vs.(map[string]interface{}); ok {
			// Basic search filter
			if search != "" {
				if metadata, ok := volumeSnapshotMap["metadata"].(map[string]interface{}); ok {
					if name, ok := metadata["name"].(string); ok {
						if !strings.Contains(strings.ToLower(name), strings.ToLower(search)) {
							continue
						}
					}
				}
			}
			filteredVolumeSnapshots = append(filteredVolumeSnapshots, vs)
		}
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, volumeSnapshot := range filteredVolumeSnapshots {
		responses = append(responses, s.volumeSnapshotToResponse(volumeSnapshot))
	}

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(responses) {
		responses = []map[string]interface{}{}
	} else if end > len(responses) {
		responses = responses[start:]
	} else {
		responses = responses[start:end]
	}

	// Create paginated response
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    responses,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalBeforeFilter,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetVolumeSnapshot handles GET /api/v1/namespaces/{namespace}/volumesnapshots/{name}
// @Summary Get VolumeSnapshot details
// @Description Get details and summary for a specific VolumeSnapshot.
// @Tags VolumeSnapshots
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "VolumeSnapshot name"
// @Success 200 {object} map[string]interface{} "VolumeSnapshot details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/volumesnapshots/{name} [get]
func (s *Server) handleGetVolumeSnapshot(w http.ResponseWriter, r *http.Request) {
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

	// Get volume snapshot from resource manager
	volumeSnapshot, err := s.resourceManager.GetVolumeSnapshot(r.Context(), namespace, name)
	if err != nil {
		s.logger.Error("Failed to get volume snapshot",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to enhanced summary
	summary := s.volumeSnapshotToResponse(volumeSnapshot)

	// Add full volume snapshot details for detailed view
	volumeSnapshotMap := volumeSnapshot.(map[string]interface{})
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       volumeSnapshotMap["spec"],
		"status":     volumeSnapshotMap["status"],
		"metadata":   volumeSnapshotMap["metadata"],
		"kind":       "VolumeSnapshot",
		"apiVersion": "snapshot.storage.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListVolumeSnapshotClasses handles GET /api/v1/volumesnapshotclasses
// @Summary List VolumeSnapshotClasses
// @Description Lists all VolumeSnapshotClasses with optional search and pagination.
// @Tags VolumeSnapshotClasses
// @Produce json
// @Param search query string false "Search term for VolumeSnapshotClass name"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Success 200 {object} map[string]interface{} "Paginated list of VolumeSnapshotClasses"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/volumesnapshotclasses [get]
func (s *Server) handleListVolumeSnapshotClasses(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")
	search := r.URL.Query().Get("search")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	// Get volume snapshot classes from resource manager
	volumeSnapshotClasses, err := s.resourceManager.ListVolumeSnapshotClasses(r.Context())
	if err != nil {
		s.logger.Error("Failed to list volume snapshot classes", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": map[string]interface{}{
				"items":    []interface{}{},
				"page":     page,
				"pageSize": pageSize,
				"total":    0,
			},
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Store total count before filtering
	totalBeforeFilter := len(volumeSnapshotClasses)

	// Apply basic search filtering
	var filteredVolumeSnapshotClasses []interface{}
	for _, vsc := range volumeSnapshotClasses {
		if search != "" {
			vscMap, ok := vsc.(map[string]interface{})
			if !ok {
				continue
			}
			if metadata, ok := vscMap["metadata"].(map[string]interface{}); ok {
				if name, ok := metadata["name"].(string); ok {
					if !strings.Contains(strings.ToLower(name), strings.ToLower(search)) {
						continue
					}
				}
			}
		}
		filteredVolumeSnapshotClasses = append(filteredVolumeSnapshotClasses, vsc)
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, vsc := range filteredVolumeSnapshotClasses {
		responses = append(responses, s.volumeSnapshotClassToResponse(vsc))
	}

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(responses) {
		responses = []map[string]interface{}{}
	} else if end > len(responses) {
		responses = responses[start:]
	} else {
		responses = responses[start:end]
	}

	// Create paginated response
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    responses,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalBeforeFilter,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetVolumeSnapshotClass handles GET /api/v1/volumesnapshotclasses/{name}
// @Summary Get VolumeSnapshotClass details
// @Description Get details and summary for a specific VolumeSnapshotClass.
// @Tags VolumeSnapshotClasses
// @Produce json
// @Param name path string true "VolumeSnapshotClass name"
// @Success 200 {object} map[string]interface{} "VolumeSnapshotClass details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/volumesnapshotclasses/{name} [get]
func (s *Server) handleGetVolumeSnapshotClass(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	if name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "name is required",
			"status": "error",
		})
		return
	}

	// Get volume snapshot class from resource manager
	volumeSnapshotClass, err := s.resourceManager.GetVolumeSnapshotClass(r.Context(), name)
	if err != nil {
		s.logger.Error("Failed to get volume snapshot class",
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to enhanced summary
	summary := s.volumeSnapshotClassToResponse(volumeSnapshotClass)

	// Add full volume snapshot class details for detailed view
	volumeSnapshotClassMap := volumeSnapshotClass.(map[string]interface{})
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       volumeSnapshotClassMap["spec"],
		"metadata":   volumeSnapshotClassMap["metadata"],
		"kind":       "VolumeSnapshotClass",
		"apiVersion": "snapshot.storage.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListCSIDrivers handles GET /api/v1/csidrivers
// @Summary List CSIDrivers
// @Description Lists all CSIDrivers with optional search and pagination.
// @Tags CSIDrivers
// @Produce json
// @Param search query string false "Search term for CSIDriver name"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Success 200 {object} map[string]interface{} "Paginated list of CSIDrivers"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/csidrivers [get]
func (s *Server) handleListCSIDrivers(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")
	search := r.URL.Query().Get("search")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	// Get CSI drivers from resource manager
	csiDrivers, err := s.resourceManager.ListCSIDrivers(r.Context())
	if err != nil {
		s.logger.Error("Failed to list CSI drivers", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": map[string]interface{}{
				"items":    []interface{}{},
				"page":     page,
				"pageSize": pageSize,
				"total":    0,
			},
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Store total count before filtering
	totalBeforeFilter := len(csiDrivers)

	// Apply basic search filtering
	var filteredCSIDrivers []interface{}
	for _, csi := range csiDrivers {
		if search != "" {
			if !strings.Contains(strings.ToLower(csi.Name), strings.ToLower(search)) {
				continue
			}
		}
		filteredCSIDrivers = append(filteredCSIDrivers, csi)
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, csi := range filteredCSIDrivers {
		csiTyped, ok := csi.(storagev1.CSIDriver)
		if !ok {
			continue
		}
		responses = append(responses, s.csiDriverToResponse(csiTyped))
	}

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(responses) {
		responses = []map[string]interface{}{}
	} else if end > len(responses) {
		responses = responses[start:]
	} else {
		responses = responses[start:end]
	}

	// Create paginated response
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    responses,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalBeforeFilter,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetCSIDriver handles GET /api/v1/csidrivers/{name}
// @Summary Get CSIDriver details
// @Description Get details and summary for a specific CSIDriver.
// @Tags CSIDrivers
// @Produce json
// @Param name path string true "CSIDriver name"
// @Success 200 {object} map[string]interface{} "CSIDriver details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/csidrivers/{name} [get]
func (s *Server) handleGetCSIDriver(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	if name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "name is required",
			"status": "error",
		})
		return
	}

	// Get CSI driver from resource manager
	csiDriver, err := s.resourceManager.GetCSIDriver(r.Context(), name)
	if err != nil {
		s.logger.Error("Failed to get CSI driver",
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to enhanced summary
	summary := s.csiDriverToResponse(*csiDriver)

	// Add full CSI driver details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       csiDriver.Spec,
		"metadata":   csiDriver.ObjectMeta,
		"kind":       "CSIDriver",
		"apiVersion": "storage.k8s.io/v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// handleListConfigMaps handles GET /api/v1/configmaps
// @Summary List ConfigMaps
// @Description Lists all ConfigMaps in the cluster or a specific namespace, with optional search and pagination.
// @Tags ConfigMaps
// @Produce json
// @Param namespace query string false "Namespace to filter by (empty for all namespaces)"
// @Param search query string false "Search term for ConfigMap name"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Success 200 {object} map[string]interface{} "Paginated list of ConfigMaps"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/configmaps [get]
func (s *Server) handleListConfigMaps(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	namespace := r.URL.Query().Get("namespace")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")
	search := r.URL.Query().Get("search")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	// Get config maps from resource manager
	configMaps, err := s.resourceManager.ListConfigMaps(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list config maps", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"data": map[string]interface{}{
				"items":    []interface{}{},
				"page":     page,
				"pageSize": pageSize,
				"total":    0,
			},
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	// Store total count before filtering
	totalBeforeFilter := len(configMaps)

	// Apply basic filtering
	var filteredConfigMaps []v1.ConfigMap
	for _, cm := range configMaps {
		// Basic search filter
		if search != "" {
			if !strings.Contains(strings.ToLower(cm.Name), strings.ToLower(search)) {
				continue
			}
		}
		filteredConfigMaps = append(filteredConfigMaps, cm)
	}

	// Convert to response format
	var responses []map[string]interface{}
	for _, configMap := range filteredConfigMaps {
		responses = append(responses, s.configMapToResponse(configMap))
	}

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize
	if start > len(responses) {
		responses = []map[string]interface{}{}
	} else if end > len(responses) {
		responses = responses[start:]
	} else {
		responses = responses[start:end]
	}

	// Create paginated response
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    responses,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalBeforeFilter,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetConfigMap handles GET /api/v1/namespaces/{namespace}/configmaps/{name}
// @Summary Get ConfigMap details
// @Description Get details and summary for a specific ConfigMap.
// @Tags ConfigMaps
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "ConfigMap name"
// @Success 200 {object} map[string]interface{} "ConfigMap details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/namespaces/{namespace}/configmaps/{name} [get]
func (s *Server) handleGetConfigMap(w http.ResponseWriter, r *http.Request) {
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

	// Get config map from resource manager
	configMap, err := s.resourceManager.GetConfigMap(r.Context(), namespace, name)
	if err != nil {
		s.logger.Error("Failed to get config map",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert unstructured to ConfigMap for enhanced summary
	configMapObj := &v1.ConfigMap{}
	if unstructuredMap, ok := configMap.(map[string]interface{}); ok {
		// Extract metadata
		if metadata, ok := unstructuredMap["metadata"].(map[string]interface{}); ok {
			if name, ok := metadata["name"].(string); ok {
				configMapObj.Name = name
			}
			if namespace, ok := metadata["namespace"].(string); ok {
				configMapObj.Namespace = namespace
			}
			if creationTimestamp, ok := metadata["creationTimestamp"].(string); ok {
				if ts, err := time.Parse(time.RFC3339, creationTimestamp); err == nil {
					configMapObj.CreationTimestamp = metav1.NewTime(ts)
				}
			}
		}
		// Extract data
		if data, ok := unstructuredMap["data"].(map[string]interface{}); ok {
			configMapObj.Data = make(map[string]string)
			for k, v := range data {
				if strVal, ok := v.(string); ok {
					configMapObj.Data[k] = strVal
				}
			}
		}
	}

	// Convert to enhanced summary
	summary := s.configMapToResponse(*configMapObj)

	// Add full config map details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       configMap.(map[string]interface{})["data"],
		"metadata":   configMap.(map[string]interface{})["metadata"],
		"kind":       "ConfigMap",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}

// Persistent Volume handlers

// handleListPersistentVolumes handles GET /api/v1/persistentvolumes
// @Summary List PersistentVolumes
// @Description Lists all PersistentVolumes in the cluster, with optional search and pagination.
// @Tags PersistentVolumes
// @Produce json
// @Param search query string false "Search term for PersistentVolume name or status"
// @Param page query int false "Page number (default: 1)"
// @Param pageSize query int false "Page size (default: 25)"
// @Success 200 {object} map[string]interface{} "Paginated list of PersistentVolumes"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/persistentvolumes [get]
func (s *Server) handleListPersistentVolumes(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters for enhanced filtering
	search := r.URL.Query().Get("search")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	// Get PVs from Kubernetes API
	pvs, err := s.kubeClient.CoreV1().PersistentVolumes().List(
		r.Context(),
		metav1.ListOptions{},
	)
	if err != nil {
		s.logger.Error("Failed to list persistent volumes", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to slice for filtering
	pvList := append([]v1.PersistentVolume{}, pvs.Items...)

	// Store total count before filtering for pagination metadata
	totalBeforeFilter := len(pvList)

	// Apply basic filtering if search is provided
	if search != "" {
		var filteredPVs []v1.PersistentVolume
		searchLower := strings.ToLower(search)
		for _, pv := range pvList {
			if strings.Contains(strings.ToLower(pv.Name), searchLower) ||
				strings.Contains(strings.ToLower(string(pv.Status.Phase)), searchLower) {
				filteredPVs = append(filteredPVs, pv)
			}
		}
		pvList = filteredPVs
	}

	// Convert to enhanced summaries
	var items []map[string]interface{}
	for _, pv := range pvList {
		summary := s.persistentVolumeToResponse(&pv)
		items = append(items, summary)
	}

	// Apply pagination
	start := (page - 1) * pageSize
	end := start + pageSize

	if start >= len(items) {
		items = []map[string]interface{}{}
	} else if end > len(items) {
		items = items[start:]
	} else {
		items = items[start:end]
	}

	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    items,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalBeforeFilter,
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetPersistentVolume handles GET /api/v1/persistentvolumes/{name}
// @Summary Get PersistentVolume details
// @Description Get details and summary for a specific PersistentVolume.
// @Tags PersistentVolumes
// @Produce json
// @Param name path string true "PersistentVolume name"
// @Success 200 {object} map[string]interface{} "PersistentVolume details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/persistentvolumes/{name} [get]
func (s *Server) handleGetPersistentVolume(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	if name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "name is required",
			"status": "error",
		})
		return
	}

	// Get PV from Kubernetes API
	pv, err := s.kubeClient.CoreV1().PersistentVolumes().Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		s.logger.Error("Failed to get persistent volume",
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  err.Error(),
			"status": "error",
		})
		return
	}

	// Convert to enhanced summary
	summary := s.persistentVolumeToResponse(pv)

	// Add full PV details for detailed view
	fullDetails := map[string]interface{}{
		"summary":    summary,
		"spec":       pv.Spec,
		"status":     pv.Status,
		"metadata":   pv.ObjectMeta,
		"kind":       "PersistentVolume",
		"apiVersion": "v1",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   fullDetails,
		"status": "success",
	})
}
