/* frontend/src/components/opsview/sections/EphemeralStorageSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import {
	MetricCategoricalBarChart,
	MetricRadialChart,
	type ChartSeries,
} from "@/components/opsview/charts";
import { formatBytesIEC } from "@/lib/metric-utils";
import { AlertTriangle } from "lucide-react";

import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";
import { type ColumnDef } from "@/lib/table";

/* ----------------------------- Types & helpers ----------------------------- */

type NodeEntity = { name: string; role?: string };
type PodEntity = { namespace: string; name: string; node?: string };
type CtrEntity = { namespace: string; pod: string; container: string; node?: string };

type PodEphemeralRow = {
	id: string;              // ns/pod
	name: string;            // ns/pod
	pct: number;             // 0-100
	bytes?: number;
	node?: string;
};

type ContainerRow = {
	id: string;              // ns/pod/container
	ns: string;
	pod: string;
	container: string;
	rootfsBytes: number;
	logsBytes: number;
	sumBytes: number;
	node?: string;
};

const NODE_LIMIT = 200;
const POD_LIMIT = 400;
const CTR_LIMIT = 800;
const EPHEM_THRESHOLD_PCT = 80; // configurable if you want via props

async function discoverNodes(): Promise<NodeEntity[]> {
	const qs = new URLSearchParams(); qs.set("limit", String(NODE_LIMIT));
	const res = await fetch(`/api/v1/timeseries/entities/nodes?${qs.toString()}`);
	if (!res.ok) return [];
	const { entities } = await res.json();
	return (entities ?? []).map((e: any) => ({ name: e.name, role: e.role })) as NodeEntity[];
}

async function discoverPods(): Promise<PodEntity[]> {
	const qs = new URLSearchParams(); qs.set("limit", String(POD_LIMIT));
	const res = await fetch(`/api/v1/timeseries/entities/pods?${qs.toString()}`);
	if (!res.ok) return [];
	const { entities } = await res.json();
	return (entities ?? []).map((e: any) => ({ namespace: e.namespace, name: e.name, node: e.node })) as PodEntity[];
}

async function discoverContainers(): Promise<CtrEntity[]> {
	const qs = new URLSearchParams(); qs.set("limit", String(CTR_LIMIT));
	const res = await fetch(`/api/v1/timeseries/entities/containers?${qs.toString()}`);
	if (!res.ok) return [];
	const { entities } = await res.json();
	// Expecting { namespace, pod, container, node }
	return (entities ?? []).map((e: any) => ({
		namespace: e.namespace,
		pod: e.pod ?? e.podName ?? e.pod_name,
		container: e.container ?? e.name,
		node: e.node,
	})) as CtrEntity[];
}

function latest(arr?: Array<{ t: number; v: number }>) {
	if (!arr?.length) return undefined;
	return arr[arr.length - 1]!.v;
}

function percentile(values: number[], p = 0.9) {
	const arr = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
	if (!arr.length) return Number.POSITIVE_INFINITY;
	const idx = Math.floor(p * (arr.length - 1));
	return arr[idx];
}

/* -------------------------------- Component -------------------------------- */

