package dto

import (
	"github.com/aaronlmathis/kaptn/internal/k8s/actions"
)

// BulkActionRequest represents a bulk action request from the frontend
type BulkActionRequest struct {
	Action       string                 `json:"action"`  // e.g., "restart-pods", "delete-deployments"
	Targets      []BulkActionTarget     `json:"targets"` // Resources to act upon
	Params       map[string]interface{} `json:"params,omitempty"`
	DryRun       bool                   `json:"dry_run"`
	ForceConfirm bool                   `json:"force_confirm"` // User confirmed destructive action
}

// BulkActionTarget represents a target resource for bulk actions
type BulkActionTarget struct {
	Namespace string `json:"namespace,omitempty"`
	Name      string `json:"name"`
}

// BulkActionResponse represents the response to a bulk action
type BulkActionResponse struct {
	Success              bool                      `json:"success"`
	RequestID            string                    `json:"request_id"`
	Message              string                    `json:"message"`
	ResourcesAffected    int                       `json:"resources_affected"`
	ResourcesTotal       int                       `json:"resources_total"`
	Details              map[string]interface{}    `json:"details,omitempty"`
	RequiresConfirmation bool                      `json:"requires_confirmation,omitempty"`
	SafetyViolations     []actions.SafetyViolation `json:"safety_violations,omitempty"`
	Warnings             []string                  `json:"warnings,omitempty"`
}

// ApplyConfigRequest represents the enhanced apply request for the Apply Config drawer
type ApplyConfigRequest struct {
	YAMLContent  string       `json:"yamlContent"`
	Files        []FileUpload `json:"files,omitempty"`
	Namespace    string       `json:"namespace,omitempty"`
	DryRun       bool         `json:"dryRun"`
	Force        bool         `json:"force"`
	Validate     bool         `json:"validate"`
	FieldManager string       `json:"fieldManager,omitempty"`
	ShowDiff     bool         `json:"showDiff"`
	ServerSide   bool         `json:"serverSide"`
}

// FileUpload represents an uploaded YAML file
type FileUpload struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

// ApplyConfigResponse represents the enhanced apply response
type ApplyConfigResponse struct {
	Success          bool                     `json:"success"`
	Resources        []EnhancedResourceResult `json:"resources"`
	Errors           []ValidationError        `json:"errors,omitempty"`
	Warnings         []string                 `json:"warnings,omitempty"`
	Message          string                   `json:"message,omitempty"`
	Summary          *ApplySummary            `json:"summary,omitempty"`
	DangerousActions []DangerousAction        `json:"dangerousActions,omitempty"`
}

// EnhancedResourceResult extends ResourceResult with additional metadata
type EnhancedResourceResult struct {
	Name       string                 `json:"name"`
	Namespace  string                 `json:"namespace,omitempty"`
	Kind       string                 `json:"kind"`
	APIVersion string                 `json:"apiVersion"`
	Action     string                 `json:"action"` // "created", "updated", "unchanged", "error", "would-create", "would-update"
	Error      string                 `json:"error,omitempty"`
	Diff       map[string]interface{} `json:"diff,omitempty"`
	Source     string                 `json:"source,omitempty"` // "inline", "file:filename.yaml"
	Metadata   ResourceMetadata       `json:"metadata"`
	Status     string                 `json:"status"` // "success", "error", "warning"
	Links      []ResourceLink         `json:"links,omitempty"`
}

// ValidationError represents a validation error
type ValidationError struct {
	Type         string `json:"type"` // "delete", "overwrite", "crd", "rbac"
	Resource     string `json:"resource"`
	Description  string `json:"description"`
	Risk         string `json:"risk"`         // "low", "medium", "high", "critical"
	Confirmation bool   `json:"confirmation"` // whether user confirmation is required
}

// ApplySummary provides a summary of the apply operation
type ApplySummary struct {
	Total     int `json:"total"`
	Created   int `json:"created"`
	Updated   int `json:"updated"`
	Unchanged int `json:"unchanged"`
	Errors    int `json:"errors"`
}

// DangerousAction represents an action that requires special attention
type DangerousAction struct {
	Type         string `json:"type"` // "delete", "overwrite", "crd", "rbac"
	Resource     string `json:"resource"`
	Description  string `json:"description"`
	Risk         string `json:"risk"`         // "low", "medium", "high", "critical"
	Confirmation bool   `json:"confirmation"` // whether user confirmation is required
}
