/* frontend/src/components/opsview/sections/ReliabilitySection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { MetricLineChart, MetricCategoricalBarChart, type ChartSeries } from "@/components/opsview/charts";
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters";
import { Checkbox } from "@/components/ui/checkbox";
import {
	getCoreRowModel,
	getFacetedRowModel,
	getFacetedUniqueValues,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
	type ColumnDef,
	type VisibilityState,
	type SortingState,
	type ColumnFiltersState,
} from "@/lib/table";
import { formatCores, formatBytesIEC, formatCount } from "@/lib/metric-utils";
import {
	getRestartRateBadge,
	getRestartCountBadge,
	getPodStatusBadge,
	getResourceIcon,
} from "@/lib/summary-card-utils";
import {
	AlertTriangle,
	Eye,
	Copy,
	Download,
	Trash,
	Activity,
} from "lucide-react";

/* ---------- Types & helpers for Unstable Pods ---------- */

interface UnstablePod {
	id: string;
	name: string;
	namespace: string;
	restartRate: number; // restarts per hour
	restartsTotal: number; // total restarts in time window
	cpuUsage: number; // CPU cores
	memoryUsage: number; // bytes
	memoryLimit?: number; // bytes
	memLimitPressure?: number; // ratio 0-1
	isCrashLoopSuspect: boolean;
	isOOMSuspect: boolean;
	age: string;
}

function getUnstablePodBadge(pod: UnstablePod) {
	if (pod.isCrashLoopSuspect) {
		return <Badge variant="destructive" className="text-xs">CrashLoop</Badge>;
	}
	if (pod.isOOMSuspect) {
		return <Badge variant="destructive" className="text-xs">OOM</Badge>;
	}
	if (pod.restartRate > 5) {
		return <Badge variant="destructive" className="text-xs">High Restarts</Badge>;
	}
	if (pod.restartRate > 1) {
		return <Badge variant="outline" className="text-orange-600 text-xs">Unstable</Badge>;
	}
	return <Badge variant="secondary" className="text-xs">Moderate</Badge>;
}

