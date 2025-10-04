# API v1 Package Documentation

## Overview

The `internal/api/v1` package provides the core API layer structure for Kaptn's Kubernetes admin dashboard, implementing a comprehensive REST API with standardized request/response patterns, domain-specific formatters, and action handling. This package follows a clean architecture pattern with separation of concerns across DTOs (Data Transfer Objects), formatters, and handlers.

## Package Architecture

```
internal/api/v1/
├── dto/                           # Data Transfer Objects
│   ├── doc.go                    # Package documentation
│   ├── common.go                 # Shared structures (pagination, responses, metadata)
│   ├── actions.go                # Bulk actions, apply configurations, validation
│   ├── auth.go                   # Authentication, authorization, user profiles
│   ├── workloads.go              # Pods, deployments, jobs, cronjobs, etc.
│   ├── networking.go             # Services, ingresses, network policies, Istio
│   ├── storage.go                # PVs, PVCs, storage classes, CSI drivers
│   ├── secrets.go                # Secrets and ConfigMaps
│   ├── rbac.go                   # Roles, role bindings, cluster roles, RBAC
│   ├── cluster.go                # Nodes, namespaces, CRDs, API resources
│   ├── monitoring.go             # Metrics, time series, health checks
│   ├── events.go                 # Kubernetes events
│   └── hpa.go                    # Horizontal Pod Autoscalers
├── formatters/                   # Response formatters
│   ├── doc.go                    # Package documentation
│   ├── common.go                 # Shared formatting utilities
│   ├── workloads.go              # Workload resource formatters
│   ├── networking.go             # Networking resource formatters
│   ├── storage.go                # Storage resource formatters
│   ├── config.go                 # ConfigMap, Secret formatters
│   ├── rbac.go                   # RBAC resource formatters
│   └── cluster.go                # Cluster resource formatters
└── handlers/                     # Specialized handlers
    └── actions/                  # Action parsing and handling
        ├── doc.go                # Package documentation
        ├── parser.go             # Action string parsing logic
        └── integration_test.go   # Integration tests
```

## Core Components

### 1. Data Transfer Objects (DTOs)

The DTO layer provides standardized request/response structures organized by functional domain.

#### Common Structures (`dto/common.go`)

**Pagination Support:**
```go
type PaginationRequest struct {
    Page     int `json:"page"`
    PageSize int `json:"pageSize"`
}

type PaginationResponse struct {
    Page     int `json:"page"`
    PageSize int `json:"pageSize"`
    Total    int `json:"total"`
}
```

**List Operations:**
```go
type ListOptions struct {
    Namespace         string            `json:"namespace,omitempty"`
    Search            string            `json:"search,omitempty"`
    LabelSelector     string            `json:"labelSelector,omitempty"`
    FieldSelector     string            `json:"fieldSelector,omitempty"`
    Sort              string            `json:"sort,omitempty"`
    Order             string            `json:"order,omitempty"`
    Pagination        PaginationRequest `json:"pagination"`
    IncludeData       bool              `json:"includeData,omitempty"`
    ShowManagedFields bool              `json:"showManagedFields,omitempty"`
}
```

**Standardized Responses:**
```go
type APIResponse struct {
    Status string      `json:"status"`
    Data   interface{} `json:"data,omitempty"`
    Error  string      `json:"error,omitempty"`
}

type ListResponse struct {
    Items    interface{} `json:"items"`
    Page     int         `json:"page"`
    PageSize int         `json:"pageSize"`
    Total    int         `json:"total"`
    Status   string      `json:"status"`
}
```

**Resource Metadata:**
```go
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
```

#### Workload DTOs (`dto/workloads.go`)

