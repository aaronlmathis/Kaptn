import { useState, useEffect, useCallback } from 'react';
// import { useNamespace } from '@/contexts/namespace-context';
import type { SummaryCard } from '@/components/SummaryCards';

interface UseResourceSummaryResult {
	data: SummaryCard[];
	isLoading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

// Mock data generation for development
function generateMockSummaryData(resource: string): SummaryCard[] {
	const mockData: Record<string, SummaryCard[]> = {
		nodes: [
			{
				title: "Total Nodes",
				value: "3",
				subtitle: "All nodes operational",
				footer: "Cluster capacity ready"
			},
			{
				title: "Ready vs NotReady",
				value: "3/3",
				subtitle: "100% nodes ready",
				footer: "No maintenance needed"
			},
			{
				title: "CPU Allocatable vs Used",
				value: "65%",
				subtitle: "CPU capacity utilized",
				footer: "Resource allocation optimal"
			},
			{
				title: "Memory Allocatable vs Used",
				value: "45%",
				subtitle: "Memory capacity utilized",
				footer: "Memory allocation healthy"
			}
		],
		pods: [
			{
				title: "Total Pods",
				value: "142",
				subtitle: "Active workload instances",
				footer: "Across all namespaces"
			},
			{
				title: "Ready vs NotReady",
				value: "138/142",
				subtitle: "97% pods ready",
				footer: "4 pods pending startup"
			},
			{
				title: "Created Last 24h",
				value: "23",
				subtitle: "Recent pod deployments",
				footer: "Active development detected"
			},
			{
				title: "Avg. CPU / Memory",
				value: "245m/512Mi",
				subtitle: "Average resource usage",
				footer: "Per pod consumption"
			}
		],
		deployments: [
			{
				title: "Total Deployments",
				value: "28",
				subtitle: "Application deployments",
				footer: "Managed workloads"
			},
			{
				title: "Available vs Unavailable",
				value: "26/28",
				subtitle: "93% deployments ready",
				footer: "2 scaling in progress"
			},
			{
				title: "Updated Last 24h",
				value: "7",
				subtitle: "Recent deployment updates",
				footer: "Active development cycle"
			},
			{
				title: "Pods per Deployment",
				value: "3.2",
				subtitle: "Average replica count",
				footer: "Scaling configuration"
			}
		],
		replicasets: [
			{
				title: "Total ReplicaSets",
				value: "45",
				subtitle: "Replica management objects",
				footer: "Deployment backing resources"
			},
			{
				title: "Ready vs Desired",
				value: "89/92",
				subtitle: "97% replicas ready",
				footer: "3 replicas scaling"
			},
			{
				title: "Created Last 24h",
				value: "8",
				subtitle: "New replica sets",
				footer: "Recent deployment activity"
			},
			{
				title: "Pods per ReplicaSet",
				value: "2.1",
				subtitle: "Average pods managed",
				footer: "Resource distribution"
			}
		],
		statefulsets: [
			{
				title: "Total StatefulSets",
				value: "6",
				subtitle: "Stateful applications",
				footer: "Data persistence workloads"
			},
			{
				title: "Ready vs Current",
				value: "6/6",
				subtitle: "100% statefulsets ready",
				footer: "All instances healthy"
			},
			{
				title: "PVCs per StatefulSet",
				value: "2.3",
				subtitle: "Average storage claims",
				footer: "Persistent storage usage"
			},
			{
				title: "Headless Services",
				value: "6",
				subtitle: "StatefulSet services",
				footer: "Service discovery enabled"
			}
		],
		daemonsets: [
			{
				title: "Total DaemonSets",
				value: "8",
				subtitle: "Node-level services",
				footer: "System workloads"
			},
			{
				title: "Desired vs Current",
				value: "24/24",
				subtitle: "100% pods scheduled",
				footer: "All nodes covered"
			},
			{
				title: "Node Coverage",
				value: "100%",
				subtitle: "All nodes have pods",
				footer: "Complete cluster coverage"
			},
			{
				title: "Updated Last 24h",
				value: "2",
				subtitle: "Recent DaemonSet updates",
				footer: "System maintenance"
			}
		],
		jobs: [
			{
				title: "Total Jobs",
				value: "34",
				subtitle: "Batch job executions",
				footer: "Task processing workloads"
			},
			{
				title: "Successful vs Failed",
				value: "31/3",
				subtitle: "91% success rate",
				footer: "3 jobs failed"
			},
			{
				title: "Active Jobs",
				value: "5",
				subtitle: "Currently running",
				footer: "Processing tasks"
			},
			{
				title: "Avg. Duration",
				value: "4m 32s",
				subtitle: "Average completion time",
				footer: "Job performance metric"
			}
		],
		cronjobs: [
			{
				title: "Total CronJobs",
				value: "12",
				subtitle: "Scheduled job definitions",
				footer: "Automated task scheduling"
			},
			{
				title: "Next Schedule",
				value: "14m",
				subtitle: "Next job execution",
				footer: "Upcoming scheduled run"
			},
			{
				title: "Last Run Status",
				value: "10/2",
				subtitle: "Successful vs failed",
				footer: "Recent execution results"
			},
			{
				title: "Avg. Schedule Interval",
				value: "2h 15m",
				subtitle: "Average time between runs",
				footer: "Scheduling frequency"
			}
		],
		services: [
			{
				title: "Total Services",
				value: "47",
				subtitle: "Network service endpoints",
				footer: "Application connectivity"
			},
			{
				title: "Type Distribution",
				value: "32/12/3",
				subtitle: "ClusterIP/NodePort/LoadBalancer",
				footer: "Service type breakdown"
			},
			{
				title: "Avg. Endpoints per Service",
				value: "2.8",
				subtitle: "Average backend endpoints",
				footer: "Load distribution"
			},
			{
				title: "Orphaned Services",
				value: "3",
				subtitle: "Services with zero endpoints",
				footer: "Requires attention"
			}
		],
		endpoints: [
			{
				title: "Total Endpoints",
				value: "89",
				subtitle: "Service endpoint objects",
				footer: "Backend connectivity"
			},
			{
				title: "Healthy vs Unhealthy",
				value: "84/5",
				subtitle: "94% endpoints healthy",
				footer: "5 endpoints need attention"
			},
			{
				title: "Pods per Endpoint",
				value: "3.2",
				subtitle: "Average pods per endpoint",
				footer: "Load distribution"
			},
			{
				title: "Namespaces Used",
				value: "12",
				subtitle: "Namespaces with endpoints",
				footer: "Cross-namespace services"
			}
		],
		endpointslices: [
			{
				title: "Total EndpointSlices",
				value: "156",
				subtitle: "Endpoint slice objects",
				footer: "Scalable endpoint management"
			},
			{
				title: "Avg. Endpoints per Slice",
				value: "8.4",
				subtitle: "Average endpoints per slice",
				footer: "Efficient grouping"
			},
			{
				title: "Created Last 24h",
				value: "23",
				subtitle: "Recently created slices",
				footer: "Active endpoint changes"
			},
			{
				title: "Slices per Service",
				value: "3.3",
				subtitle: "Average slices per service",
				footer: "Service scaling indicator"
			}
		],
		ingresses: [
			{
				title: "Total Ingresses",
				value: "18",
				subtitle: "HTTP/HTTPS routing rules",
				footer: "External traffic management"
			},
			{
				title: "TLS Enabled",
				value: "14",
				subtitle: "Ingresses with TLS",
				footer: "78% have SSL/TLS"
			},
			{
				title: "Rules per Ingress",
				value: "2.8",
				subtitle: "Average routing rules",
				footer: "Traffic routing complexity"
			},
			{
				title: "Errors / Warnings",
				value: "2",
				subtitle: "Ingresses with issues",
				footer: "Configuration problems"
			}
		],
		ingressclasses: [
			{
				title: "Total Classes",
				value: "4",
				subtitle: "Available ingress classes",
				footer: "Controller diversity"
			},
			{
				title: "In Use",
				value: "18/3/0/0",
				subtitle: "Ingresses per class",
				footer: "Usage distribution"
			},
			{
				title: "Default Class",
				value: "nginx",
				subtitle: "Default ingress class",
				footer: "Primary controller"
			},
			{
				title: "Created Last 24h",
				value: "0",
				subtitle: "Recently added classes",
				footer: "Stable configuration"
			}
		],
		networkpolicies: [
			{
				title: "Total Policies",
				value: "23",
				subtitle: "Network security policies",
				footer: "Traffic control rules"
			},
			{
				title: "Namespaces Covered",
				value: "8",
				subtitle: "Namespaces with policies",
				footer: "Security coverage"
			},
			{
				title: "Pods Covered",
				value: "134",
				subtitle: "Pods selected by policies",
				footer: "Protected workloads"
			},
			{
				title: "Denied Connections",
				value: "24",
				subtitle: "Blocked network events",
				footer: "Security enforcement"
			}
		],
		loadbalancers: [
			{
				title: "Total LoadBalancers",
				value: "8",
				subtitle: "External load balancer services",
				footer: "Public traffic entry points"
			},
			{
				title: "External IPs",
				value: "6",
				subtitle: "Assigned external IPs",
				footer: "2 pending allocation"
			},
			{
				title: "Healthy vs Unhealthy",
				value: "7/1",
				subtitle: "87% load balancers healthy",
				footer: "1 requires attention"
			},
			{
				title: "Traffic Rate",
				value: "1.2k req/s",
				subtitle: "Average requests per second",
				footer: "Current load"
			}
		],
		configmaps: [
			{
				title: "Total ConfigMaps",
				value: "67",
				subtitle: "Configuration data objects",
				footer: "Application settings"
			},
			{
				title: "Namespaces Used",
				value: "15",
				subtitle: "Namespaces with ConfigMaps",
				footer: "Configuration distribution"
			},
			{
				title: "Updated Last 24h",
				value: "12",
				subtitle: "Recently modified configs",
				footer: "Configuration changes"
			},
			{
				title: "Avg. Size",
				value: "8.4 KB",
				subtitle: "Average configuration size",
				footer: "Data volume per ConfigMap"
			}
		],
		secrets: [
			{
				title: "Total Secrets",
				value: "89",
				subtitle: "Sensitive data objects",
				footer: "Credential management"
			},
			{
				title: "Type Distribution",
				value: "45/12/32",
				subtitle: "Opaque/TLS/Others",
				footer: "Secret type breakdown"
			},
			{
				title: "Used vs Unused",
				value: "76/13",
				subtitle: "Mounted vs orphaned",
				footer: "13 secrets unused"
			},
			{
				title: "Updated Last 24h",
				value: "8",
				subtitle: "Recently modified secrets",
				footer: "Credential updates"
			}
		],
		persistentvolumes: [
			{
				title: "Total PVs",
				value: "34",
				subtitle: "Persistent storage volumes",
				footer: "Cluster storage capacity"
			},
			{
				title: "Bound vs Unbound",
				value: "28/6",
				subtitle: "82% volumes bound",
				footer: "6 available for binding"
			},
			{
				title: "Capacity Usage",
				value: "2.4 TB / 4.1 TB",
				subtitle: "58% storage utilized",
				footer: "1.7 TB available"
			},
			{
				title: "Reclaim Policies",
				value: "18/12/4",
				subtitle: "Retain/Delete/Recycle",
				footer: "Data retention strategy"
			}
		],
		persistentvolumeclaims: [
			{
				title: "Total PVCs",
				value: "42",
				subtitle: "Storage claim requests",
				footer: "Application storage needs"
			},
			{
				title: "Bound vs Pending",
				value: "38/4",
				subtitle: "90% claims satisfied",
				footer: "4 pending binding"
			},
			{
				title: "Requested Capacity",
				value: "2.8 TB",
				subtitle: "Total storage requested",
				footer: "Application requirements"
			},
			{
				title: "Storage Class Dist.",
				value: "24/12/6",
				subtitle: "SSD/HDD/NFS distribution",
				footer: "Storage type preferences"
			}
		],
		storageclasses: [
			{
				title: "Total SCs",
				value: "6",
				subtitle: "Available storage classes",
				footer: "Storage type options"
			},
			{
				title: "Default SC",
				value: "gp2-ssd",
				subtitle: "Default storage class",
				footer: "Primary storage type"
			},
			{
				title: "Reclaim Policy Dist.",
				value: "4/2",
				subtitle: "Delete vs Retain",
				footer: "Data persistence strategy"
			},
			{
				title: "Binding Modes",
				value: "4/2",
				subtitle: "Immediate/WaitForFirstConsumer",
				footer: "Provisioning behavior"
			}
		],
		volumesnapshots: [
			{
				title: "Total Snapshots",
				value: "67",
				subtitle: "Volume backup snapshots",
				footer: "Data protection points"
			},
			{
				title: "Bound vs Pending",
				value: "63/4",
				subtitle: "94% snapshots ready",
				footer: "4 snapshots processing"
			},
			{
				title: "Failed Snapshots",
				value: "2",
				subtitle: "Snapshots with errors",
				footer: "Backup issues detected"
			},
			{
				title: "Classes Used",
				value: "3",
				subtitle: "Active snapshot classes",
				footer: "Backup type diversity"
			}
		],
		volumesnapshotclasses: [
			{
				title: "Total SnapshotClasses",
				value: "4",
				subtitle: "Snapshot configuration classes",
				footer: "Backup policy templates"
			},
			{
				title: "Driver Usage",
				value: "2/1/1",
				subtitle: "CSI driver distribution",
				footer: "Storage backend diversity"
			},
			{
				title: "Deletion Policy",
				value: "3/1",
				subtitle: "Delete vs Retain",
				footer: "Snapshot retention policy"
			},
			{
				title: "Default Class",
				value: "csi-snapclass",
				subtitle: "Default snapshot class",
				footer: "Primary backup method"
			}
		]
	};

	return mockData[resource] || [
		{ title: "Metric 1", value: "N/A", subtitle: "Not available", footer: "Data pending" },
		{ title: "Metric 2", value: "N/A", subtitle: "Not available", footer: "Data pending" },
		{ title: "Metric 3", value: "N/A", subtitle: "Not available", footer: "Data pending" },
		{ title: "Metric 4", value: "N/A", subtitle: "Not available", footer: "Data pending" }
	];
}

export function useResourceSummary(resource: string): UseResourceSummaryResult {
	const [data, setData] = useState<SummaryCard[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			// TODO: Replace with actual API call when backend is ready
			// const response = await fetch(`/api/v1/${resource}/summary?namespace=${selectedNamespace}`);
			// if (!response.ok) {
			//   throw new Error(`Failed to fetch ${resource} summary`);
			// }
			// const summaryData = await response.json();

			// Simulate API delay
			await new Promise(resolve => setTimeout(resolve, 500));

			// For now, use mock data
			const summaryData = generateMockSummaryData(resource);
			setData(summaryData);
		} catch (err) {
			setError(err instanceof Error ? err.message : `Failed to fetch ${resource} summary`);
			console.error(`Error fetching ${resource} summary:`, err);
		} finally {
			setIsLoading(false);
		}
	}, [resource]); // selectedNamespace is used inside but doesn't need to be a dependency for mock data

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, isLoading, error, refetch: fetchData };
}
