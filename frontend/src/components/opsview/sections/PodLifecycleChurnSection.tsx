/* frontend/src/components/opsview/sections/PodLifecycleChurnSection.tsx */

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

/* ----------------------------- Types & utils ----------------------------- */

type NamespaceEntity = {
	id: string;
	name: string;
};

type NsChurnRow = {
	id: string;
	namespace: string;
	createPerHour: number;    // +Δ count over last 1h (per hour)
	terminatePerHour: number; // |−Δ| count over last 1h (per hour)
	restartRate: number;      // latest ns.pods.restarts.rate
};

const NS_LIMIT = 200;

async function discoverNamespaces(): Promise<NamespaceEntity[]> {
	const qs = new URLSearchParams();
	qs.set("limit", String(NS_LIMIT));
	const res = await fetch(`/api/v1/timeseries/entities/namespaces?${qs.toString()}`);
	if (!res.ok) return [];
	const { entities } = await res.json();
	return (entities ?? []).map((e: any) => ({ id: e.name, name: e.name })) as NamespaceEntity[];
}

function latest(arr?: Array<{ t: number; v: number }>) {
	if (!arr?.length) return undefined;
	return arr[arr.length - 1]!.v;
}

function sumAbsDeltasInWindow(
	arr: Array<{ t: number; v: number }> | undefined,
	windowMs: number,
): { pos: number; neg: number } {
	if (!arr || arr.length < 2) return { pos: 0, neg: 0 };
	const cutoff = Date.now() - windowMs;
	let pos = 0, neg = 0;
	for (let i = 1; i < arr.length; i++) {
		const a = arr[i - 1], b = arr[i];
		if (b.t < cutoff) continue;
		const d = (b.v ?? 0) - (a.v ?? 0);
		if (d > 0) pos += d;
		else if (d < 0) neg += -d;
	}
	return { pos, neg };
}

const formatInt = (n: number) => Math.round(n).toString();
const formatRate = (n: number) => n.toFixed(n >= 10 ? 0 : 1);
const formatPct0 = (n: number) => `${Math.round(n)}%`;

/* -------------------------------- Component ------------------------------- */

