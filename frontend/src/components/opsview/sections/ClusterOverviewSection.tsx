/* frontend/src/components/opsview/sections/ClusterOverviewSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { MetricAreaChart, type ChartSeries } from "@/components/opsview/charts";
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters";
import { Checkbox } from "@/components/ui/checkbox";
import {
	type ColumnDef,
} from "@/lib/table";
import { formatCores, formatBytesIEC } from "@/lib/metric-utils";
import {
	getPodStatusBadge,
	getPodPhaseBadge,
	getResourceIcon,
	getNodeReadinessBadge,
} from "@/lib/summary-card-utils";
import {
	AlertTriangle,
	Eye,
	Copy,
	Download,
	Trash,
} from "lucide-react";
import { IconGripVertical } from "@tabler/icons-react";

/* ---------- Types & helpers for Unschedulable Pods ---------- */

interface UnschedulablePod {
	id: string;
	name: string;
	namespace: string;
	reason: string;
	message: string;
	age: string;
	requestedCpu?: string;
	requestedMemory?: string;
	nodeName?: string;
}

function getReasonBadge(reason: string) {
	switch (reason.toLowerCase()) {
		case "insufficient cpu":
		case "insufficient memory":
			return <Badge variant="destructive" className="text-xs">{reason}</Badge>;
		case "nodeaffinity":
		case "node affinity":
			return <Badge variant="outline" className="text-orange-600 text-xs">{reason}</Badge>;
		case "no nodes available":
			return <Badge variant="destructive" className="text-xs">{reason}</Badge>;
		case "taints":
		case "taint":
			return <Badge variant="secondary" className="text-xs">{reason}</Badge>;
		default:
			return <Badge variant="outline" className="text-xs">{reason}</Badge>;
	}
}

function createUnschedulablePodsColumns(
	onViewDetails: (pod: UnschedulablePod) => void
): ColumnDef<UnschedulablePod>[] {
	return [
		{
			id: "drag",
			header: () => null,
			cell: ({ row }) => (
				<Button
					variant="ghost"
					size="icon"
					className="text-muted-foreground size-7 hover:bg-transparent cursor-grab"
				>
					<IconGripVertical className="text-muted-foreground size-3" />
					<span className="sr-only">Drag to reorder</span>
				</Button>
			),
			enableSorting: false,
			enableHiding: false,
		},
		{
			id: "select",
			header: ({ table }) => (
				<div className="flex items-center justify-center">
					<Checkbox
						checked={
							table.getIsAllPageRowsSelected() ||
							(table.getIsSomePageRowsSelected() ? "indeterminate" : false)
						}
						onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
						aria-label="Select all"
					/>
				</div>
			),
			cell: ({ row }) => (
				<div className="flex items-center justify-center">
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
						aria-label="Select row"
					/>
				</div>
			),
			enableSorting: false,
			enableHiding: false,
		},
		{
			accessorKey: "name",
			header: "Pod Name",
			cell: ({ row }) => (
				<button
					onClick={() => onViewDetails(row.original)}
					className="text-left hover:underline focus:underline focus:outline-none text-sm font-medium"
				>
					{row.original.name}
				</button>
			),
			enableHiding: false,
		},
		{
			accessorKey: "namespace",
			header: "Namespace",
			cell: ({ row }) => (
				<Badge variant="outline" className="text-muted-foreground text-xs px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: "reason",
			header: "Reason",
			cell: ({ row }) => getReasonBadge(row.original.reason),
		},
		{
			accessorKey: "message",
			header: "Message",
			cell: ({ row }) => (
				<div className="text-sm text-muted-foreground max-w-xs truncate" title={row.original.message}>
					{row.original.message}
				</div>
			),
		},
		{
			accessorKey: "age",
			header: "Age",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
	];
}

/* ---------- Unschedulable Pods Section ---------- */

function UnschedulablePodsSection() {
	const mockUnschedulablePods: UnschedulablePod[] = React.useMemo(() => [
		{
			id: "1",
			name: "webapp-deploy-5f7d8c9b4-x7k2m",
			namespace: "production",
			reason: "Insufficient CPU",
			message: "0/3 nodes are available: 3 Insufficient cpu.",
			age: "5m23s",
			requestedCpu: "2000m",
			requestedMemory: "4Gi",
		},
		{
			id: "2",
			name: "redis-cluster-2",
			namespace: "cache",
			reason: "NodeAffinity",
			message: "0/3 nodes are available: 3 node(s) didn't match Pod's node affinity/selector.",
			age: "12m45s",
			requestedCpu: "500m",
			requestedMemory: "2Gi",
		},
		{
			id: "3",
			name: "ml-training-gpu-pod",
			namespace: "ml-workloads",
			reason: "Insufficient Memory",
			message: "0/3 nodes are available: 3 Insufficient memory.",
			age: "1h2m",
			requestedCpu: "4000m",
			requestedMemory: "16Gi",
		},
	], []);

	const [globalFilter, setGlobalFilter] = React.useState("")
	const [reasonFilter, setReasonFilter] = React.useState<string>("all")

	const handleViewDetails = React.useCallback((pod: UnschedulablePod) => {
		// console.log('View details for pod:', pod.name);
		// TODO: Implement pod detail view
	}, []);

	const columns = React.useMemo(
		() => createUnschedulablePodsColumns(handleViewDetails),
		[handleViewDetails]
	);

	const reasonOptions: FilterOption[] = React.useMemo(() => {
		const reasons = new Set(mockUnschedulablePods.map(pod => pod.reason));
		return Array.from(reasons).sort().map(reason => ({
			value: reason,
			label: reason,
			badge: getReasonBadge(reason)
		}));
	}, [mockUnschedulablePods]);



	const podBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "view-details",
			label: "View Details",
			icon: <Eye className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Pod Names",
			icon: <Copy className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "export-yaml",
			label: "Export as YAML",
			icon: <Download className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "delete-pods",
			label: "Delete Selected Pods",
			icon: <Trash className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			variant: "destructive" as const,
			requiresSelection: true,
		},
	], []);

	return (
		<div className="border rounded-lg bg-card">
			<div className="p-4 border-b">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold">Unschedulable Pods</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Pods that cannot be scheduled on any node
						</p>
					</div>
					<Badge variant="destructive" className="text-xs">
						{mockUnschedulablePods.length} unschedulable
					</Badge>
				</div>
			</div>

			<div className="px-4 pb-6">
				<UniversalDataTable
					data={mockUnschedulablePods}
					columns={columns}
					enableReorder={true}
					enableRowSelection={true}
					className="px-0 [&_tbody_tr]:bg-background/50"
					renderFilters={({ table, selectedCount, totalCount }) => (
						<div className="p-4 space-y-4">
							<DataTableFilters
								globalFilter={globalFilter}
								onGlobalFilterChange={setGlobalFilter}
								searchPlaceholder="Search pods by name, namespace, reason, or message..."
								categoryFilter={reasonFilter}
								onCategoryFilterChange={setReasonFilter}
								categoryLabel="Filter by reason"
								categoryOptions={reasonOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={podBulkActions}
								bulkActionsLabel="Pod Actions"
								table={table}
								showColumnToggle={true}
								onRefresh={() => {
									console.log('Refresh unschedulable pods data');
								}}
								isRefreshing={false}
							/>
						</div>
					)}
				/>
			</div>
		</div>
	);
}

