/* frontend/src/components/opsview/sections/NetworkHealthSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import {
	MetricAreaChart,
	MetricLineChart,
	type ChartSeries,
} from "@/components/opsview/charts";
import { AlertTriangle } from "lucide-react";

import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";
import { type ColumnDef } from "@/lib/table";

/* ----------------------------- Types & helpers ----------------------------- */

type NodeEntity = { name: string };
type PodEntity = { namespace: string; name: string; node?: string };

const NODE_LIMIT = 200;
const POD_LIMIT = 400;

async function discoverNodes(): Promise<NodeEntity[]> {
	const qs = new URLSearchParams(); qs.set("limit", String(NODE_LIMIT));
	const res = await fetch(`/api/v1/timeseries/entities/nodes?${qs.toString()}`);
	if (!res.ok) return [];
	const { entities } = await res.json();
	return (entities ?? []).map((e: any) => ({ name: e.name })) as NodeEntity[];
}

async function discoverPods(): Promise<PodEntity[]> {
	const qs = new URLSearchParams(); qs.set("limit", String(POD_LIMIT));
	const res = await fetch(`/api/v1/timeseries/entities/pods?${qs.toString()}`);
	if (!res.ok) return [];
	const { entities } = await res.json();
	return (entities ?? []).map((e: any) => ({
		namespace: e.namespace, name: e.name, node: e.node
	})) as PodEntity[];
}

function latest(arr?: Array<{ t: number; v: number }>) {
	if (!arr?.length) return undefined;
	return arr[arr.length - 1]!.v;
}

const formatBps = (v: number) => {
	if (!Number.isFinite(v)) return "0 bps";
	const units = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
	let i = 0; let n = v;
	while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
	return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
};
const formatPps = (v: number) => `${Math.round(v).toLocaleString()} pps`;
const intFmt = (n: number) => Math.round(n).toString();

/* ------------------------------- Component -------------------------------- */

