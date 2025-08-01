package actions

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap/zaptest"
	v1 "k8s.io/api/core/v1"
	policyv1 "k8s.io/api/policy/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	ktesting "k8s.io/client-go/testing"
)

func TestNodeActionsService_CordonNode(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create a fake Kubernetes client
	fakeClient := fake.NewSimpleClientset()

	// Create a test node
	node := &v1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-node",
		},
		Spec: v1.NodeSpec{
			Unschedulable: false,
		},
	}
	fakeClient.CoreV1().Nodes().Create(context.Background(), node, metav1.CreateOptions{})

	service := NewNodeActionsService(fakeClient, logger)

	// Test cordoning the node
	err := service.CordonNode(context.Background(), "test-request-id", "test-user", "test-node")
	assert.NoError(t, err)

	// Verify the node is cordoned
	updatedNode, err := fakeClient.CoreV1().Nodes().Get(context.Background(), "test-node", metav1.GetOptions{})
	assert.NoError(t, err)
	assert.True(t, updatedNode.Spec.Unschedulable)
}

func TestNodeActionsService_UncordonNode(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create a fake Kubernetes client
	fakeClient := fake.NewSimpleClientset()

	// Create a test node that is already cordoned
	node := &v1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-node",
		},
		Spec: v1.NodeSpec{
			Unschedulable: true,
		},
	}
	fakeClient.CoreV1().Nodes().Create(context.Background(), node, metav1.CreateOptions{})

	service := NewNodeActionsService(fakeClient, logger)

	// Test uncordoning the node
	err := service.UncordonNode(context.Background(), "test-request-id", "test-user", "test-node")
	assert.NoError(t, err)

	// Verify the node is uncordoned
	updatedNode, err := fakeClient.CoreV1().Nodes().Get(context.Background(), "test-node", metav1.GetOptions{})
	assert.NoError(t, err)
	assert.False(t, updatedNode.Spec.Unschedulable)
}

func TestNodeActionsService_DrainNode_SkipsDaemonSetPods(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create a fake Kubernetes client
	fakeClient := fake.NewSimpleClientset()

	// Create a test node
	node := &v1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-node",
		},
		Spec: v1.NodeSpec{
			Unschedulable: false,
		},
	}
	fakeClient.CoreV1().Nodes().Create(context.Background(), node, metav1.CreateOptions{})

	// Create a DaemonSet pod (should be skipped)
	daemonSetPod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "daemon-pod",
			Namespace: "default",
			OwnerReferences: []metav1.OwnerReference{
				{
					Kind: "DaemonSet",
					Name: "test-daemonset",
				},
			},
		},
		Spec: v1.PodSpec{
			NodeName: "test-node",
		},
		Status: v1.PodStatus{
			Phase: v1.PodRunning,
		},
	}
	fakeClient.CoreV1().Pods("default").Create(context.Background(), daemonSetPod, metav1.CreateOptions{})

	// Create a regular pod (should be evicted)
	regularPod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "regular-pod",
			Namespace: "default",
		},
		Spec: v1.PodSpec{
			NodeName: "test-node",
		},
		Status: v1.PodStatus{
			Phase: v1.PodRunning,
		},
	}
	fakeClient.CoreV1().Pods("default").Create(context.Background(), regularPod, metav1.CreateOptions{})

	service := NewNodeActionsService(fakeClient, logger)

	// Start drain operation
	jobID, err := service.DrainNode(context.Background(), "test-request-id", "test-user", "test-node", DrainOptions{
		TimeoutSeconds: 30,
		Force:          false,
	})
	assert.NoError(t, err)
	assert.NotEmpty(t, jobID)

	// Wait a moment for the async operation to complete
	time.Sleep(100 * time.Millisecond)

	// Check that the job exists and track if it completes
	job, exists := service.GetJob(jobID)
	assert.True(t, exists)
	assert.Equal(t, "drain", job.Type)

	// The node should be cordoned
	updatedNode, err := fakeClient.CoreV1().Nodes().Get(context.Background(), "test-node", metav1.GetOptions{})
	assert.NoError(t, err)
	assert.True(t, updatedNode.Spec.Unschedulable)
}

