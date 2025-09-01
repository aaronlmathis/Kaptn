package dto

import (
	"time"
	
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

// ConfigMapSummary represents a summary view of a configmap for list views
type ConfigMapSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
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

// ConfigMapDetail represents a detailed view of a configmap
type ConfigMapDetail struct {
	*ConfigMapSummary
	Data            map[string]string       `json:"data,omitempty"`
	BinaryData      map[string][]byte       `json:"binaryData,omitempty"`
	Immutable       *bool                   `json:"immutable,omitempty"`
	ManagedFields   interface{}             `json:"managedFields,omitempty"`
	OwnerReferences []metav1.OwnerReference `json:"ownerReferences,omitempty"`
	Finalizers      []string                `json:"finalizers,omitempty"`
}

// ConfigMapCreateRequest represents a request to create a configmap
type ConfigMapCreateRequest struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Data        map[string]string `json:"data,omitempty"`
	BinaryData  map[string][]byte `json:"binaryData,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	Immutable   *bool             `json:"immutable,omitempty"`
}

// ConfigMapUpdateRequest represents a request to update a configmap
type ConfigMapUpdateRequest struct {
	Data        map[string]string `json:"data,omitempty"`
	BinaryData  map[string][]byte `json:"binaryData,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	Immutable   *bool             `json:"immutable,omitempty"`
}
