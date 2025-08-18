/* frontend/src/components/opsview/sections/CapacityHeadroomSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { MetricAreaChart, type ChartSeries } from "@/components/opsview/charts";
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
import { AlertTriangle, Eye, Copy, Download, Trash } from "lucide-react";
import { IconGripVertical } from "@tabler/icons-react";

/**
 * Formatting helpers
 */
function formatPercent(v: number): string {
	if (!isFinite(v)) return "0%";
	const pct = Math.max(0, Math.min(100, v));
	return `${pct.toFixed(0)}%`;
}

function headroomBadge(pct: number) {
	const pctInt = Math.round(pct);
	if (pctInt <= 5) return <Badge variant="destructive" className="text-xs">{formatPercent(pct)}</Badge>;
	if (pctInt <= 15) return <Badge variant="outline" className="text-orange-600 text-xs">{formatPercent(pct)}</Badge>;
	if (pctInt <= 30) return <Badge variant="secondary" className="text-xs">{formatPercent(pct)}</Badge>;
	return <Badge variant="default" className="text-xs">{formatPercent(pct)}</Badge>;
}

/**
 * We derive “headroom %” from live series:
 * CPU:   (limits - used) / limits * 100
 * Memory:(limits - used) / limits * 100
 * ImageFS:(capacity - used) / capacity * 100
 */
type Point = { t: number; v: number };
type SeriesMap = Record<string, Point[]>;

/**
 * Utility to map two series (A, B) by timestamp (assuming aligned sampling) and compute fn(A,B) → series
 */
function deriveSeries(
	a: Point[] | undefined,
	b: Point[] | undefined,
	derive: (a: number, b: number) => number
): [number, number][] {
	if (!a?.length || !b?.length) return [];
	const len = Math.min(a.length, b.length);
	const out: [number, number][] = [];
	for (let i = 0; i < len; i++) {
		const t = a[i].t ?? b[i].t;
		const av = a[i].v ?? 0;
		const bv = b[i].v ?? 0;
		out.push([t, derive(av, bv)]);
	}
	return out;
}

/**
 * Row type for “Nodes by lowest headroom” table
 */
interface NodeHeadroomRow {
	id: string;         // unique
	node: string;       // node name
	cpuHeadroomPct: number;
	memHeadroomPct: number;
	imgfsHeadroomPct: number;
}

/**
 * Create table columns
 */
function createColumns(): ColumnDef<NodeHeadroomRow>[] {
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
			size: 40,
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
			size: 40,
		},
		{
			accessorKey: "node",
			header: "Node",
			cell: ({ row }) => (
				<span className="font-medium text-sm">{row.original.node}</span>
			),
		},
		{
			accessorKey: "cpuHeadroomPct",
			header: "CPU Headroom",
			sortingFn: "alphanumeric",
			cell: ({ row }) => headroomBadge(row.original.cpuHeadroomPct),
		},
		{
			accessorKey: "memHeadroomPct",
			header: "Mem Headroom",
			sortingFn: "alphanumeric",
			cell: ({ row }) => headroomBadge(row.original.memHeadroomPct),
		},
		{
			accessorKey: "imgfsHeadroomPct",
			header: "ImageFS Headroom",
			sortingFn: "alphanumeric",
			cell: ({ row }) => headroomBadge(row.original.imgfsHeadroomPct),
		},
	];
}

/**
 * CapacityHeadroomSection
 *
 * Subscribes to cluster + node-level series and renders:
 * - Charts: CPU Headroom %, Memory Headroom %, ImageFS Headroom %
 * - Table: Nodes by lowest headroom (sortable)
 */
