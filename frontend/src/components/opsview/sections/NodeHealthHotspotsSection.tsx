/* frontend/src/components/opsview/sections/NodeHealthHotspotsSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import {
	MetricLineChart,
	MetricRadialChart,
	type ChartSeries,
} from "@/components/opsview/charts";
import {
	formatBytesIEC,
	formatCores,
} from "@/lib/metric-utils";
import { AlertTriangle, ChevronRight } from "lucide-react";

import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";
import { type ColumnDef } from "@/lib/table";

/* ----------------------------- Types & utils ----------------------------- */

type NodeEntity = {
	id: string;        // node name
	name: string;      // node name
	role?: string;
	ready?: boolean;
};

type HotspotRow = {
	id: string;          // node name
	node: string;
	cpuPct: number;      // usage / alloc * 100
	memPct: number;      // usage / alloc * 100
	imageFsPct: number;  // node.imagefs.used.percent
	rootFsPct: number;   // node.fs.used.percent
	inodesPct: number;   // node.fs.inodes.used.percent
	rxPps: number;       // node.net.rx.pps
	txPps: number;       // node.net.tx.pps
	pods: number;        // node.pods.count
	podDensity: number;  // pods / allocatable.pods * 100
	diskPressure: number; // 0 or 1
	memPressure: number;  // 0 or 1
	pidPressure: number;  // 0 or 1
};

const NODE_LIMIT = 200;

async function discoverNodes(): Promise<NodeEntity[]> {
	const qs = new URLSearchParams();
	qs.set("limit", String(NODE_LIMIT));
	const res = await fetch(`/api/v1/timeseries/entities/nodes?${qs.toString()}`);
	if (!res.ok) return [];
	const { entities } = await res.json();
	return (entities ?? []).map((e: any) => ({
		id: e.name,
		name: e.name,
		role: e.role,
		ready: e.ready,
	})) as NodeEntity[];
}

function latest(series?: Array<{ t: number; v: number }>) {
	if (!series?.length) return undefined;
	return series[series.length - 1]!.v;
}

const formatPct0 = (v: number) => `${Math.round(v)}%`;
const formatPps = (v: number) => `${Math.round(v).toLocaleString()} pps`;
const formatBps = (v: number) => {
	if (!Number.isFinite(v)) return "0 bps";
	const units = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
	let i = 0; let n = v;
	while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
	return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
};

/* ------------------------------- Component ------------------------------- */

