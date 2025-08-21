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
import { fetchEntities } from "@/lib/metrics-api";
import {
	type ColumnDef,
} from "@/lib/table";
import { AlertTriangle, Eye, Copy, Download } from "lucide-react";
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
			cell: () => (
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
	// Step 1: Discover available nodes
	const [nodes, setNodes] = React.useState<Array<{ id: string; name: string }>>([]);
	const [nodesLoading, setNodesLoading] = React.useState(true);
	const [nodesError, setNodesError] = React.useState<string | null>(null);

	// Fetch nodes on mount
	React.useEffect(() => {
		async function loadNodes() {
			try {
				setNodesLoading(true);
				setNodesError(null);
				const result = await fetchEntities('node');
				setNodes(result.entities);
				//console.log('CapacityHeadroom - Discovered nodes:', result.entities);
			} catch (error) {
				//console.error('Failed to load nodes:', error);
				setNodesError(error instanceof Error ? error.message : 'Failed to load nodes');
			} finally {
				setNodesLoading(false);
			}
		}
		loadNodes();
	}, []);

	// Step 2: Create a SINGLE subscription for ALL metrics (cluster + nodes)
	const allMetricSeries = React.useMemo(() => {
		const series: string[] = [];

		// Always include cluster-level metrics for charts
		series.push(
			"cluster.cpu.used.cores",
			"cluster.cpu.limits.cores",
			"cluster.mem.used.bytes",
			"cluster.mem.limits.bytes",
			"cluster.mem.capacity.bytes",
			"cluster.mem.allocatable.bytes",
			"cluster.fs.image.used.bytes",
			"cluster.fs.image.capacity.bytes"
		);

		// Add node-level metrics for each discovered node
		nodes.forEach(node => {
			//console.log(`🔍 Building node metrics for node: "${node.name}" (id: ${node.id})`);
			const nodeMetrics = [
				`node.cpu.usage.cores.${node.name}`,
				`node.capacity.cpu.cores.${node.name}`,
				`node.mem.usage.bytes.${node.name}`,
				`node.capacity.mem.bytes.${node.name}`,
				`node.fs.used.percent.${node.name}`,
				`node.fs.used.bytes.${node.name}`,
				`node.imagefs.used.bytes.${node.name}`
			];
			//console.log(`🔍 Node metrics:`, nodeMetrics);
			series.push(...nodeMetrics);
		});

		//console.log('CapacityHeadroom - Building metric series for', nodes.length, 'nodes');
		//console.log('CapacityHeadroom - All metric series:', series);
		//console.log('CapacityHeadroom - Cluster metrics:', series.filter(s => s.startsWith('cluster.')));
		//console.log('CapacityHeadroom - Node metrics:', series.filter(s => s.startsWith('node.')));
		return series;
	}, [nodes]);

	// Single subscription for everything
	const {
		seriesData: allData,
		connectionState,
		isConnected,
	} = useLiveSeriesSubscription(
		"capacity-headroom-all",
		allMetricSeries,
		{
			res: "lo",
			since: "30m",
			autoConnect: allMetricSeries.length > 0,
		}
	);

	// DEBUG: Check what's actually being passed to the subscription
	// React.useEffect(() => {
	// 	////console.log("🔍 SUBSCRIPTION DEBUG:");
	// 	////console.log("- allMetricSeries.length:", allMetricSeries.length);
	// 	////console.log("- allMetricSeries:", allMetricSeries);
	// 	////console.log("- autoConnect:", allMetricSeries.length > 0);
	// }, [allMetricSeries]);

	// DEBUG: Monitor data flow
	// React.useEffect(() => {
	// 	const dataKeyCount = Object.keys(allData).length;
	// 	//////console.log("=== CAPACITY DEBUG ===");
	// 	//////console.log("Series requested:", allMetricSeries.length);
	// 	////console.log("Data received:", dataKeyCount);
	// 	////console.log("Connected:", isConnected);
	// 	if (dataKeyCount === 0 && allMetricSeries.length > 0) {
	// 		////console.log("❌ NO DATA despite", allMetricSeries.length, "series requested");
	// 	}
	// 	//console.log("=======================");
	// }, [allMetricSeries.length, allData, isConnected]);

	// --- Cluster headroom % time series
	const cpuHeadroomSeries: ChartSeries[] = React.useMemo(() => {
		const used = allData["cluster.cpu.used.cores"];
		const lim = allData["cluster.cpu.limits.cores"];
		const pct = deriveSeries(used, lim, (u, l) => (l > 0 ? ((l - u) / l) * 100 : 0));
		return [
			{
				key: "cluster.cpu.headroom.pct",
				name: "CPU Headroom %",
				color: "#10b981", // green
				data: pct,
			},
		];
	}, [allData]);

	const memHeadroomSeries: ChartSeries[] = React.useMemo(() => {
		// Use the documented memory metrics for cluster-level headroom
		const used = allData["cluster.mem.used.bytes"];
		let capacity = allData["cluster.mem.capacity.bytes"];

		// Try allocatable if capacity isn't available
		if (!capacity?.length || capacity.every(p => p.v === 0)) {
			capacity = allData["cluster.mem.allocatable.bytes"];
		}

		// As a last resort, try limits
		if (!capacity?.length || capacity.every(p => p.v === 0)) {
			capacity = allData["cluster.mem.limits.bytes"];
		}

		// Debug memory data
		//console.log("Memory Headroom Debug:");
		//console.log("- used data points:", used?.length || 0, "latest:", used?.[used.length - 1]);
		//console.log("- capacity data points:", capacity?.length || 0, "latest:", capacity?.[capacity.length - 1]);
		//console.log("- all memory keys:", Object.keys(allData).filter(k => k.includes('mem')));

		const pct = deriveSeries(used, capacity, (u, c) => {
			if (c <= 0) return 0;
			const headroom = ((c - u) / c) * 100;
			//console.log(`Memory calc: used=${u}, capacity=${c}, headroom=${headroom}%`);
			// Check for obviously wrong calculations (negative headroom suggests wrong metrics)
			if (headroom < 0) {
				//console.warn(`Negative memory headroom detected: used=${u}, capacity=${c}. This suggests a metric mismatch.`);
				return 0;
			}
			return Math.max(0, Math.min(100, headroom)); // Cap at 100%
		});

		//console.log("- calculated headroom series length:", pct.length, "sample:", pct.slice(-3));

		return [
			{
				key: "cluster.mem.headroom.pct",
				name: "Memory Headroom %",
				color: "#06b6d4", // cyan
				data: pct,
			},
		];
	}, [allData]);

	const imgfsHeadroomSeries: ChartSeries[] = React.useMemo(() => {
		const used = allData["cluster.fs.image.used.bytes"];
		const cap = allData["cluster.fs.image.capacity.bytes"];
		const pct = deriveSeries(used, cap, (u, c) => (c > 0 ? ((c - u) / c) * 100 : 0));
		return [
			{
				key: "cluster.imagefs.headroom.pct",
				name: "ImageFS Headroom %",
				color: "#8b5cf6", // purple
				data: pct,
			},
		];
	}, [allData]);

	// --- Node table (latest value per node)
	// Now we use the discovered nodes and their corresponding metrics

	function latest(points?: Point[]): number | undefined {
		if (!points?.length) return undefined;
		return points[points.length - 1]?.v;
	}

	// Debug: Let's see what keys we actually receive from the backend
	React.useEffect(() => {
		const allKeys = Object.keys(allData as SeriesMap);
		//console.log("CapacityHeadroom - All received keys:", allKeys);
		//console.log("CapacityHeadroom - Node-like keys:", allKeys.filter(k => k.startsWith('node.')));
		//console.log("CapacityHeadroom - Cluster memory keys:", allKeys.filter(k => k.includes('mem')));

		// Check if we have any node metrics at all
		const nodeKeys = allKeys.filter(k => k.startsWith('node.'));
		if (nodeKeys.length === 0 && nodes.length > 0) {
			//console.warn("CapacityHeadroom - No node-level metrics received. Backend may not support node scope yet.");
		}
	}, [allData, nodes]);

	const tableRows: NodeHeadroomRow[] = React.useMemo(() => {
		const rows: NodeHeadroomRow[] = [];

		// Use discovered nodes instead of parsing keys heuristically
		nodes.forEach((node) => {
			// Pull the latest for each needed metric per node
			// Only use metrics that actually exist based on test_node_subscription_correct.js
			const nCpuUsed = latest(allData[`node.cpu.usage.cores.${node.name}`]);
			const nCpuCap = latest(allData[`node.capacity.cpu.cores.${node.name}`]);
			const nMemUsed = latest(allData[`node.mem.usage.bytes.${node.name}`]);
			const nMemCap = latest(allData[`node.capacity.mem.bytes.${node.name}`]);

			// DEBUG: Output the raw metric values for this node
			//console.log(`=== NODE ${node.name} DEBUG ===`);
			//console.log(`CPU: used=${nCpuUsed}, cap=${nCpuCap}`);
			//console.log(`MEM: used=${nMemUsed}, cap=${nMemCap}`);
			//console.log(`Keys that exist for this node:`, Object.keys(allData).filter(k => k.includes(node.name)));
			//console.log(`Total allData keys:`, Object.keys(allData).length);

			// Calculate headroom percentages using only available metrics
			// For CPU and Memory: headroom = (capacity - used) / capacity * 100
			let cpuPct = 0;
			let memPct = 0;

			// CPU headroom calculation
			if (nCpuCap && nCpuCap > 0 && nCpuUsed !== undefined) {
				cpuPct = Math.max(0, Math.min(100, ((nCpuCap - nCpuUsed) / nCpuCap) * 100));
			}

			// Memory headroom calculation  
			if (nMemCap && nMemCap > 0 && nMemUsed !== undefined) {
				memPct = Math.max(0, Math.min(100, ((nMemCap - nMemUsed) / nMemCap) * 100));
			}

			//console.log(`CALCULATED: CPU=${cpuPct.toFixed(1)}% | MEM=${memPct.toFixed(1)}%`);
			//console.log(`===========================`);

			rows.push({
				id: node.id,
				node: node.name,
				cpuHeadroomPct: cpuPct,
				memHeadroomPct: memPct,
				imgfsHeadroomPct: 0, // ImageFS metrics not available, set to 0
			});
		});

		// Sort by lowest headroom first (taking the minimum of CPU and Memory only)
		return rows.sort((a, b) => {
			const aMin = Math.min(a.cpuHeadroomPct, a.memHeadroomPct);
			const bMin = Math.min(b.cpuHeadroomPct, b.memHeadroomPct);
			return aMin - bMin;
		});
	}, [allData, nodes]);

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
				//console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Node Names",
			icon: <Copy className="size-4" />,
			action: () => {
				//console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "export-report",
			label: "Export Headroom Report",
			icon: <Download className="size-4" />,
			action: () => {
				//console.log('Bulk action triggered - this should be handled by the table');
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

			{/* Node Discovery Error */}
			{nodesError && (
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						Failed to discover nodes: {nodesError}
					</AlertDescription>
				</Alert>
			)}

			{/* Loading State */}
			{nodesLoading && (
				<Alert>
					<AlertDescription>
						Discovering cluster nodes...
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
					subtitle="(capacity - used) / capacity"
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
								{nodes.length > 0 && ` • ${nodes.length} nodes discovered`}
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
						getRowId={(row) => row.id}
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
										//console.log("Refresh node headroom data");
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