**Pod Summary:**
```go
type PodSummary struct {
    ID                string                  `json:"id"`
    Name              string                  `json:"name"`
    Namespace         string                  `json:"namespace"`
    Phase             string                  `json:"phase"`
    Ready             string                  `json:"ready"`
    Status            string                  `json:"status"`
    Restarts          int32                   `json:"restarts"`
    Age               string                  `json:"age"`
    Node              string                  `json:"node"`
    PodIP             string                  `json:"podIP"`
    CreationTimestamp time.Time               `json:"creationTimestamp"`
    Labels            map[string]string       `json:"labels"`
    Annotations       map[string]string       `json:"annotations"`
    OwnerReferences   []metav1.OwnerReference `json:"ownerReferences,omitempty"`
}
```

**Deployment Summary:**
```go
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
```

**Job Summary:**
```go
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
```

**CronJob Summary:**
```go
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
```

### 2. Response Formatters

The formatters package provides domain-specific conversion functions for transforming Kubernetes resources into standardized API responses.

#### Workloads Formatter (`formatters/workloads.go`)

**Pod Formatting:**
```go
type WorkloadsFormatter struct{}

func (f *WorkloadsFormatter) PodToSummary(pod *v1.Pod) map[string]interface{} {
    // Basic pod summary
    phase := string(pod.Status.Phase)
    ready := false
    readyContainers := 0
    totalContainers := len(pod.Spec.Containers)
    
    // Check readiness conditions
    for _, condition := range pod.Status.Conditions {
        if condition.Type == v1.PodReady && condition.Status == v1.ConditionTrue {
            ready = true
            break
        }
    }
    
    for _, containerStatus := range pod.Status.ContainerStatuses {
        if containerStatus.Ready {
            readyContainers++
        }
    }
    
    return map[string]interface{}{
        "name":              pod.Name,
        "namespace":         pod.Namespace,
        "phase":             phase,
        "ready":             ready,
        "readyContainers":   readyContainers,
        "totalContainers":   totalContainers,
        "nodeName":          pod.Spec.NodeName,
        "podIP":             pod.Status.PodIP,
        "hostIP":            pod.Status.HostIP,
        "labels":            pod.Labels,
        "creationTimestamp": pod.CreationTimestamp.Time,
        "deletionTimestamp": pod.DeletionTimestamp,
        "restartPolicy":     string(pod.Spec.RestartPolicy),
    }
}
```

**Enhanced Pod Formatting with Metrics:**
```go
func (f *WorkloadsFormatter) EnhancedPodToSummary(pod *v1.Pod, podMetricsMap map[string]map[string]interface{}) map[string]interface{} {
    // Start with basic summary
    summary := f.PodToSummary(pod)
    
    // Calculate restart count
    var restartCount int32
    for _, containerStatus := range pod.Status.ContainerStatuses {
        restartCount += containerStatus.RestartCount
    }
    
    // Format ready as "x/y"
    readyContainers := summary["readyContainers"].(int)
    totalContainers := summary["totalContainers"].(int)
    readyStr := fmt.Sprintf("%d/%d", readyContainers, totalContainers)
    
    // Calculate age
    age := calculateAge(pod.CreationTimestamp.Time)
    
    // Get status reason
    statusReason := getStatusReason(pod)
    
    // Get metrics if available
    key := pod.Namespace + "/" + pod.Name
    var cpuMetrics, memoryMetrics map[string]interface{}
    if metrics, exists := podMetricsMap[key]; exists {
        cpuMetrics = metrics["cpu"].(map[string]interface{})
        memoryMetrics = metrics["memory"].(map[string]interface{})
    } else {
        // Default metrics when not available
        cpuMetrics = map[string]interface{}{
            "milli":          0,
            "ofLimitPercent": nil,
        }
        memoryMetrics = map[string]interface{}{
            "bytes":          0,
            "ofLimitPercent": nil,
        }
    }
    
    return map[string]interface{}{
        "name":         pod.Name,
        "namespace":    pod.Namespace,
        "phase":        string(pod.Status.Phase),
        "ready":        readyStr,
        "restartCount": restartCount,
        "age":          age,
        "node":         pod.Spec.NodeName,
        "cpu":          cpuMetrics,
        "memory":       memoryMetrics,
        "statusReason": statusReason,
        "podIP":        pod.Status.PodIP,
        "labels":       pod.Labels,
        "creationTimestamp": pod.CreationTimestamp.Time,
    }
}
```