export default function NodeHealthHotspotsSection() {
	const [nodes, setNodes] = React.useState<NodeEntity[]>([]);
	const [loadingNodes, setLoadingNodes] = React.useState(true);
	const [nodeError, setNodeError] = React.useState<string | null>(null);
	const [selectedNode, setSelectedNode] = React.useState<string | null>(null);

	// Discover nodes
	React.useEffect(() => {
		let mounted = true;
		setLoadingNodes(true);
		setNodeError(null);
		discoverNodes()
			.then(list => {
				if (!mounted) return;
				setNodes(list);
				if (!selectedNode && list.length) setSelectedNode(list[0].name);
			})
			.catch(err => { if (mounted) setNodeError(String(err)); })
			.finally(() => { if (mounted) setLoadingNodes(false); });
		return () => { mounted = false; };
	}, []);

	/* -------- Build subscription keys (cluster + per-node metrics) -------- */

	const clusterKeys = React.useMemo(() => [
		"cluster.nodes.ready",
		"cluster.nodes.notready",
		"cluster.pods.unschedulable",
	], []);

	const nodeBases = React.useMemo(() => [
		"node.cpu.usage.cores",
		"node.allocatable.cpu.cores",
		"node.mem.usage.bytes",
		"node.allocatable.mem.bytes",
		"node.net.rx.bps",
		"node.net.tx.bps",
		"node.net.rx.pps",
		"node.net.tx.pps",
		"node.fs.used.percent",
		"node.imagefs.used.percent",
		"node.fs.inodes.used.percent",
		"node.process.count",
		"node.pods.count",
		"node.allocatable.pods",
		"node.condition.disk_pressure",
		"node.condition.memory_pressure",
		"node.condition.pid_pressure",
	], []);

	const nodeKeys = React.useMemo(() => {
		const keys: string[] = [];
		for (const n of nodes) {
			for (const base of nodeBases) {
				keys.push(`${base}.${n.name}`);
			}
		}
		return keys;
	}, [nodes, nodeBases]);

	const { seriesData: live, isConnected, connectionState } = useLiveSeriesSubscription(
		"node-health-hotspots",
		[...clusterKeys, ...nodeKeys],
		{ res: "lo", since: "30m", autoConnect: true }
	);

	/* --------------------------------- Cards -------------------------------- */

	const nodesReady = Math.round(latest(live["cluster.nodes.ready"]) || 0);
	const nodesNotReady = Math.round(latest(live["cluster.nodes.notready"]) || 0);
	const unschedulable = Math.round(latest(live["cluster.pods.unschedulable"]) || 0);

	const cards: SummaryCard[] = [
		{
			title: "Nodes Ready",
			value: `${nodesReady}/${nodesReady + nodesNotReady}`,
			subtitle: nodesNotReady > 0 ? `${nodesNotReady} not ready` : "All nodes ready",
			badge: <Badge variant={nodesNotReady ? "destructive" : "secondary"}>
				{nodesNotReady ? "Degraded" : "Healthy"}
			</Badge>,
			footer: "Cluster readiness (ready / total).",
		},
		{
			title: "Pods Unschedulable",
			value: unschedulable,
			subtitle: unschedulable > 0 ? "Investigate capacity / constraints" : "All pods schedulable",
			badge: <Badge variant={unschedulable ? "destructive" : "outline"}>
				{unschedulable ? "Action Needed" : "OK"}
			</Badge>,
			footer: "Pods currently not placeable on any node.",
		},
	];

	/* ---------------------------- Hotspot table data ---------------------------- */

	const hotspotRows: HotspotRow[] = React.useMemo(() => {
		return nodes.map(n => {
			const cpuU = latest(live[`node.cpu.usage.cores.${n.name}`]) ?? 0;
			const cpuA = latest(live[`node.allocatable.cpu.cores.${n.name}`]) ?? 0;
			const memU = latest(live[`node.mem.usage.bytes.${n.name}`]) ?? 0;
			const memA = latest(live[`node.allocatable.mem.bytes.${n.name}`]) ?? 0;

			const imageFs = latest(live[`node.imagefs.used.percent.${n.name}`]) ?? 0;
			const rootFs = latest(live[`node.fs.used.percent.${n.name}`]) ?? 0;
			const inodes = latest(live[`node.fs.inodes.used.percent.${n.name}`]) ?? 0;

			const rxPps = latest(live[`node.net.rx.pps.${n.name}`]) ?? 0;
			const txPps = latest(live[`node.net.tx.pps.${n.name}`]) ?? 0;

			const pods = Math.round(latest(live[`node.pods.count.${n.name}`]) ?? 0);
			const allocatablePods = latest(live[`node.allocatable.pods.${n.name}`]) ?? 0;
			const diskPressure = latest(live[`node.condition.disk_pressure.${n.name}`]) ?? 0;
			const memPressure = latest(live[`node.condition.memory_pressure.${n.name}`]) ?? 0;
			const pidPressure = latest(live[`node.condition.pid_pressure.${n.name}`]) ?? 0;

			const cpuPct = cpuA > 0 ? (cpuU / cpuA) * 100 : 0;
			const memPct = memA > 0 ? (memU / memA) * 100 : 0;
			const podDensity = allocatablePods > 0 ? (pods / allocatablePods) * 100 : 0;

			return {
				id: n.name,
				node: n.name,
				cpuPct,
				memPct,
				imageFsPct: imageFs,
				rootFsPct: rootFs,
				inodesPct: inodes,
				rxPps,
				txPps,
				pods,
				podDensity,
				diskPressure,
				memPressure,
				pidPressure,
			};
		});
	}, [nodes, live]);

	// compute 90th percentile thresholds for highlighting
	function percentile(values: number[], p = 0.9) {
		const arr = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
		if (!arr.length) return Number.POSITIVE_INFINITY;
		const idx = Math.floor(p * (arr.length - 1));
		return arr[idx];
		// simple, stable; ok for UI highlighting
	}

	const thresholds = React.useMemo(() => ({
		cpuPct: percentile(hotspotRows.map(r => r.cpuPct)),
		memPct: percentile(hotspotRows.map(r => r.memPct)),
		imageFsPct: percentile(hotspotRows.map(r => r.imageFsPct)),
		rootFsPct: percentile(hotspotRows.map(r => r.rootFsPct)),
		inodesPct: percentile(hotspotRows.map(r => r.inodesPct)),
		rxPps: percentile(hotspotRows.map(r => r.rxPps)),
		txPps: percentile(hotspotRows.map(r => r.txPps)),
		pods: percentile(hotspotRows.map(r => r.pods)),
		podDensity: percentile(hotspotRows.map(r => r.podDensity)),
	}), [hotspotRows]);

	const columns = React.useMemo<ColumnDef<HotspotRow>[]>(() => [
		{
			accessorKey: "node",
			header: "Node",
			cell: ({ row }) => (
				<button
					onClick={() => setSelectedNode(row.original.node)}
					className="inline-flex items-center gap-1 text-left hover:underline text-sm font-medium"
				>
					{row.original.node}
					<ChevronRight className="h-3 w-3 opacity-60" />
				</button>
			),
			enableHiding: false,
		},
		{
			accessorKey: "cpuPct",
			header: "CPU %",
			cell: ({ row }) => {
				const v = row.original.cpuPct;
				const hot = v >= thresholds.cpuPct;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatPct0(v)}</span>;
			},
			sortingFn: (a, b) => a.original.cpuPct - b.original.cpuPct,
		},
		{
			accessorKey: "memPct",
			header: "Mem %",
			cell: ({ row }) => {
				const v = row.original.memPct;
				const hot = v >= thresholds.memPct;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatPct0(v)}</span>;
			},
			sortingFn: (a, b) => a.original.memPct - b.original.memPct,
		},
		{
			accessorKey: "imageFsPct",
			header: "ImageFS %",
			cell: ({ row }) => {
				const v = row.original.imageFsPct;
				const hot = v >= thresholds.imageFsPct;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatPct0(v)}</span>;
			},
			sortingFn: (a, b) => a.original.imageFsPct - b.original.imageFsPct,
		},
		{
			accessorKey: "rootFsPct",
			header: "RootFS %",
			cell: ({ row }) => {
				const v = row.original.rootFsPct;
				const hot = v >= thresholds.rootFsPct;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatPct0(v)}</span>;
			},
			sortingFn: (a, b) => a.original.rootFsPct - b.original.rootFsPct,
		},
		{
			accessorKey: "inodesPct",
			header: "Inodes %",
			cell: ({ row }) => {
				const v = row.original.inodesPct;
				const hot = v >= thresholds.inodesPct;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatPct0(v)}</span>;
			},
			sortingFn: (a, b) => a.original.inodesPct - b.original.inodesPct,
		},
		{
			accessorKey: "rxPps",
			header: "RX pps",
			cell: ({ row }) => {
				const v = row.original.rxPps;
				const hot = v >= thresholds.rxPps;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatPps(v)}</span>;
			},
			sortingFn: (a, b) => a.original.rxPps - b.original.rxPps,
		},
		{
			accessorKey: "txPps",
			header: "TX pps",
			cell: ({ row }) => {
				const v = row.original.txPps;
				const hot = v >= thresholds.txPps;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatPps(v)}</span>;
			},
			sortingFn: (a, b) => a.original.txPps - b.original.txPps,
		},
		{
			accessorKey: "pods",
			header: "Pods",
			cell: ({ row }) => {
				const v = row.original.pods;
				const hot = v >= thresholds.pods;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{v}</span>;
			},
			sortingFn: (a, b) => a.original.pods - b.original.pods,
		},
		{
			accessorKey: "podDensity",
			header: "Pod Density",
			cell: ({ row }) => {
				const v = row.original.podDensity;
				const hot = v >= thresholds.podDensity;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatPct0(v)}</span>;
			},
			sortingFn: (a, b) => a.original.podDensity - b.original.podDensity,
		},
		{
			accessorKey: "diskPressure",
			header: "Disk Pressure",
			cell: ({ row }) => {
				const v = row.original.diskPressure;
				return v > 0 ? <Badge variant="destructive">Active</Badge> : <Badge variant="outline">OK</Badge>;
			},
			sortingFn: (a, b) => a.original.diskPressure - b.original.diskPressure,
		},
		{
			accessorKey: "memPressure",
			header: "Mem Pressure",
			cell: ({ row }) => {
				const v = row.original.memPressure;
				return v > 0 ? <Badge variant="destructive">Active</Badge> : <Badge variant="outline">OK</Badge>;
			},
			sortingFn: (a, b) => a.original.memPressure - b.original.memPressure,
		},
		{
			accessorKey: "pidPressure",
			header: "PID Pressure",
			cell: ({ row }) => {
				const v = row.original.pidPressure;
				return v > 0 ? <Badge variant="destructive">Active</Badge> : <Badge variant="outline">OK</Badge>;
			},
			sortingFn: (a, b) => a.original.pidPressure - b.original.pidPressure,
		},
	], [thresholds]);

	/* ---------------------------- Drill-in charts ---------------------------- */

	const sel = selectedNode;

	const makeSeries = React.useCallback((key: string, name: string, color: string): ChartSeries => {
		const arr = (sel && live[`${key}.${sel}`]) || [];
		const data: [number, number][] = arr.map(p => [p.t, p.v]);
		return { key: `${key}.${sel}`, name, color, data };
	}, [live, sel]);

	const cpuSeries: ChartSeries[] = React.useMemo(() => {
		if (!sel) return [];
		return [
			makeSeries("node.cpu.usage.cores", "CPU Used (cores)", "#3b82f6"),
			makeSeries("node.allocatable.cpu.cores", "CPU Allocatable (cores)", "#94a3b8"),
		];
	}, [makeSeries, sel]);

	const memSeries: ChartSeries[] = React.useMemo(() => {
		if (!sel) return [];
		return [
			makeSeries("node.mem.usage.bytes", "Mem Used (bytes)", "#06b6d4"),
			makeSeries("node.allocatable.mem.bytes", "Mem Allocatable (bytes)", "#94a3b8"),
		];
	}, [makeSeries, sel]);

	const netBpsSeries: ChartSeries[] = React.useMemo(() => {
		if (!sel) return [];
		return [
			makeSeries("node.net.rx.bps", "RX (bps)", "#10b981"),
			makeSeries("node.net.tx.bps", "TX (bps)", "#f59e0b"),
		];
	}, [makeSeries, sel]);

	const netPpsSeries: ChartSeries[] = React.useMemo(() => {
		if (!sel) return [];
		return [
			makeSeries("node.net.rx.pps", "RX (pps)", "#22c55e"),
			makeSeries("node.net.tx.pps", "TX (pps)", "#eab308"),
		];
	}, [makeSeries, sel]);

	const procSeries: ChartSeries[] = React.useMemo(() => {
		if (!sel) return [];
		return [makeSeries("node.process.count", "Process Count", "#a855f7")];
	}, [makeSeries, sel]);

	const storageGaugeSeries = React.useMemo(() => {
		if (!sel) return [];
		const s1 = latest(live[`node.fs.used.percent.${sel}`]) ?? 0;
		const s2 = latest(live[`node.imagefs.used.percent.${sel}`]) ?? 0;
		const s3 = latest(live[`node.fs.inodes.used.percent.${sel}`]) ?? 0;
		const now = Date.now();
		return [
			{ key: `fs.root.${sel}`, name: "RootFS %", color: "#ef4444", data: [[now, s1]] },
			{ key: `fs.image.${sel}`, name: "ImageFS %", color: "#f97316", data: [[now, s2]] },
			{ key: `fs.inodes.${sel}`, name: "Inodes %", color: "#eab308", data: [[now, s3]] },
		] as ChartSeries[];
	}, [live, sel]);

	/* --------------------------------- UI --------------------------------- */

	return (
		<>

			{(connectionState.lastError || nodeError) && (
				<div className="px-4 pt-4">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							{nodeError ? `Node discovery failed: ${nodeError}` : `WebSocket error: ${connectionState.lastError}`}
						</AlertDescription>
					</Alert>
				</div>
			)}

			{/* Cards */}
			<div className="p-4">
				<SummaryCards
					cards={cards}
					columns={2}
					loading={loadingNodes}
					error={connectionState.lastError}
					lastUpdated={null}
					noPadding
				/>
			</div>

			{/* Hotspot table */}
			<div className="px-4 pb-2">
				<div className="flex items-center justify-between mb-2">
					<h3 className="text-sm font-medium text-muted-foreground">Hotspots</h3>
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground">Selected:</span>
						<select
							className="text-xs bg-background border rounded px-2 py-1"
							value={selectedNode || ""}
							onChange={e => setSelectedNode(e.target.value)}
						>
							{nodes.map(n => (
								<option key={n.name} value={n.name}>{n.name}</option>
							))}
						</select>
					</div>
				</div>

				<UniversalDataTable
					data={hotspotRows}
					columns={columns}
					enableReorder={false}
					enableRowSelection={false}
					onRowClick={(row) => setSelectedNode(row.node)}
					className="px-0 [&_tbody_tr]:bg-background/50"
				/>
			</div>

			{/* Drill-in charts */}
			{selectedNode && (
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-6 p-4 pt-0">
					<MetricLineChart
						title={`CPU (node: ${selectedNode})`}
						subtitle="Usage vs Allocatable"
						series={cpuSeries}
						unit="cores"
						formatter={formatCores}
						scopeLabel={`node:${selectedNode}`}
						timespanLabel="30m"
						resolutionLabel="lo"
					/>
					<MetricLineChart
						title={`Memory (node: ${selectedNode})`}
						subtitle="Usage vs Allocatable"
						series={memSeries}
						unit="bytes"
						formatter={formatBytesIEC}
						scopeLabel={`node:${selectedNode}`}
						timespanLabel="30m"
						resolutionLabel="lo"
					/>

					<MetricLineChart
						title={`Network Throughput (node: ${selectedNode})`}
						subtitle="RX/TX bps"
						series={netBpsSeries}
						unit=""
						formatter={formatBps}
						scopeLabel={`node:${selectedNode}`}
						timespanLabel="30m"
						resolutionLabel="lo"
					/>
					<MetricLineChart
						title={`Network Packets (node: ${selectedNode})`}
						subtitle="RX/TX pps"
						series={netPpsSeries}
						unit=""
						formatter={formatPps}
						scopeLabel={`node:${selectedNode}`}
						timespanLabel="30m"
						resolutionLabel="lo"
					/>

					<MetricRadialChart
						title={`Storage Utilization (node: ${selectedNode})`}
						subtitle="RootFS / ImageFS / Inodes (latest)"
						series={storageGaugeSeries}
						unit="%"
						formatter={(v: number) => `${v.toFixed(0)}%`}
						scopeLabel={`node:${selectedNode}`}
						timespanLabel="now"
						resolutionLabel="lo"
					/>

					<MetricLineChart
						title={`Process Count (node: ${selectedNode})`}
						subtitle="Spikes can imply runaway processes"
						series={procSeries}
						unit=""
						formatter={(v: number) => v.toFixed(0)}
						scopeLabel={`node:${selectedNode}`}
						timespanLabel="30m"
						resolutionLabel="lo"
					/>
				</div>
			)}
		</>
	);
}