function createUnstablePodsColumns(
	onViewDetails: (pod: UnstablePod) => void
): ColumnDef<UnstablePod>[] {
	return [
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
			accessorKey: "restartRate",
			header: "Restart Rate",
			cell: ({ row }) => (
				<div className="text-sm font-mono">
					{row.original.restartRate.toFixed(1)}/h
				</div>
			),
		},
		{
			accessorKey: "restartsTotal",
			header: "Restarts (1h)",
			cell: ({ row }) => (
				<div className="text-sm font-mono">
					{row.original.restartsTotal}
				</div>
			),
		},
		{
			accessorKey: "cpuUsage",
			header: "CPU",
			cell: ({ row }) => (
				<div className="text-sm font-mono">
					{formatCores(row.original.cpuUsage)}
				</div>
			),
		},
		{
			accessorKey: "memoryUsage",
			header: "Memory",
			cell: ({ row }) => (
				<div className="text-sm font-mono">
					{formatBytesIEC(row.original.memoryUsage)}
				</div>
			),
		},
		{
			accessorKey: "memLimitPressure",
			header: "Mem Pressure",
			cell: ({ row }) => {
				const pressure = row.original.memLimitPressure;
				if (pressure === undefined) {
					return <span className="text-xs text-muted-foreground">N/A</span>;
				}
				const pct = (pressure * 100).toFixed(1);
				const variant = pressure > 0.9 ? "destructive" : pressure > 0.7 ? "outline" : "secondary";
				return (
					<Badge variant={variant} className="text-xs">
						{pct}%
					</Badge>
				);
			},
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => getUnstablePodBadge(row.original),
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

/* ---------- Unstable Pods Section ---------- */

function UnstablePodsSection() {
	// Mock data for demonstration - in real implementation this would come from WebSocket
	const mockUnstablePods: UnstablePod[] = React.useMemo(() => [
		{
			id: "1",
			name: "webapp-deploy-5f7d8c9b4-x7k2m",
			namespace: "production",
			restartRate: 8.5,
			restartsTotal: 34,
			cpuUsage: 0.05, // Very low CPU but high restarts = CrashLoop
			memoryUsage: 1024 * 1024 * 1024, // 1GB
			memoryLimit: 2 * 1024 * 1024 * 1024, // 2GB
			memLimitPressure: 0.5,
			isCrashLoopSuspect: true,
			isOOMSuspect: false,
			age: "2h15m",
		},
		{
			id: "2",
			name: "ml-training-gpu-pod",
			namespace: "ml-workloads",
			restartRate: 3.2,
			restartsTotal: 13,
			cpuUsage: 2.1,
			memoryUsage: 15 * 1024 * 1024 * 1024, // 15GB
			memoryLimit: 16 * 1024 * 1024 * 1024, // 16GB
			memLimitPressure: 0.94, // Very high memory pressure
			isCrashLoopSuspect: false,
			isOOMSuspect: true,
			age: "1h45m",
		},
		{
			id: "3",
			name: "redis-cluster-2",
			namespace: "cache",
			restartRate: 1.8,
			restartsTotal: 7,
			cpuUsage: 0.3,
			memoryUsage: 512 * 1024 * 1024, // 512MB
			memoryLimit: 1024 * 1024 * 1024, // 1GB
			memLimitPressure: 0.5,
			isCrashLoopSuspect: false,
			isOOMSuspect: false,
			age: "3h20m",
		},
		{
			id: "4",
			name: "api-server-df8b9",
			namespace: "backend",
			restartRate: 6.1,
			restartsTotal: 25,
			cpuUsage: 0.8,
			memoryUsage: 800 * 1024 * 1024, // 800MB
			age: "1h30m",
			isCrashLoopSuspect: false,
			isOOMSuspect: false,
		},
	], []);

	const [sorting, setSorting] = React.useState<SortingState>([
		{ id: "restartRate", desc: true } // Sort by restart rate by default
	]);
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
	const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = React.useState({});
	const [globalFilter, setGlobalFilter] = React.useState("");
	const [statusFilter, setStatusFilter] = React.useState<string>("all");

	const handleViewDetails = React.useCallback((pod: UnstablePod) => {
		console.log('View details for pod:', pod.name);
		// TODO: Implement pod detail view
	}, []);

	const columns = React.useMemo(
		() => createUnstablePodsColumns(handleViewDetails),
		[handleViewDetails]
	);

	const statusOptions: FilterOption[] = React.useMemo(() => [
		{ value: "crashloop", label: "CrashLoop", badge: <Badge variant="destructive" className="text-xs">CrashLoop</Badge> },
		{ value: "oom", label: "OOM Risk", badge: <Badge variant="destructive" className="text-xs">OOM</Badge> },
		{ value: "high-restarts", label: "High Restarts", badge: <Badge variant="outline" className="text-orange-600 text-xs">High</Badge> },
		{ value: "unstable", label: "Unstable", badge: <Badge variant="outline" className="text-xs">Unstable</Badge> },
	], []);

	const filteredData = React.useMemo(() => {
		let filtered = mockUnstablePods;

		if (statusFilter !== "all") {
			filtered = filtered.filter(pod => {
				switch (statusFilter) {
					case "crashloop":
						return pod.isCrashLoopSuspect;
					case "oom":
						return pod.isOOMSuspect;
					case "high-restarts":
						return pod.restartRate > 5;
					case "unstable":
						return pod.restartRate > 1 && pod.restartRate <= 5;
					default:
						return true;
				}
			});
		}

		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase();
			filtered = filtered.filter(pod =>
				pod.name.toLowerCase().includes(searchTerm) ||
				pod.namespace.toLowerCase().includes(searchTerm)
			);
		}

		return filtered;
	}, [mockUnstablePods, statusFilter, globalFilter]);

	const table = useReactTable({
		data: filteredData,
		columns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
		state: {
			sorting,
			columnFilters,
			columnVisibility,
			rowSelection,
		},
	});

	const podBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "view-details",
			label: "View Details",
			icon: <Eye className="size-4" />,
			action: () => {
				const selectedPods = table.getFilteredSelectedRowModel().rows.map(row => row.original);
				console.log('View details for pods:', selectedPods.map(p => p.name));
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Pod Names",
			icon: <Copy className="size-4" />,
			action: () => {
				const selectedPods = table.getFilteredSelectedRowModel().rows.map(row => row.original);
				const names = selectedPods.map(p => p.name).join('\n');
				navigator.clipboard.writeText(names);
				console.log('Copied pod names:', names);
			},
			requiresSelection: true,
		},
		{
			id: "export-yaml",
			label: "Export as YAML",
			icon: <Download className="size-4" />,
			action: () => {
				const selectedPods = table.getFilteredSelectedRowModel().rows.map(row => row.original);
				console.log('Export YAML for pods:', selectedPods.map(p => p.name));
			},
			requiresSelection: true,
		},
		{
			id: "delete-pods",
			label: "Delete Selected Pods",
			icon: <Trash className="size-4" />,
			action: () => {
				const selectedPods = table.getFilteredSelectedRowModel().rows.map(row => row.original);
				console.log('Delete pods:', selectedPods.map(p => `${p.name} in ${p.namespace}`));
			},
			variant: "destructive" as const,
			requiresSelection: true,
		},
	], [table]);

	return (
		<div className="border rounded-lg bg-card">
			<div className="p-4 border-b">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold">Top Unstable Pods (Last 1h)</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Pods with high restart rates, sorted by restart frequency
						</p>
					</div>
					<Badge variant="destructive" className="text-xs">
						{filteredData.length} unstable pods
					</Badge>
				</div>
			</div>

			<div className="p-4 space-y-4">
				<DataTableFilters
					globalFilter={globalFilter}
					onGlobalFilterChange={setGlobalFilter}
					searchPlaceholder="Search pods by name or namespace..."
					categoryFilter={statusFilter}
					onCategoryFilterChange={setStatusFilter}
					categoryLabel="Filter by status"
					categoryOptions={statusOptions}
					selectedCount={table.getFilteredSelectedRowModel().rows.length}
					totalCount={table.getFilteredRowModel().rows.length}
					bulkActions={podBulkActions}
					bulkActionsLabel="Pod Actions"
					table={table}
					showColumnToggle={true}
					onRefresh={() => {
						console.log('Refresh unstable pods data');
					}}
					isRefreshing={false}
				/>
			</div>

			<div className="px-4 pb-6">
				<UniversalDataTable
					data={filteredData}
					columns={columns}
					className="px-0 [&_tbody_tr]:bg-background/50"
				/>
			</div>
		</div>
	);
}