**Deployment Formatting:**
```go
func (f *WorkloadsFormatter) DeploymentToResponse(deployment appsv1.Deployment) map[string]interface{} {
    age := calculateAge(deployment.CreationTimestamp.Time)
    
    // Prepare replica counts
    desired := int32(0)
    if deployment.Spec.Replicas != nil {
        desired = *deployment.Spec.Replicas
    }
    
    replicas := map[string]int32{
        "desired":   desired,
        "ready":     deployment.Status.ReadyReplicas,
        "updated":   deployment.Status.UpdatedReplicas,
        "available": deployment.Status.AvailableReplicas,
    }
    
    // Convert conditions
    var conditions []map[string]string
    for _, condition := range deployment.Status.Conditions {
        conditions = append(conditions, map[string]string{
            "type":    string(condition.Type),
            "status":  string(condition.Status),
            "reason":  condition.Reason,
            "message": condition.Message,
        })
    }
    
    return map[string]interface{}{
        "name":              deployment.Name,
        "namespace":         deployment.Namespace,
        "replicas":          replicas,
        "conditions":        conditions,
        "age":               age,
        "labels":            deployment.Labels,
        "creationTimestamp": deployment.CreationTimestamp.Time,
    }
}
```

**Job Formatting:**
```go
func (f *WorkloadsFormatter) JobToResponse(job batchv1.Job) map[string]interface{} {
    ageStr := calculateAge(job.CreationTimestamp.Time)
    
    // Get job status
    status := "Unknown"
    if job.Status.CompletionTime != nil {
        status = "Complete"
    } else if job.Status.Failed > 0 {
        status = "Failed"
    } else if job.Status.Active > 0 {
        status = "Running"
    } else if job.Status.Succeeded > 0 {
        status = "Complete"
    }
    
    // Calculate completions
    completions := "0/1"
    if job.Spec.Completions != nil {
        completions = fmt.Sprintf("%d/%d", job.Status.Succeeded, *job.Spec.Completions)
    } else {
        completions = fmt.Sprintf("%d", job.Status.Succeeded)
    }
    
    // Calculate duration
    duration := "N/A"
    if job.Status.StartTime != nil {
        var endTime time.Time
        if job.Status.CompletionTime != nil {
            endTime = job.Status.CompletionTime.Time
        } else {
            endTime = time.Now()
        }
        jobDuration := endTime.Sub(job.Status.StartTime.Time)
        duration = calculateAge(time.Now().Add(-jobDuration))
    }
    
    // Get container image
    image := "N/A"
    if len(job.Spec.Template.Spec.Containers) > 0 {
        image = job.Spec.Template.Spec.Containers[0].Image
    }
    
    return map[string]interface{}{
        "name":              job.Name,
        "namespace":         job.Namespace,
        "status":            status,
        "completions":       completions,
        "duration":          duration,
        "age":               ageStr,
        "image":             image,
        "labels":            job.Labels,
        "creationTimestamp": job.CreationTimestamp.Format(time.RFC3339),
        "parallelism":       getValueOrDefault(job.Spec.Parallelism, 1),
        "backoffLimit":      getValueOrDefault(job.Spec.BackoffLimit, 6),
        "activeDeadlineSeconds": job.Spec.ActiveDeadlineSeconds,
        "conditions":        formatJobConditions(job.Status.Conditions),
    }
}
```