export default function NetworkHealthSection() {
	const [nodes, setNodes] = React.useState<NodeEntity[]>([]);
	const [pods, setPods] = React.useState<PodEntity[]>([]);
	const [discError, setDiscError] = React.useState<string | null>(null);
	const [loadingDisc, setLoadingDisc] = React.useState(true);

	const [selectedNode, setSelectedNode] = React.useState<string | null>(null);

	React.useEffect(() => {
		let m = true;
		setLoadingDisc(true);
		setDiscError(null);
		Promise.all([discoverNodes(), discoverPods()])
			.then(([n, p]) => {
				if (!m) return;
				setNodes(n);
				setPods(p);
				if (!selectedNode && n.length) setSelectedNode(n[0].name);
			})
			.catch(err => { if (m) setDiscError(String(err)); })
			.finally(() => { if (m) setLoadingDisc(false); });
		return () => { m = false; };
	}, []);

	/* ------------------------------ Subscriptions ------------------------------ */

	const clusterKeys = React.useMemo(() => [
		"cluster.net.rx.bps",
		"cluster.net.tx.bps",
	], []);

	const nodeBases = React.useMemo(() => [
		"node.net.rx.bps",
		"node.net.tx.bps",
		"node.net.rx.pps",
		"node.net.tx.pps",
	], []);

	const nodeKeys = React.useMemo(() => {
		const keys: string[] = [];
		for (const n of nodes) {
			for (const base of nodeBases) keys.push(`${base}.${n.name}`);
		}
		return keys;
	}, [nodes, nodeBases]);

	const podKeys = React.useMemo(() => {
		const keys: string[] = [];
		for (const p of pods) {
			keys.push(`pod.net.rx.bps.${p.namespace}.${p.name}`);
			keys.push(`pod.net.tx.bps.${p.namespace}.${p.name}`);
		}
		return keys;
	}, [pods]);

	// 24h for charts, enough for trend inspection
	const { seriesData: live, isConnected, connectionState } = useLiveSeriesSubscription(
		"network-health",
		[...clusterKeys, ...nodeKeys, ...podKeys],
		{ res: "lo", since: "24h", autoConnect: true }
	);

	/* ---------------------------------- Cards ---------------------------------- */

	const rxNow = latest(live["cluster.net.rx.bps"]) ?? 0;
	const txNow = latest(live["cluster.net.tx.bps"]) ?? 0;

	// Packet Pressure (Top Node pps): max across nodes of rx.pps/tx.pps
	let topNode = "-";
	let maxPps = 0;
	for (const n of nodes) {
		const rx = latest(live[`node.net.rx.pps.${n.name}`]) ?? 0;
		const tx = latest(live[`node.net.tx.pps.${n.name}`]) ?? 0;
		const m = Math.max(rx, tx);
		if (m > maxPps) { maxPps = m; topNode = n.name; }
	}

	const cards: SummaryCard[] = [
		{
			title: "Cluster Throughput",
			value: `${formatBps(rxNow)} / ${formatBps(txNow)}`,
			subtitle: "RX / TX (latest)",
			badge: <Badge variant="secondary">Cluster</Badge>,
			footer: "Total network receive / transmit rate.",
		},
		{
			title: "Packet Pressure (Top Node)",
			value: formatPps(maxPps),
			subtitle: topNode !== "-" ? `Node: ${topNode}` : "No data",
			badge: <Badge variant={maxPps > 0 ? "secondary" : "outline"}>pps</Badge>,
			footer: "Max of node RX/TX packets per second.",
		},
	];

	/* --------------------------------- Charts --------------------------------- */

	// Cluster Net (Area Stacked): rx + tx bps
	const clusterNetSeries: ChartSeries[] = React.useMemo(() => ([
		{
			key: "cluster.net.rx.bps",
			name: "RX (bps)",
			color: "#10b981",
			data: (live["cluster.net.rx.bps"] || []).map(p => [p.t, p.v]),
		},
		{
			key: "cluster.net.tx.bps",
			name: "TX (bps)",
			color: "#f59e0b",
			data: (live["cluster.net.tx.bps"] || []).map(p => [p.t, p.v]),
		},
	]), [live]);

	// Per-Node Net (Line): bps and pps for selected node
	const sel = selectedNode;
	const nodeBpsSeries: ChartSeries[] = React.useMemo(() => {
		if (!sel) return [];
		return [
			{
				key: `node.net.rx.bps.${sel}`,
				name: "RX (bps)",
				color: "#22c55e",
				data: (live[`node.net.rx.bps.${sel}`] || []).map(p => [p.t, p.v]),
			},
			{
				key: `node.net.tx.bps.${sel}`,
				name: "TX (bps)",
				color: "#eab308",
				data: (live[`node.net.tx.bps.${sel}`] || []).map(p => [p.t, p.v]),
			},
		];
	}, [sel, live]);

	const nodePpsSeries: ChartSeries[] = React.useMemo(() => {
		if (!sel) return [];
		return [
			{
				key: `node.net.rx.pps.${sel}`,
				name: "RX (pps)",
				color: "#3b82f6",
				data: (live[`node.net.rx.pps.${sel}`] || []).map(p => [p.t, p.v]),
			},
			{
				key: `node.net.tx.pps.${sel}`,
				name: "TX (pps)",
				color: "#ef4444",
				data: (live[`node.net.tx.pps.${sel}`] || []).map(p => [p.t, p.v]),
			},
		];
	}, [sel, live]);

	/* ------------------------------ Top Talker Pods ----------------------------- */

	type TalkerRow = {
		id: string;
		ns: string;
		pod: string;
		node?: string;
		rx: number;
		tx: number;
		total: number;
	};

	const talkers: TalkerRow[] = React.useMemo(() => {
		const rows: TalkerRow[] = [];
		for (const p of pods) {
			const rx = latest(live[`pod.net.rx.bps.${p.namespace}.${p.name}`]) ?? 0;
			const tx = latest(live[`pod.net.tx.bps.${p.namespace}.${p.name}`]) ?? 0;
			const total = rx + tx;
			if (total > 0) {
				rows.push({
					id: `${p.namespace}/${p.name}`,
					ns: p.namespace,
					pod: p.name,
					node: p.node,
					rx, tx, total,
				});
			}
		}
		rows.sort((a, b) => b.total - a.total);
		return rows;
	}, [pods, live]);

	const columns = React.useMemo<ColumnDef<TalkerRow>[]>(() => [
		{
			accessorKey: "ns",
			header: "Namespace",
			cell: ({ row }) => <span className="text-sm">{row.original.ns}</span>,
			enableHiding: false,
		},
		{
			accessorKey: "pod",
			header: "Pod",
			cell: ({ row }) => <span className="text-sm font-medium">{row.original.pod}</span>,
			enableHiding: false,
		},
		{
			accessorKey: "rx",
			header: "RX bps",
			cell: ({ row }) => <span>{formatBps(row.original.rx)}</span>,
			sortingFn: (a, b) => a.original.rx - b.original.rx,
		},
		{
			accessorKey: "tx",
			header: "TX bps",
			cell: ({ row }) => <span>{formatBps(row.original.tx)}</span>,
			sortingFn: (a, b) => a.original.tx - b.original.tx,
		},
		{
			accessorKey: "total",
			header: "Total bps",
			cell: ({ row }) => <span className="font-semibold">{formatBps(row.original.total)}</span>,
			sortingFn: (a, b) => a.original.total - b.original.total,
		},
		{
			accessorKey: "node",
			header: "Node",
			cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.node ?? "-"}</span>,
		},
	], []);

	/* ----------------------------------- UI ----------------------------------- */

	return (
		<div className="border rounded-lg bg-card">
			<div className="p-4 border-b">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold">Network Health</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Spot saturation and top talkers.
						</p>
					</div>
					{isConnected && (
						<div className="flex items-center gap-1.5 text-xs text-green-600">
							<div className="size-2 bg-green-500 rounded-full animate-pulse" />
							Live Data
						</div>
					)}
				</div>
			</div>

			{(connectionState.lastError || discError) && (
				<div className="px-4 pt-4">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							{discError ? `Discovery failed: ${discError}` : `WebSocket error: ${connectionState.lastError}`}
						</AlertDescription>
					</Alert>
				</div>
			)}

			{/* Cards */}
			<div className="p-4">
				<SummaryCards
					cards={cards}
					columns={2}
					loading={loadingDisc}
					error={connectionState.lastError}
					lastUpdated={null}
					noPadding
				/>
			</div>

			{/* Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 pt-0">
				<MetricAreaChart
					title="Cluster Net (24h)"
					subtitle="RX/TX bps — stacked"
					series={clusterNetSeries}
					unit=""
					formatter={formatBps}
					scopeLabel="cluster"
					timespanLabel="24h"
					resolutionLabel="lo"
					stacked
				/>

				<div className="flex items-center justify-between -mb-2">
					<h3 className="text-sm font-medium text-muted-foreground pl-4">Per-Node</h3>
					<div className="pr-4">
						<select
							className="text-xs bg-background border rounded px-2 py-1"
							value={selectedNode || ""}
							onChange={(e) => setSelectedNode(e.target.value)}
						>
							{nodes.map(n => <option key={n.name} value={n.name}>{n.name}</option>)}
						</select>
					</div>
				</div>
				<MetricLineChart
					title={`Throughput (bps) — ${sel ?? "-"}`}
					subtitle="RX/TX bps"
					series={nodeBpsSeries}
					unit=""
					formatter={formatBps}
					scopeLabel={sel ? `node:${sel}` : undefined}
					timespanLabel="24h"
					resolutionLabel="lo"
				/>
				<MetricLineChart
					title={`Packets (pps) — ${sel ?? "-"}`}
					subtitle="RX/TX pps"
					series={nodePpsSeries}
					unit=""
					formatter={formatPps}
					scopeLabel={sel ? `node:${sel}` : undefined}
					timespanLabel="24h"
					resolutionLabel="lo"
				/>
			</div>

			{/* Top Talker Pods */}
			<div className="px-4 pb-4">
				<h3 className="text-sm font-medium text-muted-foreground mb-2">Top Talker Pods</h3>
				<UniversalDataTable
					data={talkers}
					columns={columns}
					enableReorder={false}
					enableRowSelection={false}
					className="px-0 [&_tbody_tr]:bg-background/50"
				/>
				<p className="mt-2 text-xs text-muted-foreground">
					Total bps = RX + TX (latest). Sort to find bandwidth leaders and potential saturators.
				</p>
			</div>
		</div>
	);
}
