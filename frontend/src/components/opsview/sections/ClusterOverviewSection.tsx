/* frontend/src/components/opsview/sections/ClusterOverviewSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { MetricLineChart, type ChartSeries } from "@/components/opsview/charts";
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter";
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
	Eye,
	Copy,
	Download,
	Trash,
} from "lucide-react";
import {
	IconGripVertical,
	IconCpu,
	IconDatabase,
	IconNetwork,
	IconTopologyStar3,
	IconAlertTriangle,
} from "@tabler/icons-react";

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
	switch (reason) {
		case "InsufficientMemory":
		case "InsufficientCPU":
			return (
				<Badge variant="outline" className="text-red-500 border-red-500/60 text-xs">
					<IconCpu className="size-3 mr-1" />
					{reason}
				</Badge>
			);
		case "NodeAffinity":
		case "PodAntiAffinity":
			return (
				<Badge variant="outline" className="text-purple-600 border-purple-600/50 text-xs">
					<IconTopologyStar3 className="size-3 mr-1" />
					{reason}
				</Badge>
			);
		case "Taint":
			return (
				<Badge variant="outline" className="text-blue-600 border-blue-600/50 text-xs">
					<IconAlertTriangle className="size-3 mr-1" />
					{reason}
				</Badge>
			);
		case "UnboundPVC":
		case "VolumeNodeAffinityConflict":
			return (
				<Badge variant="outline" className="text-yellow-600 border-yellow-600/50 text-xs">
					<IconDatabase className="size-3 mr-1" />
					{reason}
				</Badge>
			);
		case "PortConflict":
			return (
				<Badge variant="outline" className="text-indigo-600 border-indigo-600/50 text-xs">
					<IconNetwork className="size-3 mr-1" />
					{reason}
				</Badge>
			);
		default:
			return (
				<Badge variant="outline" className="text-xs">
					<IconAlertTriangle className="size-3 mr-1" />
					{reason || "Unschedulable"}
				</Badge>
			);
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

/* ---------- Unschedulable Pods Section (LIVE) ---------- */