**CronJob Formatting:**
```go
func (f *WorkloadsFormatter) CronJobToResponse(cronJob batchv1.CronJob) map[string]interface{} {
    ageStr := calculateAge(cronJob.CreationTimestamp.Time)
    
    // Get suspend status
    suspend := false
    if cronJob.Spec.Suspend != nil {
        suspend = *cronJob.Spec.Suspend
    }
    
    // Get last schedule time
    lastScheduleTime := "Never"
    if cronJob.Status.LastScheduleTime != nil {
        lastScheduleTime = cronJob.Status.LastScheduleTime.Format("2006-01-02 15:04:05")
    }
    
    // Count active jobs
    activeJobs := len(cronJob.Status.Active)
    
    // Get container image
    image := "N/A"
    if len(cronJob.Spec.JobTemplate.Spec.Template.Spec.Containers) > 0 {
        image = cronJob.Spec.JobTemplate.Spec.Template.Spec.Containers[0].Image
    }
    
    return map[string]interface{}{
        "name":                         cronJob.Name,
        "namespace":                    cronJob.Namespace,
        "schedule":                     cronJob.Spec.Schedule,
        "suspend":                      suspend,
        "active":                       activeJobs,
        "lastSchedule":                 lastScheduleTime,
        "nextSchedule":                 "Check cron schedule", // Simplified
        "age":                          ageStr,
        "image":                        image,
        "labels":                       cronJob.Labels,
        "creationTimestamp":            cronJob.CreationTimestamp.Format(time.RFC3339),
        "concurrencyPolicy":            string(cronJob.Spec.ConcurrencyPolicy),
        "startingDeadlineSeconds":      cronJob.Spec.StartingDeadlineSeconds,
        "successfulJobsHistoryLimit":   getValueOrDefault(cronJob.Spec.SuccessfulJobsHistoryLimit, 3),
        "failedJobsHistoryLimit":       getValueOrDefault(cronJob.Spec.FailedJobsHistoryLimit, 1),
    }
}
```

#### Utility Functions

**Age Calculation:**
```go
func calculateAge(creationTime time.Time) string {
    duration := time.Since(creationTime)
    
    days := int(duration.Hours() / 24)
    if days > 0 {
        return fmt.Sprintf("%dd", days)
    }
    
    hours := int(duration.Hours())
    if hours > 0 {
        return fmt.Sprintf("%dh", hours)
    }
    
    minutes := int(duration.Minutes())
    if minutes > 0 {
        return fmt.Sprintf("%dm", minutes)
    }
    
    return fmt.Sprintf("%ds", int(duration.Seconds()))
}
```

**Status Reason Detection:**
```go
func getStatusReason(pod *v1.Pod) *string {
    // Check for container states that indicate issues
    for _, containerStatus := range pod.Status.ContainerStatuses {
        if containerStatus.State.Waiting != nil {
            reason := containerStatus.State.Waiting.Reason
            return &reason
        }
        if containerStatus.State.Terminated != nil && 
           containerStatus.State.Terminated.Reason != "Completed" {
            reason := containerStatus.State.Terminated.Reason
            return &reason
        }
    }
    
    // Check pod conditions for issues
    for _, condition := range pod.Status.Conditions {
        if condition.Status == v1.ConditionFalse && condition.Reason != "" {
            reason := condition.Reason
            return &reason
        }
    }
    
    return nil
}
```

### 3. Action Handlers (`handlers/actions`)

Provides parsing and handling for Kubernetes resource actions.

#### Action Parser (`handlers/actions/parser.go`)

**Parser Interface:**
```go
type Parser interface {
    Parse(action string) (resource, verb string)
}

type DefaultParser struct{}
```

**Action Parsing Logic:**
```go
func (p *DefaultParser) Parse(action string) (resource, verb string) {
    // Try parsing as pods action
    if res, verb := p.parsePods(action); res != "" {
        return res, verb
    }
    
    // Try parsing as deployments action
    if res, verb := p.parseDeployments(action); res != "" {
        return res, verb
    }
    
    // Try parsing as services action
    if res, verb := p.parseServices(action); res != "" {
        return res, verb
    }
    
    // Additional resource types...
    
    return "unknown", "unknown"
}
```