/* ---------- Main Reliability Section ---------- */

export default function ReliabilitySection() {
	const {
		seriesData: liveData,
		isConnected: wsConnected,
		connectionState,
	} = useLiveSeriesSubscription(
		'reliability-metrics',
		[
			'cluster.pods.restarts.1h',
			'cluster.pods.restarts.rate',
			'cluster.pods.failed',
			'cluster.pods.succeeded'
		],
		{
			res: 'lo',
			since: '60m', // 1 hour for restart analysis
			autoConnect: true,
		}
	);

	const getLatestValue = (key: string): number => {
		const data = liveData[key];
		return data && data.length > 0 ? data[data.length - 1].v : 0;
	};

	// Extract latest values from live data
	const restartsLastHour = Math.round(getLatestValue('cluster.pods.restarts.1h'));
	const restartRate = getLatestValue('cluster.pods.restarts.rate');
	const podsFailed = Math.round(getLatestValue('cluster.pods.failed'));
	const podsSucceeded = Math.round(getLatestValue('cluster.pods.succeeded'));

	// Mock namespace-based data for restart rate distribution
	const namespaceRestartData = React.useMemo(() => [
		{ name: "production", value: 8 },
		{ name: "staging", value: 3 },
		{ name: "ml-workloads", value: 12 },
		{ name: "backend", value: 5 },
		{ name: "cache", value: 2 },
		{ name: "monitoring", value: 1 },
	], []);

	React.useEffect(() => {
		console.log('🔧 Reliability: Received live data:', liveData);
		console.log('🔧 Reliability: Available keys:', Object.keys(liveData));
		Object.entries(liveData).forEach(([key, data]) => {
			console.log(`🔧 ${key}:`, data.length, 'points, latest:', data.length > 0 ? data[data.length - 1] : 'no data');
		});
	}, [liveData]);

	const summaryData: SummaryCard[] = React.useMemo(() => {
		return [
			{
				title: "Restarts (1h)",
				value: restartsLastHour,
				subtitle: `${restartsLastHour} pod restarts in the last hour`,
				badge: getRestartCountBadge(restartsLastHour),
				icon: getResourceIcon("pods"),
				footer: restartsLastHour === 0 ? "No restart activity" :
					restartsLastHour < 10 ? "Low restart activity" :
						restartsLastHour < 50 ? "Moderate restart activity" : "High restart activity - investigate"
			},
			{
				title: "Restart Rate",
				value: restartRate.toFixed(2),
				subtitle: `${restartRate.toFixed(2)} restarts per minute across cluster`,
				badge: getRestartRateBadge(restartRate * 60), // Convert to per hour for badge
				icon: <Activity className="h-4 w-4" />,
				footer: restartRate < 0.1 ? "Stable cluster" :
					restartRate < 0.5 ? "Some instability" : "High restart rate - check workloads"
			},
			{
				title: "Pods Failed",
				value: podsFailed,
				subtitle: `${podsFailed} failed pods`,
				badge: getPodStatusBadge(podsSucceeded, podsFailed + podsSucceeded),
				icon: getResourceIcon("pods"),
				footer: podsFailed === 0 ? "No failed pods" :
					podsFailed < 5 ? "Few failures" : "Many failed pods - investigate"
			},
			{
				title: "Success Rate",
				value: podsSucceeded + podsFailed > 0 ?
					`${((podsSucceeded / (podsSucceeded + podsFailed)) * 100).toFixed(1)}%` : "100%",
				subtitle: `${podsSucceeded} succeeded vs ${podsFailed} failed`,
				badge: getPodStatusBadge(podsSucceeded, podsSucceeded + podsFailed),
				footer: podsSucceeded + podsFailed === 0 ? "No completed pods" :
					(podsSucceeded / (podsSucceeded + podsFailed)) > 0.95 ? "High success rate" : "Review failed workloads"
			},
		];
	}, [restartsLastHour, restartRate, podsFailed, podsSucceeded]);

	// Prepare chart series
	const restartRateSeries: ChartSeries[] = [
		{
			key: 'cluster.pods.restarts.rate',
			name: 'Restart Rate',
			color: '#ef4444',
			data: (liveData['cluster.pods.restarts.rate'] || []).map(point => [point.t, point.v])
		}
	];

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
					title="Cluster Restart Rate"
					subtitle="Real-time cluster restart rate showing restarts per minute. Helps identify stability trends and periods of high restart activity across the cluster."
					series={restartRateSeries}
					unit="restarts/min"
					formatter={(value) => `${value.toFixed(2)} restarts/min`}
					scopeLabel="cluster"
					timespanLabel="60m"
					resolutionLabel="lo"
				/>

				<MetricCategoricalBarChart
					title="Pod Restart Distribution by Namespace"
					subtitle="Distribution of pod restart counts by namespace over the last hour. Helps identify which teams or applications are experiencing the most instability."
					data={namespaceRestartData}
					unit="restarts"
					formatter={formatCount}
					layout="horizontal"
					showLegend={true}
					scopeLabel="cluster"
					timespanLabel="60m"
					resolutionLabel="lo"
				/>
			</div>

			<UnstablePodsSection />
		</div>
	);
}
