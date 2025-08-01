package actions

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
	"gopkg.in/yaml.v3"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/restmapper"
)

// ApplyService handles YAML apply operations
type ApplyService struct {
	client          kubernetes.Interface
	dynamicClient   dynamic.Interface
	discoveryClient discovery.DiscoveryInterface
	logger          *zap.Logger
}

// NewApplyService creates a new apply service
func NewApplyService(client kubernetes.Interface, dynamicClient dynamic.Interface, discoveryClient discovery.DiscoveryInterface, logger *zap.Logger) *ApplyService {
	return &ApplyService{
		client:          client,
		dynamicClient:   dynamicClient,
		discoveryClient: discoveryClient,
		logger:          logger,
	}
}

// ApplyOptions contains options for apply operation
type ApplyOptions struct {
	DryRun    bool   `json:"dryRun"`
	Force     bool   `json:"force"`
	Namespace string `json:"namespace,omitempty"`
}

// ApplyResult represents the result of an apply operation
type ApplyResult struct {
	Success   bool             `json:"success"`
	Resources []ResourceResult `json:"resources"`
	Errors    []string         `json:"errors,omitempty"`
	Message   string           `json:"message,omitempty"`
}

// ResourceResult represents the result for a single resource
type ResourceResult struct {
	Name       string                 `json:"name"`
	Namespace  string                 `json:"namespace,omitempty"`
	Kind       string                 `json:"kind"`
	APIVersion string                 `json:"apiVersion"`
	Action     string                 `json:"action"` // "created", "updated", "unchanged", "error"
	Error      string                 `json:"error,omitempty"`
	Diff       map[string]interface{} `json:"diff,omitempty"`
}

// ApplyYAML applies YAML content using server-side apply
func (s *ApplyService) ApplyYAML(ctx context.Context, requestID, user string, yamlContent string, opts ApplyOptions) (*ApplyResult, error) {
	audit := &AuditLog{
		RequestID: requestID,
		User:      user,
		Action:    "apply",
		Resource:  "yaml",
		Timestamp: time.Now(),
		Details: map[string]interface{}{
			"dryRun": opts.DryRun,
			"force":  opts.Force,
		},
	}

	s.logger.Info("Starting YAML apply operation",
		zap.String("requestId", requestID),
		zap.String("user", user),
		zap.Bool("dryRun", opts.DryRun),
		zap.Bool("force", opts.Force))

	result := &ApplyResult{
		Success:   true,
		Resources: []ResourceResult{},
		Errors:    []string{},
	}

	// Parse YAML documents
	documents, err := s.parseYAMLDocuments(yamlContent)
	if err != nil {
		audit.Success = false
		audit.Error = err.Error()
		s.logAudit(audit)
		return &ApplyResult{
			Success: false,
			Errors:  []string{fmt.Sprintf("Failed to parse YAML: %v", err)},
		}, err
	}

	s.logger.Info("Parsed YAML documents", zap.Int("count", len(documents)))

	// Create REST mapper for GVR resolution
	mapper, err := s.createRESTMapper()
	if err != nil {
		audit.Success = false
		audit.Error = err.Error()
		s.logAudit(audit)
		return &ApplyResult{
			Success: false,
			Errors:  []string{fmt.Sprintf("Failed to create REST mapper: %v", err)},
		}, err
	}

	// Process each document
	for i, doc := range documents {
		resourceResult := s.applyResource(ctx, doc, opts, mapper, i)
		result.Resources = append(result.Resources, resourceResult)

		if resourceResult.Error != "" {
			result.Success = false
			result.Errors = append(result.Errors, resourceResult.Error)
		}
	}

	// Set result message
	if result.Success {
		if opts.DryRun {
			result.Message = fmt.Sprintf("Dry run completed successfully for %d resources", len(result.Resources))
		} else {
			result.Message = fmt.Sprintf("Successfully applied %d resources", len(result.Resources))
		}
	} else {
		result.Message = fmt.Sprintf("Apply operation completed with %d errors", len(result.Errors))
	}

	audit.Success = result.Success
	if !result.Success {
		audit.Error = strings.Join(result.Errors, "; ")
	}
	audit.Details["resourceCount"] = len(result.Resources)
	s.logAudit(audit)

	return result, nil
}

// parseYAMLDocuments parses multi-document YAML into unstructured objects
func (s *ApplyService) parseYAMLDocuments(yamlContent string) ([]*unstructured.Unstructured, error) {
	var documents []*unstructured.Unstructured

	// Split on document separator
	docs := strings.Split(yamlContent, "---")

	for _, doc := range docs {
		doc = strings.TrimSpace(doc)
		if doc == "" {
			continue
		}

		// Parse YAML into map
		var obj map[string]interface{}
		if err := yaml.Unmarshal([]byte(doc), &obj); err != nil {
			return nil, fmt.Errorf("failed to parse YAML document: %w", err)
		}

		// Skip empty documents
		if len(obj) == 0 {
			continue
		}

		// Create unstructured object
		unstructuredObj := &unstructured.Unstructured{Object: obj}

		// Validate required fields
		if unstructuredObj.GetAPIVersion() == "" {
			return nil, fmt.Errorf("missing apiVersion in resource")
		}
		if unstructuredObj.GetKind() == "" {
			return nil, fmt.Errorf("missing kind in resource")
		}
		if unstructuredObj.GetName() == "" {
			return nil, fmt.Errorf("missing metadata.name in resource")
		}

		documents = append(documents, unstructuredObj)
	}

	if len(documents) == 0 {
		return nil, fmt.Errorf("no valid resources found in YAML")
	}

	return documents, nil
}