**Pod Actions:**
```go
func (p *DefaultParser) parsePods(action string) (resource, verb string) {
    switch action {
    case "restart-pods":
        return "pods", "delete"  // Controller recreates
    case "delete-pods":
        return "pods", "delete"
    case "export-yaml":
        return "pods", "get"
    case "get-logs":
        return "pods", "get"
    case "describe-pods":
        return "pods", "get"
    }
    return "", ""
}
```

**Deployment Actions:**
```go
func (p *DefaultParser) parseDeployments(action string) (resource, verb string) {
    switch action {
    case "restart-deployments":
        return "deployments", "update"
    case "scale-deployments":
        return "deployments", "update"
    case "delete-deployments":
        return "deployments", "delete"
    case "export-yaml":
        return "deployments", "get"
    case "describe-deployments":
        return "deployments", "get"
    }
    return "", ""
}
```

**Service Actions:**
```go
func (p *DefaultParser) parseServices(action string) (resource, verb string) {
    switch action {
    case "delete-services":
        return "services", "delete"
    case "export-yaml":
        return "services", "get"
    case "describe-services":
        return "services", "get"
    }
    return "", ""
}
```

## Usage Examples

### DTO Usage in Handlers

```go
package handlers

import (
    "encoding/json"
    "net/http"
    
    "github.com/example/kaptn/internal/api/v1/dto"
)

func handleListPods(w http.ResponseWriter, r *http.Request) {
    // Parse request options
    var opts dto.ListOptions
    if err := json.NewDecoder(r.Body).Decode(&opts); err != nil {
        http.Error(w, "Invalid request body", http.StatusBadRequest)
        return
    }
    
    // Get pods from Kubernetes
    pods, err := kubeClient.CoreV1().Pods(opts.Namespace).List(ctx, metav1.ListOptions{
        LabelSelector: opts.LabelSelector,
        FieldSelector: opts.FieldSelector,
    })
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    // Convert to summaries
    var summaries []dto.PodSummary
    for _, pod := range pods.Items {
        summary := dto.PodSummary{
            ID:                pod.Name,
            Name:              pod.Name,
            Namespace:         pod.Namespace,
            Phase:             string(pod.Status.Phase),
            Ready:             fmt.Sprintf("%d/%d", readyCount, totalCount),
            Age:               calculateAge(pod.CreationTimestamp.Time),
            Node:              pod.Spec.NodeName,
            PodIP:             pod.Status.PodIP,
            CreationTimestamp: pod.CreationTimestamp.Time,
            Labels:            pod.Labels,
            Annotations:       pod.Annotations,
        }
        summaries = append(summaries, summary)
    }
    
    // Return standardized response
    response := dto.APIResponse{
        Status: "success",
        Data:   summaries,
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}
```

### Formatter Usage

```go
package handlers

import (
    "net/http"
    "github.com/example/kaptn/internal/api/v1/formatters"
)

func handleGetPod(w http.ResponseWriter, r *http.Request) {
    // Get pod from Kubernetes
    pod, err := kubeClient.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
    if err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }
    
    // Format response
    formatter := formatters.NewWorkloadsFormatter()
    response := formatter.PodToSummary(pod)
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

func handleGetPodWithMetrics(w http.ResponseWriter, r *http.Request) {
    // Get pod and metrics
    pod, err := kubeClient.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
    if err != nil {
        http.Error(w, err.Error(), http.StatusNotFound)
        return
    }
    
    // Get metrics map
    podMetricsMap := getPodMetrics() // Implementation depends on metrics source
    
    // Format enhanced response with metrics
    formatter := formatters.NewWorkloadsFormatter()
    response := formatter.EnhancedPodToSummary(pod, podMetricsMap)
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}
```