export default function PodLifecycleChurnSection() {
	const [namespaces, setNamespaces] = React.useState<NamespaceEntity[]>([]);
	const [loadingNs, setLoadingNs] = React.useState(true);
	const [nsError, setNsError] = React.useState<string | null>(null);

	// Discover namespaces once
	React.useEffect(() => {
		let mounted = true;
		setLoadingNs(true);
		discoverNamespaces()
			.then(list => { if (mounted) setNamespaces(list); })
			.catch(err => { if (mounted) setNsError(String(err)); })
			.finally(() => { if (mounted) setLoadingNs(false); });
		return () => { mounted = false; };
	}, []);

	/* --------------------------- Subscription keys --------------------------- */

	const clusterKeys = React.useMemo(() => [
		"cluster.pods.running",
		"cluster.pods.pending",
		"cluster.pods.restarts.rate",
	], []);

	const nsBases = React.useMemo(() => [
		"ns.pods.running",
		"ns.pods.restarts.rate",
	], []);

	const nsKeys = React.useMemo(() => {
		const keys: string[] = [];
		for (const ns of namespaces) {
			for (const base of nsBases) keys.push(`${base}.${ns.name}`);
		}
		return keys;
	}, [namespaces, nsBases]);

	// 24h window so we can chart trends; we’ll compute 1h deltas from within this window
	const { seriesData: live, isConnected, connectionState } = useLiveSeriesSubscription(
		"pod-lifecycle-churn",
		[...clusterKeys, ...nsKeys],
		{ res: "lo", since: "24h", autoConnect: true }
	);

	/* ---------------------------------- Cards --------------------------------- */

	const running = Math.round(latest(live["cluster.pods.running"]) || 0);
	const pending = Math.round(latest(live["cluster.pods.pending"]) || 0);

	// Churn Score: rolling absolute delta sum over the last 1h on cluster.pods.running
	const clusterRunningArr = live["cluster.pods.running"] || [];
	const { pos: churnPos, neg: churnNeg } = sumAbsDeltasInWindow(clusterRunningArr, 60 * 60 * 1000);
	const churnScore = Math.round(churnPos + churnNeg);

	const cards: SummaryCard[] = [
		{
			title: "Pods Running",
			value: formatInt(running),
			subtitle: `${running} running pod${running === 1 ? "" : "s"}`,
			badge: <Badge variant="secondary">Cluster</Badge>,
			footer: "Current running pods in cluster.",
		},
		{
			title: "Pods Pending",
			value: formatInt(pending),
			subtitle: `${pending} pending pod${pending === 1 ? "" : "s"}`,
			badge: <Badge variant={pending ? "destructive" : "outline"}>{pending ? "Investigate" : "OK"}</Badge>,
			footer: "Awaiting scheduling/resources.",
		},
		{
			title: "Churn Score (1h)",
			value: formatInt(churnScore),
			subtitle: "Sum of abs(Δ running) over last 1h",
			badge: <Badge variant={churnScore > 0 ? "secondary" : "outline"}>Derived</Badge>,
			footer: "Higher = more rapid create/terminate activity.",
		},
	];

	/* --------------------------------- Charts --------------------------------- */

	// Running vs Pending (combined in one Area chart)
	const runningSeries: ChartSeries = {
		key: "cluster.pods.running",
		name: "Running",
		color: "#3b82f6",
		data: (live["cluster.pods.running"] || []).map(p => [p.t, p.v]),
	};
	const pendingSeries: ChartSeries = {
		key: "cluster.pods.pending",
		name: "Pending",
		color: "#f59e0b",
		data: (live["cluster.pods.pending"] || []).map(p => [p.t, p.v]),
	};

	const restartsSeries: ChartSeries[] = React.useMemo(() => ([
		{
			key: "cluster.pods.restarts.rate",
			name: "Restart Rate",
			color: "#ef4444",
			data: (live["cluster.pods.restarts.rate"] || []).map(p => [p.t, p.v]),
		}
	]), [live]);

	/* ------------------------- High-Churn Namespaces table ------------------------- */

	const nsRows: NsChurnRow[] = React.useMemo(() => {
		const rows: NsChurnRow[] = [];
		for (const ns of namespaces) {
			const runArr = live[`ns.pods.running.${ns.name}`] || [];
			const rrArr = live[`ns.pods.restarts.rate.${ns.name}`] || [];

			const { pos, neg } = sumAbsDeltasInWindow(runArr, 60 * 60 * 1000);
			const restartRate = latest(rrArr) ?? 0;

			rows.push({
				id: ns.name,
				namespace: ns.name,
				// Interpret “Δ count over window” as create/terminate counts per hour
				createPerHour: pos,
				terminatePerHour: neg,
				restartRate,
			});
		}
		// Sort by creates desc as default signal
		rows.sort((a, b) => b.createPerHour - a.createPerHour);
		return rows;
	}, [namespaces, live]);

	// 90th percentile thresholds for highlight
	function percentile(values: number[], p = 0.9) {
		const arr = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
		if (!arr.length) return Number.POSITIVE_INFINITY;
		const idx = Math.floor(p * (arr.length - 1));
		return arr[idx];
	}

	const thresholds = React.useMemo(() => ({
		createPerHour: percentile(nsRows.map(r => r.createPerHour)),
		terminatePerHour: percentile(nsRows.map(r => r.terminatePerHour)),
		restartRate: percentile(nsRows.map(r => r.restartRate)),
	}), [nsRows]);

	const columns = React.useMemo<ColumnDef<NsChurnRow>[]>(() => [
		{
			accessorKey: "namespace",
			header: "Namespace",
			cell: ({ row }) => <span className="font-medium text-sm">{row.original.namespace}</span>,
			enableHiding: false,
		},
		{
			accessorKey: "createPerHour",
			header: "Create / h",
			cell: ({ row }) => {
				const v = row.original.createPerHour;
				const hot = v >= thresholds.createPerHour;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatInt(v)}</span>;
			},
			sortingFn: (a, b) => a.original.createPerHour - b.original.createPerHour,
		},
		{
			accessorKey: "terminatePerHour",
			header: "Terminate / h",
			cell: ({ row }) => {
				const v = row.original.terminatePerHour;
				const hot = v >= thresholds.terminatePerHour;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatInt(v)}</span>;
			},
			sortingFn: (a, b) => a.original.terminatePerHour - b.original.terminatePerHour,
		},
		{
			accessorKey: "restartRate",
			header: "Restart rate",
			cell: ({ row }) => {
				const v = row.original.restartRate;
				const hot = v >= thresholds.restartRate;
				return <span className={hot ? "font-semibold text-red-600" : ""}>{formatRate(v)}</span>;
			},
			sortingFn: (a, b) => a.original.restartRate - b.original.restartRate,
		},
	], [thresholds]);

	/* ---------------------------------- UI ---------------------------------- */

	return (
		<>

			{(connectionState.lastError || nsError) && (
				<div className="px-4 pt-4">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							{nsError ? `Namespace discovery failed: ${nsError}` : `WebSocket error: ${connectionState.lastError}`}
						</AlertDescription>
					</Alert>
				</div>
			)}

			{/* Cards */}
			<div className="p-4">
				<SummaryCards
					cards={cards}
					columns={3}
					loading={loadingNs}
					error={connectionState.lastError}
					lastUpdated={null}
					noPadding
				/>
			</div>

			{/* Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 pt-0">
				<MetricAreaChart
					title="Running vs Pending (24h)"
					subtitle="Cluster pod counts over time"
					series={[runningSeries, pendingSeries]}
					unit=""
					formatter={(v: number) => v.toFixed(0)}
					scopeLabel="cluster"
					timespanLabel="24h"
					resolutionLabel="lo"
					stacked={false}
				/>

				<MetricLineChart
					title="Restart Rate (24h)"
					subtitle="Cluster pod restart rate"
					series={restartsSeries}
					unit=""
					formatter={(v: number) => v.toFixed(v >= 10 ? 0 : 2)}
					scopeLabel="cluster"
					timespanLabel="24h"
					resolutionLabel="lo"
				/>
			</div>

			{/* High-Churn Namespaces */}
			<div className="px-4 pb-4">
				<h3 className="text-sm font-medium text-muted-foreground mb-2">High-Churn Namespaces</h3>
				<UniversalDataTable
					data={nsRows}
					columns={columns}
					enableReorder={false}
					enableRowSelection={false}
					className="px-0 [&_tbody_tr]:bg-background/50"
				/>
				<p className="mt-2 text-xs text-muted-foreground">
					Create/Terminate rates are estimated from positive/negative changes in running pod counts over the last hour.
					Restart rate is the latest reported value per namespace.
				</p>
			</div>
		</>
	);
}
