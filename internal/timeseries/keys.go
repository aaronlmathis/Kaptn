package timeseries

// Series key constants for the cluster-level metrics
const (
	// CPU metrics
	ClusterCPUUsedCores     = "cluster.cpu.used.cores"
	ClusterCPUCapacityCores = "cluster.cpu.capacity.cores"

	// Network metrics
	ClusterNetRxBps = "cluster.net.rx.bps"
	ClusterNetTxBps = "cluster.net.tx.bps"
)

// AllSeriesKeys returns all available series keys
func AllSeriesKeys() []string {
	return []string{
		ClusterCPUUsedCores,
		ClusterCPUCapacityCores,
		ClusterNetRxBps,
		ClusterNetTxBps,
	}
}
