/* frontend/src/components/opsview/sections/OverLimitsThrottlingSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import {
	MetricCategoricalBarChart,
	MetricLineChart,
	type ChartSeries,
} from "@/components/opsview/charts";
import { formatCores } from "@/lib/metric-utils";
import { AlertTriangle, ExternalLink } from "lucide-react";

/**
 * Over-Limits / Throttling
 * - CPU over-limit: pod.cpu.usage.cores > pod.cpu.limit.cores (when limit exists)
 * - Memory near-limit: pod.mem.working_set.bytes / pod.mem.limit.bytes > 0.9 (when limit exists)
 */

type DiscoveredPod = {
	id: string;         // "ns/pod"
	name: string;       // "pod"
	namespace: string;  // "ns"
	node?: string;
	status?: string;
};

type Offender = {
	id: string;
	namespace: string;
	pod: string;
	value: number;  // cores delta for CPU; ratio (0..1+) for memory
	usage?: number;
	limit?: number;
};

const POD_LIMIT = 120; // safeguard: cap subscriptions to avoid series explosion

async function discoverPods(namespace?: string): Promise<DiscoveredPod[]> {
	const qs = new URLSearchParams();
	if (namespace && namespace !== "all") qs.set("namespace", namespace);
	qs.set("limit", String(POD_LIMIT));
	const res = await fetch(`/api/v1/timeseries/entities/pods?${qs.toString()}`);
	if (!res.ok) return [];
	const { entities } = await res.json();
	return (entities ?? []).map((e: any) => ({
		id: `${e.namespace}/${e.name}`,
		name: e.name,
		namespace: e.namespace,
		status: e.status,
		node: e.node,
	})) as DiscoveredPod[];
}

function buildPodKeys(pods: DiscoveredPod[], bases: string[]): string[] {
	const keys: string[] = [];
	for (const p of pods) {
		for (const base of bases) {
			keys.push(`${base}.${p.namespace}.${p.name}`);
		}
	}
	return keys;
}

function latest(series: Array<{ t: number; v: number }> | undefined) {
	if (!series || series.length === 0) return undefined;
	return series[series.length - 1]!.v;
}

