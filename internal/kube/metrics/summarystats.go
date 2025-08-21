package metrics

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// NetworkStats represents network statistics for a node
type NetworkStats struct {
	NodeName  string    `json:"nodeName"`
	RxBytes   uint64    `json:"rxBytes"`   // Total received bytes
	TxBytes   uint64    `json:"txBytes"`   // Total transmitted bytes
	RxPackets uint64    `json:"rxPackets"` // Total received packets
	TxPackets uint64    `json:"txPackets"` // Total transmitted packets
	Timestamp time.Time `json:"timestamp"`
}

// FilesystemStats represents filesystem statistics for a node
type FilesystemStats struct {
	NodeName            string    `json:"nodeName"`
	FsCapacityBytes     uint64    `json:"fsCapacityBytes"`
	FsAvailableBytes    uint64    `json:"fsAvailableBytes"`
	FsUsedBytes         uint64    `json:"fsUsedBytes"` // Derived if not directly available
	FsInodesTotal       uint64    `json:"fsInodesTotal"`
	FsInodesFree        uint64    `json:"fsInodesFree"`
	FsInodesUsed        uint64    `json:"fsInodesUsed"` // Derived if not directly available
	ImageFsCapacityBytes uint64    `json:"imageFsCapacityBytes"`
	ImageFsAvailableBytes uint64    `json:"imageFsAvailableBytes"`
	ImageFsUsedBytes    uint64    `json:"imageFsUsedBytes"` // Derived if not directly available
	ImageFsInodesTotal  uint64    `json:"imageFsInodesTotal"`
	ImageFsInodesFree   uint64    `json:"imageFsInodesFree"`
	ImageFsInodesUsed   uint64    `json:"imageFsInodesUsed"` // Derived if not directly available
	Timestamp           time.Time `json:"timestamp"`
}

// InterfaceStats represents network statistics for a single network interface
type InterfaceStats struct {
	Name      string `json:"name"`
	RxBytes   uint64 `json:"rxBytes"`
	RxErrors  uint64 `json:"rxErrors"`
	TxBytes   uint64 `json:"txBytes"`
	TxErrors  uint64 `json:"txErrors"`
	RxPackets uint64 `json:"rxPackets"`
	TxPackets uint64 `json:"txPackets"`
}

// SummaryStatsResponse represents the kubelet summary stats response
type SummaryStatsResponse struct {
	Node struct {
		Network struct {
			RxBytes    uint64           `json:"rxBytes"`
			TxBytes    uint64           `json:"txBytes"`
			RxPackets  uint64           `json:"rxPackets"`
			TxPackets  uint64           `json:"txPackets"`
			Interfaces []InterfaceStats `json:"interfaces"` // Per-interface stats
		} `json:"network"`
		Fs struct {
			UsedBytes     uint64 `json:"usedBytes"`
			CapacityBytes uint64 `json:"capacityBytes"`
			AvailableBytes uint64 `json:"availableBytes"`
			Inodes        uint64 `json:"inodes"`      // Total inodes
			InodesFree    uint64 `json:"inodesFree"`  // Free inodes
		} `json:"fs"`
		Runtime struct {
			ImageFs struct {
				UsedBytes     uint64 `json:"usedBytes"`
				CapacityBytes uint64 `json:"capacityBytes"`
				AvailableBytes uint64 `json:"availableBytes"`
				Inodes        uint64 `json:"inodes"`      // Total inodes
				InodesFree    uint64 `json:"inodesFree"`  // Free inodes
			} `json:"imageFs"`
		} `json:"runtime"`
		Memory struct {
			UsageBytes      uint64 `json:"usageBytes"`
			WorkingSetBytes uint64 `json:"workingSetBytes"`
		} `json:"memory"`
		SystemContainers []struct {
			Name string `json:"name"`
		} `json:"systemContainers"`
	} `json:"node"`
	Pods []struct {
		PodRef struct {
			Name      string `json:"name"`
			Namespace string `json:"namespace"`
		} `json:"podRef"`
		Network struct {
			RxBytes uint64 `json:"rxBytes"`
			TxBytes uint64 `json:"txBytes"`
		} `json:"network"`
		EphemeralStorage struct {
			UsedBytes uint64 `json:"usedBytes"`
		} `json:"ephemeral-storage"`
	} `json:"pods"`
}

