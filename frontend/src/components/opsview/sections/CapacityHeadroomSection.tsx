/* frontend/src/components/opsview/sections/CapacityHeadroomSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { MetricLineChart, type ChartSeries } from "@/components/opsview/charts";
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter";
import { formatCores, formatBytesIEC } from "@/lib/metric-utils";
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

const toneForHeadroom = (p: number): "ok" | "warn" | "crit" => {
	if (p <= 10) return "crit";
	if (p <= 25) return "warn";
	return "ok";
};

function headroomBadge(pct: number) {
	const pctInt = Math.round(pct);
	if (pctInt <= 10) { // Critical
		return <Badge variant="outline" className="text-xs text-red-500 border-red-500/60">{formatPercent(pct)}</Badge>;
	}
	if (pctInt <= 25) { // Warning
		return <Badge variant="outline" className="text-xs text-orange-500 border-orange-500/60">{formatPercent(pct)}</Badge>;
	}
	if (pctInt <= 50) { // OK
		return <Badge variant="outline" className="text-xs text-blue-500 border-blue-500/60">{formatPercent(pct)}</Badge>;
	}
	// Healthy
	return <Badge variant="outline" className="text-xs text-green-600 border-green-600/60">{formatPercent(pct)}</Badge>;
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
	seriesA: Point[] | undefined,
	seriesB: Point[] | undefined,
	derive: (a: number, b: number) => number
): [number, number][] {
	if (!seriesA?.length || !seriesB?.length) return [];

	const mapB = new Map<number, number>();
	for (const p of seriesB) {
		if (p.t && Number.isFinite(p.v)) {
			mapB.set(p.t, p.v);
		}
	}

	const out: [number, number][] = [];
	for (const pA of seriesA) {
		if (pA.t && Number.isFinite(pA.v) && mapB.has(pA.t)) {
			const valB = mapB.get(pA.t)!;
			out.push([pA.t, derive(pA.v, valB)]);
		}
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
			"cluster.cpu.allocatable.cores",
			"cluster.cpu.requested.cores",
			"cluster.mem.used.bytes",
			"cluster.mem.limits.bytes",
			"cluster.mem.capacity.bytes",
			"cluster.mem.allocatable.bytes",
			"cluster.mem.requested.bytes",
			"cluster.fs.image.used.bytes",
			"cluster.fs.image.capacity.bytes"
		);

		// Add node-level metrics for each discovered node
		nodes.forEach(node => {
			//console.log(`🔍 Building node metrics for node: "${node.name}" (id: ${node.id})`);
			const nodeMetrics = [
				`node.cpu.usage.cores.${node.name}`,
				`node.allocatable.cpu.cores.${node.name}`,
				`node.mem.usage.bytes.${node.name}`,
				`node.allocatable.mem.bytes.${node.name}`,
				`node.fs.used.percent.${node.name}`,
				`node.fs.used.bytes.${node.name}`,
				`node.imagefs.used.bytes.${node.name}`,
				`node.imagefs.used.percent.${node.name}`
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
		const alloc = allData["cluster.cpu.allocatable.cores"];
		const pct = deriveSeries(used, alloc, (u, a) => (a > 0 ? ((a - u) / a) * 100 : 0));
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
		const used = allData["cluster.mem.used.bytes"];
		const alloc = allData["cluster.mem.allocatable.bytes"];
		const pct = deriveSeries(used, alloc, (u, a) => (a > 0 ? ((a - u) / a) * 100 : 0));

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

	// --- Footer data calculations ---
	const { cpuFooter, memFooter, imgfsFooter } = React.useMemo(() => {
		// CPU footer
		const cpuUsed = latest(allData["cluster.cpu.used.cores"]) ?? 0;
		const cpuAlloc = latest(allData["cluster.cpu.allocatable.cores"]) ?? 0;
		const cpuReq = latest(allData["cluster.cpu.requested.cores"]) ?? 0;

		const cpuHeadroom = Math.max(0, cpuAlloc - cpuUsed);
		const cpuHeadroomPct = cpuAlloc > 0 ? (cpuHeadroom / cpuAlloc) * 100 : 100;
		const cpuUsedRatio = cpuAlloc > 0 ? (cpuUsed / cpuAlloc) : 0;
		const cpuReqRatio = cpuAlloc > 0 ? (cpuReq / cpuAlloc) : 0;
		const cpuReqDisplay = cpuReqRatio > 5 ? `${cpuReqRatio.toFixed(1)}x` : `${(cpuReqRatio * 100).toFixed(0)}%`;

		const cpuTone = toneForHeadroom(cpuHeadroomPct);
		const cpuSummary = `CPU has ${formatPercent(cpuHeadroomPct)} headroom (${formatCores(cpuHeadroom)} available).`;

		const cpuFooter = (
			<SectionHealthFooter
				tone={cpuTone}
				summary={cpuSummary}
				usedPct={cpuUsedRatio}
				ratioPills={[
					{ label: "Used/Allocatable", value: `${(cpuUsedRatio * 100).toFixed(0)}%`, tone: toneForHeadroom(100 - cpuUsedRatio * 100) === 'crit' ? 'crit' : 'info' },
					{ label: "Req/Allocatable", value: cpuReqDisplay, tone: cpuReqRatio > 1 ? "warn" : "info", title: "Commitment vs Allocatable" },
				]}
			/>
		);

		// Memory footer
		const memUsed = latest(allData["cluster.mem.used.bytes"]) ?? 0;
		const memAlloc = latest(allData["cluster.mem.allocatable.bytes"]) ?? 0;
		const memReq = latest(allData["cluster.mem.requested.bytes"]) ?? 0;

		const memHeadroom = Math.max(0, memAlloc - memUsed);
		const memHeadroomPct = memAlloc > 0 ? (memHeadroom / memAlloc) * 100 : 100;
		const memUsedRatio = memAlloc > 0 ? (memUsed / memAlloc) : 0;
		const memReqRatio = memAlloc > 0 ? (memReq / memAlloc) : 0;
		const memReqDisplay = memReqRatio > 5 ? `${memReqRatio.toFixed(1)}x` : `${(memReqRatio * 100).toFixed(0)}%`;

		const memTone = toneForHeadroom(memHeadroomPct);
		const memSummary = `Memory has ${formatPercent(memHeadroomPct)} headroom (${formatBytesIEC(memHeadroom)} available).`;

		const memFooter = (
			<SectionHealthFooter
				tone={memTone}
				summary={memSummary}
				usedPct={memUsedRatio}
				ratioPills={[
					{ label: "Used/Allocatable", value: `${(memUsedRatio * 100).toFixed(0)}%`, tone: toneForHeadroom(100 - memUsedRatio * 100) === 'crit' ? 'crit' : 'info' },
					{ label: "Req/Allocatable", value: memReqDisplay, tone: memReqRatio > 1 ? "warn" : "info", title: "Commitment vs Allocatable" },
				]}
			/>
		);

		// ImageFS footer
		const imgfsUsed = latest(allData["cluster.fs.image.used.bytes"]) ?? 0;
		const imgfsCap = latest(allData["cluster.fs.image.capacity.bytes"]) ?? 0;

		const imgfsHeadroom = Math.max(0, imgfsCap - imgfsUsed);
		const imgfsHeadroomPct = imgfsCap > 0 ? (imgfsHeadroom / imgfsCap) * 100 : 100;
		const imgfsUsedPct = imgfsCap > 0 ? (imgfsUsed / imgfsCap) : 0;

		const imgfsTone = toneForHeadroom(imgfsHeadroomPct);
		const imgfsSummary = `ImageFS has ${formatPercent(imgfsHeadroomPct)} headroom (${formatBytesIEC(imgfsHeadroom)} available).`;

		const imgfsFooter = (
			<SectionHealthFooter
				tone={imgfsTone}
				summary={imgfsSummary}
				usedPct={imgfsUsedPct}
				ratioPills={[
					{ label: "Used/Capacity", value: `${(imgfsUsedPct * 100).toFixed(0)}%`, tone: toneForHeadroom(100 - imgfsUsedPct * 100) === 'crit' ? 'crit' : 'info' },
				]}
			/>
		);

		return { cpuFooter, memFooter, imgfsFooter };
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
			const nCpuAlloc = latest(allData[`node.allocatable.cpu.cores.${node.name}`]);
			const nMemUsed = latest(allData[`node.mem.usage.bytes.${node.name}`]);
			const nMemAlloc = latest(allData[`node.allocatable.mem.bytes.${node.name}`]);
			const nImgfsUsedPct = latest(allData[`node.imagefs.used.percent.${node.name}`]);

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
			let imgfsPct = 0;

			// CPU headroom calculation
			if (nCpuAlloc && nCpuAlloc > 0 && nCpuUsed !== undefined) {
				cpuPct = Math.max(0, Math.min(100, ((nCpuAlloc - nCpuUsed) / nCpuAlloc) * 100));
			}

			// Memory headroom calculation  
			if (nMemAlloc && nMemAlloc > 0 && nMemUsed !== undefined) {
				memPct = Math.max(0, Math.min(100, ((nMemAlloc - nMemUsed) / nMemAlloc) * 100));
			}

			// ImageFS headroom calculation
			if (nImgfsUsedPct !== undefined) {
				imgfsPct = Math.max(0, Math.min(100, 100 - nImgfsUsedPct));
			}

			//console.log(`CALCULATED: CPU=${cpuPct.toFixed(1)}% | MEM=${memPct.toFixed(1)}%`);
			//console.log(`===========================`);

			rows.push({
				id: node.id,
				node: node.name,
				cpuHeadroomPct: cpuPct,
				memHeadroomPct: memPct,
				imgfsHeadroomPct: imgfsPct,
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
				<MetricLineChart
					title="CPU Headroom %"
					subtitle="(allocatable - used) / allocatable"
					series={cpuHeadroomSeries}
					unit="%"
					formatter={(v) => formatPercent(v)}
					scopeLabel="cluster"
					timespanLabel="30m"
					resolutionLabel="hi"
					footerExtra={cpuFooter}
				/>
				<MetricLineChart
					title="Memory Headroom %"
					subtitle="(allocatable - used) / allocatable"
					series={memHeadroomSeries}
					unit="%"
					formatter={(v) => formatPercent(v)}
					scopeLabel="cluster"
					timespanLabel="30m"
					resolutionLabel="hi"
					footerExtra={memFooter}
				/>
				<MetricLineChart
					title="ImageFS Headroom %"
					subtitle="(capacity - used) / capacity"
					series={imgfsHeadroomSeries}
					unit="%"
					formatter={(v) => formatPercent(v)}
					scopeLabel="cluster"
					timespanLabel="30m"
					resolutionLabel="hi"
					footerExtra={imgfsFooter}
				/>
			</div>

			{/* Nodes by lowest headroom */}
			<div className="border rounded-lg bg-card">
				<div className="p-4 border-b">
					<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
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
								/>
							</div>
						)}
					/>
				</div>
			</div>
		</div>
	);
}
