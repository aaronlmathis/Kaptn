package dto

import "time"

// EventSummary represents a summary view of a Kubernetes event for list views
type EventSummary struct {
	ID                  string            `json:"id"`
	Name                string            `json:"name"`
	Namespace           string            `json:"namespace"`
	Type                string            `json:"type"`
	Reason              string            `json:"reason"`
	Message             string            `json:"message"`
	Source              string            `json:"source"`
	InvolvedObject      string            `json:"involvedObject"`
	InvolvedObjectKind  string            `json:"involvedObjectKind"`
	InvolvedObjectName  string            `json:"involvedObjectName"`
	Count               int32             `json:"count"`
	FirstTimestamp      time.Time         `json:"firstTimestamp"`
	LastTimestamp       time.Time         `json:"lastTimestamp"`
	Age                 string            `json:"age"`
	Level               string            `json:"level"`
	ReportingController string            `json:"reportingController"`
	ReportingInstance   string            `json:"reportingInstance"`
	CreationTimestamp   time.Time         `json:"creationTimestamp"`
	Labels              map[string]string `json:"labels"`
	Annotations         map[string]string `json:"annotations"`
}

// EventsListRequest represents a request to list events
type EventsListRequest struct {
	Namespace       string `json:"namespace,omitempty"`
	InvolvedObject  string `json:"involvedObject,omitempty"`
	Type            string `json:"type,omitempty"`
	Reason          string `json:"reason,omitempty"`
	Source          string `json:"source,omitempty"`
	FieldSelector   string `json:"fieldSelector,omitempty"`
	LabelSelector   string `json:"labelSelector,omitempty"`
	TimeWindowHours int    `json:"timeWindowHours,omitempty"`
	ListOptions
}

// EventsListResponse represents a response containing events
type EventsListResponse struct {
	Items    []EventSummary `json:"items"`
	Page     int            `json:"page"`
	PageSize int            `json:"pageSize"`
	Total    int            `json:"total"`
	Status   string         `json:"status"`
}
