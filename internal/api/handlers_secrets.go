package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/selectors"
	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
	v1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// SecretSummary represents a summary view of a secret for list views
type SecretSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Type              string            `json:"type"`
	Keys              []string          `json:"keys"`
	KeyCount          int               `json:"keyCount"`
	Age               string            `json:"age"`
	AgeTimestamp      time.Time         `json:"ageTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	ResourceVersion   string            `json:"resourceVersion"`
	UID               string            `json:"uid"`
}

// SecretDetail represents a detailed view of a secret
type SecretDetail struct {
	*SecretSummary
	Data            map[string]string       `json:"data,omitempty"`       // Only included when explicitly requested
	StringData      map[string]string       `json:"stringData,omitempty"` // For creation/updates
	Immutable       *bool                   `json:"immutable,omitempty"`
	ManagedFields   interface{}             `json:"managedFields,omitempty"`
	OwnerReferences []metav1.OwnerReference `json:"ownerReferences,omitempty"`
	Finalizers      []string                `json:"finalizers,omitempty"`
}

// SecretCreateRequest represents a request to create a secret
type SecretCreateRequest struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Type        string            `json:"type"`
	Data        map[string]string `json:"data,omitempty"`
	StringData  map[string]string `json:"stringData,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	Immutable   *bool             `json:"immutable,omitempty"`
}

