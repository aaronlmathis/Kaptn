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
	RxBytes   uint64    `json:"rxBytes"`
	TxBytes   uint64    `json:"txBytes"`
	Timestamp time.Time `json:"timestamp"`
}

// SummaryStatsResponse represents the kubelet summary stats response
type SummaryStatsResponse struct {
	Node struct {
		Network struct {
			RxBytes uint64 `json:"rxBytes"`
			TxBytes uint64 `json:"txBytes"`
		} `json:"network"`
	} `json:"node"`
}

// SummaryStatsAdapter provides Kubelet Summary API integration for network statistics
type SummaryStatsAdapter struct {
	logger     *zap.Logger
	kubeClient kubernetes.Interface
	restConfig *rest.Config
	httpClient *http.Client
}

// NewSummaryStatsAdapter creates a new summary stats adapter
func NewSummaryStatsAdapter(logger *zap.Logger, kubeClient kubernetes.Interface, restConfig *rest.Config) *SummaryStatsAdapter {
	// Create HTTP client with the same transport as the rest config
	httpClient := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Use the same transport as kubernetes client for authentication
	if restConfig.Transport != nil {
		httpClient.Transport = restConfig.Transport
	}

	return &SummaryStatsAdapter{
		logger:     logger,
		kubeClient: kubeClient,
		restConfig: restConfig,
		httpClient: httpClient,
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

		nodeStats := NetworkStats{
			NodeName:  nodeName,
			RxBytes:   summaryStats.Node.Network.RxBytes,
			TxBytes:   summaryStats.Node.Network.TxBytes,
			Timestamp: timestamp,
		}

		stats = append(stats, nodeStats)

		ssa.logger.Debug("Node network stats collected",
			zap.String("node", nodeName),
			zap.Uint64("rxBytes", nodeStats.RxBytes),
			zap.Uint64("txBytes", nodeStats.TxBytes),
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

	var totalRxBytes, totalTxBytes uint64
	timestamp := time.Now()

	for _, stats := range nodeStats {
		totalRxBytes += stats.RxBytes
		totalTxBytes += stats.TxBytes
	}

	clusterStats := NetworkStats{
		NodeName:  "cluster", // Special identifier for cluster-wide stats
		RxBytes:   totalRxBytes,
		TxBytes:   totalTxBytes,
		Timestamp: timestamp,
	}

	ssa.logger.Debug("Cluster network stats calculated",
		zap.Uint64("totalRxBytes", totalRxBytes),
		zap.Uint64("totalTxBytes", totalTxBytes),
	)

	return clusterStats, nil
}

// getNodeSummaryStats fetches summary statistics from a specific node's kubelet
func (ssa *SummaryStatsAdapter) getNodeSummaryStats(ctx context.Context, nodeName string) (*SummaryStatsResponse, error) {
	// Construct the URL for the node's summary stats endpoint
	url := fmt.Sprintf("%s/api/v1/nodes/%s/proxy/stats/summary", ssa.restConfig.Host, nodeName)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set authentication headers if available
	if ssa.restConfig.BearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+ssa.restConfig.BearerToken)
	}

	resp, err := ssa.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to make request to node %s: %w", nodeName, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
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
