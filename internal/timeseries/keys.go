package timeseries

import "fmt"

// Series key constants for the cluster-level metrics
const (
	// Existing cluster CPU metrics
	ClusterCPUUsedCores     = "cluster.cpu.used.cores"
	ClusterCPUCapacityCores = "cluster.cpu.capacity.cores"

	// Cluster memory metrics
	ClusterMemUsedBytes     = "cluster.mem.used.bytes"
	ClusterMemCapacityBytes = "cluster.mem.capacity.bytes"

	// Existing cluster network metrics
	ClusterNetRxBps = "cluster.net.rx.bps"
	ClusterNetTxBps = "cluster.net.tx.bps"

	// Cluster state gauges (labels: cluster="default")
	ClusterNodesCount          = "cluster.nodes.count"
	ClusterPodsRunning         = "cluster.pods.running"
	ClusterPodsPending         = "cluster.pods.pending"
	ClusterPodsFailed          = "cluster.pods.failed"
	ClusterPodsSucceeded       = "cluster.pods.succeeded"
	ClusterCPUAllocatableCores = "cluster.cpu.allocatable.cores"
	ClusterMemAllocatableBytes = "cluster.mem.allocatable.bytes"
	ClusterCPURequestedCores   = "cluster.cpu.requested.cores" // optional
	ClusterMemRequestedBytes   = "cluster.mem.requested.bytes" // optional

	// New cluster-level aggregated metrics
	ClusterCPULimitsCores       = "cluster.cpu.limits.cores"
	ClusterMemLimitsBytes       = "cluster.mem.limits.bytes"
	ClusterPodsRestartsTotal    = "cluster.pods.restarts.total"
	ClusterPodsRestartsRate     = "cluster.pods.restarts.rate"
	ClusterNodesReady           = "cluster.nodes.ready"
	ClusterNodesNotReady        = "cluster.nodes.notready"
	ClusterPodsUnschedulable    = "cluster.pods.unschedulable"
	ClusterFsImageUsedBytes     = "cluster.fs.image.used.bytes"
	ClusterFsImageCapacityBytes = "cluster.fs.image.capacity.bytes"
)

// Node-level metric base keys (will be combined with node names)
const (
	NodeCPUUsageBase       = "node.cpu.usage.cores"
	NodeMemUsageBase       = "node.mem.usage.bytes"
	NodeMemWorkingSetBase  = "node.mem.working_set.bytes"
	NodeNetRxBase          = "node.net.rx.bps"
	NodeNetTxBase          = "node.net.tx.bps"
	NodeFsUsedBase         = "node.fs.used.bytes"
	NodeFsUsedPercentBase  = "node.fs.used.percent"
	NodeImageFsUsedBase    = "node.imagefs.used.bytes"
	NodeProcessCountBase   = "node.process.count"
	NodeCapacityCPUBase    = "node.capacity.cpu.cores"
	NodeCapacityMemBase    = "node.capacity.mem.bytes"
	NodeAllocatableCPUBase = "node.allocatable.cpu.cores"
	NodeAllocatableMemBase = "node.allocatable.mem.bytes"

	// New node-level metrics
	NodePodsCountBase           = "node.pods.count"
	NodeImageFsCapacityBase     = "node.imagefs.capacity.bytes"
	NodeImageFsUsedPercentBase  = "node.imagefs.used.percent"
	NodeFsInodesUsedPercentBase = "node.fs.inodes.used.percent"
	NodeNetRxPpsBase            = "node.net.rx.pps" // packets per second
	NodeNetTxPpsBase            = "node.net.tx.pps" // packets per second
)

// Pod-level metric base keys (will be combined with namespace and pod names)
const (
	PodCPUUsageBase      = "pod.cpu.usage.cores"
	PodMemUsageBase      = "pod.mem.usage.bytes"
	PodMemWorkingSetBase = "pod.mem.working_set.bytes"
	PodNetRxBase         = "pod.net.rx.bps"
	PodNetTxBase         = "pod.net.tx.bps"
	PodEphemeralUsedBase = "pod.ephemeral.used.bytes"

	// New pod-level metrics for requests/limits
	PodCPURequestBase       = "pod.cpu.request.cores"
	PodCPULimitBase         = "pod.cpu.limit.cores"
	PodMemRequestBase       = "pod.mem.request.bytes"
	PodMemLimitBase         = "pod.mem.limit.bytes"
	PodRestartsTotalBase    = "pod.restarts.total"
	PodRestartsRateBase     = "pod.restarts.rate"
	PodEphemeralPercentBase = "pod.ephemeral.used.percent"
)

