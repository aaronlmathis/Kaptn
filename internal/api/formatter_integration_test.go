package api

import (
	"testing"

	"time"

	"github.com/aaronlmathis/kaptn/internal/api/v1/formatters"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestNamespaceFormatterIntegration(t *testing.T) {
	// Test that the new formatter produces a valid response
	clusterFormatter := formatters.NewClusterFormatter()

	namespace := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-namespace",
			Labels: map[string]string{
				"app": "test",
			},
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-24 * time.Hour)},
		},
		Status: corev1.NamespaceStatus{
			Phase: corev1.NamespaceActive,
		},
	}

	summary := clusterFormatter.NamespaceToResponse(namespace)

	// Verify the response has the expected structure for handlers
	if summary["name"] != "test-namespace" {
		t.Errorf("Expected name 'test-namespace', got %v", summary["name"])
	}

	if summary["status"] != "Active" {
		t.Errorf("Expected status 'Active', got %v", summary["status"])
	}

	// Verify the response has all the expected fields that the API would return
	requiredFields := []string{"name", "status", "age", "labelsCount", "annotationsCount", "creationTimestamp", "labels", "annotations"}
	for _, field := range requiredFields {
		if _, exists := summary[field]; !exists {
			t.Errorf("Expected field '%s' to exist in response", field)
		}
	}
}