function UnschedulablePodsSection() {
	const [pods, setPods] = React.useState<UnschedulablePod[]>([]);
	const [loading, setLoading] = React.useState<boolean>(false);
	const [error, setError] = React.useState<string | null>(null);

	const [globalFilter, setGlobalFilter] = React.useState("");
	const [reasonFilter, setReasonFilter] = React.useState<string>("all");

	const handleViewDetails = React.useCallback((pod: UnschedulablePod) => {
		// TODO: Implement pod detail view (drawer/modal)
		// console.log('View details for pod:', pod.name);
	}, []);

	const columns = React.useMemo(
		() => createUnschedulablePodsColumns(handleViewDetails),
		[handleViewDetails]
	);

	const mapEntityToRow = (e: any): UnschedulablePod => ({
		id: e.id ?? `${e.namespace}/${e.name}`,
		name: e.name,
		namespace: e.namespace,
		reason: e.unschedulableReason || "Other",
		message: e.unschedulableMessage || "",
		age: e.age ?? e.creationTimestamp ?? "",
		requestedCpu: typeof e?.requests?.cpu === "number" ? formatCores(e.requests.cpu) : undefined,
		requestedMemory: typeof e?.requests?.memory === "number" ? formatBytesIEC(e.requests.memory) : undefined,
		nodeName: e.node || undefined,
	});

	const fetchUnschedulable = React.useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			// Prefer server-side filter if implemented
			const res = await fetch("/api/v1/timeseries/entities/pods?unschedulable=1", { credentials: "include" });
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			const json = await res.json();
			const entities = Array.isArray(json?.entities) ? json.entities : [];

			// Fallback to client filtering if server didn’t filter
			const onlyUnsched = entities.filter((e: any) => e?.unschedulable === true);

			setPods(onlyUnsched.map(mapEntityToRow));
		} catch (err: any) {
			// Fallback path: try without param, then client-filter
			try {
				const res2 = await fetch("/api/v1/timeseries/entities/pods", { credentials: "include" });
				if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
				const json2 = await res2.json();
				const entities2 = Array.isArray(json2?.entities) ? json2.entities : [];
				const onlyUnsched2 = entities2.filter((e: any) => e?.unschedulable === true);
				setPods(onlyUnsched2.map(mapEntityToRow));
			} catch (err2: any) {
				setError(err2?.message ?? "Failed to load pods");
			}
		} finally {
			setLoading(false);
		}
	}, []);

	React.useEffect(() => {
		let active = true;
		(async () => {
			await fetchUnschedulable();
		})();
		return () => {
			active = false;
		};
	}, [fetchUnschedulable]);

	// Optional: light polling (comment out if not desired)
	// React.useEffect(() => {
	//   const id = setInterval(fetchUnschedulable, 15000);
	//   return () => clearInterval(id);
	// }, [fetchUnschedulable]);

	// Build reason filter options from live data
	const reasonOptions: FilterOption[] = React.useMemo(() => {
		const reasons = new Set<string>();
		for (const p of pods) {
			if (p.reason) reasons.add(p.reason);
		}
		return Array.from(reasons)
			.sort((a, b) => a.localeCompare(b))
			.map((reason) => ({
				value: reason,
				label: reason,
				badge: getReasonBadge(reason),
			}));
	}, [pods]);

	// Apply client-side filters (reason + text search)
	const filteredPods = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase();
		const byReason =
			reasonFilter === "all" ? pods : pods.filter((p) => p.reason === reasonFilter);

		if (!q) return byReason;

		return byReason.filter((p) => {
			return (
				p.name.toLowerCase().includes(q) ||
				p.namespace.toLowerCase().includes(q) ||
				p.reason.toLowerCase().includes(q) ||
				p.message.toLowerCase().includes(q)
			);
		});
	}, [pods, reasonFilter, globalFilter]);

	const podBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "view-details",
			label: "View Details",
			icon: <Eye className="size-4" />,
			action: () => {
				// handled by the table selection consumer in your app
				// console.log('Bulk: view details');
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Pod Names",
			icon: <Copy className="size-4" />,
			action: () => {
				// console.log('Bulk: copy names');
			},
			requiresSelection: true,
		},
		{
			id: "export-yaml",
			label: "Export as YAML",
			icon: <Download className="size-4" />,
			action: () => {
				// console.log('Bulk: export yaml');
			},
			requiresSelection: true,
		},
		{
			id: "delete-pods",
			label: "Delete Selected Pods",
			icon: <Trash className="size-4" />,
			action: () => {
				// console.log('Bulk: delete');
			},
			variant: "destructive" as const,
			requiresSelection: true,
		},
	], []);

	return (
		<div className="border rounded-lg bg-card">
			<div className="p-4 border-b">
				<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className="text-xl font-semibold">Unschedulable Pods</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Pods that cannot be scheduled on any node
						</p>
					</div>
					<Badge variant="outline" className={`text-xs ${pods.length > 0 ? "text-red-500 border-red-500/60" : ""}`}>
						{pods.length} unschedulable
					</Badge>
				</div>
			</div>

			<div className="px-4 pb-6">
				{error && (
					<Alert variant="destructive" className="mb-3">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>{String(error)}</AlertDescription>
					</Alert>
				)}

				<UniversalDataTable
					data={filteredPods}
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
			'cluster.cpu.allocatable.cores',
			'cluster.mem.used.bytes',
			'cluster.mem.requested.bytes',

			'cluster.mem.allocatable.bytes',
			'cluster.mem.capacity.bytes',
		],
		{
			res: 'lo',
			since: '15m',
			autoConnect: true,
		}
	);

	// Be sure you're subscribing to 'cluster.cpu.allocatable.cores'
	const cpuSeries: ChartSeries[] = [
		{
			key: 'cluster.cpu.used.cores',
			name: 'Used',
			color: '#2563eb', // blue
			data: (liveData['cluster.cpu.used.cores'] || []).map(p => [p.t, p.v]),
		},
		{
			key: 'cluster.cpu.allocatable.cores',
			name: 'Allocatable',
			color: '#16a34a', // green
			data: (liveData['cluster.cpu.allocatable.cores'] || []).map(p => [p.t, p.v]),
		},
		{
			key: 'cluster.cpu.requested.cores',
			name: 'Requested',
			color: '#f59e0b', // orange
			data: (liveData['cluster.cpu.requested.cores'] || []).map(p => [p.t, p.v]),
		},
	];

	const memorySeries: ChartSeries[] = [
		{
			key: 'cluster.mem.used.bytes',
			name: 'Used',
			color: '#06b6d4',
			data: (liveData['cluster.mem.used.bytes'] || []).map(p => [p.t, p.v]),
		},
		{
			key: 'cluster.mem.allocatable.bytes',
			name: 'Allocatable',
			color: '#10b981',
			data: (liveData['cluster.mem.allocatable.bytes'] || []).map(p => [p.t, p.v]),
		},
		{
			key: 'cluster.mem.requested.bytes',
			name: 'Requested',
			color: '#8b5cf6',
			data: (liveData['cluster.mem.requested.bytes'] || []).map(p => [p.t, p.v]),
		},

		{
			key: 'cluster.mem.capacity.bytes',
			name: 'Capacity',
			color: '#22c55e', // lighter/darker than Allocatable
			data: (liveData['cluster.mem.capacity.bytes'] || []).map(p => [p.t, p.v]),
		},
	];

	const getLatestValue = (key: string): number => {
		const data = liveData[key];
		return data && data.length > 0 ? data[data.length - 1].v : 0;
	};

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

	const latest = (arr?: Array<{ t: number; v: number }>) =>
		(arr?.length ? arr[arr.length - 1]?.v || 0 : 0);

	const toneForPct = (p: number): "ok" | "warn" | "crit" => {
		if (p >= 0.9) return "crit";
		if (p >= 0.75) return "warn";
		return "ok";
	};

	// --- CPU footer data ---
	const cpuUsed = latest(liveData['cluster.cpu.used.cores']);
	const cpuAlloc = Math.max(1e-9, latest(liveData['cluster.cpu.allocatable.cores'])); // avoid /0
	const cpuReq = latest(liveData['cluster.cpu.requested.cores']);

	const cpuUsedRatio = cpuUsed / cpuAlloc;
	const cpuReqRatio = cpuReq / cpuAlloc;
	const cpuReqDisplay = cpuReqRatio > 5 ? `${cpuReqRatio.toFixed(1)}x` : `${(cpuReqRatio * 100).toFixed(0)}%`;

	const cpuTone = toneForPct(cpuUsedRatio);
	const cpuSummary =
		`CPU ${(cpuUsedRatio * 100).toFixed(0)}% utilized (${cpuUsed.toFixed(1)} / ${cpuAlloc.toFixed(1)} cores).` +
		(cpuReq > cpuAlloc ? ` Requests exceed allocatable (${cpuReq.toFixed(1)} > ${cpuAlloc.toFixed(1)}).` : '');

	const cpuFooter = (
		<SectionHealthFooter
			tone={cpuTone}
			summary={cpuSummary}
			usedPct={cpuUsedRatio}
			ratioPills={[
				{ label: "Requested/Alloc", value: cpuReqDisplay, tone: cpuReqRatio > 1 ? "warn" : "info", title: "Commitment posture" },
				{ label: "Used/Requested", value: cpuReq > 0 ? `${((cpuUsed / cpuReq) * 100).toFixed(0)}%` : "—", title: "Headroom vs requested" },
			]}
		/>
	);

	// --- Memory footer data ---
	const memUsed = latest(liveData['cluster.mem.used.bytes']);
	const memAlloc = Math.max(1e-9, latest(liveData['cluster.mem.allocatable.bytes']));
	const memReq = latest(liveData['cluster.mem.requested.bytes']);

	const memUsedRatio = memUsed / memAlloc;
	const memReqRatio = memReq / memAlloc;
	const memReqDisplay = memReqRatio > 5 ? `${memReqRatio.toFixed(1)}x` : `${(memReqRatio * 100).toFixed(0)}%`;

	const memTone = toneForPct(memUsedRatio);
	const memSummary =
		`Memory ${(memUsedRatio * 100).toFixed(0)}% utilized (${formatBytesIEC(memUsed)} / ${formatBytesIEC(memAlloc)}).` +
		(memReq > memAlloc ? ` Requests exceed allocatable (${formatBytesIEC(memReq)} > ${formatBytesIEC(memAlloc)}).` : '');

	const memFooter = (
		<SectionHealthFooter
			tone={memTone}
			summary={memSummary}
			usedPct={memUsedRatio}
			ratioPills={[
				{ label: "Requested/Alloc", value: memReqDisplay, tone: memReqRatio > 1 ? "warn" : "info", title: "Commitment posture" },
				{ label: "Used/Requested", value: memReq > 0 ? `${((memUsed / memReq) * 100).toFixed(0)}%` : "—", title: "Headroom vs requested" },
			]}
		/>
	);
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
				<MetricLineChart
					title="CPU Usage vs Requests vs Limits"
					subtitle="Real-time cluster CPU utilization showing used cores against requested and limit allocations. Helps identify under-provisioning (usage near requests) and throttling risks (usage near limits)."
					series={cpuSeries}
					unit="cores"
					formatter={formatCores}
					scopeLabel="cluster"
					timespanLabel="15m"
					resolutionLabel="lo"
					footerExtra={cpuFooter}
				/>

				<MetricLineChart
					title="Memory Usage vs Requests vs Limits"
					subtitle="Real-time cluster memory utilization showing used memory against requested and limit allocations. Helps identify under-provisioning (usage near requests) and OOM risks (usage near limits)."
					series={memorySeries}
					unit="bytes"
					formatter={formatBytesIEC}
					scopeLabel="cluster"
					timespanLabel="15m"
					resolutionLabel="lo"
					footerExtra={memFooter}
				/>
			</div>

			<UnschedulablePodsSection />
		</div>
	);
}