### Action Parser Usage

```go
package handlers

import (
    "net/http"
    "github.com/example/kaptn/internal/api/v1/handlers/actions"
)

func handleBulkAction(w http.ResponseWriter, r *http.Request) {
    action := r.FormValue("action")
    
    // Parse action
    parser := actions.NewDefaultParser()
    resource, verb := parser.Parse(action)
    
    if resource == "unknown" {
        http.Error(w, "Unknown action", http.StatusBadRequest)
        return
    }
    
    // Check permissions
    if !hasPermission(user, resource, verb) {
        http.Error(w, "Permission denied", http.StatusForbidden)
        return
    }
    
    // Execute action based on parsed resource and verb
    switch action {
    case "restart-pods":
        err = restartPods(selectedPods)
    case "scale-deployments":
        err = scaleDeployments(selectedDeployments, replicas)
    case "delete-services":
        err = deleteServices(selectedServices)
    default:
        http.Error(w, "Action not implemented", http.StatusNotImplemented)
        return
    }
    
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}
```

## Design Patterns

### 1. Domain-Driven Organization

The package is organized by functional domains rather than technical layers:

```
dto/
├── workloads.go     # Pod, Deployment, Job, CronJob DTOs
├── networking.go    # Service, Ingress, NetworkPolicy DTOs  
├── storage.go       # PV, PVC, StorageClass DTOs
├── rbac.go         # Role, RoleBinding DTOs
└── ...

formatters/
├── workloads.go     # Workload resource formatters
├── networking.go    # Network resource formatters
├── storage.go       # Storage resource formatters
└── ...
```

### 2. Consistent Response Structure

All API responses follow a standardized structure:

```go
// Success response
{
    "status": "success",
    "data": {
        // Resource data
    }
}

// Error response
{
    "status": "error",
    "error": "Error message"
}

// Paginated response
{
    "items": [...],
    "page": 1,
    "pageSize": 25,
    "total": 100,
    "status": "success"
}
```

### 3. Metrics Integration

Formatters support metrics integration for enhanced resource information:

```go
// Basic pod summary
basicSummary := formatter.PodToSummary(pod)

// Enhanced summary with metrics
enhancedSummary := formatter.EnhancedPodToSummary(pod, metricsMap)

// Metrics structure
metricsMap = map[string]map[string]interface{}{
    "namespace/pod-name": {
        "cpu": {
            "milli": 250,
            "ofLimitPercent": 25.0,
        },
        "memory": {
            "bytes": 134217728,
            "ofLimitPercent": 50.0,
        },
    },
}
```

### 4. Action Parsing Strategy

Actions are parsed using a resource-scoped approach:

```go
// Action string: "restart-pods"
// Parsed as: resource="pods", verb="delete"
// Rationale: Pod restart is implemented as delete (controller recreates)

// Action string: "scale-deployments" 
// Parsed as: resource="deployments", verb="update"
// Rationale: Scaling modifies deployment spec

// Action string: "export-yaml"
// Parsed as: resource="<contextual>", verb="get"
// Rationale: Export requires read permissions
```

## Configuration

### Pagination Defaults
```go
const (
    DefaultPage     = 1
    DefaultPageSize = 25
    MaxPageSize     = 100
)
```

### Formatter Configuration
```go
// Age calculation precision
type AgeFormat int

const (
    AgeFormatDays AgeFormat = iota
    AgeFormatHours
    AgeFormatMinutes
    AgeFormatSeconds
)
```

### Supported Actions
```go
// Pod actions
var PodActions = []string{
    "restart-pods",
    "delete-pods", 
    "export-yaml",
    "get-logs",
    "describe-pods",
}

// Deployment actions
var DeploymentActions = []string{
    "restart-deployments",
    "scale-deployments",
    "delete-deployments",
    "export-yaml",
    "describe-deployments",
}

// Service actions
var ServiceActions = []string{
    "delete-services",
    "export-yaml",
    "describe-services",
}
```