// Namespace-level metric base keys (will be combined with namespace names)
const (
	NamespaceCPUUsedBase          = "ns.cpu.used.cores"
	NamespaceCPURequestBase       = "ns.cpu.request.cores"
	NamespaceCPULimitBase         = "ns.cpu.limit.cores"
	NamespaceMemUsedBase          = "ns.mem.used.bytes"
	NamespaceMemRequestBase       = "ns.mem.request.bytes"
	NamespaceMemLimitBase         = "ns.mem.limit.bytes"
	NamespacePodsRunningBase      = "ns.pods.running"
	NamespacePodsRestartsRateBase = "ns.pods.restarts.rate"
)

// Container-level metric base keys (will be combined with namespace, pod, and container names)
const (
	ContainerCPUUsageBase      = "ctr.cpu.usage.cores"
	ContainerMemWorkingSetBase = "ctr.mem.working_set.bytes"
	ContainerRootFsUsedBase    = "ctr.rootfs.used.bytes"
	ContainerLogsUsedBase      = "ctr.logs.used.bytes"
)

// Legacy constants for backward compatibility - DEPRECATED
// Deprecated since v1.2.0. These constants will be removed in v2.0.0.
// Please migrate to the corresponding *Base constants above.
const (
	NodeCPUUsageCores       = NodeCPUUsageBase
	NodeMemUsageBytes       = NodeMemUsageBase
	NodeMemWorkingSetBytes  = NodeMemWorkingSetBase
	NodeNetRxBps            = NodeNetRxBase
	NodeNetTxBps            = NodeNetTxBase
	NodeFsUsedBytes         = NodeFsUsedBase
	NodeFsUsedPercent       = NodeFsUsedPercentBase
	NodeImageFsUsedBytes    = NodeImageFsUsedBase
	NodeProcessCount        = NodeProcessCountBase
	NodeCapacityCPUCores    = NodeCapacityCPUBase
	NodeCapacityMemBytes    = NodeCapacityMemBase
	NodeAllocatableCPUCores = NodeAllocatableCPUBase
	NodeAllocatableMemBytes = NodeAllocatableMemBase

	PodCPUUsageCores      = PodCPUUsageBase
	PodMemUsageBytes      = PodMemUsageBase
	PodMemWorkingSetBytes = PodMemWorkingSetBase
	PodNetRxBps           = PodNetRxBase
	PodNetTxBps           = PodNetTxBase
	PodEphemeralUsedBytes = PodEphemeralUsedBase

	CtrCPUUsageCores      = ContainerCPUUsageBase
	CtrMemWorkingSetBytes = ContainerMemWorkingSetBase
	CtrRootFsUsedBytes    = ContainerRootFsUsedBase
	CtrLogsUsedBytes      = ContainerLogsUsedBase
)

// GenerateNodeSeriesKey creates a node-specific series key
func GenerateNodeSeriesKey(metricBase, nodeName string) string {
	return fmt.Sprintf("%s.%s", metricBase, nodeName)
}

// GeneratePodSeriesKey creates a pod-specific series key
func GeneratePodSeriesKey(metricBase, namespace, podName string) string {
	return fmt.Sprintf("%s.%s.%s", metricBase, namespace, podName)
}

// GenerateContainerSeriesKey creates a container-specific series key
func GenerateContainerSeriesKey(metricBase, namespace, podName, containerName string) string {
	return fmt.Sprintf("%s.%s.%s.%s", metricBase, namespace, podName, containerName)
}

// GenerateNamespaceSeriesKey creates a namespace-specific series key
func GenerateNamespaceSeriesKey(metricBase, namespace string) string {
	return fmt.Sprintf("%s.%s", metricBase, namespace)
}