func TestNodeActionsService_DrainNode_RespectsTimeout(t *testing.T) {
	logger := zaptest.NewLogger(t)

	// Create a fake Kubernetes client
	fakeClient := fake.NewSimpleClientset()

	// Mock eviction to simulate hanging/slow operations
	fakeClient.PrependReactor("create", "evictions", func(action ktesting.Action) (handled bool, ret runtime.Object, err error) {
		// Simulate a slow eviction that would cause timeout
		time.Sleep(200 * time.Millisecond)
		return true, &policyv1.Eviction{}, nil
	})

	// Create a test node
	node := &v1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-node",
		},
		Spec: v1.NodeSpec{
			Unschedulable: false,
		},
	}
	fakeClient.CoreV1().Nodes().Create(context.Background(), node, metav1.CreateOptions{})

	// Create a regular pod
	regularPod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "regular-pod",
			Namespace: "default",
		},
		Spec: v1.PodSpec{
			NodeName: "test-node",
		},
		Status: v1.PodStatus{
			Phase: v1.PodRunning,
		},
	}
	fakeClient.CoreV1().Pods("default").Create(context.Background(), regularPod, metav1.CreateOptions{})

	service := NewNodeActionsService(fakeClient, logger)

	// Start drain operation with very short timeout
	jobID, err := service.DrainNode(context.Background(), "test-request-id", "test-user", "test-node", DrainOptions{
		TimeoutSeconds: 1, // Very short timeout
		Force:          false,
	})
	assert.NoError(t, err)
	assert.NotEmpty(t, jobID)

	// Wait for the job to complete or timeout
	time.Sleep(2 * time.Second)

	// Check the job status - it should have timed out
	job, exists := service.GetJob(jobID)
	assert.True(t, exists)
	assert.Equal(t, JobStatusError, job.Status)
}

func TestJobTracker_CreateAndGetJob(t *testing.T) {
	logger := zaptest.NewLogger(t)
	tracker := NewJobTracker(logger)

	// Create a job
	job := tracker.CreateJob("test job", "test")
	assert.NotEmpty(t, job.ID)
	assert.Equal(t, "test", job.Type)
	assert.Equal(t, JobStatusRunning, job.Status)

	// Retrieve the job
	retrievedJob, exists := tracker.GetJob(job.ID)
	assert.True(t, exists)
	assert.Equal(t, job.ID, retrievedJob.ID)
	assert.Equal(t, job.Type, retrievedJob.Type)

	// Test updating job status
	job.UpdateStatus("Test progress message")
	job.SetComplete()

	// Retrieve updated job
	updatedJob, exists := tracker.GetJob(job.ID)
	assert.True(t, exists)
	assert.Equal(t, JobStatusCompleted, updatedJob.Status)
	assert.NotEmpty(t, updatedJob.Progress)
	assert.NotNil(t, updatedJob.EndTime)
}

func TestJobTracker_JobNotFound(t *testing.T) {
	logger := zaptest.NewLogger(t)
	tracker := NewJobTracker(logger)

	// Try to get a non-existent job
	job, exists := tracker.GetJob("non-existent-job-id")
	assert.False(t, exists)
	assert.Nil(t, job)
}

func TestIsDaemonSetPod(t *testing.T) {
	// Test pod with DaemonSet owner
	daemonSetPod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			OwnerReferences: []metav1.OwnerReference{
				{
					Kind: "DaemonSet",
					Name: "test-daemonset",
				},
			},
		},
	}
	assert.True(t, isDaemonSetPod(daemonSetPod))

	// Test pod without DaemonSet owner
	regularPod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			OwnerReferences: []metav1.OwnerReference{
				{
					Kind: "ReplicaSet",
					Name: "test-replicaset",
				},
			},
		},
	}
	assert.False(t, isDaemonSetPod(regularPod))

	// Test pod with no owners
	orphanPod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{},
	}
	assert.False(t, isDaemonSetPod(orphanPod))
}

func TestIsMirrorPod(t *testing.T) {
	// Test static/mirror pod
	mirrorPod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Annotations: map[string]string{
				v1.MirrorPodAnnotationKey: "mirror-pod-annotation",
			},
		},
	}
	assert.True(t, isMirrorPod(mirrorPod))

	// Test regular pod
	regularPod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Annotations: map[string]string{
				"other-annotation": "value",
			},
		},
	}
	assert.False(t, isMirrorPod(regularPod))

	// Test pod with no annotations
	noAnnotationsPod := &v1.Pod{
		ObjectMeta: metav1.ObjectMeta{},
	}
	assert.False(t, isMirrorPod(noAnnotationsPod))
}
