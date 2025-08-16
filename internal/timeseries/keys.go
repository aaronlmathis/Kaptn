package timeseries

// Series key constants for the cluster-level metrics
const (
	// Existing cluster CPU metrics
	ClusterCPUUsedCores     = "cluster.cpu.used.cores"
	ClusterCPUCapacityCores = "cluster.cpu.capacity.cores"

	// Cluster memory metrics
	ClusterMemUsedBytes = "cluster.mem.used.bytes"

	// Existing cluster network metrics
	ClusterNetRxBps = "cluster.net.rx.bps"
	ClusterNetTxBps = "cluster.net.tx.bps"

	// New: Node-level metrics (labels: node)
	NodeCPUUsageCores       = "node.cpu.usage.cores"
	NodeMemUsageBytes       = "node.mem.usage.bytes"
	NodeMemWorkingSetBytes  = "node.mem.working_set.bytes"
	NodeNetRxBps            = "node.net.rx.bps"
	NodeNetTxBps            = "node.net.tx.bps"
	NodeFsUsedBytes         = "node.fs.used.bytes"
	NodeFsUsedPercent       = "node.fs.used.percent"
	NodeImageFsUsedBytes    = "node.imagefs.used.bytes"
	NodeProcessCount        = "node.process.count"
	NodeCapacityCPUCores    = "node.capacity.cpu.cores"
	NodeCapacityMemBytes    = "node.capacity.mem.bytes"
	NodeAllocatableCPUCores = "node.allocatable.cpu.cores"
	NodeAllocatableMemBytes = "node.allocatable.mem.bytes"

	// New: Pod-level metrics (labels: namespace, pod, node)
	PodCPUUsageCores      = "pod.cpu.usage.cores"
	PodMemUsageBytes      = "pod.mem.usage.bytes"
	PodMemWorkingSetBytes = "pod.mem.working_set.bytes"
	PodNetRxBps           = "pod.net.rx.bps"
	PodNetTxBps           = "pod.net.tx.bps"
	PodEphemeralUsedBytes = "pod.ephemeral.used.bytes"

	// New: Container-level metrics (labels: namespace, pod, container, node)
	CtrCPUUsageCores      = "ctr.cpu.usage.cores"
	CtrMemWorkingSetBytes = "ctr.mem.working_set.bytes"
	CtrRootFsUsedBytes    = "ctr.rootfs.used.bytes"
	CtrLogsUsedBytes      = "ctr.logs.used.bytes"

	// New: Cluster/State gauges (labels: cluster="default")
	ClusterNodesCount          = "cluster.nodes.count"
	ClusterPodsRunning         = "cluster.pods.running"
	ClusterPodsPending         = "cluster.pods.pending"
	ClusterPodsFailed          = "cluster.pods.failed"
	ClusterPodsSucceeded       = "cluster.pods.succeeded"
	ClusterCPUAllocatableCores = "cluster.cpu.allocatable.cores"
	ClusterMemAllocatableBytes = "cluster.mem.allocatable.bytes"
	ClusterCPURequestedCores   = "cluster.cpu.requested.cores" // optional
	ClusterMemRequestedBytes   = "cluster.mem.requested.bytes" // optional
)

// AllSeriesKeys returns all available series keys
func AllSeriesKeys() []string {
	return []string{
		// Existing cluster metrics
		ClusterCPUUsedCores,
		ClusterCPUCapacityCores,
		ClusterMemUsedBytes,
		ClusterNetRxBps,
		ClusterNetTxBps,

		// Node metrics
		NodeCPUUsageCores,
		NodeMemUsageBytes,
		NodeMemWorkingSetBytes,
		NodeNetRxBps,
		NodeNetTxBps,
		NodeFsUsedBytes,
		NodeFsUsedPercent,
		NodeImageFsUsedBytes,
		NodeProcessCount,
		NodeCapacityCPUCores,
		NodeCapacityMemBytes,
		NodeAllocatableCPUCores,
		NodeAllocatableMemBytes,

		// Pod metrics
		PodCPUUsageCores,
		PodMemUsageBytes,
		PodMemWorkingSetBytes,
		PodNetRxBps,
		PodNetTxBps,
		PodEphemeralUsedBytes,

		// Container metrics
		CtrCPUUsageCores,
		CtrMemWorkingSetBytes,
		CtrRootFsUsedBytes,
		CtrLogsUsedBytes,

		// Cluster state gauges
		ClusterNodesCount,
		ClusterPodsRunning,
		ClusterPodsPending,
		ClusterPodsFailed,
		ClusterPodsSucceeded,
		ClusterCPUAllocatableCores,
		ClusterMemAllocatableBytes,
		ClusterCPURequestedCores,
		ClusterMemRequestedBytes,
	}
}
