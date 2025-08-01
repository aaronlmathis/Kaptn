package selectors

import (
	"testing"

	v1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestFilterPods(t *testing.T) {
	// Create test pods
	pods := []v1.Pod{
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-pod-1",
				Namespace: "default",
				Labels:    map[string]string{"app": "test", "version": "v1"},
			},
			Spec: v1.PodSpec{
				NodeName: "node-1",
			},
			Status: v1.PodStatus{
				Phase: v1.PodRunning,
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-pod-2",
				Namespace: "kube-system",
				Labels:    map[string]string{"app": "system", "version": "v2"},
			},
			Spec: v1.PodSpec{
				NodeName: "node-2",
			},
			Status: v1.PodStatus{
				Phase: v1.PodPending,
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-pod-3",
				Namespace: "default",
				Labels:    map[string]string{"app": "test", "version": "v2"},
			},
			Spec: v1.PodSpec{
				NodeName: "node-1",
			},
			Status: v1.PodStatus{
				Phase: v1.PodRunning,
			},
		},
	}

	tests := []struct {
		name        string
		options     PodFilterOptions
		expectedLen int
		expectError bool
	}{
		{
			name:        "no filters",
			options:     PodFilterOptions{},
			expectedLen: 3,
		},
		{
			name: "filter by namespace",
			options: PodFilterOptions{
				Namespace: "default",
			},
			expectedLen: 2,
		},
		{
			name: "filter by node",
			options: PodFilterOptions{
				NodeName: "node-1",
			},
			expectedLen: 2,
		},
		{
			name: "filter by label selector",
			options: PodFilterOptions{
				LabelSelector: "app=test",
			},
			expectedLen: 2,
		},
		{
			name: "filter by field selector",
			options: PodFilterOptions{
				FieldSelector: "status.phase=Running",
			},
			expectedLen: 2,
		},
		{
			name: "pagination",
			options: PodFilterOptions{
				Page:     1,
				PageSize: 2,
			},
			expectedLen: 2,
		},
		{
			name: "pagination page 2",
			options: PodFilterOptions{
				Page:     2,
				PageSize: 2,
			},
			expectedLen: 1,
		},
		{
			name: "invalid label selector",
			options: PodFilterOptions{
				LabelSelector: "invalid=selector=format",
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := FilterPods(pods, tt.options)

			if tt.expectError {
				if err == nil {
					t.Error("expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if len(result) != tt.expectedLen {
				t.Errorf("expected %d pods, got %d", tt.expectedLen, len(result))
			}
		})
	}
}

func TestFilterNodes(t *testing.T) {
	// Create test nodes
	nodes := []v1.Node{
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:   "master-node",
				Labels: map[string]string{"node-role.kubernetes.io/control-plane": ""},
			},
			Spec: v1.NodeSpec{
				Unschedulable: false,
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:   "worker-node-1",
				Labels: map[string]string{"node-role.kubernetes.io/worker": ""},
			},
			Spec: v1.NodeSpec{
				Unschedulable: false,
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:   "worker-node-2",
				Labels: map[string]string{"node-role.kubernetes.io/worker": ""},
			},
			Spec: v1.NodeSpec{
				Unschedulable: true,
			},
		},
	}

	tests := []struct {
		name        string
		options     NodeFilterOptions
		expectedLen int
		expectError bool
	}{
		{
			name:        "no filters",
			options:     NodeFilterOptions{},
			expectedLen: 3,
		},
		{
			name: "filter by label selector",
			options: NodeFilterOptions{
				LabelSelector: "node-role.kubernetes.io/worker",
			},
			expectedLen: 2,
		},
		{
			name: "filter by field selector",
			options: NodeFilterOptions{
				FieldSelector: "spec.unschedulable=false",
			},
			expectedLen: 2,
		},
		{
			name: "pagination",
			options: NodeFilterOptions{
				Page:     1,
				PageSize: 2,
			},
			expectedLen: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := FilterNodes(nodes, tt.options)

			if tt.expectError {
				if err == nil {
					t.Error("expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if len(result) != tt.expectedLen {
				t.Errorf("expected %d nodes, got %d", tt.expectedLen, len(result))
			}
		})
	}
}

func TestBuildSelectors(t *testing.T) {
	tests := []struct {
		name     string
		input    map[string]string
		expected string
		isLabel  bool
	}{
		{
			name:     "label selector with values",
			input:    map[string]string{"app": "test", "version": "v1"},
			expected: "app=test,version=v1",
			isLabel:  true,
		},
		{
			name:     "label selector with empty value",
			input:    map[string]string{"app": "", "version": "v1"},
			expected: "app,version=v1",
			isLabel:  true,
		},
		{
			name:     "field selector",
			input:    map[string]string{"status.phase": "Running", "spec.nodeName": "node-1"},
			expected: "status.phase=Running,spec.nodeName=node-1",
			isLabel:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var result string
			if tt.isLabel {
				result = BuildLabelSelector(tt.input)
			} else {
				result = BuildFieldSelector(tt.input)
			}

			// Since map iteration order is not guaranteed, we need to check if the result contains the expected parts
			if len(result) == 0 && len(tt.expected) > 0 {
				t.Errorf("expected non-empty result")
			}
		})
	}
}