// DetailedNodeStats represents detailed node statistics
type DetailedNodeStats struct {
	NodeName         string    `json:"nodeName"`
	MemoryUsageBytes uint64    `json:"memoryUsageBytes"`
	MemoryWorkingSet uint64    `json:"memoryWorkingSetBytes"`
	FsUsedBytes      uint64    `json:"fsUsedBytes"`
	FsCapacityBytes  uint64    `json:"fsCapacityBytes"`
	ImageFsUsedBytes uint64    `json:"imageFsUsedBytes"`
	ImageFsCapacity  uint64    `json:"imageFsCapacityBytes"`
	ProcessCount     int       `json:"processCount"`
	Timestamp        time.Time `json:"timestamp"`
}

// PodNetworkStats represents network statistics for a pod
type PodNetworkStats struct {
	PodName       string    `json:"podName"`
	PodNamespace  string    `json:"podNamespace"`
	NodeName      string    `json:"nodeName"`
	RxBytes       uint64    `json:"rxBytes"`
	TxBytes       uint64    `json:"txBytes"`
	EphemeralUsed uint64    `json:"ephemeralUsedBytes"`
	Timestamp     time.Time `json:"timestamp"`
}

// SummaryStatsAdapter provides Kubelet Summary API integration for network statistics
type SummaryStatsAdapter struct {
	logger     *zap.Logger
	kubeClient kubernetes.Interface
	restConfig *rest.Config
	httpClient *http.Client
}

// NewSummaryStatsAdapter creates a new summary stats adapter
func NewSummaryStatsAdapter(logger *zap.Logger, kubeClient kubernetes.Interface, restConfig *rest.Config, insecureTLS bool) *SummaryStatsAdapter {
	// Clone the rest config to avoid modifying the original
	configCopy := rest.CopyConfig(restConfig)

	// Apply insecure TLS if requested
	if insecureTLS {
		configCopy.TLSClientConfig.Insecure = true
		configCopy.TLSClientConfig.CAFile = ""
		configCopy.TLSClientConfig.CAData = nil
		logger.Warn("Summary API configured with insecure TLS - certificate verification disabled")
	}

	return &SummaryStatsAdapter{
		logger:     logger,
		kubeClient: kubeClient,
		restConfig: configCopy,
		httpClient: &http.Client{Timeout: 30 * time.Second}, // Will be replaced by transport-based client
	}
}

// HasSummaryAPI returns true if the Kubelet Summary API is accessible
func (ssa *SummaryStatsAdapter) HasSummaryAPI(ctx context.Context) bool {
	// Get a list of nodes to test with
	nodes, err := ssa.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil || len(nodes.Items) == 0 {
		ssa.logger.Warn("Cannot test Summary API - no nodes available", zap.Error(err))
		return false
	}

	// Test the Summary API on the first node
	nodeName := nodes.Items[0].Name
	_, err = ssa.getNodeSummaryStats(ctx, nodeName)
	if err != nil {
		ssa.logger.Info("Summary API not available", zap.String("testedNode", nodeName), zap.Error(err))
		return false
	}

	ssa.logger.Info("Summary API confirmed available")
	return true
}

