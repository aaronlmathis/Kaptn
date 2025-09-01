package dto

import (
	"time"
	
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// PodSummary represents a summary view of a pod for list views
type PodSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Phase             string            `json:"phase"`
	Ready             string            `json:"ready"`
	Status            string            `json:"status"`
	Restarts          int32             `json:"restarts"`
	Age               string            `json:"age"`
	Node              string            `json:"node"`
	PodIP             string            `json:"podIP"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
	OwnerReferences   []metav1.OwnerReference `json:"ownerReferences,omitempty"`
}

// DeploymentSummary represents a summary view of a deployment for list views
type DeploymentSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Ready             string            `json:"ready"`
	UpToDate          int32             `json:"upToDate"`
	Available         int32             `json:"available"`
	Age               string            `json:"age"`
	Images            []string          `json:"images"`
	Strategy          string            `json:"strategy"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// StatefulSetSummary represents a summary view of a statefulset for list views
type StatefulSetSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Ready             string            `json:"ready"`
	Age               string            `json:"age"`
	Images            []string          `json:"images"`
	Service           string            `json:"service"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// DaemonSetSummary represents a summary view of a daemonset for list views
type DaemonSetSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Desired           int32             `json:"desired"`
	Current           int32             `json:"current"`
	Ready             int32             `json:"ready"`
	UpToDate          int32             `json:"upToDate"`
	Available         int32             `json:"available"`
	Age               string            `json:"age"`
	Images            []string          `json:"images"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// ReplicaSetSummary represents a summary view of a replicaset for list views
type ReplicaSetSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Desired           int32             `json:"desired"`
	Current           int32             `json:"current"`
	Ready             int32             `json:"ready"`
	Age               string            `json:"age"`
	Images            []string          `json:"images"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
	OwnerReferences   []metav1.OwnerReference `json:"ownerReferences,omitempty"`
}

// JobSummary represents a summary view of a job for list views
type JobSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Completions       string            `json:"completions"`
	Duration          string            `json:"duration"`
	Age               string            `json:"age"`
	Images            []string          `json:"images"`
	Status            string            `json:"status"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// CronJobSummary represents a summary view of a cronjob for list views
type CronJobSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Schedule          string            `json:"schedule"`
	Suspend           bool              `json:"suspend"`
	Active            int               `json:"active"`
	LastSchedule      *time.Time        `json:"lastSchedule,omitempty"`
	Age               string            `json:"age"`
	Images            []string          `json:"images"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// EndpointsSummary represents a summary view of endpoints for list views
type EndpointsSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Endpoints         []string          `json:"endpoints"`
	Age               string            `json:"age"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}

// EndpointSliceSummary represents a summary view of endpointslices for list views
type EndpointSliceSummary struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	AddressType       string            `json:"addressType"`
	Ports             []string          `json:"ports"`
	Endpoints         int               `json:"endpoints"`
	Age               string            `json:"age"`
	CreationTimestamp time.Time         `json:"creationTimestamp"`
	Labels            map[string]string `json:"labels"`
	Annotations       map[string]string `json:"annotations"`
}
