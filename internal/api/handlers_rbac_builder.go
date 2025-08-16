package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"go.uber.org/zap"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/yaml"
)

// RBACFormData represents the form data from the frontend
type RBACFormData struct {
	IdentityType string               `json:"identityType"`
	IdentityName string               `json:"identityName"`
	Scope        string               `json:"scope"`
	Namespace    string               `json:"namespace,omitempty"`
	RoleName     string               `json:"roleName"`
	Permissions  []RBACPermissionRule `json:"permissions"`
	Labels       map[string]string    `json:"labels,omitempty"`
	Annotations  map[string]string    `json:"annotations,omitempty"`
}

// RBACPermissionRule represents a permission rule
type RBACPermissionRule struct {
	APIGroups     []string `json:"apiGroups"`
	Resources     []string `json:"resources"`
	ResourceNames []string `json:"resourceNames,omitempty"`
	Verbs         []string `json:"verbs"`
}

// GeneratedYAML represents the generated YAML response
type GeneratedYAML struct {
	Role    string `json:"role"`
	Binding string `json:"binding"`
}

// ApplyResult represents the result of applying RBAC configuration
type ApplyResult struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
	Message string `json:"message,omitempty"`
}

// handleGenerateRBACYAML handles POST /api/v1/rbac/generate
// @Summary Generate RBAC YAML
// @Description Generate Role and RoleBinding YAML from form data
// @Tags RBAC
// @Accept json
// @Produce json
// @Param body body RBACFormData true "RBAC configuration"
// @Success 200 {object} map[string]interface{} "Generated YAML"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/rbac/generate [post]
func (s *Server) handleGenerateRBACYAML(w http.ResponseWriter, r *http.Request) {
	var formData RBACFormData
	if err := json.NewDecoder(r.Body).Decode(&formData); err != nil {
		s.logger.Error("Failed to decode request body", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	// Validate form data
	if err := s.validateRBACFormData(&formData); err != nil {
		s.logger.Error("Invalid form data", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Generate YAML
	generatedYAML, err := s.generateRBACYAMLFromForm(&formData)
	if err != nil {
		s.logger.Error("Failed to generate YAML", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to generate YAML"})
		return
	}

	response := map[string]interface{}{
		"status": "success",
		"data":   generatedYAML,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		s.logger.Error("Failed to encode response", zap.Error(err))
	}
}

// handleDryRunRBAC handles POST /api/v1/rbac/dry-run
// @Summary Dry run RBAC configuration
// @Description Validate RBAC configuration without applying to cluster
// @Tags RBAC
// @Accept json
// @Produce json
// @Param body body RBACFormData true "RBAC configuration"
// @Success 200 {object} map[string]interface{} "Dry run result"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/rbac/dry-run [post]
func (s *Server) handleDryRunRBAC(w http.ResponseWriter, r *http.Request) {
	var formData RBACFormData
	if err := json.NewDecoder(r.Body).Decode(&formData); err != nil {
		s.logger.Error("Failed to decode request body", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	// Validate form data
	if err := s.validateRBACFormData(&formData); err != nil {
		s.logger.Error("Invalid form data", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Perform dry run
	result, err := s.dryRunRBACConfiguration(r.Context(), &formData)
	if err != nil {
		s.logger.Error("Failed to perform dry run", zap.Error(err))
		result = &ApplyResult{
			Success: false,
			Error:   fmt.Sprintf("Dry run failed: %v", err),
		}
	}

	response := map[string]interface{}{
		"status": "success",
		"data":   result,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		s.logger.Error("Failed to encode response", zap.Error(err))
	}
}

// handleApplyRBAC handles POST /api/v1/rbac/apply
// @Summary Apply RBAC configuration
// @Description Apply Role and RoleBinding to the cluster
// @Tags RBAC
// @Accept json
// @Produce json
// @Param body body RBACFormData true "RBAC configuration"
// @Success 200 {object} map[string]interface{} "Apply result"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /api/v1/rbac/apply [post]
func (s *Server) handleApplyRBAC(w http.ResponseWriter, r *http.Request) {
	var formData RBACFormData
	if err := json.NewDecoder(r.Body).Decode(&formData); err != nil {
		s.logger.Error("Failed to decode request body", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	// Validate form data
	if err := s.validateRBACFormData(&formData); err != nil {
		s.logger.Error("Invalid form data", zap.Error(err))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// Apply to cluster
	result, err := s.applyRBACConfiguration(r.Context(), &formData)
	if err != nil {
		s.logger.Error("Failed to apply RBAC configuration", zap.Error(err))
		result = &ApplyResult{
			Success: false,
			Error:   fmt.Sprintf("Apply failed: %v", err),
		}
	}

	response := map[string]interface{}{
		"status": "success",
		"data":   result,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		s.logger.Error("Failed to encode response", zap.Error(err))
	}
}

// validateRBACFormData validates the form data
func (s *Server) validateRBACFormData(formData *RBACFormData) error {
	if formData.IdentityName == "" {
		return fmt.Errorf("identity name is required")
	}

	if formData.IdentityType != "User" && formData.IdentityType != "Group" {
		return fmt.Errorf("identity type must be 'User' or 'Group'")
	}

	if formData.Scope != "Cluster" && formData.Scope != "Namespace" {
		return fmt.Errorf("scope must be 'Cluster' or 'Namespace'")
	}

	if formData.Scope == "Namespace" && formData.Namespace == "" {
		return fmt.Errorf("namespace is required when scope is 'Namespace'")
	}

	if formData.RoleName == "" {
		return fmt.Errorf("role name is required")
	}

	if len(formData.Permissions) == 0 {
		return fmt.Errorf("at least one permission rule is required")
	}

	for i, perm := range formData.Permissions {
		if len(perm.APIGroups) == 0 {
			return fmt.Errorf("permission rule %d: at least one API group is required", i+1)
		}
		if len(perm.Resources) == 0 {
			return fmt.Errorf("permission rule %d: at least one resource is required", i+1)
		}
		if len(perm.Verbs) == 0 {
			return fmt.Errorf("permission rule %d: at least one verb is required", i+1)
		}
	}

	return nil
}

// generateRBACYAMLFromForm generates YAML from form data
func (s *Server) generateRBACYAMLFromForm(formData *RBACFormData) (*GeneratedYAML, error) {
	var role runtime.Object
	var binding runtime.Object

	// Create role object
	if formData.Scope == "Cluster" {
		// Create ClusterRole
		clusterRole := &rbacv1.ClusterRole{
			TypeMeta: metav1.TypeMeta{
				APIVersion: "rbac.authorization.k8s.io/v1",
				Kind:       "ClusterRole",
			},
			ObjectMeta: metav1.ObjectMeta{
				Name:        formData.RoleName,
				Labels:      formData.Labels,
				Annotations: formData.Annotations,
			},
			Rules: s.convertPermissionRules(formData.Permissions),
		}
		role = clusterRole

		// Create ClusterRoleBinding
		clusterRoleBinding := &rbacv1.ClusterRoleBinding{
			TypeMeta: metav1.TypeMeta{
				APIVersion: "rbac.authorization.k8s.io/v1",
				Kind:       "ClusterRoleBinding",
			},
			ObjectMeta: metav1.ObjectMeta{
				Name:        formData.RoleName + "-binding",
				Labels:      formData.Labels,
				Annotations: formData.Annotations,
			},
			RoleRef: rbacv1.RoleRef{
				APIGroup: "rbac.authorization.k8s.io",
				Kind:     "ClusterRole",
				Name:     formData.RoleName,
			},
			Subjects: []rbacv1.Subject{
				{
					Kind: formData.IdentityType,
					Name: formData.IdentityName,
				},
			},
		}
		binding = clusterRoleBinding
	} else {
		// Create Role
		roleObj := &rbacv1.Role{
			TypeMeta: metav1.TypeMeta{
				APIVersion: "rbac.authorization.k8s.io/v1",
				Kind:       "Role",
			},
			ObjectMeta: metav1.ObjectMeta{
				Name:        formData.RoleName,
				Namespace:   formData.Namespace,
				Labels:      formData.Labels,
				Annotations: formData.Annotations,
			},
			Rules: s.convertPermissionRules(formData.Permissions),
		}
		role = roleObj

		// Create RoleBinding
		roleBinding := &rbacv1.RoleBinding{
			TypeMeta: metav1.TypeMeta{
				APIVersion: "rbac.authorization.k8s.io/v1",
				Kind:       "RoleBinding",
			},
			ObjectMeta: metav1.ObjectMeta{
				Name:        formData.RoleName + "-binding",
				Namespace:   formData.Namespace,
				Labels:      formData.Labels,
				Annotations: formData.Annotations,
			},
			RoleRef: rbacv1.RoleRef{
				APIGroup: "rbac.authorization.k8s.io",
				Kind:     "Role",
				Name:     formData.RoleName,
			},
			Subjects: []rbacv1.Subject{
				{
					Kind:      formData.IdentityType,
					Name:      formData.IdentityName,
					Namespace: formData.Namespace,
				},
			},
		}
		binding = roleBinding
	}

	// Convert to YAML
	roleYAML, err := yaml.Marshal(role)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal role: %w", err)
	}

	bindingYAML, err := yaml.Marshal(binding)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal binding: %w", err)
	}

	return &GeneratedYAML{
		Role:    string(roleYAML),
		Binding: string(bindingYAML),
	}, nil
}

// convertPermissionRules converts form permission rules to Kubernetes PolicyRules
func (s *Server) convertPermissionRules(permissions []RBACPermissionRule) []rbacv1.PolicyRule {
	rules := make([]rbacv1.PolicyRule, len(permissions))
	for i, perm := range permissions {
		rules[i] = rbacv1.PolicyRule{
			APIGroups:     perm.APIGroups,
			Resources:     perm.Resources,
			ResourceNames: perm.ResourceNames,
			Verbs:         perm.Verbs,
		}
	}
	return rules
}

// dryRunRBACConfiguration validates the configuration without applying to cluster
func (s *Server) dryRunRBACConfiguration(ctx context.Context, formData *RBACFormData) (*ApplyResult, error) {
	// Generate the YAML to validate structure
	_, err := s.generateRBACYAMLFromForm(formData)
	if err != nil {
		return &ApplyResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to generate YAML: %v", err),
		}, nil
	}

	// Check if resources already exist
	if formData.Scope == "Cluster" {
		// Check ClusterRole
		_, err = s.kubeClient.RbacV1().ClusterRoles().Get(ctx, formData.RoleName, metav1.GetOptions{})
		if err == nil {
			return &ApplyResult{
				Success: false,
				Error:   fmt.Sprintf("ClusterRole '%s' already exists", formData.RoleName),
			}, nil
		}

		// Check ClusterRoleBinding
		_, err = s.kubeClient.RbacV1().ClusterRoleBindings().Get(ctx, formData.RoleName+"-binding", metav1.GetOptions{})
		if err == nil {
			return &ApplyResult{
				Success: false,
				Error:   fmt.Sprintf("ClusterRoleBinding '%s-binding' already exists", formData.RoleName),
			}, nil
		}
	} else {
		// Check Role
		_, err = s.kubeClient.RbacV1().Roles(formData.Namespace).Get(ctx, formData.RoleName, metav1.GetOptions{})
		if err == nil {
			return &ApplyResult{
				Success: false,
				Error:   fmt.Sprintf("Role '%s' already exists in namespace '%s'", formData.RoleName, formData.Namespace),
			}, nil
		}

		// Check RoleBinding
		_, err = s.kubeClient.RbacV1().RoleBindings(formData.Namespace).Get(ctx, formData.RoleName+"-binding", metav1.GetOptions{})
		if err == nil {
			return &ApplyResult{
				Success: false,
				Error:   fmt.Sprintf("RoleBinding '%s-binding' already exists in namespace '%s'", formData.RoleName, formData.Namespace),
			}, nil
		}
	}

	return &ApplyResult{
		Success: true,
		Message: fmt.Sprintf("Dry run successful. Role '%s' and binding can be created.", formData.RoleName),
	}, nil
}

// applyRBACConfiguration applies the configuration to the cluster
func (s *Server) applyRBACConfiguration(ctx context.Context, formData *RBACFormData) (*ApplyResult, error) {
	// First perform dry run to validate
	dryRunResult, err := s.dryRunRBACConfiguration(ctx, formData)
	if err != nil || !dryRunResult.Success {
		return dryRunResult, err
	}

	if formData.Scope == "Cluster" {
		// Create ClusterRole
		clusterRole := &rbacv1.ClusterRole{
			ObjectMeta: metav1.ObjectMeta{
				Name:        formData.RoleName,
				Labels:      formData.Labels,
				Annotations: formData.Annotations,
			},
			Rules: s.convertPermissionRules(formData.Permissions),
		}

		_, err = s.kubeClient.RbacV1().ClusterRoles().Create(ctx, clusterRole, metav1.CreateOptions{})
		if err != nil {
			return &ApplyResult{
				Success: false,
				Error:   fmt.Sprintf("Failed to create ClusterRole: %v", err),
			}, nil
		}

		// Create ClusterRoleBinding
		clusterRoleBinding := &rbacv1.ClusterRoleBinding{
			ObjectMeta: metav1.ObjectMeta{
				Name:        formData.RoleName + "-binding",
				Labels:      formData.Labels,
				Annotations: formData.Annotations,
			},
			RoleRef: rbacv1.RoleRef{
				APIGroup: "rbac.authorization.k8s.io",
				Kind:     "ClusterRole",
				Name:     formData.RoleName,
			},
			Subjects: []rbacv1.Subject{
				{
					Kind: formData.IdentityType,
					Name: formData.IdentityName,
				},
			},
		}

		_, err = s.kubeClient.RbacV1().ClusterRoleBindings().Create(ctx, clusterRoleBinding, metav1.CreateOptions{})
		if err != nil {
			// Try to cleanup the role if binding creation fails
			s.kubeClient.RbacV1().ClusterRoles().Delete(ctx, formData.RoleName, metav1.DeleteOptions{})
			return &ApplyResult{
				Success: false,
				Error:   fmt.Sprintf("Failed to create ClusterRoleBinding: %v", err),
			}, nil
		}

		return &ApplyResult{
			Success: true,
			Message: fmt.Sprintf("Successfully created ClusterRole '%s' and ClusterRoleBinding '%s-binding'", formData.RoleName, formData.RoleName),
		}, nil
	} else {
		// Create Role
		role := &rbacv1.Role{
			ObjectMeta: metav1.ObjectMeta{
				Name:        formData.RoleName,
				Namespace:   formData.Namespace,
				Labels:      formData.Labels,
				Annotations: formData.Annotations,
			},
			Rules: s.convertPermissionRules(formData.Permissions),
		}

		_, err = s.kubeClient.RbacV1().Roles(formData.Namespace).Create(ctx, role, metav1.CreateOptions{})
		if err != nil {
			return &ApplyResult{
				Success: false,
				Error:   fmt.Sprintf("Failed to create Role: %v", err),
			}, nil
		}

		// Create RoleBinding
		roleBinding := &rbacv1.RoleBinding{
			ObjectMeta: metav1.ObjectMeta{
				Name:        formData.RoleName + "-binding",
				Namespace:   formData.Namespace,
				Labels:      formData.Labels,
				Annotations: formData.Annotations,
			},
			RoleRef: rbacv1.RoleRef{
				APIGroup: "rbac.authorization.k8s.io",
				Kind:     "Role",
				Name:     formData.RoleName,
			},
			Subjects: []rbacv1.Subject{
				{
					Kind:      formData.IdentityType,
					Name:      formData.IdentityName,
					Namespace: formData.Namespace,
				},
			},
		}

		_, err = s.kubeClient.RbacV1().RoleBindings(formData.Namespace).Create(ctx, roleBinding, metav1.CreateOptions{})
		if err != nil {
			// Try to cleanup the role if binding creation fails
			s.kubeClient.RbacV1().Roles(formData.Namespace).Delete(ctx, formData.RoleName, metav1.DeleteOptions{})
			return &ApplyResult{
				Success: false,
				Error:   fmt.Sprintf("Failed to create RoleBinding: %v", err),
			}, nil
		}

		return &ApplyResult{
			Success: true,
			Message: fmt.Sprintf("Successfully created Role '%s' and RoleBinding '%s-binding' in namespace '%s'", formData.RoleName, formData.RoleName, formData.Namespace),
		}, nil
	}
}
