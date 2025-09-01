package dto

import "time"

// NodeSummary represents a summary view of a node for list views
type NodeSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Status            string            `json:"status"`
	Roles             []string          `json:"roles"`
	Age               string            `json:"age"`
	Version           string            `json:"version"`
	InternalIP        string            `json:"internalIP"`
	ExternalIP        string            `json:"externalIP"`
	OSImage           string            `json:"osImage"`
	KernelVersion     string            `json:"kernelVersion"`
	ContainerRuntime  string            `json:"containerRuntime"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// NamespaceSummary represents a summary view of a namespace for list views
type NamespaceSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Status            string            `json:"status"`
	Age               string            `json:"age"`
	ResourceQuotas    int               `json:"resourceQuotas"`
	LimitRanges       int               `json:"limitRanges"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// CRDSummary represents a summary view of a Custom Resource Definition for list views
type CRDSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Group             string            `json:"group"`
	Kind              string            `json:"kind"`
	Plural            string            `json:"plural"`
	Singular          string            `json:"singular"`
	Scope             string            `json:"scope"`
	Versions          []string          `json:"versions"`
	StoredVersions    []string          `json:"storedVersions"`
	Established       bool              `json:"established"`
	NamesAccepted     bool              `json:"namesAccepted"`
	Age               string            `json:"age"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// APIResourceSummary represents a summary view of an API resource for list views
type APIResourceSummary struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	SingularName string   `json:"singularName"`
	ShortNames   []string `json:"shortNames"`
	Kind         string   `json:"kind"`
	Group        string   `json:"group"`
	Version      string   `json:"version"`
	APIVersion   string   `json:"apiVersion"`
	Namespaced   bool     `json:"namespaced"`
	Categories   []string `json:"categories"`
	Verbs        []string `json:"verbs"`
}

// ClusterOverviewResponse represents cluster overview information
type ClusterOverviewResponse struct {
	Status       string                 `json:"status"`
	Version      string                 `json:"version"`
	Nodes        ClusterNodesInfo       `json:"nodes"`
	Namespaces   ClusterNamespacesInfo  `json:"namespaces"`
	Workloads    ClusterWorkloadsInfo   `json:"workloads"`
	Resources    ClusterResourcesInfo   `json:"resources"`
	Health       ClusterHealthInfo      `json:"health"`
	Capabilities map[string]bool        `json:"capabilities"`
}

// ClusterNodesInfo represents information about cluster nodes
type ClusterNodesInfo struct {
	Total  int `json:"total"`
	Ready  int `json:"ready"`
	Master int `json:"master"`
	Worker int `json:"worker"`
}

// ClusterNamespacesInfo represents information about cluster namespaces
type ClusterNamespacesInfo struct {
	Total  int `json:"total"`
	Active int `json:"active"`
}

// ClusterWorkloadsInfo represents information about cluster workloads
type ClusterWorkloadsInfo struct {
	Pods         int `json:"pods"`
	Deployments  int `json:"deployments"`
	StatefulSets int `json:"statefulSets"`
	DaemonSets   int `json:"daemonSets"`
	Jobs         int `json:"jobs"`
	CronJobs     int `json:"cronJobs"`
}

// ClusterResourcesInfo represents information about cluster resources
type ClusterResourcesInfo struct {
	Services           int `json:"services"`
	ConfigMaps         int `json:"configMaps"`
	Secrets            int `json:"secrets"`
	PersistentVolumes  int `json:"persistentVolumes"`
	StorageClasses     int `json:"storageClasses"`
}

// ClusterHealthInfo represents cluster health information
type ClusterHealthInfo struct {
	Overall    string                     `json:"overall"`
	Components map[string]ComponentHealth `json:"components"`
}

// ComponentHealth represents the health of a cluster component
type ComponentHealth struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}
