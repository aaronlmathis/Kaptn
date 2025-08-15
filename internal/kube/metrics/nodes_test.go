package metrics

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zaptest"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestNodesAdapter_ListNodes(t *testing.T) {
	logger := zaptest.NewLogger(t)

	tests := []struct {
		name        string
		nodes       []corev1.Node
		expected    []NodeCapacity
		expectError bool
	}{
		{
			name: "single node with CPU capacity",
			nodes: []corev1.Node{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "node-1",
					},
					Status: corev1.NodeStatus{
						Capacity: corev1.ResourceList{
							corev1.ResourceCPU: resource.MustParse("4"),
						},
					},
				},
			},
			expected: []NodeCapacity{
				{
					Name:     "node-1",
					CPUCores: 4.0,
				},
			},
			expectError: false,
		},
		{
			name: "multiple nodes with different CPU capacities",
			nodes: []corev1.Node{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "node-1",
					},
					Status: corev1.NodeStatus{
						Capacity: corev1.ResourceList{
							corev1.ResourceCPU: resource.MustParse("2"),
						},
					},
				},
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "node-2",
					},
					Status: corev1.NodeStatus{
						Capacity: corev1.ResourceList{
							corev1.ResourceCPU: resource.MustParse("8"),
						},
					},
				},
			},
			expected: []NodeCapacity{
				{
					Name:     "node-1",
					CPUCores: 2.0,
				},
				{
					Name:     "node-2",
					CPUCores: 8.0,
				},
			},
			expectError: false,
		},
		{
			name: "node with millicores",
			nodes: []corev1.Node{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "node-1",
					},
					Status: corev1.NodeStatus{
						Capacity: corev1.ResourceList{
							corev1.ResourceCPU: resource.MustParse("1500m"),
						},
					},
				},
			},
			expected: []NodeCapacity{
				{
					Name:     "node-1",
					CPUCores: 1.5,
				},
			},
			expectError: false,
		},
		{
			name:        "no nodes",
			nodes:       []corev1.Node{},
			expected:    []NodeCapacity{},
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create fake client with nodes
			fakeClient := fake.NewSimpleClientset()
			for _, node := range tt.nodes {
				_, err := fakeClient.CoreV1().Nodes().Create(context.TODO(), &node, metav1.CreateOptions{})
				require.NoError(t, err)
			}

			adapter := NewNodesAdapter(logger, fakeClient)

			result, err := adapter.ListNodes(context.Background())

			if tt.expectError {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestNodesAdapter_GetTotalClusterCPUCapacity(t *testing.T) {
	logger := zaptest.NewLogger(t)

	tests := []struct {
		name        string
		nodes       []corev1.Node
		expected    float64
		expectError bool
	}{
		{
			name: "multiple nodes",
			nodes: []corev1.Node{
				{
					ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
					Status: corev1.NodeStatus{
						Capacity: corev1.ResourceList{
							corev1.ResourceCPU: resource.MustParse("2"),
						},
					},
				},
				{
					ObjectMeta: metav1.ObjectMeta{Name: "node-2"},
					Status: corev1.NodeStatus{
						Capacity: corev1.ResourceList{
							corev1.ResourceCPU: resource.MustParse("4"),
						},
					},
				},
			},
			expected:    6.0,
			expectError: false,
		},
		{
			name:        "no nodes",
			nodes:       []corev1.Node{},
			expected:    0.0,
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create fake client with nodes
			fakeClient := fake.NewSimpleClientset()
			for _, node := range tt.nodes {
				_, err := fakeClient.CoreV1().Nodes().Create(context.TODO(), &node, metav1.CreateOptions{})
				require.NoError(t, err)
			}

			adapter := NewNodesAdapter(logger, fakeClient)

			result, err := adapter.GetTotalClusterCPUCapacity(context.Background())

			if tt.expectError {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestNodesAdapter_ListNodes_Error(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create fake client that returns an error
	fakeClient := fake.NewSimpleClientset()
	fakeClient.PrependReactor("list", "nodes", func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
		return true, nil, assert.AnError
	})

	adapter := NewNodesAdapter(logger, fakeClient)

	result, err := adapter.ListNodes(context.Background())

	assert.Error(t, err)
	assert.Nil(t, result)
	assert.Contains(t, err.Error(), "failed to list nodes")
}
