package formatters

import (
	"testing"
	"time"

	"github.com/aaronlmathis/kaptn/internal/k8s/metrics"
	appsv1 "k8s.io/api/apps/v1"
	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestWorkloadsFormatter_PodToSummary(t *testing.T) {
	formatter := NewWorkloadsFormatter()
	
	// Create a test pod
	creationTime := time.Now().Add(-5 * time.Minute)
	pod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "test-pod",
			Namespace:         "test-namespace",
			CreationTimestamp: metav1.NewTime(creationTime),
			Labels: map[string]string{
				"app": "test",
			},
		},
		Spec: v1.PodSpec{
			NodeName: "test-node",
			Containers: []v1.Container{
				{Name: "container1"},
				{Name: "container2"},
			},
			RestartPolicy: v1.RestartPolicyAlways,
		},
		Status: v1.PodStatus{
			Phase: v1.PodRunning,
			PodIP: "10.0.0.1",
			HostIP: "192.168.1.1",
			Conditions: []v1.PodCondition{
				{
					Type:   v1.PodReady,
					Status: v1.ConditionTrue,
				},
			},
			ContainerStatuses: []v1.ContainerStatus{
				{Ready: true},
				{Ready: true},
			},
		},
	}

	result := formatter.PodToSummary(pod)

	// Verify expected fields
	if result["name"] != "test-pod" {
		t.Errorf("Expected name 'test-pod', got %v", result["name"])
	}
	if result["namespace"] != "test-namespace" {
		t.Errorf("Expected namespace 'test-namespace', got %v", result["namespace"])
	}
	if result["phase"] != string(v1.PodRunning) {
		t.Errorf("Expected phase 'Running', got %v", result["phase"])
	}
	if result["ready"] != true {
		t.Errorf("Expected ready true, got %v", result["ready"])
	}
	if result["readyContainers"] != 2 {
		t.Errorf("Expected readyContainers 2, got %v", result["readyContainers"])
	}
	if result["totalContainers"] != 2 {
		t.Errorf("Expected totalContainers 2, got %v", result["totalContainers"])
	}
}

func TestWorkloadsFormatter_EnhancedPodToSummary(t *testing.T) {
	formatter := NewWorkloadsFormatter()
	
	// Create a test pod
	creationTime := time.Now().Add(-5 * time.Minute)
	pod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "test-pod",
			Namespace:         "test-namespace",
			CreationTimestamp: metav1.NewTime(creationTime),
		},
		Spec: v1.PodSpec{
			NodeName: "test-node",
		},
		Status: v1.PodStatus{
			Phase: v1.PodRunning,
			ContainerStatuses: []v1.ContainerStatus{
				{RestartCount: 1},
				{RestartCount: 2},
			},
		},
	}

	// Create test metrics
	podMetricsMap := map[string]map[string]interface{}{
		"test-namespace/test-pod": {
			"cpu": map[string]interface{}{
				"milli":          100,
				"ofLimitPercent": nil,
			},
			"memory": map[string]interface{}{
				"bytes":          1024,
				"ofLimitPercent": nil,
			},
		},
	}

	result := formatter.EnhancedPodToSummary(pod, podMetricsMap)

	// Verify enhanced fields
	if result["name"] != "test-pod" {
		t.Errorf("Expected name 'test-pod', got %v", result["name"])
	}
	if result["ready"] != "0/0" {
		t.Errorf("Expected ready '0/0', got %v", result["ready"])
	}
	if result["restartCount"] != int32(3) {
		t.Errorf("Expected restartCount 3, got %v", result["restartCount"])
	}
	
	// Check metrics
	cpu := result["cpu"].(map[string]interface{})
	if cpu["milli"] != 100 {
		t.Errorf("Expected CPU milli 100, got %v", cpu["milli"])
	}
	
	memory := result["memory"].(map[string]interface{})
	if memory["bytes"] != 1024 {
		t.Errorf("Expected memory bytes 1024, got %v", memory["bytes"])
	}
}

func TestWorkloadsFormatter_DeploymentToResponse(t *testing.T) {
	formatter := NewWorkloadsFormatter()
	
	// Create a test deployment
	replicas := int32(3)
	deployment := appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "test-deployment",
			Namespace:         "test-namespace",
			CreationTimestamp: metav1.NewTime(time.Now().Add(-10 * time.Minute)),
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
		},
		Status: appsv1.DeploymentStatus{
			ReadyReplicas:     2,
			UpdatedReplicas:   3,
			AvailableReplicas: 2,
			Conditions: []appsv1.DeploymentCondition{
				{
					Type:    appsv1.DeploymentProgressing,
					Status:  v1.ConditionTrue,
					Reason:  "NewReplicaSetAvailable",
					Message: "ReplicaSet has successfully progressed.",
				},
			},
		},
	}

	result := formatter.DeploymentToResponse(deployment)

	// Verify fields
	if result["name"] != "test-deployment" {
		t.Errorf("Expected name 'test-deployment', got %v", result["name"])
	}
	
	replicasData := result["replicas"].(map[string]int32)
	if replicasData["desired"] != 3 {
		t.Errorf("Expected desired replicas 3, got %v", replicasData["desired"])
	}
	if replicasData["ready"] != 2 {
		t.Errorf("Expected ready replicas 2, got %v", replicasData["ready"])
	}
}

func TestCalculatePodCPUUsage(t *testing.T) {
	podMetric := metrics.PodMetrics{
		Containers: []metrics.ContainerMetrics{
			{
				CPU: metrics.ResourceUsage{
					Used:      "100m",
					UsedBytes: 100,
					Percent:   10.0,
				},
			},
			{
				CPU: metrics.ResourceUsage{
					Used:      "200m",
					UsedBytes: 200,
					Percent:   20.0,
				},
			},
		},
	}

	result := CalculatePodCPUUsage(podMetric)
	
	if result["milli"] != int64(300) {
		t.Errorf("Expected total CPU milli 300, got %v", result["milli"])
	}
}

func TestCalculatePodMemoryUsage(t *testing.T) {
	podMetric := metrics.PodMetrics{
		Containers: []metrics.ContainerMetrics{
			{
				Memory: metrics.ResourceUsage{
					Used:      "1Ki",
					UsedBytes: 1024,
					Percent:   5.0,
				},
			},
			{
				Memory: metrics.ResourceUsage{
					Used:      "2Ki",
					UsedBytes: 2048,
					Percent:   10.0,
				},
			},
		},
	}

	result := CalculatePodMemoryUsage(podMetric)
	
	if result["bytes"] != int64(3072) {
		t.Errorf("Expected total memory bytes 3072, got %v", result["bytes"])
	}
}

func TestCalculateAge(t *testing.T) {
	// Test various age calculations
	tests := []struct {
		name     string
		duration time.Duration
		expected string
	}{
		{"seconds", 30 * time.Second, "30s"},
		{"minutes", 5 * time.Minute, "5m"},
		{"hours", 2 * time.Hour, "2h"},
		{"days", 25 * time.Hour, "1d"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			creationTime := time.Now().Add(-tt.duration)
			result := calculateAge(creationTime)
			if result != tt.expected {
				t.Errorf("Expected age %s, got %s", tt.expected, result)
			}
		})
	}
}