// SecretUpdateRequest represents a request to update a secret
type SecretUpdateRequest struct {
	Data        map[string]string `json:"data,omitempty"`
	StringData  map[string]string `json:"stringData,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	Immutable   *bool             `json:"immutable,omitempty"`
}

// handleListSecrets handles GET /api/v1/secrets
// @Summary List secrets
// @Description List all secrets across namespaces or in a specific namespace
// @Tags Secrets
// @Produce json
// @Param namespace query string false "Filter by namespace"
// @Param type query string false "Filter by secret type (Opaque, kubernetes.io/tls, etc.)"
// @Param labelSelector query string false "Label selector"
// @Param fieldSelector query string false "Field selector"
// @Param search query string false "Search in name, namespace, labels, type"
// @Param sort query string false "Sort field (name, namespace, type, keys, age)"
// @Param order query string false "Sort order (asc, desc)"
// @Param page query int false "Page number (1-based)"
// @Param pageSize query int false "Number of items per page"
// @Param includeData query bool false "Include secret data in response (default: false)"
// @Success 200 {object} map[string]interface{} "List of secrets"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/secrets [get]
func (s *Server) handleListSecrets(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters
	namespace := r.URL.Query().Get("namespace")
	secretType := r.URL.Query().Get("type")
	labelSelector := r.URL.Query().Get("labelSelector")
	fieldSelector := r.URL.Query().Get("fieldSelector")
	search := r.URL.Query().Get("search")
	sort := r.URL.Query().Get("sort")
	order := r.URL.Query().Get("order")
	pageStr := r.URL.Query().Get("page")
	pageSizeStr := r.URL.Query().Get("pageSize")
	includeDataStr := r.URL.Query().Get("includeData")

	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)
	includeData := strings.ToLower(includeDataStr) == "true"

	// Default page size if not specified
	if pageSize <= 0 {
		pageSize = 25
	}
	if page <= 0 {
		page = 1
	}

	// Get secrets from resource manager
	secrets, err := s.resourceManager.ListSecrets(r.Context(), namespace)
	if err != nil {
		s.logger.Error("Failed to list secrets", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Filter secrets
	filterOpts := selectors.SecretFilterOptions{
		Namespace:     namespace,
		Type:          secretType,
		LabelSelector: labelSelector,
		FieldSelector: fieldSelector,
		Search:        search,
		Sort:          sort,
		Order:         order,
		Page:          page,
		PageSize:      pageSize,
	}

	filteredSecrets, err := selectors.FilterSecrets(secrets, filterOpts)
	if err != nil {
		s.logger.Error("Failed to filter secrets", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to filter secrets: " + err.Error()})
		return
	}

	// Convert to summary format
	var items []interface{}
	for _, secret := range filteredSecrets {
		summary := s.secretToSummary(&secret, includeData)
		items = append(items, summary)
	}

	// Calculate total before pagination for metadata
	totalSecrets := len(secrets)

	// Prepare response with pagination metadata
	response := map[string]interface{}{
		"data": map[string]interface{}{
			"items":    items,
			"page":     page,
			"pageSize": pageSize,
			"total":    totalSecrets,
			"filtered": len(filteredSecrets),
		},
		"status": "success",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

// handleGetSecret handles GET /api/v1/secrets/{namespace}/{name}
// @Summary Get secret
// @Description Get a specific secret by name and namespace
// @Tags Secrets
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Secret name"
// @Param includeData query bool false "Include secret data in response (default: false)"
// @Success 200 {object} map[string]interface{} "Secret details"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 404 {object} map[string]string "Secret not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/secrets/{namespace}/{name} [get]
func (s *Server) handleGetSecret(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	includeDataStr := r.URL.Query().Get("includeData")
	includeData := strings.ToLower(includeDataStr) == "true"

	if namespace == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace and name are required"})
		return
	}

	// Get secret from Kubernetes API
	secret, err := s.resourceManager.GetSecret(r.Context(), namespace, name)
	if err != nil {
		if errors.IsNotFound(err) {
			s.logger.Warn("Secret not found",
				zap.String("namespace", namespace),
				zap.String("name", name))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Secret not found"})
			return
		}

		s.logger.Error("Failed to get secret",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Convert to detailed format
	detail := s.secretToDetail(secret, includeData)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   detail,
		"status": "success",
	})
}

// handleCreateSecret handles POST /api/v1/secrets
// @Summary Create secret
// @Description Create a new secret
// @Tags Secrets
// @Accept json
// @Produce json
// @Param secret body SecretCreateRequest true "Secret to create"
// @Success 201 {object} map[string]interface{} "Created secret"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 409 {object} map[string]string "Secret already exists"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/secrets [post]
func (s *Server) handleCreateSecret(w http.ResponseWriter, r *http.Request) {
	var req SecretCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.logger.Error("Failed to decode request body", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	// Validate required fields
	if req.Name == "" || req.Namespace == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "name and namespace are required"})
		return
	}

	// Set default type if not specified
	if req.Type == "" {
		req.Type = "Opaque"
	}

	// Validate secret data based on type
	if req.Data != nil {
		if err := validateSecretData(req.Type, req.Data); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
	}

	// Create Kubernetes Secret object
	secret := &v1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:        req.Name,
			Namespace:   req.Namespace,
			Labels:      req.Labels,
			Annotations: req.Annotations,
		},
		Type:       v1.SecretType(req.Type),
		Data:       make(map[string][]byte),
		StringData: req.StringData,
		Immutable:  req.Immutable,
	}

	// Convert string data to byte data if provided
	if req.Data != nil {
		for key, value := range req.Data {
			secret.Data[key] = []byte(value)
		}
	}

	// Create the secret
	createdSecret, err := s.resourceManager.CreateSecret(r.Context(), secret)
	if err != nil {
		if errors.IsAlreadyExists(err) {
			s.logger.Warn("Secret already exists",
				zap.String("namespace", req.Namespace),
				zap.String("name", req.Name))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "Secret already exists"})
			return
		}

		s.logger.Error("Failed to create secret",
			zap.String("namespace", req.Namespace),
			zap.String("name", req.Name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Return created secret (without data for security)
	detail := s.secretToDetail(createdSecret, false)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   detail,
		"status": "success",
	})
}

// handleUpdateSecret handles PUT /api/v1/secrets/{namespace}/{name}
// @Summary Update secret
// @Description Update an existing secret
// @Tags Secrets
// @Accept json
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Secret name"
// @Param secret body SecretUpdateRequest true "Secret update data"
// @Success 200 {object} map[string]interface{} "Updated secret"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 404 {object} map[string]string "Secret not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/secrets/{namespace}/{name} [put]
func (s *Server) handleUpdateSecret(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	if namespace == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace and name are required"})
		return
	}

	var req SecretUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.logger.Error("Failed to decode request body", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	// Get existing secret
	existingSecret, err := s.resourceManager.GetSecret(r.Context(), namespace, name)
	if err != nil {
		if errors.IsNotFound(err) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Secret not found"})
			return
		}

		s.logger.Error("Failed to get secret for update",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Update the secret fields
	if req.Data != nil {
		existingSecret.Data = make(map[string][]byte)
		for key, value := range req.Data {
			existingSecret.Data[key] = []byte(value)
		}
	}

	if req.StringData != nil {
		existingSecret.StringData = req.StringData
	}

	if req.Labels != nil {
		existingSecret.Labels = req.Labels
	}

	if req.Annotations != nil {
		existingSecret.Annotations = req.Annotations
	}

	if req.Immutable != nil {
		existingSecret.Immutable = req.Immutable
	}

	// Update the secret
	updatedSecret, err := s.resourceManager.UpdateSecret(r.Context(), existingSecret)
	if err != nil {
		s.logger.Error("Failed to update secret",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Return updated secret (without data for security)
	detail := s.secretToDetail(updatedSecret, false)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   detail,
		"status": "success",
	})
}

// handleDeleteSecret handles DELETE /api/v1/secrets/{namespace}/{name}
// @Summary Delete secret
// @Description Delete a secret
// @Tags Secrets
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Secret name"
// @Param gracePeriodSeconds query int false "Grace period for deletion in seconds"
// @Success 200 {object} map[string]string "Deletion success"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 404 {object} map[string]string "Secret not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/secrets/{namespace}/{name} [delete]
func (s *Server) handleDeleteSecret(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	gracePeriodStr := r.URL.Query().Get("gracePeriodSeconds")

	if namespace == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace and name are required"})
		return
	}

	// Get security context for authorization check
	secCtx, err := s.getSecurityContext(r)
	if err != nil {
		s.logger.Error("Failed to get security context for secret deletion", zap.Error(err))
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Check delete permission for secrets using SSAR
	if err := s.checkResourcePermission(r.Context(), secCtx, "delete", "secrets", namespace, name); err != nil {
		if secErr, ok := err.(*SecurityError); ok {
			s.writeSecurityError(w, secErr, secCtx.User)
		} else {
			http.Error(w, "Permission check failed", http.StatusInternalServerError)
		}
		return
	}

	deleteOptions := metav1.DeleteOptions{}
	if gracePeriodStr != "" {
		if gracePeriod, err := strconv.ParseInt(gracePeriodStr, 10, 64); err == nil {
			deleteOptions.GracePeriodSeconds = &gracePeriod
		}
	}

	// Delete the secret
	deleteErr := s.resourceManager.DeleteSecret(r.Context(), namespace, name, deleteOptions)
	if deleteErr != nil {
		if errors.IsNotFound(deleteErr) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Secret not found"})
			return
		}

		s.logger.Error("Failed to delete secret",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.String("user", secCtx.User.Email),
			zap.Error(deleteErr))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": deleteErr.Error()})
		return
	}

	// Log successful deletion for audit
	s.logger.Info("Secret deleted successfully",
		zap.String("user", secCtx.User.Email),
		zap.String("user_sub", secCtx.User.Sub),
		zap.Strings("user_groups", secCtx.User.Groups),
		zap.String("namespace", namespace),
		zap.String("name", name))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": fmt.Sprintf("Secret '%s' deleted successfully", name),
		"status":  "success",
	})
}

// handleGetSecretData handles GET /api/v1/secrets/{namespace}/{name}/data/{key}
// @Summary Get secret data key
// @Description Get a specific data key from a secret (returns base64 encoded value)
// @Tags Secrets
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Secret name"
// @Param key path string true "Data key"
// @Param decode query bool false "Base64 decode the value (default: false)"
// @Success 200 {object} map[string]interface{} "Secret data key value"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 404 {object} map[string]string "Secret or key not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/secrets/{namespace}/{name}/data/{key} [get]
func (s *Server) handleGetSecretData(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	key := chi.URLParam(r, "key")
	decodeStr := r.URL.Query().Get("decode")
	decode := strings.ToLower(decodeStr) == "true"

	if namespace == "" || name == "" || key == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace, name, and key are required"})
		return
	}

	// Get secret from Kubernetes API
	secret, err := s.resourceManager.GetSecret(r.Context(), namespace, name)
	if err != nil {
		if errors.IsNotFound(err) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Secret not found"})
			return
		}

		s.logger.Error("Failed to get secret for data access",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.String("key", key),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Check if the key exists
	value, exists := secret.Data[key]
	if !exists {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": fmt.Sprintf("Key '%s' not found in secret", key)})
		return
	}

	var responseValue interface{}
	if decode {
		responseValue = string(value)
	} else {
		responseValue = value // This will be base64 encoded in JSON
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"key":     key,
			"value":   responseValue,
			"decoded": decode,
		},
		"status": "success",
	})
}

// handleGetSecretUsageExamples handles GET /api/v1/secrets/{namespace}/{name}/usage
// @Summary Get secret usage examples
// @Description Get YAML examples showing how to use the secret in various scenarios
// @Tags Secrets
// @Produce json
// @Param namespace path string true "Namespace"
// @Param name path string true "Secret name"
// @Success 200 {object} map[string]interface{} "Usage examples"
// @Failure 400 {object} map[string]string "Bad request"
// @Failure 404 {object} map[string]string "Secret not found"
// @Failure 500 {object} map[string]string "Internal server error"
// @Router /api/v1/secrets/{namespace}/{name}/usage [get]
func (s *Server) handleGetSecretUsageExamples(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	if namespace == "" || name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "namespace and name are required"})
		return
	}

	// Get secret to determine type
	secret, err := s.resourceManager.GetSecret(r.Context(), namespace, name)
	if err != nil {
		if errors.IsNotFound(err) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Secret not found"})
			return
		}

		s.logger.Error("Failed to get secret for usage examples",
			zap.String("namespace", namespace),
			zap.String("name", name),
			zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	examples := getSecretUsageExamples(string(secret.Type), name, namespace)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"secretName": name,
			"namespace":  namespace,
			"type":       string(secret.Type),
			"examples":   examples,
		},
		"status": "success",
	})
}

// handleListSecretTypes handles GET /api/v1/secrets/types
// @Summary List available secret types
// @Description Get a list of all available Kubernetes secret types with descriptions
// @Tags Secrets
// @Produce json
// @Success 200 {object} map[string]interface{} "Available secret types"
// @Router /api/v1/secrets/types [get]
func (s *Server) handleListSecretTypes(w http.ResponseWriter, r *http.Request) {
	secretTypes := map[string]interface{}{
		"Opaque": map[string]interface{}{
			"description": "Generic secret type for arbitrary data",
			"keys":        []string{"Any custom keys"},
			"usage":       "General purpose data storage",
		},
		"kubernetes.io/tls": map[string]interface{}{
			"description": "TLS certificate and private key",
			"keys":        []string{"tls.crt", "tls.key"},
			"usage":       "HTTPS certificates for ingress controllers",
		},
		"kubernetes.io/dockerconfigjson": map[string]interface{}{
			"description": "Docker registry credentials in JSON format",
			"keys":        []string{".dockerconfigjson"},
			"usage":       "Pull images from private registries",
		},
		"kubernetes.io/dockercfg": map[string]interface{}{
			"description": "Legacy Docker registry credentials",
			"keys":        []string{".dockercfg"},
			"usage":       "Legacy Docker registry authentication",
		},
		"kubernetes.io/basic-auth": map[string]interface{}{
			"description": "Basic authentication credentials",
			"keys":        []string{"username", "password"},
			"usage":       "HTTP basic authentication",
		},
		"kubernetes.io/ssh-auth": map[string]interface{}{
			"description": "SSH authentication credentials",
			"keys":        []string{"ssh-privatekey"},
			"usage":       "SSH key authentication",
		},
		"kubernetes.io/service-account-token": map[string]interface{}{
			"description": "Service account token (managed by Kubernetes)",
			"keys":        []string{"token", "ca.crt", "namespace"},
			"usage":       "Automatically generated for service accounts",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":   secretTypes,
		"status": "success",
	})
}

// handleSecretsWebSocket handles WebSocket connections for real-time secret updates
func (s *Server) handleSecretsWebSocket(w http.ResponseWriter, r *http.Request) {
	s.wsHub.ServeWS(w, r, "secrets")
}

// Helper functions

// secretToSummary converts a Kubernetes Secret to a SecretSummary
func (s *Server) secretToSummary(secret *v1.Secret, includeData bool) *SecretSummary {
	keys := make([]string, 0, len(secret.Data))
	for key := range secret.Data {
		keys = append(keys, key)
	}

	summary := &SecretSummary{
		ID:                fmt.Sprintf("%s/%s", secret.Namespace, secret.Name),
		Name:              secret.Name,
		Namespace:         secret.Namespace,
		Type:              string(secret.Type),
		Keys:              keys,
		KeyCount:          len(keys),
		Age:               formatAge(secret.CreationTimestamp.Time),
		AgeTimestamp:      secret.CreationTimestamp.Time,
		Labels:            secret.Labels,
		Annotations:       secret.Annotations,
		CreationTimestamp: secret.CreationTimestamp.Time,
		ResourceVersion:   secret.ResourceVersion,
		UID:               string(secret.UID),
	}

	return summary
}

// secretToDetail converts a Kubernetes Secret to a SecretDetail
func (s *Server) secretToDetail(secret *v1.Secret, includeData bool) *SecretDetail {
	summary := s.secretToSummary(secret, includeData)

	detail := &SecretDetail{
		SecretSummary:   summary,
		Immutable:       secret.Immutable,
		OwnerReferences: secret.OwnerReferences,
		Finalizers:      secret.Finalizers,
	}

	// Only include data if explicitly requested
	if includeData && secret.Data != nil {
		detail.Data = make(map[string]string)
		for key, value := range secret.Data {
			detail.Data[key] = string(value)
		}
	}

	return detail
}

// formatAge formats a timestamp into a human-readable age string
func formatAge(t time.Time) string {
	duration := time.Since(t)
	days := int(duration.Hours() / 24)
	hours := int(duration.Hours()) % 24
	minutes := int(duration.Minutes()) % 60

	if days > 0 {
		return fmt.Sprintf("%dd", days)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh", hours)
	}
	if minutes > 0 {
		return fmt.Sprintf("%dm", minutes)
	}
	return "< 1m"
}

// validateSecretData validates secret data based on secret type
func validateSecretData(secretType string, data map[string]string) error {
	switch secretType {
	case "kubernetes.io/tls":
		// TLS secrets require tls.crt and tls.key
		if _, hasCert := data["tls.crt"]; !hasCert {
			return fmt.Errorf("TLS secret must contain 'tls.crt' key")
		}
		if _, hasKey := data["tls.key"]; !hasKey {
			return fmt.Errorf("TLS secret must contain 'tls.key' key")
		}
	case "kubernetes.io/dockerconfigjson":
		// Docker config secrets require .dockerconfigjson
		if _, hasConfig := data[".dockerconfigjson"]; !hasConfig {
			return fmt.Errorf("Docker config secret must contain '.dockerconfigjson' key")
		}
	case "kubernetes.io/dockercfg":
		// Legacy docker config secrets require .dockercfg
		if _, hasConfig := data[".dockercfg"]; !hasConfig {
			return fmt.Errorf("Docker config secret must contain '.dockercfg' key")
		}
	case "kubernetes.io/basic-auth":
		// Basic auth secrets should have username and password
		if _, hasUser := data["username"]; !hasUser {
			return fmt.Errorf("Basic auth secret should contain 'username' key")
		}
		if _, hasPass := data["password"]; !hasPass {
			return fmt.Errorf("Basic auth secret should contain 'password' key")
		}
	case "kubernetes.io/ssh-auth":
		// SSH auth secrets require ssh-privatekey
		if _, hasKey := data["ssh-privatekey"]; !hasKey {
			return fmt.Errorf("SSH auth secret must contain 'ssh-privatekey' key")
		}
	}
	return nil
}

// getSecretUsageExamples returns usage examples for different secret types
func getSecretUsageExamples(secretType, name, namespace string) map[string]interface{} {
	examples := make(map[string]interface{})

	// Volume mount example
	examples["volumeMount"] = map[string]interface{}{
		"spec": map[string]interface{}{
			"volumes": []map[string]interface{}{
				{
					"name": "secret-volume",
					"secret": map[string]interface{}{
						"secretName": name,
					},
				},
			},
			"containers": []map[string]interface{}{
				{
					"name": "app",
					"volumeMounts": []map[string]interface{}{
						{
							"name":      "secret-volume",
							"mountPath": "/etc/secrets",
							"readOnly":  true,
						},
					},
				},
			},
		},
	}

	// Environment variable example
	examples["envVar"] = map[string]interface{}{
		"spec": map[string]interface{}{
			"containers": []map[string]interface{}{
				{
					"name": "app",
					"env": []map[string]interface{}{
						{
							"name": "SECRET_KEY",
							"valueFrom": map[string]interface{}{
								"secretKeyRef": map[string]interface{}{
									"name": name,
									"key":  "key-name",
								},
							},
						},
					},
				},
			},
		},
	}

	// Type-specific examples
	switch secretType {
	case "kubernetes.io/tls":
		examples["tlsIngress"] = map[string]interface{}{
			"apiVersion": "networking.k8s.io/v1",
			"kind":       "Ingress",
			"spec": map[string]interface{}{
				"tls": []map[string]interface{}{
					{
						"hosts":      []string{"example.com"},
						"secretName": name,
					},
				},
			},
		}
	case "kubernetes.io/dockerconfigjson":
		examples["imagePullSecrets"] = map[string]interface{}{
			"spec": map[string]interface{}{
				"imagePullSecrets": []map[string]interface{}{
					{"name": name},
				},
			},
		}
	}

	return examples
}