// ListNodeNetworkStats returns network statistics for all nodes
// Returns empty slice if Summary API is not available
func (ssa *SummaryStatsAdapter) ListNodeNetworkStats(ctx context.Context) ([]NetworkStats, error) {
	nodes, err := ssa.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		ssa.logger.Error("Failed to list nodes for network stats", zap.Error(err))
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}

	stats := make([]NetworkStats, 0, len(nodes.Items))
	timestamp := time.Now()

	for _, node := range nodes.Items {
		nodeName := node.Name
		summaryStats, err := ssa.getNodeSummaryStats(ctx, nodeName)
		if err != nil {
			ssa.logger.Warn("Failed to get summary stats for node",
				zap.String("node", nodeName),
				zap.Error(err))
			continue
		}

		var rxBytes, txBytes, rxPackets, txPackets uint64

		// Kubelet can return network stats aggregated at the node level or
		// as a list of interfaces. We prioritize the list of interfaces if present.
		if len(summaryStats.Node.Network.Interfaces) > 0 {
			// Sum byte and packet counts from all interfaces.
			for _, iface := range summaryStats.Node.Network.Interfaces {
				rxBytes += iface.RxBytes
				txBytes += iface.TxBytes
				rxPackets += iface.RxPackets
				txPackets += iface.TxPackets
			}
			// If packet counts were not found on interfaces (sum is 0),
			// check for a node-level aggregate. This handles cases where Kubelet
			// provides per-interface byte counts but only node-level packet counts.
			if rxPackets == 0 && summaryStats.Node.Network.RxPackets > 0 {
				ssa.logger.Debug("Falling back to node-level rxPackets", zap.String("node", nodeName))
				rxPackets = summaryStats.Node.Network.RxPackets
			}
			if txPackets == 0 && summaryStats.Node.Network.TxPackets > 0 {
				ssa.logger.Debug("Falling back to node-level txPackets", zap.String("node", nodeName))
				txPackets = summaryStats.Node.Network.TxPackets
			}
		} else {
			// Fallback to top-level stats if interfaces array is empty.
			rxBytes = summaryStats.Node.Network.RxBytes
			txBytes = summaryStats.Node.Network.TxBytes
			rxPackets = summaryStats.Node.Network.RxPackets
			txPackets = summaryStats.Node.Network.TxPackets
		}

		nodeStats := NetworkStats{
			NodeName:  nodeName,
			RxBytes:   rxBytes,
			TxBytes:   txBytes,
			RxPackets: rxPackets,
			TxPackets: txPackets,
			Timestamp: timestamp,
		}

		stats = append(stats, nodeStats)

		ssa.logger.Debug("Node network stats collected",
			zap.String("node", nodeName),
			zap.Uint64("rxBytes", nodeStats.RxBytes),
			zap.Uint64("rxPackets", nodeStats.RxPackets),
			zap.Uint64("txBytes", nodeStats.TxBytes),
			zap.Uint64("txPackets", nodeStats.TxPackets),
		)
	}

	ssa.logger.Debug("Collected network stats for nodes",
		zap.Int("nodeCount", len(stats)),
		zap.Int("totalNodes", len(nodes.Items)),
	)

	return stats, nil
}

// GetClusterNetworkStats returns aggregated network statistics for the entire cluster
func (ssa *SummaryStatsAdapter) GetClusterNetworkStats(ctx context.Context) (NetworkStats, error) {
	nodeStats, err := ssa.ListNodeNetworkStats(ctx)
	if err != nil {
		return NetworkStats{}, err
	}

	var totalRxBytes, totalTxBytes, totalRxPackets, totalTxPackets uint64
	timestamp := time.Now()

	for _, stats := range nodeStats {
		totalRxBytes += stats.RxBytes
		totalTxBytes += stats.TxBytes
		totalRxPackets += stats.RxPackets
		totalTxPackets += stats.TxPackets
	}

	clusterStats := NetworkStats{
		NodeName:  "cluster", // Special identifier for cluster-wide stats
		RxBytes:   totalRxBytes,
		TxBytes:   totalTxBytes,
		RxPackets: totalRxPackets,
		TxPackets: totalTxPackets,
		Timestamp: timestamp,
	}

	ssa.logger.Debug("Cluster network stats calculated",
		zap.Uint64("totalRxBytes", totalRxBytes),
		zap.Uint64("totalTxBytes", totalTxBytes),
		zap.Uint64("totalRxPackets", totalRxPackets),
		zap.Uint64("totalTxPackets", totalTxPackets),
	)

	return clusterStats, nil
}

