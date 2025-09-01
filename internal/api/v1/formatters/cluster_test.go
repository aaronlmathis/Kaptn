package formatters

import (
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/aaronlmathis/kaptn/internal/k8s/resources"
)

func TestClusterFormatter_NamespaceToResponse(t *testing.T) {
	formatter := &ClusterFormatter{}

	namespace := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-namespace",
			Labels: map[string]string{
				"app": "test",
				"env": "dev",
			},
			Annotations: map[string]string{
				"description": "test namespace",
			},
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-24 * time.Hour)},
		},
		Status: corev1.NamespaceStatus{
			Phase: corev1.NamespaceActive,
		},
	}

	result := formatter.NamespaceToResponse(namespace)

	if result["name"] != "test-namespace" {
		t.Errorf("Expected name 'test-namespace', got %v", result["name"])
	}

	if result["status"] != "Active" {
		t.Errorf("Expected status 'Active', got %v", result["status"])
	}

	if result["labelsCount"] != 2 {
		t.Errorf("Expected labelsCount 2, got %v", result["labelsCount"])
	}

	if result["annotationsCount"] != 1 {
		t.Errorf("Expected annotationsCount 1, got %v", result["annotationsCount"])
	}

	// Check that age is not "unknown"
	if result["age"] == "unknown" {
		t.Errorf("Expected age to be calculated, got 'unknown'")
	}
}

func TestClusterFormatter_NodeToSummary(t *testing.T) {
	formatter := &ClusterFormatter{}

	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "worker-node-1",
			Labels: map[string]string{
				"kubernetes.io/hostname":         "worker-node-1",
				"node-role.kubernetes.io/worker": "",
			},
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-7 * 24 * time.Hour)},
		},
		Status: corev1.NodeStatus{
			Conditions: []corev1.NodeCondition{
				{
					Type:   corev1.NodeReady,
					Status: corev1.ConditionTrue,
				},
			},
			Capacity: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("4"),
				corev1.ResourceMemory: resource.MustParse("8Gi"),
			},
			Allocatable: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("3800m"),
				corev1.ResourceMemory: resource.MustParse("7.5Gi"),
			},
			NodeInfo: corev1.NodeSystemInfo{
				KubeletVersion:  "v1.28.0",
				OSImage:         "Ubuntu 22.04.3 LTS",
				KernelVersion:   "5.15.0-78-generic",
				Architecture:    "amd64",
				OperatingSystem: "linux",
			},
		},
	}

	result := formatter.NodeToSummary(node)

	if result["name"] != "worker-node-1" {
		t.Errorf("Expected name 'worker-node-1', got %v", result["name"])
	}

	if result["ready"] != true {
		t.Errorf("Expected ready true, got %v", result["ready"])
	}

	if result["kubeletVersion"] != "v1.28.0" {
		t.Errorf("Expected kubeletVersion 'v1.28.0', got %v", result["kubeletVersion"])
	}

	// Check capacity (ResourceList)
	capacity, ok := result["capacity"].(corev1.ResourceList)
	if !ok {
		t.Errorf("Expected capacity to be ResourceList, got %T", result["capacity"])
	} else {
		cpuQuantity := capacity[corev1.ResourceCPU]
		if cpuQuantity.String() != "4" {
			t.Errorf("Expected CPU capacity '4', got %v", cpuQuantity.String())
		}
		memQuantity := capacity[corev1.ResourceMemory]
		if memQuantity.String() != "8Gi" {
			t.Errorf("Expected memory capacity '8Gi', got %v", memQuantity.String())
		}
	}
}

func TestClusterFormatter_APIResourceToResponse(t *testing.T) {
	formatter := &ClusterFormatter{}

	apiResource := resources.APIResource{
		Name:         "pods",
		SingularName: "pod",
		Namespaced:   true,
		Kind:         "Pod",
		Group:        "",
		Version:      "v1",
		APIVersion:   "v1",
		ShortNames:   []string{"po"},
		Categories:   []string{"all"},
	}

	result := formatter.APIResourceToResponse(apiResource)

	if result["name"] != "pods" {
		t.Errorf("Expected name 'pods', got %v", result["name"])
	}

	if result["kind"] != "Pod" {
		t.Errorf("Expected kind 'Pod', got %v", result["kind"])
	}

	if result["namespaced"] != "true" {
		t.Errorf("Expected namespaced 'true', got %v", result["namespaced"])
	}

	// Check shortNames (string format)
	shortNames, ok := result["shortNames"].(string)
	if !ok {
		t.Errorf("Expected shortNames to be string, got %T", result["shortNames"])
	} else if shortNames != "po" {
		t.Errorf("Expected shortNames 'po', got %v", shortNames)
	}
}
