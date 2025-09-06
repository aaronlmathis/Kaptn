package dto

import "time"

// HPAView represents a HorizontalPodAutoscaler for API responses
type HPAView struct {
    Namespace       string         `json:"namespace"`
    Name            string         `json:"name"`
    TargetKind      string         `json:"targetKind"`
    TargetName      string         `json:"targetName"`
    MinReplicas     *int32         `json:"minReplicas,omitempty"`
    MaxReplicas     int32          `json:"maxReplicas"`
    DesiredReplicas int32          `json:"desiredReplicas"`
    CurrentReplicas int32          `json:"currentReplicas"`
    PrimaryMetric   *PrimaryMetric `json:"primaryMetric,omitempty"`
    Conditions      []HPACondition `json:"conditions,omitempty"`
    LastScaleTime   *time.Time     `json:"lastScaleTime,omitempty"`
    Signals         HPASignals     `json:"signals"`
}

type PrimaryMetric struct {
    Type         string  `json:"type"`
    ResourceName *string `json:"resourceName,omitempty"`
    TargetDesc   string  `json:"targetDesc"`
}

type HPACondition struct {
    Type               string `json:"type"`
    Status             string `json:"status"`
    Reason             string `json:"reason,omitempty"`
    Message            string `json:"message,omitempty"`
    LastTransitionTime string `json:"lastTransitionTime,omitempty"`
}

type HPASignals struct {
    AtMax       bool `json:"atMax"`
    Limited     bool `json:"limited"`
    ThrashScore int  `json:"thrashScore"`
}