// ListNodeFilesystemStats returns filesystem statistics for all nodes
// Returns empty slice if Summary API is not available
func (ssa *SummaryStatsAdapter) ListNodeFilesystemStats(ctx context.Context) ([]FilesystemStats, error) {
	nodes, err := ssa.kubeClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		ssa.logger.Error("Failed to list nodes for filesystem stats", zap.Error(err))
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}

	stats := make([]FilesystemStats, 0, len(nodes.Items))
	timestamp := time.Now()

	for _, node := range nodes.Items {
		nodeName := node.Name
		summaryStats, err := ssa.getNodeSummaryStats(ctx, nodeName)
		if err != nil {
			ssa.logger.Warn("Failed to get summary stats for node (filesystem)",
				zap.String("node", nodeName),
				zap.Error(err))
			continue
		}

		fsStats := FilesystemStats{
			NodeName:            nodeName,
			FsCapacityBytes:     summaryStats.Node.Fs.CapacityBytes,
			FsAvailableBytes:    summaryStats.Node.Fs.AvailableBytes,
			FsUsedBytes:         summaryStats.Node.Fs.UsedBytes,
			FsInodesTotal:       summaryStats.Node.Fs.Inodes,
			FsInodesFree:        summaryStats.Node.Fs.InodesFree,
			ImageFsCapacityBytes: summaryStats.Node.Runtime.ImageFs.CapacityBytes,
			ImageFsAvailableBytes: summaryStats.Node.Runtime.ImageFs.AvailableBytes,
			ImageFsUsedBytes:    summaryStats.Node.Runtime.ImageFs.UsedBytes,
			ImageFsInodesTotal:  summaryStats.Node.Runtime.ImageFs.Inodes,
			ImageFsInodesFree:   summaryStats.Node.Runtime.ImageFs.InodesFree,
			Timestamp:           timestamp,
		}
		stats = append(stats, fsStats)
	}

	ssa.logger.Debug("Collected filesystem stats for nodes",
		zap.Int("nodeCount", len(stats)),
	)

	return stats, nil
}

// getNodeSummaryStats fetches summary statistics from a specific node's kubelet
func (ssa *SummaryStatsAdapter) getNodeSummaryStats(ctx context.Context, nodeName string) (*SummaryStatsResponse, error) {
	// Construct the URL for the node's summary stats endpoint
	url := fmt.Sprintf("%s/api/v1/nodes/%s/proxy/stats/summary", ssa.restConfig.Host, nodeName)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Use the rest config's transport for proper authentication
	// This handles both kubeconfig and in-cluster service account authentication
	transport := ssa.restConfig.Transport
	if transport == nil {
		// Fallback to creating transport from config
		transport, err = rest.TransportFor(ssa.restConfig)
		if err != nil {
			return nil, fmt.Errorf("failed to create transport: %w", err)
		}
	}

	// Create a temporary client with the proper transport
	tempClient := &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
	}

	resp, err := tempClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request to node %s: %w", nodeName, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Log more details about the error for debugging
		body, _ := io.ReadAll(resp.Body)
		ssa.logger.Debug("Summary API request failed",
			zap.String("node", nodeName),
			zap.Int("status", resp.StatusCode),
			zap.String("response", string(body)),
			zap.String("url", url))
		return nil, fmt.Errorf("node %s returned status %d", nodeName, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var summaryStats SummaryStatsResponse
	if err := json.Unmarshal(body, &summaryStats); err != nil {
		return nil, fmt.Errorf("failed to unmarshal summary stats: %w", err)
	}

	return &summaryStats, nil
}
