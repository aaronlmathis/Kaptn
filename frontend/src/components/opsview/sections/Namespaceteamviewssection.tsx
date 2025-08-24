/* frontend/src/components/opsview/sections/NamespaceTeamViewsSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import {
	MetricLineChart,
	MetricStackedBarChart,
	type ChartSeries,
} from "@/components/opsview/charts";
import { formatBytesIEC, formatCores } from "@/lib/metric-utils";
import { AlertTriangle } from "lucide-react";

import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";
import { type ColumnDef } from "@/lib/table";

/* ----------------------------- Types & helpers ----------------------------- */

type NamespaceEntity = { name: string };
type PodEntity = { namespace: string; name: string; node?: string };

type WorkloadRow = {
	id: string;
	pod: string;
	cpuUsed: number;
	cpuReq: number;
	cpuLimit: number;
	memWS: number;
	memReq: number;
	memLimit: number;
	restartsRate: number;
	ephemeralPct?: number;
	node?: string;
};

const NS_LIMIT = 200;
const POD_LIMIT_PER_NS = 300;

async function discoverNamespaces(): Promise<NamespaceEntity[]> {
	const qs = new URLSearchParams(); qs.set("limit", String(NS_LIMIT));
	const res = await fetch(`/api/v1/timeseries/entities/namespaces?${qs.toString()}`);
	if (!res.ok) return [];
	const { entities } = await res.json();
	return (entities ?? []).map((e: any) => ({ name: e.name })) as NamespaceEntity[];
}

async function discoverPods(ns: string): Promise<PodEntity[]> {
	const qs = new URLSearchParams();
	qs.set("namespace", ns);
	qs.set("limit", String(POD_LIMIT_PER_NS));
	const res = await fetch(`/api/v1/timeseries/entities/pods?${qs.toString()}`);
	if (!res.ok) return [];
	const { entities } = await res.json();
	return (entities ?? []).map((e: any) => ({
		namespace: e.namespace, name: e.name, node: e.node,
	})) as PodEntity[];
}

function latest(arr?: Array<{ t: number; v: number }>) {
	if (!arr?.length) return undefined;
	return arr[arr.length - 1]!.v;
}

const int0 = (n: number) => Math.round(n).toString();

/* -------------------------------- Component -------------------------------- */