## Testing

### DTO Testing
```go
func TestPodSummaryJSON(t *testing.T) {
    summary := dto.PodSummary{
        Name:      "test-pod",
        Namespace: "default",
        Phase:     "Running",
        Ready:     "1/1",
        Age:       "5m",
    }
    
    data, err := json.Marshal(summary)
    assert.NoError(t, err)
    
    var unmarshaled dto.PodSummary
    err = json.Unmarshal(data, &unmarshaled)
    assert.NoError(t, err)
    assert.Equal(t, summary, unmarshaled)
}
```

### Formatter Testing
```go
func TestPodToSummary(t *testing.T) {
    pod := &v1.Pod{
        ObjectMeta: metav1.ObjectMeta{
            Name:      "test-pod",
            Namespace: "default",
        },
        Status: v1.PodStatus{
            Phase: v1.PodRunning,
            PodIP: "10.0.0.1",
        },
    }
    
    formatter := formatters.NewWorkloadsFormatter()
    summary := formatter.PodToSummary(pod)
    
    assert.Equal(t, "test-pod", summary["name"])
    assert.Equal(t, "default", summary["namespace"])
    assert.Equal(t, "Running", summary["phase"])
    assert.Equal(t, "10.0.0.1", summary["podIP"])
}
```

### Action Parser Testing
```go
func TestActionParsing(t *testing.T) {
    parser := actions.NewDefaultParser()
    
    tests := []struct {
        action   string
        resource string
        verb     string
    }{
        {"restart-pods", "pods", "delete"},
        {"scale-deployments", "deployments", "update"},
        {"delete-services", "services", "delete"},
        {"unknown-action", "unknown", "unknown"},
    }
    
    for _, test := range tests {
        resource, verb := parser.Parse(test.action)
        assert.Equal(t, test.resource, resource)
        assert.Equal(t, test.verb, verb)
    }
}
```

## Security Considerations

### Input Validation
- All DTO fields are validated before processing
- Pagination parameters are bounded to prevent abuse
- Search terms are sanitized to prevent injection attacks

### Permission Integration
- Action parsing provides resource/verb pairs for RBAC checking
- Formatters include only authorized information
- Sensitive fields are filtered based on user permissions

### Data Sanitization
- User input is sanitized in DTOs
- Error messages are sanitized in responses
- Metrics data is validated before inclusion

## Performance Optimization

### Memory Efficiency
- DTOs use value types where appropriate
- Slice pre-allocation in formatters
- Reusable formatter instances

### Response Size Optimization
- Summary DTOs exclude verbose fields
- Optional fields use omitempty tags
- Pagination reduces response size

### Caching Integration
- Formatter outputs are cacheable
- DTO structures support ETag generation
- Metrics integration is optional for performance

## Best Practices

### DTO Design
- Use clear, descriptive field names
- Include JSON tags with omitempty where appropriate
- Provide validation tags for automatic validation
- Use pointer types for optional fields

### Formatter Implementation
- Calculate derived fields (age, status) in formatters
- Handle missing or nil fields gracefully
- Provide both basic and enhanced formatting options
- Include metrics integration where beneficial

### Action Handling
- Use consistent action naming conventions
- Map actions to appropriate Kubernetes verbs
- Provide clear documentation for each action
- Handle unknown actions gracefully

## Dependencies

### External Dependencies
- `k8s.io/api` - Kubernetes API types
- `k8s.io/apimachinery` - Kubernetes API machinery
- Standard library (`time`, `fmt`, `encoding/json`)

### Internal Dependencies
- `internal/k8s/metrics` - Metrics integration
- `internal/auth` - User context handling

This documentation provides comprehensive coverage of the API v1 package, serving as both a developer guide for extending API functionality and a reference for understanding the standardized request/response patterns used throughout Kaptn's REST API.