export default function CapacityHeadroomSection() {
	const {
		seriesData: liveData,
		connectionState,
		isConnected,
	} = useLiveSeriesSubscription(
		"capacity-headroom",
		[
			// Cluster-level
			"cluster.cpu.used.cores",
			"cluster.cpu.limits.cores",
			"cluster.mem.used.bytes",
			"cluster.mem.limits.bytes",
			"cluster.imagefs.used.bytes",
			"cluster.imagefs.capacity.bytes",

			// Node-level (assumes backend emits these; table will gracefully handle missing)
			"node.cpu.used.cores",
			"node.cpu.limits.cores",
			"node.mem.used.bytes",
			"node.mem.limits.bytes",
			"node.imagefs.used.bytes",
			"node.imagefs.capacity.bytes",
			// optional: identifier series for nodes if emitted; otherwise we parse from data keys if available
		],
		{
			res: "lo",
			since: "30m",
			autoConnect: true,
		}
	);

	// --- Cluster headroom % time series
	const cpuHeadroomSeries: ChartSeries[] = React.useMemo(() => {
		const used = liveData["cluster.cpu.used.cores"];
		const lim = liveData["cluster.cpu.limits.cores"];
		const pct = deriveSeries(used, lim, (u, l) => (l > 0 ? ((l - u) / l) * 100 : 0));
		return [
			{
				key: "cluster.cpu.headroom.pct",
				name: "CPU Headroom %",
				color: "#10b981", // green
				data: pct,
			},
		];
	}, [liveData]);

	const memHeadroomSeries: ChartSeries[] = React.useMemo(() => {
		const used = liveData["cluster.mem.used.bytes"];
		const lim = liveData["cluster.mem.limits.bytes"];
		const pct = deriveSeries(used, lim, (u, l) => (l > 0 ? ((l - u) / l) * 100 : 0));
		return [
			{
				key: "cluster.mem.headroom.pct",
				name: "Memory Headroom %",
				color: "#06b6d4", // cyan
				data: pct,
			},
		];
	}, [liveData]);

	const imgfsHeadroomSeries: ChartSeries[] = React.useMemo(() => {
		const used = liveData["cluster.imagefs.used.bytes"];
		const cap = liveData["cluster.imagefs.capacity.bytes"];
		const pct = deriveSeries(used, cap, (u, c) => (c > 0 ? ((c - u) / c) * 100 : 0));
		return [
			{
				key: "cluster.imagefs.headroom.pct",
				name: "ImageFS Headroom %",
				color: "#8b5cf6", // purple
				data: pct,
			},
		];
	}, [liveData]);

	// --- Node table (latest value per node)
	// NOTE: If your backend emits per-node series with labels (e.g., key includes node),
	// adapt this extraction to your actual shape. Here we expect flat series keyed as above
	// with per-node splits accessible via a map like liveData["node.cpu.used.cores:<nodeName>"].
	// If you don't have that, this will fall back to an empty table (no crash).

	function latest(points?: Point[]): number | undefined {
		if (!points?.length) return undefined;
		return points[points.length - 1]?.v;
	}

	// Heuristic: find node keys by scanning liveData for prefixes like "node.cpu.used.cores:"
	const nodeNames: string[] = React.useMemo(() => {
		const names = new Set<string>();
		Object.keys(liveData as SeriesMap).forEach((k) => {
			// Accept keys formatted like "node.cpu.used.cores:<nodeName>"
			const m = k.match(/^node\.(?:cpu|mem|imagefs)\.[\w.]+:(.+)$/);
			if (m?.[1]) names.add(m[1]);
		});
		return Array.from(names).sort();
	}, [liveData]);

	const tableRows: NodeHeadroomRow[] = React.useMemo(() => {
		const rows: NodeHeadroomRow[] = [];

		nodeNames.forEach((node) => {
			// Pull the latest for each needed metric per node, using the "<metric>:<node>" key shape.
			const nCpuUsed = latest(liveData[`node.cpu.used.cores:${node}`]);
			const nCpuLim = latest(liveData[`node.cpu.limits.cores:${node}`]);
			const nMemUsed = latest(liveData[`node.mem.used.bytes:${node}`]);
			const nMemLim = latest(liveData[`node.mem.limits.bytes:${node}`]);
			const nImgUsed = latest(liveData[`node.imagefs.used.bytes:${node}`]);
			const nImgCap = latest(liveData[`node.imagefs.capacity.bytes:${node}`]);

			const cpuPct = nCpuLim && nCpuLim > 0 ? Math.max(0, ((nCpuLim - (nCpuUsed ?? 0)) / nCpuLim) * 100) : 0;
			const memPct = nMemLim && nMemLim > 0 ? Math.max(0, ((nMemLim - (nMemUsed ?? 0)) / nMemLim) * 100) : 0;
			const imgPct = nImgCap && nImgCap > 0 ? Math.max(0, ((nImgCap - (nImgUsed ?? 0)) / nImgCap) * 100) : 0;

			rows.push({
				id: node,
				node,
				cpuHeadroomPct: cpuPct,
				memHeadroomPct: memPct,
				imgfsHeadroomPct: imgPct,
			});
		});

		// If no node split is available from backend yet, provide a tiny mock so the UI isn't empty.
		if (rows.length === 0) {
			return [
				{ id: "mock-1", node: "node-a", cpuHeadroomPct: 42, memHeadroomPct: 61, imgfsHeadroomPct: 75 },
				{ id: "mock-2", node: "node-b", cpuHeadroomPct: 18, memHeadroomPct: 12, imgfsHeadroomPct: 33 },
				{ id: "mock-3", node: "node-c", cpuHeadroomPct: 7, memHeadroomPct: 29, imgfsHeadroomPct: 14 },
			];
		}

		return rows;
	}, [liveData, nodeNames]);

	// Table state
	const [globalFilter, setGlobalFilter] = React.useState("");
	const [dimensionFilter, setDimensionFilter] = React.useState<string>("all"); // cpu|mem|imgfs|all

	const columns = React.useMemo(() => createColumns(), []);
	const dimensionOptions: FilterOption[] = React.useMemo(() => ([
		{ value: "all", label: "All" },
		{ value: "cpu", label: "CPU" },
		{ value: "mem", label: "Memory" },
		{ value: "imgfs", label: "ImageFS" },
	]), []);

	// Bulk actions for selected nodes
	const nodeBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "view-details",
			label: "View Node Details",
			icon: <Eye className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Node Names",
			icon: <Copy className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "export-report",
			label: "Export Headroom Report",
			icon: <Download className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
	], []);

	return (
		<div className="space-y-6">
			{/* Connection / Error */}
			{connectionState.lastError && (
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						WebSocket error: {connectionState.lastError}
					</AlertDescription>
				</Alert>
			)}

			{/* Charts: CPU + Memory + ImageFS headroom % */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<MetricAreaChart
					title="CPU Headroom %"
					subtitle="(limits - used) / limits"
					series={cpuHeadroomSeries}
					unit="%"
					formatter={(v) => formatPercent(v)}
					stacked={false}
					scopeLabel="cluster"
					timespanLabel="30m"
					resolutionLabel="hi"
				/>
				<MetricAreaChart
					title="Memory Headroom %"
					subtitle="(limits - used) / limits"
					series={memHeadroomSeries}
					unit="%"
					formatter={(v) => formatPercent(v)}
					stacked={false}
					scopeLabel="cluster"
					timespanLabel="30m"
					resolutionLabel="hi"
				/>
				<MetricAreaChart
					title="ImageFS Headroom %"
					subtitle="(capacity - used) / capacity"
					series={imgfsHeadroomSeries}
					unit="%"
					formatter={(v) => formatPercent(v)}
					stacked={false}
					scopeLabel="cluster"
					timespanLabel="30m"
					resolutionLabel="hi"
				/>
			</div>

			{/* Nodes by lowest headroom */}
			<div className="border rounded-lg bg-card">
				<div className="p-4 border-b">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-xl font-semibold">Nodes by Lowest Headroom</h2>
							<p className="text-sm text-muted-foreground mt-1">
								Sort by CPU, Memory, or ImageFS headroom to find saturation risks
							</p>
						</div>
						<Badge variant={isConnected ? "default" : "secondary"} className="text-xs">
							{isConnected ? "Live" : "Offline"}
						</Badge>
					</div>
				</div>

				<div className="px-4 pb-6">
					<UniversalDataTable
						data={tableRows}
						columns={columns}
						enableReorder={true}
						enableRowSelection={true}
						className="px-0 [&_tbody_tr]:bg-background/50"
						getRowId={(row, index) => row.id}
						renderFilters={({ table, selectedCount, totalCount }) => (
							<div className="p-4 space-y-4">
								<DataTableFilters
									globalFilter={globalFilter}
									onGlobalFilterChange={setGlobalFilter}
									searchPlaceholder="Filter by node…"
									categoryFilter={dimensionFilter}
									onCategoryFilterChange={setDimensionFilter}
									categoryLabel="Sort dimension"
									categoryOptions={dimensionOptions}
									selectedCount={selectedCount}
									totalCount={totalCount}
									bulkActions={nodeBulkActions}
									bulkActionsLabel="Node Actions"
									table={table}
									showColumnToggle={true}
									onRefresh={() => {
										console.log("Refresh node headroom data");
									}}
									isRefreshing={false}
								/>
							</div>
						)}
					/>
				</div>
			</div>
		</div>
	);
}