export default function OverLimitsThrottlingSection(props: { namespace?: string }) {
	const namespace = props.namespace ?? "all";

	const [pods, setPods] = React.useState<DiscoveredPod[]>([]);
	const [loadingPods, setLoadingPods] = React.useState(true);
	const [podError, setPodError] = React.useState<string | null>(null);

	React.useEffect(() => {
		let mounted = true;
		setLoadingPods(true);
		setPodError(null);
		discoverPods(namespace)
			.then(list => { if (mounted) setPods(list); })
			.catch(err => { if (mounted) setPodError(String(err)); })
			.finally(() => { if (mounted) setLoadingPods(false); });
		return () => { mounted = false; };
	}, [namespace]);

	// Build series keys for the discovered pods
	const neededBases = React.useMemo(
		() => [
			"pod.cpu.usage.cores",
			"pod.cpu.limit.cores",
			"pod.mem.working_set.bytes",
			"pod.mem.limit.bytes",
			// Optional proxy signal for stress (not charted here but handy to have):
			"pod.restarts.rate",
		],
		[]
	);

	const podKeys = React.useMemo(() => buildPodKeys(pods, neededBases), [pods, neededBases]);

	const { seriesData: live, isConnected, connectionState } = useLiveSeriesSubscription(
		"over-limits-throttling",
		podKeys,
		{ res: "lo", since: "15m", autoConnect: true }
	);

	// ---------- Derivations (latest snapshot) ----------
	const cpuOver: Offender[] = [];
	const memNear: Offender[] = [];

	for (const p of pods) {
		const usage = latest(live[`pod.cpu.usage.cores.${p.namespace}.${p.name}`]);
		const cpuLimit = latest(live[`pod.cpu.limit.cores.${p.namespace}.${p.name}`]);
		const ws = latest(live[`pod.mem.working_set.bytes.${p.namespace}.${p.name}`]);
		const memLimit = latest(live[`pod.mem.limit.bytes.${p.namespace}.${p.name}`]);

		// CPU over-limit when limit exists and usage > limit
		if (cpuLimit && cpuLimit > 0 && usage !== undefined && usage > cpuLimit) {
			cpuOver.push({
				id: `${p.namespace}/${p.name}`,
				namespace: p.namespace,
				pod: p.name,
				value: usage - cpuLimit, // Δ cores
				usage,
				limit: cpuLimit,
			});
		}

		// Memory near-limit when limit exists and working_set / limit > 0.9
		if (memLimit && memLimit > 0 && ws !== undefined) {
			const ratio = ws / memLimit;
			if (ratio > 0.9) {
				memNear.push({
					id: `${p.namespace}/${p.name}`,
					namespace: p.namespace,
					pod: p.name,
					value: ratio, // ratio 0..1+
					usage: ws,
					limit: memLimit,
				});
			}
		}
	}

	cpuOver.sort((a, b) => b.value - a.value);
	memNear.sort((a, b) => b.value - a.value);

	// ---------- Cards ----------
	const summaryCards: SummaryCard[] = [
		{
			title: "Pods Over CPU Limit",
			value: cpuOver.length,
			subtitle:
				cpuOver.length > 0
					? `${Math.min(cpuOver.length, 3)} sample offender(s): ${cpuOver.slice(0, 3).map(o => `${o.namespace}/${o.pod}`).join(", ")}`
					: "No pods currently exceeding CPU limits",
			badge: <Badge variant={cpuOver.length ? "destructive" : "outline"}>{cpuOver.length ? "Action Needed" : "OK"}</Badge>,
			footer: "Computed as usage.cores > limit.cores (when limit exists). Consider lowering workload or raising limit.",
		},
		{
			title: "Pods Near Memory Limit",
			value: memNear.length,
			subtitle:
				memNear.length > 0
					? `${Math.min(memNear.length, 3)} sample offender(s): ${memNear.slice(0, 3).map(o => `${o.namespace}/${o.pod}`).join(", ")}`
					: "No pods near memory limits",
			badge: <Badge variant={memNear.length ? "destructive" : "outline"}>{memNear.length ? "> 90% of limit" : "OK"}</Badge>,
			footer: "Computed as working_set.bytes / mem.limit.bytes > 0.9 (when limit exists). Watch for OOM risk.",
		},
	];

	// ---------- Snapshot charts (categorical) ----------
	const cpuOverBarData = React.useMemo(() => {
		return cpuOver
			.slice(0, 25)
			.map(o => ({ name: `${o.namespace}/${o.pod}`, value: o.value }));
	}, [cpuOver]);

	const memPressureBarData = React.useMemo(() => {
		return memNear
			.slice(0, 25)
			.map(o => ({
				name: `${o.namespace}/${o.pod}`,
				value: Math.min(o.value, 2) * 100, // cap at 200% to keep axis sane
			}));
	}, [memNear]);

	// ---------- Trend lines: counts over time ----------
	// Build a sorted timestamp set from relevant metrics.
	const cpuTimestamps = React.useMemo(() => {
		const s = new Set<number>();
		for (const k of Object.keys(live)) {
			if (k.startsWith("pod.cpu.usage.cores.")) {
				for (const pt of live[k] ?? []) s.add(pt.t);
			}
		}
		return Array.from(s).sort((a, b) => a - b);
	}, [live]);

	const memTimestamps = React.useMemo(() => {
		const s = new Set<number>();
		for (const k of Object.keys(live)) {
			if (k.startsWith("pod.mem.working_set.bytes.")) {
				for (const pt of live[k] ?? []) s.add(pt.t);
			}
		}
		return Array.from(s).sort((a, b) => a - b);
	}, [live]);

	const overLimitCountSeries: ChartSeries[] = React.useMemo(() => {
		const data: [number, number][] = cpuTimestamps.map((t) => {
			let count = 0;
			for (const p of pods) {
				const uArr = live[`pod.cpu.usage.cores.${p.namespace}.${p.name}`] || [];
				const lArr = live[`pod.cpu.limit.cores.${p.namespace}.${p.name}`] || [];
				const u = uArr.find(pt => pt.t === t)?.v;
				const l = lArr.find(pt => pt.t === t)?.v;
				if (l && l > 0 && u !== undefined && u > l) count++;
			}
			return [t, count];
		});
		return [{ key: "count.cpu.overlimit", name: "Pods Over CPU Limit", color: "#ef4444", data }];
	}, [cpuTimestamps, pods, live]);

	const memNearCountSeries: ChartSeries[] = React.useMemo(() => {
		const data: [number, number][] = memTimestamps.map((t) => {
			let count = 0;
			for (const p of pods) {
				const wsArr = live[`pod.mem.working_set.bytes.${p.namespace}.${p.name}`] || [];
				const limArr = live[`pod.mem.limit.bytes.${p.namespace}.${p.name}`] || [];
				const ws = wsArr.find(pt => pt.t === t)?.v;
				const lim = limArr.find(pt => pt.t === t)?.v;
				if (lim && lim > 0 && ws !== undefined && ws / lim > 0.9) count++;
			}
			return [t, count];
		});
		return [{ key: "count.mem.near", name: "Pods ≥90% Mem Limit", color: "#f59e0b", data }];
	}, [memTimestamps, pods, live]);

	return (
		<div className="border rounded-lg bg-card">
			<div className="p-4 border-b">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold">Over-Limits / Throttling</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Catch workloads hitting ceilings. CPU over-limit and memory near-limit signals derived per pod.
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

			{(connectionState.lastError || podError) && (
				<div className="px-4 pt-4">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							{podError ? `Pod discovery failed: ${podError}` : `WebSocket error: ${connectionState.lastError}`}
						</AlertDescription>
					</Alert>
				</div>
			)}

			<div className="p-4">
				<SummaryCards
					cards={summaryCards}
					columns={2}
					loading={loadingPods}
					error={connectionState.lastError}
					lastUpdated={null}
					noPadding
				/>
			</div>

			{/* Snapshot offenders */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 pt-0">
				<MetricCategoricalBarChart
					title="CPU Over-Limit (Δ cores by pod)"
					subtitle="Latest difference where usage exceeds limit. Only pods currently over limit are shown."
					data={cpuOverBarData}
					unit="cores"
					formatter={formatCores}
					layout="horizontal"
					scopeLabel={namespace === "all" ? "cluster" : `ns:${namespace}`}
					timespanLabel="now"
					resolutionLabel="lo"
					emptyMessage="No pods currently exceeding CPU limits."
				/>

				<MetricCategoricalBarChart
					title="Memory Pressure (Working Set / Limit)"
					subtitle="Pods above 90% of memory limit. Higher bars indicate greater OOM risk."
					data={memPressureBarData}
					unit="%"
					formatter={(v: number) => `${v.toFixed(0)}%`}
					layout="horizontal"
					scopeLabel={namespace === "all" ? "cluster" : `ns:${namespace}`}
					timespanLabel="now"
					resolutionLabel="lo"
					emptyMessage="No pods currently near memory limits."
				/>
			</div>

			{/* Trends (counts over time) */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4 pt-0">
				<MetricLineChart
					title="Pods Over CPU Limit (count)"
					subtitle="Count of pods with usage above CPU limit over time."
					series={overLimitCountSeries}
					unit=""
					formatter={(v: number) => v.toFixed(0)}
					scopeLabel={namespace === "all" ? "cluster" : `ns:${namespace}`}
					timespanLabel="15m"
					resolutionLabel="lo"
				/>
				<MetricLineChart
					title="Pods ≥90% Memory Limit (count)"
					subtitle="Count of pods with working set above 90% of memory limit over time."
					series={memNearCountSeries}
					unit=""
					formatter={(v: number) => v.toFixed(0)}
					scopeLabel={namespace === "all" ? "cluster" : `ns:${namespace}`}
					timespanLabel="15m"
					resolutionLabel="lo"
				/>
			</div>

			<div className="px-4 pb-4">
				<p className="text-xs text-muted-foreground">
					Note: Direct CPU throttling metrics aren’t in the stream yet. When available, add a “CPU Throttled %” chart.
					Until then, use CPU over-limit and elevated restart rate as proxy signals.
				</p>
				<div className="mt-2">
					<a
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
						href="/api/v1/timeseries/health"
						target="_blank"
						rel="noreferrer"
					>
						System health endpoint <ExternalLink className="h-3 w-3" />
					</a>
				</div>
			</div>
		</div>
	);
}
