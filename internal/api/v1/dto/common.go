// Package dto provides Data Transfer Objects for API v1.
//
// This package centralizes request/response structures to avoid duplication
// across handler files and provide consistent API interfaces.
package dto

import "time"

// PaginationRequest represents pagination parameters in API requests
type PaginationRequest struct {
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
}

// PaginationResponse represents pagination metadata in API responses
type PaginationResponse struct {
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
	Total    int `json:"total"`
}

// ListOptions represents common options for list operations
type ListOptions struct {
	Namespace         string            `json:"namespace,omitempty"`
	Search            string            `json:"search,omitempty"`
	LabelSelector     string            `json:"labelSelector,omitempty"`
	FieldSelector     string            `json:"fieldSelector,omitempty"`
	Sort              string            `json:"sort,omitempty"`
	Order             string            `json:"order,omitempty"`
	Pagination        PaginationRequest `json:"pagination"`
	IncludeData       bool              `json:"includeData,omitempty"` // For secrets, configmaps
	ShowManagedFields bool              `json:"showManagedFields,omitempty"`
}

// APIResponse represents a standard API response structure
type APIResponse struct {
	Status string      `json:"status"`
	Data   interface{} `json:"data,omitempty"`
	Error  string      `json:"error,omitempty"`
}

// ErrorResponse represents an error response structure
type ErrorResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}

// ResourceMetadata contains common metadata for Kubernetes resources
type ResourceMetadata struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace,omitempty"`
	Labels            map[string]string `json:"labels,omitempty"`
	Annotations       map[string]string `json:"annotations,omitempty"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	ResourceVersion   string            `json:"resourceVersion"`
	UID               string            `json:"uid"`
	Age               string            `json:"age"`
}

// ListResponse represents a standard paginated list response
type ListResponse struct {
	Items    interface{} `json:"items"`
	Page     int         `json:"page"`
	PageSize int         `json:"pageSize"`
	Total    int         `json:"total"`
	Status   string      `json:"status"`
}

// ResourceLink represents a related resource link
type ResourceLink struct {
	Rel    string `json:"rel"`
	Href   string `json:"href"`
	Method string `json:"method,omitempty"`
	Title  string `json:"title,omitempty"`
}