// createRESTMapper creates a REST mapper for GVR resolution
func (s *ApplyService) createRESTMapper() (*restmapper.DeferredDiscoveryRESTMapper, error) {
	return restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(s.discoveryClient)), nil
}

// applyResource applies a single resource
func (s *ApplyService) applyResource(ctx context.Context, obj *unstructured.Unstructured, opts ApplyOptions, mapper *restmapper.DeferredDiscoveryRESTMapper, index int) ResourceResult {
	result := ResourceResult{
		Name:       obj.GetName(),
		Namespace:  obj.GetNamespace(),
		Kind:       obj.GetKind(),
		APIVersion: obj.GetAPIVersion(),
		Action:     "error",
	}

	// Set namespace if provided in options and resource is namespaced
	if opts.Namespace != "" && result.Namespace == "" {
		obj.SetNamespace(opts.Namespace)
		result.Namespace = opts.Namespace
	}

	s.logger.Info("Processing resource",
		zap.Int("index", index),
		zap.String("name", result.Name),
		zap.String("namespace", result.Namespace),
		zap.String("kind", result.Kind),
		zap.String("apiVersion", result.APIVersion))

	// Parse GroupVersionKind
	gvk := schema.FromAPIVersionAndKind(obj.GetAPIVersion(), obj.GetKind())

	// Get GroupVersionResource
	mapping, err := mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
	if err != nil {
		result.Error = fmt.Sprintf("failed to find REST mapping for %s: %v", gvk, err)
		return result
	}

	gvr := mapping.Resource

	// Get the appropriate dynamic client
	var resourceClient dynamic.ResourceInterface
	if mapping.Scope.Name() == "namespace" {
		namespace := obj.GetNamespace()
		if namespace == "" {
			namespace = "default"
		}
		resourceClient = s.dynamicClient.Resource(gvr).Namespace(namespace)
	} else {
		resourceClient = s.dynamicClient.Resource(gvr)
	}

	// Check if resource exists
	existing, err := resourceClient.Get(ctx, obj.GetName(), metav1.GetOptions{})
	exists := err == nil

	if opts.DryRun {
		// For dry run, determine what would happen
		if exists {
			result.Action = "updated"
			result.Diff = s.generateDiff(existing, obj)
		} else {
			result.Action = "created"
		}
		return result
	}

	// Apply the resource using server-side apply
	fieldManager := "k8s-admin-dashboard"
	applyOptions := metav1.ApplyOptions{
		FieldManager: fieldManager,
		Force:        opts.Force,
	}

	appliedObj, err := resourceClient.Apply(ctx, obj.GetName(), obj, applyOptions)
	if err != nil {
		result.Error = fmt.Sprintf("failed to apply resource: %v", err)
		return result
	}

	// Determine action taken
	if exists {
		result.Action = "updated"
		result.Diff = s.generateDiff(existing, appliedObj)
	} else {
		result.Action = "created"
	}

	s.logger.Info("Successfully applied resource",
		zap.String("name", result.Name),
		zap.String("namespace", result.Namespace),
		zap.String("action", result.Action))

	return result
}

// generateDiff generates a simple diff between two resources
func (s *ApplyService) generateDiff(old, new *unstructured.Unstructured) map[string]interface{} {
	diff := make(map[string]interface{})

	// Simple diff implementation - in a real scenario, you might want to use a more sophisticated diff algorithm
	oldSpec, oldSpecExists := old.Object["spec"]
	newSpec, newSpecExists := new.Object["spec"]

	if oldSpecExists && newSpecExists {
		diff["spec"] = map[string]interface{}{
			"old": oldSpec,
			"new": newSpec,
		}
	} else if !oldSpecExists && newSpecExists {
		diff["spec"] = map[string]interface{}{
			"action": "added",
			"new":    newSpec,
		}
	}

	// Check labels
	oldLabels := old.GetLabels()
	newLabels := new.GetLabels()
	if len(oldLabels) != len(newLabels) || !s.mapsEqual(oldLabels, newLabels) {
		diff["labels"] = map[string]interface{}{
			"old": oldLabels,
			"new": newLabels,
		}
	}

	// Check annotations
	oldAnnotations := old.GetAnnotations()
	newAnnotations := new.GetAnnotations()
	if len(oldAnnotations) != len(newAnnotations) || !s.mapsEqual(oldAnnotations, newAnnotations) {
		diff["annotations"] = map[string]interface{}{
			"old": oldAnnotations,
			"new": newAnnotations,
		}
	}

	return diff
}

// mapsEqual compares two string maps for equality
func (s *ApplyService) mapsEqual(map1, map2 map[string]string) bool {
	if len(map1) != len(map2) {
		return false
	}

	for k, v := range map1 {
		if map2[k] != v {
			return false
		}
	}

	return true
}

// logAudit logs an audit entry
func (s *ApplyService) logAudit(audit *AuditLog) {
	s.logger.Info("audit_log",
		zap.String("requestId", audit.RequestID),
		zap.String("user", audit.User),
		zap.String("action", audit.Action),
		zap.String("resource", audit.Resource),
		zap.Time("timestamp", audit.Timestamp),
		zap.Bool("success", audit.Success),
		zap.String("error", audit.Error),
		zap.Any("details", audit.Details))
}