// ParseNodeSeriesKey extracts node name from a node series key
func ParseNodeSeriesKey(seriesKey string) (metricBase, nodeName string, ok bool) {
	// Find the last dot separator
	lastDot := -1
	for i := len(seriesKey) - 1; i >= 0; i-- {
		if seriesKey[i] == '.' {
			lastDot = i
			break
		}
	}

	if lastDot == -1 {
		return "", "", false
	}

	metricBase = seriesKey[:lastDot]
	nodeName = seriesKey[lastDot+1:]
	return metricBase, nodeName, true
}

// ParsePodSeriesKey extracts namespace and pod name from a pod series key
func ParsePodSeriesKey(seriesKey string) (metricBase, namespace, podName string, ok bool) {
	// Find the last two dot separators
	dots := make([]int, 0, 2)
	for i := len(seriesKey) - 1; i >= 0 && len(dots) < 2; i-- {
		if seriesKey[i] == '.' {
			dots = append(dots, i)
		}
	}

	if len(dots) < 2 {
		return "", "", "", false
	}

	metricBase = seriesKey[:dots[1]]
	namespace = seriesKey[dots[1]+1 : dots[0]]
	podName = seriesKey[dots[0]+1:]
	return metricBase, namespace, podName, true
}

// AllSeriesKeys returns all available series keys (cluster-level only)
func AllSeriesKeys() []string {
	return []string{
		// Cluster metrics
		ClusterCPUUsedCores,
		ClusterCPUCapacityCores,
		ClusterMemUsedBytes,
		ClusterMemCapacityBytes,
		ClusterNetRxBps,
		ClusterNetTxBps,
		ClusterNodesCount,
		ClusterPodsRunning,
		ClusterPodsPending,
		ClusterPodsFailed,
		ClusterPodsSucceeded,
		ClusterCPUAllocatableCores,
		ClusterMemAllocatableBytes,
		ClusterCPURequestedCores,
		ClusterMemRequestedBytes,
		// New cluster metrics
		ClusterCPULimitsCores,
		ClusterMemLimitsBytes,
		ClusterPodsRestartsTotal,
		ClusterPodsRestartsRate,
		ClusterNodesReady,
		ClusterNodesNotReady,
		ClusterPodsUnschedulable,
		ClusterFsImageUsedBytes,
		ClusterFsImageCapacityBytes,
	}
}

// GetNodeMetricBases returns all node-level metric base keys
func GetNodeMetricBases() []string {
	return []string{
		NodeCPUUsageBase,
		NodeMemUsageBase,
		NodeMemWorkingSetBase,
		NodeNetRxBase,
		NodeNetTxBase,
		NodeFsUsedBase,
		NodeFsUsedPercentBase,
		NodeImageFsUsedBase,
		NodeProcessCountBase,
		NodeCapacityCPUBase,
		NodeCapacityMemBase,
		NodeAllocatableCPUBase,
		NodeAllocatableMemBase,
		// New node metrics
		NodePodsCountBase,
		NodeImageFsCapacityBase,
		NodeImageFsUsedPercentBase,
		NodeFsInodesUsedPercentBase,
		NodeNetRxPpsBase,
		NodeNetTxPpsBase,
	}
}

// GetPodMetricBases returns all pod-level metric base keys
func GetPodMetricBases() []string {
	return []string{
		PodCPUUsageBase,
		PodMemUsageBase,
		PodMemWorkingSetBase,
		PodNetRxBase,
		PodNetTxBase,
		PodEphemeralUsedBase,
		// New pod metrics
		PodCPURequestBase,
		PodCPULimitBase,
		PodMemRequestBase,
		PodMemLimitBase,
		PodRestartsTotalBase,
		PodRestartsRateBase,
		PodEphemeralPercentBase,
	}
}

// GetContainerMetricBases returns all container-level metric base keys
func GetContainerMetricBases() []string {
	return []string{
		ContainerCPUUsageBase,
		ContainerMemWorkingSetBase,
		ContainerRootFsUsedBase,
		ContainerLogsUsedBase,
	}
}

// GetNamespaceMetricBases returns all namespace-level metric base keys
func GetNamespaceMetricBases() []string {
	return []string{
		NamespaceCPUUsedBase,
		NamespaceCPURequestBase,
		NamespaceCPULimitBase,
		NamespaceMemUsedBase,
		NamespaceMemRequestBase,
		NamespaceMemLimitBase,
		NamespacePodsRunningBase,
		NamespacePodsRestartsRateBase,
	}
}