/* ---------- Cluster Overview (extracted) ---------- */

export default function ClusterOverviewSection() {
	const {
		seriesData: liveData,
		isConnected: wsConnected,
		connectionState,
	} = useLiveSeriesSubscription(
		'cluster-overview-cards',
		[
			'cluster.nodes.ready',
			'cluster.nodes.count',
			'cluster.pods.running',
			'cluster.pods.pending',
			'cluster.pods.unschedulable',
			'cluster.pods.restarts.1h',
			'cluster.pods.failed',
			'cluster.cpu.used.cores',
			'cluster.cpu.requested.cores',
			'cluster.cpu.limits.cores',
			'cluster.mem.used.bytes',
			'cluster.mem.requested.bytes',
			'cluster.mem.limits.bytes'
		],
		{
			res: 'lo',
			since: '15m',
			autoConnect: true,
		}
	);

	const cpuSeries: ChartSeries[] = [
		{
			key: 'cluster.cpu.used.cores',
			name: 'Used',
			color: '#3b82f6',
			data: (liveData['cluster.cpu.used.cores'] || []).map(point => [point.t, point.v])
		},
		{
			key: 'cluster.cpu.requested.cores',
			name: 'Requested',
			color: '#f59e0b',
			data: (liveData['cluster.cpu.requested.cores'] || []).map(point => [point.t, point.v])
		},
		{
			key: 'cluster.cpu.limits.cores',
			name: 'Limits',
			color: '#ef4444',
			data: (liveData['cluster.cpu.limits.cores'] || []).map(point => [point.t, point.v])
		}
	];

	const memorySeries: ChartSeries[] = [
		{
			key: 'cluster.mem.used.bytes',
			name: 'Used',
			color: '#06b6d4',
			data: (liveData['cluster.mem.used.bytes'] || []).map(point => [point.t, point.v])
		},
		{
			key: 'cluster.mem.requested.bytes',
			name: 'Requested',
			color: '#8b5cf6',
			data: (liveData['cluster.mem.requested.bytes'] || []).map(point => [point.t, point.v])
		},
		{
			key: 'cluster.mem.limits.bytes',
			name: 'Limits',
			color: '#ec4899',
			data: (liveData['cluster.mem.limits.bytes'] || []).map(point => [point.t, point.v])
		}
	];

	const getLatestValue = (key: string): number => {
		const data = liveData[key];
		return data && data.length > 0 ? data[data.length - 1].v : 0;
	};

	// React.useEffect(() => {
	// 	console.log('🔍 ClusterOverview: Received live data:', liveData);
	// 	console.log('🔍 ClusterOverview: Available keys:', Object.keys(liveData));
	// 	Object.entries(liveData).forEach(([key, data]) => {
	// 		console.log(`🔍 ${key}:`, data.length, 'points, latest:', data.length > 0 ? data[data.length - 1] : 'no data');
	// 	});
	// }, [liveData]);

	const nodesReady = Math.round(getLatestValue('cluster.nodes.ready'));
	const nodesTotal = Math.round(getLatestValue('cluster.nodes.count'));
	const podsRunning = Math.round(getLatestValue('cluster.pods.running'));
	const podsPending = Math.round(getLatestValue('cluster.pods.pending'));
	const podsUnschedulable = Math.round(getLatestValue('cluster.pods.unschedulable'));
	const podsFailed = Math.round(getLatestValue('cluster.pods.failed'));

	const summaryData: SummaryCard[] = React.useMemo(() => {
		return [
			{
				title: "Nodes Ready",
				value: nodesTotal > 0 ? `${nodesReady}/${nodesTotal}` : "0/0",
				subtitle: nodesTotal > 0 ? `${nodesReady} of ${nodesTotal} nodes ready` : "No nodes found",
				badge: getNodeReadinessBadge(nodesReady, nodesTotal),
				icon: getResourceIcon("nodes"),
				footer: nodesReady === nodesTotal && nodesTotal > 0 ?
					"All nodes operational" :
					nodesTotal > 0 ? `${nodesTotal - nodesReady} node(s) not ready` : "No cluster nodes detected"
			},
			{
				title: "Pods Running",
				value: podsRunning,
				subtitle: `${podsRunning} pods currently running`,
				badge: getPodStatusBadge(podsRunning, podsRunning + podsPending + podsFailed),
				icon: getResourceIcon("pods"),
				footer: podsRunning > 0 ? "Workloads active" : "No running workloads"
			},
			{
				title: "Pods Pending",
				value: podsPending,
				subtitle: `${podsPending} pods waiting to start`,
				badge: getPodPhaseBadge(podsPending, podsRunning + podsPending + podsFailed, "Pending"),
				footer: podsPending === 0 ? "No scheduling issues" : "Pods awaiting resources or scheduling"
			},
			{
				title: "Unschedulable Pods",
				value: podsUnschedulable,
				subtitle: `${podsUnschedulable} pods cannot be scheduled`,
				badge: getPodPhaseBadge(podsUnschedulable, podsRunning + podsPending + podsFailed, "Failed"),
				footer: podsUnschedulable === 0 ? "All pods can be scheduled" :
					podsUnschedulable < 5 ? "Few unschedulable pods - check resources" : "Many unschedulable pods - investigate capacity"
			},
		];
	}, [nodesReady, nodesTotal, podsRunning, podsPending, podsFailed, podsUnschedulable]);

	return (
		<div className="space-y-6">
			{connectionState.lastError && (
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						WebSocket error: {connectionState.lastError}
					</AlertDescription>
				</Alert>
			)}

			<div className="space-y-4">
				{wsConnected && (
					<div className="flex items-center justify-end">
						<div className="flex items-center gap-1.5 text-xs text-green-600">
							<div className="size-2 bg-green-500 rounded-full animate-pulse" />
							Live Data
						</div>
					</div>
				)}

				<SummaryCards
					cards={summaryData}
					columns={4}
					loading={false}
					error={connectionState.lastError}
					lastUpdated={null}
					noPadding={true}
				/>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<MetricAreaChart
					title="CPU Usage vs Requests vs Limits"
					subtitle="Real-time cluster CPU utilization showing used cores against requested and limit allocations. Helps identify under-provisioning (usage near requests) and throttling risks (usage near limits)."
					series={cpuSeries}
					unit="cores"
					formatter={formatCores}
					stacked={true}
					scopeLabel="cluster"
					timespanLabel="15m"
					resolutionLabel="hi"
				/>

				<MetricAreaChart
					title="Memory Usage vs Requests vs Limits"
					subtitle="Real-time cluster memory utilization showing used memory against requested and limit allocations. Helps identify under-provisioning (usage near requests) and OOM risks (usage near limits)."
					series={memorySeries}
					unit="bytes"
					formatter={formatBytesIEC}
					stacked={true}
					scopeLabel="cluster"
					timespanLabel="15m"
					resolutionLabel="hi"
				/>
			</div>

			<UnschedulablePodsSection />
		</div>
	);
}
