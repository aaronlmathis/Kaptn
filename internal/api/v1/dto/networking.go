package dto

import (
	"time"
)

// ServiceSummary represents a summary view of a service for list views
type ServiceSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Type              string            `json:"type"`
	ClusterIP         string            `json:"clusterIP"`
	ExternalIP        string            `json:"externalIP"`
	Ports             []string          `json:"ports"`
	Age               string            `json:"age"`
	Selector          map[string]string `json:"selector,omitempty"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// IngressSummary represents a summary view of an ingress for list views
type IngressSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Class             string            `json:"class"`
	Hosts             []string          `json:"hosts"`
	Paths             []string          `json:"paths"`
	Address           string            `json:"address"`
	Age               string            `json:"age"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// IngressClassSummary represents a summary view of an ingress class for list views
type IngressClassSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Controller        string            `json:"controller"`
	IsDefault         bool              `json:"isDefault"`
	Parameters        map[string]interface{} `json:"parameters,omitempty"`
	ParametersKind    string            `json:"parametersKind,omitempty"`
	ParametersName    string            `json:"parametersName,omitempty"`
	Age               string            `json:"age"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// NetworkPolicySummary represents a summary view of a network policy for list views
type NetworkPolicySummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	PodSelector       map[string]string `json:"podSelector"`
	PolicyTypes       []string          `json:"policyTypes"`
	IngressRules      int               `json:"ingressRules"`
	EgressRules       int               `json:"egressRules"`
	Age               string            `json:"age"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// VirtualServiceSummary represents a summary view of an Istio VirtualService
type VirtualServiceSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Hosts             []string          `json:"hosts"`
	Gateways          []string          `json:"gateways"`
	Age               string            `json:"age"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// GatewaySummary represents a summary view of an Istio Gateway
type GatewaySummary struct {
	ID                string                   `json:"id"`
	Name              string                   `json:"name"`
	Namespace         string                   `json:"namespace"`
	Addresses         []string                 `json:"addresses"`
	Ports             []map[string]interface{} `json:"ports"`
	Age               string                   `json:"age"`
	CreationTimestamp time.Time                `json:"creationTimestamp"`
	Labels            map[string]string        `json:"labels"`
	Annotations       map[string]string        `json:"annotations"`
}
