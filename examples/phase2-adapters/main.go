package main

import (
	"context"
	"fmt"
	"log"

	"go.uber.org/zap"
	"k8s.io/metrics/pkg/client/clientset/versioned"

	"github.com/aaronlmathis/kaptn/internal/k8s/client"
	"github.com/aaronlmathis/kaptn/internal/kube/metrics"
)

// Example demonstrates how to use the Phase 2 Kubernetes adapters
func main() {
	logger, _ := zap.NewDevelopment()
	defer logger.Sync()

	// Create Kubernetes client factory (in-cluster for real deployment)
	factory, err := client.NewFactory(logger, client.InClusterMode, "")
	if err != nil {
		log.Fatalf("Failed to create client factory: %v", err)
	}

	// Validate connection
	if err := factory.ValidateConnection(); err != nil {
		log.Fatalf("Failed to validate connection: %v", err)
	}

	ctx := context.Background()

	// Create adapters
	nodesAdapter := metrics.NewNodesAdapter(logger, factory.Client())

	// Create metrics client for CPU usage (optional)
	metricsClient, err := versioned.NewForConfig(factory.Config())
	var apiMetricsAdapter *metrics.APIMetricsAdapter
	if err != nil {
		logger.Warn("Failed to create metrics client", zap.Error(err))
		apiMetricsAdapter = metrics.NewAPIMetricsAdapter(logger, factory.Client(), nil)
	} else {
		apiMetricsAdapter = metrics.NewAPIMetricsAdapter(logger, factory.Client(), metricsClient.MetricsV1beta1())
	}

	summaryAdapter := metrics.NewSummaryStatsAdapter(logger, factory.Client(), factory.Config())

	// Demonstrate node capacity collection
	fmt.Println("=== Node Capacity Collection ===")
	nodes, err := nodesAdapter.ListNodes(ctx)
	if err != nil {
		logger.Error("Failed to list nodes", zap.Error(err))
	} else {
		for _, node := range nodes {
			fmt.Printf("Node: %s, CPU Cores: %.2f\n", node.Name, node.CPUCores)
		}

		totalCapacity, err := nodesAdapter.GetTotalClusterCPUCapacity(ctx)
		if err != nil {
			logger.Error("Failed to get total capacity", zap.Error(err))
		} else {
			fmt.Printf("Total Cluster CPU Capacity: %.2f cores\n", totalCapacity)
		}
	}

	// Demonstrate CPU usage collection (if metrics-server available)
	fmt.Println("\n=== CPU Usage Collection ===")
	if apiMetricsAdapter.HasMetricsAPI(ctx) {
		usage, err := apiMetricsAdapter.ListNodeCPUUsage(ctx)
		if err != nil {
			logger.Error("Failed to get CPU usage", zap.Error(err))
		} else {
			for node, cores := range usage {
				fmt.Printf("Node: %s, CPU Used: %.2f cores\n", node, cores)
			}

			totalUsage, err := apiMetricsAdapter.GetTotalClusterCPUUsage(ctx)
			if err != nil {
				logger.Error("Failed to get total usage", zap.Error(err))
			} else {
				fmt.Printf("Total Cluster CPU Usage: %.2f cores\n", totalUsage)
			}
		}
	} else {
		fmt.Println("Metrics API not available - CPU usage data unavailable")
	}

	// Demonstrate network statistics collection (if Summary API available)
	fmt.Println("\n=== Network Statistics Collection ===")
	if summaryAdapter.HasSummaryAPI(ctx) {
		stats, err := summaryAdapter.ListNodeNetworkStats(ctx)
		if err != nil {
			logger.Error("Failed to get network stats", zap.Error(err))
		} else {
			for _, stat := range stats {
				fmt.Printf("Node: %s, RX: %d bytes, TX: %d bytes\n",
					stat.NodeName, stat.RxBytes, stat.TxBytes)
			}

			clusterStats, err := summaryAdapter.GetClusterNetworkStats(ctx)
			if err != nil {
				logger.Error("Failed to get cluster network stats", zap.Error(err))
			} else {
				fmt.Printf("Cluster Network - RX: %d bytes, TX: %d bytes\n",
					clusterStats.RxBytes, clusterStats.TxBytes)
			}
		}
	} else {
		fmt.Println("Summary API not available - network statistics unavailable")
	}

	// Demonstrate capability detection
	fmt.Println("\n=== Capability Detection ===")
	fmt.Printf("Metrics API Available: %t\n", apiMetricsAdapter.HasMetricsAPI(ctx))
	fmt.Printf("Summary API Available: %t\n", summaryAdapter.HasSummaryAPI(ctx))
}
