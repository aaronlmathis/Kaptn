package metrics

import (
	"context"
	"fmt"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// NodeCapacity represents a node's resource capacity
type NodeCapacity struct {
	Name     string  `json:"name"`
	CPUCores float64 `json:"cpuCores"`
}

// NodesAdapter provides node information and capacity data
type NodesAdapter struct {
	logger     *zap.Logger
	kubeClient kubernetes.Interface
}

// NewNodesAdapter creates a new nodes adapter
func NewNodesAdapter(logger *zap.Logger, kubeClient kubernetes.Interface) *NodesAdapter {
	return &NodesAdapter{
		logger:     logger,
		kubeClient: kubeClient,
	}
}

// ListNodes returns node names and their CPU capacity in cores
func (na *NodesAdapter) ListNodes(ctx context.Context) ([]NodeCapacity, error) {
	nodes, err := na.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		na.logger.Error("Failed to list nodes", zap.Error(err))
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}

	nodeCapacities := make([]NodeCapacity, 0, len(nodes.Items))

	for _, node := range nodes.Items {
		cpuQuantity := node.Status.Capacity[corev1.ResourceCPU]
		cpuCores := float64(cpuQuantity.MilliValue()) / 1000.0 // Convert millicores to cores

		nodeCapacity := NodeCapacity{
			Name:     node.Name,
			CPUCores: cpuCores,
		}

		nodeCapacities = append(nodeCapacities, nodeCapacity)

		na.logger.Debug("Node capacity collected",
			zap.String("node", node.Name),
			zap.Float64("cpuCores", cpuCores),
		)
	}

	na.logger.Info("Collected node capacities",
		zap.Int("nodeCount", len(nodeCapacities)),
	)

	return nodeCapacities, nil
}

// GetTotalClusterCPUCapacity returns the sum of all node CPU capacities in cores
func (na *NodesAdapter) GetTotalClusterCPUCapacity(ctx context.Context) (float64, error) {
	nodeCapacities, err := na.ListNodes(ctx)
	if err != nil {
		return 0, err
	}

	var totalCores float64
	for _, node := range nodeCapacities {
		totalCores += node.CPUCores
	}

	na.logger.Debug("Total cluster CPU capacity calculated",
		zap.Float64("totalCores", totalCores),
	)

	return totalCores, nil
}