export default function EphemeralStorageSection() {
	const [nodes, setNodes] = React.useState<NodeEntity[]>([]);
	const [pods, setPods] = React.useState<PodEntity[]>([]);
	const [ctrs, setCtrs] = React.useState<CtrEntity[]>([]);
	const [discError, setDiscError] = React.useState<string | null>(null);
	const [loadingDisc, setLoadingDisc] = React.useState(true);

	React.useEffect(() => {
		let m = true;
		setLoadingDisc(true);
		setDiscError(null);
		Promise.all([discoverNodes(), discoverPods(), discoverContainers()])
			.then(([n, p, c]) => { if (!m) return; setNodes(n); setPods(p); setCtrs(c); })
			.catch(err => { if (!m) return; setDiscError(String(err)); })
			.finally(() => { if (!m) return; setLoadingDisc(false); });
		return () => { m = false; };
	}, []);

	/* ------------------------------ Subscription ------------------------------ */

	// Cluster-level for ImageFS %
	const clusterKeys = React.useMemo(() => [
		"cluster.fs.image.used.bytes",
		"cluster.fs.image.capacity.bytes",
	], []);

	// Per-node storage gauges
	const nodeGaugeBases = React.useMemo(() => [
		"node.fs.used.percent",
		"node.imagefs.used.percent",
		"node.fs.inodes.used.percent",
	], []);

	const nodeKeys = React.useMemo(() => {
		const keys: string[] = [];
		for (const n of nodes) {
			for (const base of nodeGaugeBases) keys.push(`${base}.${n.name}`);
		}
		return keys;
	}, [nodes, nodeGaugeBases]);

	// Pod ephemeral %
	const podKeys = React.useMemo(() => {
		const keys: string[] = [];
		for (const p of pods) {
			keys.push(`pod.ephemeral.used.percent.${p.namespace}.${p.name}`);
			// Optional bytes if you want bars by bytes:
			// keys.push(`pod.ephemeral.used.bytes.${p.namespace}.${p.name}`);
		}
		return keys;
	}, [pods]);

	// Container sizes (rootfs, logs)
	const ctrKeys = React.useMemo(() => {
		const keys: string[] = [];
		for (const c of ctrs) {
			keys.push(`ctr.rootfs.used.bytes.${c.namespace}.${c.pod}.${c.container}`);
			keys.push(`ctr.logs.used.bytes.${c.namespace}.${c.pod}.${c.container}`);
		}
		return keys;
	}, [ctrs]);

	const { seriesData: live, isConnected, connectionState } = useLiveSeriesSubscription(
		"ephemeral-storage",
		[...clusterKeys, ...nodeKeys, ...podKeys, ...ctrKeys],
		{ res: "lo", since: "6h", autoConnect: true }
	);

	/* ---------------------------------- Cards ---------------------------------- */

	const imgUsed = latest(live["cluster.fs.image.used.bytes"]) ?? 0;
	const imgCap = latest(live["cluster.fs.image.capacity.bytes"]) ?? 0;
	const imgPct = imgCap > 0 ? (imgUsed / imgCap) * 100 : 0;

	// Pods over ephemeral threshold
	const podEphemeralRows: PodEphemeralRow[] = React.useMemo(() => {
		const rows: PodEphemeralRow[] = [];
		for (const p of pods) {
			const pct = latest(live[`pod.ephemeral.used.percent.${p.namespace}.${p.name}`]);
			if (pct === undefined) continue;
			rows.push({
				id: `${p.namespace}/${p.name}`,
				name: `${p.namespace}/${p.name}`,
				pct,
				node: p.node,
			});
		}
		// sort desc by pct
		rows.sort((a, b) => b.pct - a.pct);
		return rows;
	}, [pods, live]);

	const podsOverThreshold = podEphemeralRows.filter(r => r.pct >= EPHEM_THRESHOLD_PCT);

	const cards: SummaryCard[] = [
		{
			title: "Cluster ImageFS Utilization",
			value: `${Math.round(imgPct)}%`,
			subtitle: `${formatBytesIEC(imgUsed)} used of ${formatBytesIEC(imgCap)} (ImageFS)`,
			badge: <Badge variant={imgPct >= 85 ? "destructive" : imgPct >= 70 ? "secondary" : "outline"}>
				{imgPct >= 85 ? "Risk" : imgPct >= 70 ? "Watch" : "OK"}
			</Badge>,
			footer: "High ImageFS usage can block image pulls and evict pods.",
		},
		{
			title: `Pods over ${EPHEM_THRESHOLD_PCT}% Ephemeral`,
			value: podsOverThreshold.length.toString(),
			subtitle: podsOverThreshold.length
				? `Examples: ${podsOverThreshold.slice(0, 3).map(r => r.name).join(", ")}`
				: "No pods above threshold",
			badge: <Badge variant={podsOverThreshold.length ? "destructive" : "outline"}>
				{podsOverThreshold.length ? "Action Needed" : "OK"}
			</Badge>,
			footer: "Pods near ephemeral limit may be evicted; check logs & tmp volume growth.",
		},
	];

	/* ---------------------------- Node gauges (grid) ---------------------------- */

	// For each node, show three gauges (RootFS / ImageFS / Inodes) using MetricRadialChart (latest snapshots)
	const nodeGaugeCards = React.useMemo(() => {
		return nodes.map((n) => {
			const rootPct = latest(live[`node.fs.used.percent.${n.name}`]) ?? 0;
			const imagePct = latest(live[`node.imagefs.used.percent.${n.name}`]) ?? 0;
			const inodesPct = latest(live[`node.fs.inodes.used.percent.${n.name}`]) ?? 0;
			const now = Date.now();
			const series: ChartSeries[] = [
				{ key: `root.${n.name}`, name: "RootFS %", color: "#ef4444", data: [[now, rootPct]] },
				{ key: `image.${n.name}`, name: "ImageFS %", color: "#f59e0b", data: [[now, imagePct]] },
				{ key: `inodes.${n.name}`, name: "Inodes %", color: "#10b981", data: [[now, inodesPct]] },
			];
			return { node: n.name, series };
		});
	}, [nodes, live]);

	/* ---------------------- Pod Ephemeral Usage (bar, top N) --------------------- */

	const podBarData = React.useMemo(() => {
		// focus on highest consumers to keep chart readable
		return podEphemeralRows.slice(0, 30).map(r => ({
			name: r.name,
			value: Math.max(0, Math.min(100, r.pct)), // clamp 0..100
		}));
	}, [podEphemeralRows]);

	/* -------------------- Largest Containers (RootFS / Logs) -------------------- */

	const ctrRows: ContainerRow[] = React.useMemo(() => {
		const rows: ContainerRow[] = [];
		for (const c of ctrs) {
			const root = latest(live[`ctr.rootfs.used.bytes.${c.namespace}.${c.pod}.${c.container}`]) ?? 0;
			const logs = latest(live[`ctr.logs.used.bytes.${c.namespace}.${c.pod}.${c.container}`]) ?? 0;
			rows.push({
				id: `${c.namespace}/${c.pod}/${c.container}`,
				ns: c.namespace,
				pod: c.pod,
				container: c.container,
				rootfsBytes: root,
				logsBytes: logs,
				sumBytes: root + logs,
				node: c.node,
			});
		}
		rows.sort((a, b) => b.sumBytes - a.sumBytes);
		return rows;
	}, [ctrs, live]);

	const ctrThresholds = React.useMemo(() => ({
		rootfsBytes: percentile(ctrRows.map(r => r.rootfsBytes)),
		logsBytes: percentile(ctrRows.map(r => r.logsBytes)),
		sumBytes: percentile(ctrRows.map(r => r.sumBytes)),
	}), [ctrRows]);

	const ctrColumns = React.useMemo<ColumnDef<ContainerRow>[]>(() => [
		{
			accessorKey: "ns", header: "Namespace",
			cell: ({ row }) => <span className="text-sm">{row.original.ns}</span>,
			enableHiding: false,
		},
		{
			accessorKey: "pod", header: "Pod",
			cell: ({ row }) => <span className="text-sm font-medium">{row.original.pod}</span>,
			enableHiding: false,
		},
		{
			accessorKey: "container", header: "Container",
			cell: ({ row }) => <span className="text-sm">{row.original.container}</span>,
		},
		{
			accessorKey: "rootfsBytes", header: "RootFS",
			cell: ({ row }) => {
				const v = row.original.rootfsBytes; const hot = v >= ctrThresholds.rootfsBytes;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatBytesIEC(v)}</span>;
			},
			sortingFn: (a, b) => a.original.rootfsBytes - b.original.rootfsBytes,
		},
		{
			accessorKey: "logsBytes", header: "Logs",
			cell: ({ row }) => {
				const v = row.original.logsBytes; const hot = v >= ctrThresholds.logsBytes;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatBytesIEC(v)}</span>;
			},
			sortingFn: (a, b) => a.original.logsBytes - b.original.logsBytes,
		},
		{
			accessorKey: "sumBytes", header: "Sum",
			cell: ({ row }) => {
				const v = row.original.sumBytes; const hot = v >= ctrThresholds.sumBytes;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatBytesIEC(v)}</span>;
			},
			sortingFn: (a, b) => a.original.sumBytes - b.original.sumBytes,
		},
		{
			accessorKey: "node", header: "Node",
			cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.node ?? "-"}</span>,
		},
	], [ctrThresholds]);

	/* ----------------------------------- UI ----------------------------------- */

	return (
		<div className="border rounded-lg bg-card">
			<div className="p-4 border-b">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold">Ephemeral / Storage</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Prevent eviction due to disk pressure and log growth.
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

			{/* Node storage gauges */}
			<div className="p-4 pt-0">
				<h3 className="text-sm font-medium text-muted-foreground mb-2">Node Storage (RootFS / ImageFS / Inodes)</h3>
				<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
					{nodeGaugeCards.map(({ node, series }) => (
						<MetricRadialChart
							key={node}
							title={node}
							subtitle="Latest percent usage"
							series={series}
							unit="%"
							formatter={(v: number) => `${v.toFixed(0)}%`}
							scopeLabel={`node:${node}`}
							timespanLabel="now"
							resolutionLabel="lo"
						/>
					))}
				</div>
			</div>

			{/* Pod ephemeral usage (top offenders) */}
			<div className="grid grid-cols-1 gap-6 p-4 pt-0">
				<MetricCategoricalBarChart
					title="Pod Ephemeral Usage (Top 30)"
					subtitle={`Pods with highest ephemeral usage (threshold ${EPHEM_THRESHOLD_PCT}%).`}
					data={podBarData}
					unit="%"
					formatter={(v: number) => `${v.toFixed(0)}%`}
					layout="horizontal"
					scopeLabel="cluster"
					timespanLabel="now"
					resolutionLabel="lo"
					emptyMessage="No pod ephemeral usage reported."
				/>
			</div>

			{/* Largest containers (RootFS / Logs) */}
			<div className="px-4 pb-4">
				<h3 className="text-sm font-medium text-muted-foreground mb-2">Largest Containers (RootFS / Logs)</h3>
				<UniversalDataTable
					data={ctrRows}
					columns={ctrColumns}
					enableReorder={false}
					enableRowSelection={false}
					className="px-0 [&_tbody_tr]:bg-background/50"
				/>
				<p className="mt-2 text-xs text-muted-foreground">
					Watch for log growth and layer bloat. High ImageFS usage at cluster or node level can cause disk pressure and pod evictions.
				</p>
			</div>
		</div>
	);
}