export default function NamespaceTeamViewsSection() {
	const [namespaces, setNamespaces] = React.useState<NamespaceEntity[]>([]);
	const [selectedNs, setSelectedNs] = React.useState<string | null>(null);
	const [nsPods, setNsPods] = React.useState<PodEntity[]>([]);
	const [discError, setDiscError] = React.useState<string | null>(null);
	const [loadingDisc, setLoadingDisc] = React.useState(true);

	// Discover namespaces
	React.useEffect(() => {
		let m = true;
		setLoadingDisc(true);
		setDiscError(null);
		discoverNamespaces()
			.then(list => {
				if (!m) return;
				setNamespaces(list);
				if (!selectedNs && list.length) setSelectedNs(list[0].name);
			})
			.catch(err => { if (m) setDiscError(String(err)); })
			.finally(() => { if (m) setLoadingDisc(false); });
		return () => { m = false; };
	}, []);

	// Discover pods for selected namespace
	React.useEffect(() => {
		if (!selectedNs) return;
		let m = true;
		setLoadingDisc(true);
		discoverPods(selectedNs)
			.then(list => { if (m) setNsPods(list); })
			.catch(err => { if (m) setDiscError(String(err)); })
			.finally(() => { if (m) setLoadingDisc(false); });
		return () => { m = false; };
	}, [selectedNs]);

	/* ------------------------------ Subscriptions ------------------------------ */

	// Namespace-level metrics across ALL namespaces (for allocation posture bars)
	const nsBasesAll = React.useMemo(() => [
		"ns.cpu.used.cores",
		"ns.cpu.request.cores",
		"ns.cpu.limit.cores",
		"ns.mem.used.bytes",
		"ns.mem.request.bytes",
		"ns.mem.limit.bytes",
		"ns.pods.running",
		"ns.pods.restarts.rate",
	], []);

	const nsKeysAll = React.useMemo(() => {
		const keys: string[] = [];
		for (const ns of namespaces) {
			for (const base of nsBasesAll) keys.push(`${base}.${ns.name}`);
		}
		return keys;
	}, [namespaces, nsBasesAll]);

	// Selected namespace trend keys (same as above; 24h window)
	const since = "24h";

	// Pod-level keys (only for selected namespace, to avoid explosion)
	const podBases = React.useMemo(() => [
		"pod.cpu.usage.cores",
		"pod.cpu.request.cores",
		"pod.cpu.limit.cores",
		"pod.mem.working_set.bytes",
		"pod.mem.request.bytes",
		"pod.mem.limit.bytes",
		"pod.restarts.rate",
		"pod.ephemeral.used.percent",
	], []);

	const podKeys = React.useMemo(() => {
		const keys: string[] = [];
		for (const p of nsPods) {
			for (const base of podBases) keys.push(`${base}.${p.namespace}.${p.name}`);
		}
		return keys;
	}, [nsPods, podBases]);

	// Subscribe once for both groups
	const { seriesData: live, isConnected, connectionState } = useLiveSeriesSubscription(
		"namespace-team-views",
		[...nsKeysAll, ...podKeys],
		{ res: "lo", since, autoConnect: true }
	);

	/* ---------------------------------- Cards ---------------------------------- */

	const sel = selectedNs || "";
	const cpuUsed = latest(live[`ns.cpu.used.cores.${sel}`]) ?? 0;
	const cpuReq = latest(live[`ns.cpu.request.cores.${sel}`]) ?? 0;
	const cpuLimit = latest(live[`ns.cpu.limit.cores.${sel}`]) ?? 0;

	const memUsed = latest(live[`ns.mem.used.bytes.${sel}`]) ?? 0;
	const memReq = latest(live[`ns.mem.request.bytes.${sel}`]) ?? 0;
	const memLimit = latest(live[`ns.mem.limit.bytes.${sel}`]) ?? 0;

	const podsRun = Math.round(latest(live[`ns.pods.running.${sel}`]) ?? 0);
	const rrNs = latest(live[`ns.pods.restarts.rate.${sel}`]) ?? 0;

	const cards: SummaryCard[] = [
		{
			title: "CPU Used / Request / Limit",
			value: `${formatCores(cpuUsed)} / ${formatCores(cpuReq)} / ${formatCores(cpuLimit)}`,
			subtitle: selectedNs ? `Namespace: ${selectedNs}` : "Select a namespace",
			badge: <Badge variant="secondary">CPU</Badge>,
			footer: "Cores (used vs. capacity targets).",
		},
		{
			title: "Mem Used / Request / Limit",
			value: `${formatBytesIEC(memUsed)} / ${formatBytesIEC(memReq)} / ${formatBytesIEC(memLimit)}`,
			subtitle: selectedNs ? `Namespace: ${selectedNs}` : "Select a namespace",
			badge: <Badge variant="secondary">Memory</Badge>,
			footer: "Bytes (working set vs. requests/limits).",
		},
		{
			title: "Pods Running",
			value: int0(podsRun),
			subtitle: selectedNs ? `${podsRun} running` : "—",
			badge: <Badge variant="secondary">Pods</Badge>,
			footer: "Current running pods in namespace.",
		},
		{
			title: "Restart Rate",
			value: rrNs.toFixed(rrNs >= 10 ? 0 : 2),
			subtitle: selectedNs ? "Pods restart rate" : "—",
			badge: <Badge variant={rrNs > 0 ? "destructive" : "outline"}>{rrNs > 0 ? "Investigate" : "OK"}</Badge>,
			footer: "Elevated restarts may indicate instability.",
		},
	];

	/* --------------------------------- Charts --------------------------------- */

	// Two lines: CPU cores & Memory bytes (separate charts; dual-axis not supported in current lib)
	const cpuSeries: ChartSeries[] = React.useMemo(() => [{
		key: `ns.cpu.used.cores.${sel}`,
		name: "CPU Used (cores)",
		color: "#3b82f6",
		data: (live[`ns.cpu.used.cores.${sel}`] || []).map(p => [p.t, p.v]),
	}], [sel, live]);

	const memSeries: ChartSeries[] = React.useMemo(() => [{
		key: `ns.mem.used.bytes.${sel}`,
		name: "Mem Used (bytes)",
		color: "#06b6d4",
		data: (live[`ns.mem.used.bytes.${sel}`] || []).map(p => [p.t, p.v]),
	}], [sel, live]);

	// Allocation Posture (stacked bars) across namespaces
	const cpuAllocData = React.useMemo(() => {
		return namespaces.map(ns => ({
			name: ns.name,
			Used: latest(live[`ns.cpu.used.cores.${ns.name}`]) ?? 0,
			Request: latest(live[`ns.cpu.request.cores.${ns.name}`]) ?? 0,
			Limit: latest(live[`ns.cpu.limit.cores.${ns.name}`]) ?? 0,
		}));
	}, [namespaces, live]);

	const memAllocData = React.useMemo(() => {
		return namespaces.map(ns => ({
			name: ns.name,
			Used: latest(live[`ns.mem.used.bytes.${ns.name}`]) ?? 0,
			Request: latest(live[`ns.mem.request.bytes.${ns.name}`]) ?? 0,
			Limit: latest(live[`ns.mem.limit.bytes.${ns.name}`]) ?? 0,
		}));
	}, [namespaces, live]);

	/* ------------------------------- Workloads -------------------------------- */

	const workloadRows: WorkloadRow[] = React.useMemo(() => {
		const rows: WorkloadRow[] = [];
		for (const p of nsPods) {
			const cpuUsed = latest(live[`pod.cpu.usage.cores.${p.namespace}.${p.name}`]) ?? 0;
			const cpuReq = latest(live[`pod.cpu.request.cores.${p.namespace}.${p.name}`]) ?? 0;
			const cpuLim = latest(live[`pod.cpu.limit.cores.${p.namespace}.${p.name}`]) ?? 0;

			const memWS = latest(live[`pod.mem.working_set.bytes.${p.namespace}.${p.name}`]) ?? 0;
			const memReq = latest(live[`pod.mem.request.bytes.${p.namespace}.${p.name}`]) ?? 0;
			const memLim = latest(live[`pod.mem.limit.bytes.${p.namespace}.${p.name}`]) ?? 0;

			const restR = latest(live[`pod.restarts.rate.${p.namespace}.${p.name}`]) ?? 0;
			const ephPct = latest(live[`pod.ephemeral.used.percent.${p.namespace}.${p.name}`]);

			rows.push({
				id: `${p.namespace}/${p.name}`,
				pod: p.name,
				cpuUsed, cpuReq, cpuLimit: cpuLim,
				memWS, memReq, memLimit: memLim,
				restartsRate: restR,
				ephemeralPct: ephPct,
				node: p.node,
			});
		}
		// Default sort: highest restart rate, then memory WS
		rows.sort((a, b) => (b.restartsRate - a.restartsRate) || (b.memWS - a.memWS));
		return rows;
	}, [nsPods, live]);

	const columns = React.useMemo<ColumnDef<WorkloadRow>[]>(() => [
		{
			accessorKey: "pod",
			header: "Pod",
			cell: ({ row }) => <span className="text-sm font-medium">{row.original.pod}</span>,
			enableHiding: false,
		},
		{
			accessorKey: "cpuUsed",
			header: "CPU Used",
			cell: ({ row }) => <span>{formatCores(row.original.cpuUsed)}</span>,
			sortingFn: (a, b) => a.original.cpuUsed - b.original.cpuUsed,
		},
		{
			accessorKey: "cpuReq",
			header: "CPU Req / Lim",
			cell: ({ row }) => <span>{formatCores(row.original.cpuReq)} / {formatCores(row.original.cpuLimit)}</span>,
			sortingFn: (a, b) => (a.original.cpuReq + a.original.cpuLimit) - (b.original.cpuReq + b.original.cpuLimit),
		},
		{
			accessorKey: "memWS",
			header: "Mem WS",
			cell: ({ row }) => <span>{formatBytesIEC(row.original.memWS)}</span>,
			sortingFn: (a, b) => a.original.memWS - b.original.memWS,
		},
		{
			accessorKey: "memReq",
			header: "Mem Req / Lim",
			cell: ({ row }) => <span>{formatBytesIEC(row.original.memReq)} / {formatBytesIEC(row.original.memLimit)}</span>,
			sortingFn: (a, b) => (a.original.memReq + a.original.memLimit) - (b.original.memReq + b.original.memLimit),
		},
		{
			accessorKey: "restartsRate",
			header: "Restart rate",
			cell: ({ row }) => {
				const v = row.original.restartsRate;
				return <span className={v > 0 ? "font-semibold text-red-600" : ""}>{v.toFixed(v >= 10 ? 0 : 2)}</span>;
			},
			sortingFn: (a, b) => a.original.restartsRate - b.original.restartsRate,
		},
		{
			accessorKey: "ephemeralPct",
			header: "Ephemeral %",
			cell: ({ row }) => {
				const v = row.original.ephemeralPct;
				return v === undefined ? <span className="text-muted-foreground">—</span> : <span>{Math.round(v)}%</span>;
			},
			sortingFn: (a, b) => (a.original.ephemeralPct ?? 0) - (b.original.ephemeralPct ?? 0),
		},
		{
			accessorKey: "node",
			header: "Node",
			cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.node ?? "-"}</span>,
		},
	], []);

	/* ----------------------------------- UI ----------------------------------- */

	return (
	<>
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

			{/* Namespace selector + Cards */}
			<div className="p-4 pt-3">
  <div className="flex items-center justify-end mb-3 space-x-2">
					<div className="text-sm text-muted-foreground">Selected namespace</div>
					<select
						className="text-xs bg-background border rounded px-2 py-1"
						value={selectedNs || ""}
						onChange={(e) => setSelectedNs(e.target.value)}
					>
						{namespaces.map(ns => (
							<option key={ns.name} value={ns.name}>{ns.name}</option>
						))}
					</select>
				</div>

				<SummaryCards
					cards={cards}
					columns={4}
					loading={loadingDisc}
					error={connectionState.lastError}
					lastUpdated={null}
					noPadding
				/>
			</div>

			{/* Trends: CPU + Memory (selected namespace) */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 pt-0">
				<MetricLineChart
					title={`CPU (cores) — ${selectedNs ?? "-"}`}
					subtitle="Namespace CPU usage"
					series={cpuSeries}
					unit="cores"
					formatter={formatCores}
					scopeLabel={selectedNs ? `ns:${selectedNs}` : undefined}
					timespanLabel="24h"
					resolutionLabel="lo"
				/>
				<MetricLineChart
					title={`Memory (bytes) — ${selectedNs ?? "-"}`}
					subtitle="Namespace memory working set"
					series={memSeries}
					unit="bytes"
					formatter={formatBytesIEC}
					scopeLabel={selectedNs ? `ns:${selectedNs}` : undefined}
					timespanLabel="24h"
					resolutionLabel="lo"
				/>
			</div>

			{/* Allocation posture across namespaces */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 pt-0">
				<MetricStackedBarChart
					title="CPU Allocation Posture (by Namespace)"
					subtitle="Used vs Request vs Limit"
					data={cpuAllocData}
					dataKeys={["Used", "Request", "Limit"]}
					unit="cores"
					formatter={formatCores}
					layout="vertical"
					scopeLabel="cluster"
					timespanLabel="now"
					resolutionLabel="lo"
				/>
				<MetricStackedBarChart
					title="Memory Allocation Posture (by Namespace)"
					subtitle="Used vs Request vs Limit"
					data={memAllocData}
					dataKeys={["Used", "Request", "Limit"]}
					unit="bytes"
					formatter={formatBytesIEC}
					layout="vertical"
					scopeLabel="cluster"
					timespanLabel="now"
					resolutionLabel="lo"
				/>
			</div>

			{/* Workloads in Namespace */}
			<div className="px-4 pb-4">
				<h3 className="text-sm font-medium text-muted-foreground mb-2">Workloads in Namespace</h3>
				<UniversalDataTable
					data={workloadRows}
					columns={columns}
					enableReorder={false}
					enableRowSelection={false}
					className="px-0 [&_tbody_tr]:bg-background/50"
				/>
				<p className="mt-2 text-xs text-muted-foreground">
					CPU shown in cores; Memory in bytes. Restart rate and Ephemeral % use latest values per pod.
				</p>
			</div>
		</>
	);
}
