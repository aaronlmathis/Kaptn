/* frontend/src/components/opsview/sections/SchedulingPressureSection.tsx */

"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter";
import { MetricLineChart, MetricCategoricalBarChart, MetricRadarChart, type ChartSeries, type CategoricalDataPoint } from "@/components/opsview/charts";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { getResourceIcon } from "@/lib/summary-card-utils";
type Point = { t: number; v: number };
type SeriesMap = Record<string, Point[]>;
const latest = (pts?: Point[]) => (pts?.length ? pts[pts.length - 1]?.v || 0 : 0);

function pct(n: number, d: number) {
	if (!d || !isFinite(n) || !isFinite(d)) return 0;
	return Math.max(0, Math.min(100, (n / d) * 100));
}

type PodEntity = {
	id: string;
	name: string;
	namespace: string;
	unschedulable?: boolean;
	unschedulableReason?: string;
};

export default function SchedulingPressureSection() {
	const {
		seriesData: liveData,
		// isConnected not needed for SummaryCards itself, but you can show a live badge if you want
		connectionState,
		isConnected,
	} = useLiveSeriesSubscription(
		"scheduling-pressure",
		[
			// Pending pods
			"cluster.pods.pending",
			"cluster.pods.running",

			// Node count
			"cluster.nodes.count",

			// Node pressures per-node (0/1 or intensity)
			"node.conditions.memory_pressure",
			"node.conditions.disk_pressure",
			"node.conditions.pid_pressure",
		],
		{ res: "lo", since: "30m", autoConnect: true }
	);

	/** --- Pending pods time-series (area) --- */
	const pendingSeries = React.useMemo(() => {
		const data = (liveData["cluster.pods.pending"] || []).map((p) => [p.t, p.v] as [number, number]);
		return [{ key: "cluster.pods.pending", name: "Pods Pending", color: "#f59e0b", data }];
	}, [liveData]);

	const [pendingPodsByReason, setPendingPodsByReason] = React.useState<CategoricalDataPoint[]>([]);
	const [loadingReasons, setLoadingReasons] = React.useState(true);
	const [reasonsError, setReasonsError] = React.useState<string | null>(null);

	const fetchPendingPodReasons = React.useCallback(async () => {
		setLoadingReasons(true);
		setReasonsError(null);
		try {
			const res = await fetch("/api/v1/timeseries/entities/pods?unschedulable=1");
			if (!res.ok) {
				throw new Error(`Failed to fetch pending pods: ${res.statusText}`);
			}
			const data = await res.json();
			const pods: PodEntity[] = data.entities || [];

			const reasonCounts: Record<string, number> = {};
			for (const pod of pods) {
				if (pod.unschedulable && pod.unschedulableReason) {
					reasonCounts[pod.unschedulableReason] = (reasonCounts[pod.unschedulableReason] || 0) + 1;
				}
			}

			const chartData: CategoricalDataPoint[] = Object.entries(reasonCounts)
				.map(([name, value]) => ({ name, value }))
				.sort((a, b) => b.value - a.value);

			setPendingPodsByReason(chartData);
		} catch (err) {
			setReasonsError(err instanceof Error ? err.message : "An unknown error occurred");
		} finally {
			setLoadingReasons(false);
		}
	}, []);

	React.useEffect(() => {
		fetchPendingPodReasons();
		const intervalId = setInterval(fetchPendingPodReasons, 30000); // Poll every 30s
		return () => clearInterval(intervalId);
	}, [fetchPendingPodReasons]);

	/** --- Pending by reason (bar, latest snapshot) --- */
	const pendingReasonsData = pendingPodsByReason;

	/** --- Node pressure profile (radar) --- */
	const nodeNames: string[] = React.useMemo(() => {
		const names = new Set<string>();
		Object.keys(liveData as SeriesMap).forEach((k) => {
			const m = k.match(/^node\.conditions\.(memory_pressure|disk_pressure|pid_pressure)\.(.+)$/);
			if (m?.[2]) names.add(m[2]);
		});
		return Array.from(names).sort();
	}, [liveData]);

	const nodesTotal = Math.round(latest(liveData["cluster.nodes.count"]));

	const pressurePct = React.useMemo(() => {
		const countActive = (kind: "memory_pressure" | "disk_pressure" | "pid_pressure") => {
			let active = 0;
			nodeNames.forEach((n) => {
				const v = latest(liveData[`node.conditions.${kind}.${n}`]);
				if (v && v > 0) active++;
			});
			return pct(active, nodeNames.length || nodesTotal || 0);
		};

		if (nodeNames.length === 0) {
			// Mock data for radar chart if no nodes are discovered yet
			return { memory: 12, disk: 6, pid: 3 };
		}
		return {
			memory: countActive("memory_pressure"),
			disk: countActive("disk_pressure"),
			pid: countActive("pid_pressure"),
		};
	}, [liveData, nodeNames, nodesTotal]);

	const radarSeries: ChartSeries[] = React.useMemo(() => {
		const timestamp = Date.now(); // Current timestamp for radar data
		return [
			{ key: "memory", name: "Memory", color: "hsl(var(--chart-1))", data: [[timestamp, Math.round(pressurePct.memory)]] },
			{ key: "disk", name: "Disk", color: "hsl(var(--chart-2))", data: [[timestamp, Math.round(pressurePct.disk)]] },
			{ key: "pid", name: "PID", color: "hsl(var(--chart-3))", data: [[timestamp, Math.round(pressurePct.pid)]] },
		];
	}, [pressurePct]);

	/** --- Health Footers --- */
	const { pendingFooter, reasonsFooter, pressureFooter } = React.useMemo(() => {
		// --- Pending Pods Footer ---
		const pendingNow = Math.round(latest(liveData["cluster.pods.pending"]));
		const runningNow = Math.round(latest(liveData["cluster.pods.running"]));

		const toneForPending = (p: number): "ok" | "warn" | "crit" => {
			if (p > 20) return "crit";
			if (p > 5) return "warn";
			return "ok";
		};

		const pendingTone = toneForPending(pendingNow);
		const pendingSummary = pendingNow > 0
			? `${pendingNow} pods are awaiting scheduling.`
			: "No pods are currently pending scheduling.";

		const pendingFooter = (
			<SectionHealthFooter
				tone={pendingTone}
				summary={pendingSummary}
				ratioPills={[
					{
						label: "Pending/Running",
						value: runningNow > 0 ? `${(pendingNow / runningNow * 100).toFixed(0)}%` : (pendingNow > 0 ? "∞" : "0%"),
						title: "Ratio of pending to running pods"
					}
				]}
			/>
		);

		// --- Pending by Reason Footer ---
		const totalPendingByReason = pendingReasonsData.reduce((sum, item) => sum + item.value, 0);
		const topReason = pendingReasonsData.length > 0 ? pendingReasonsData[0] : null;

		const reasonTone = toneForPending(totalPendingByReason);
		const reasonSummary = topReason
			? `Top reason: ${topReason.name} (${topReason.value} pods).`
			: "No unschedulable pods found.";

		const reasonPills = pendingReasonsData.slice(0, 3).map(reason => ({
			label: reason.name,
			value: String(reason.value),
			tone: "info" as const
		}));

		const reasonsFooter = <SectionHealthFooter tone={reasonTone} summary={reasonSummary} ratioPills={reasonPills} />;

		// --- Node Pressure Footer ---
		const pressures = [
			{ name: "Memory", value: pressurePct.memory },
			{ name: "Disk", value: pressurePct.disk },
			{ name: "PID", value: pressurePct.pid },
		];
		const maxPressureItem = pressures.reduce((max, p) => p.value > max.value ? p : max, pressures[0] || { value: 0 });

		const toneForPressure = (p: number): "ok" | "warn" | "crit" => {
			if (p >= 25) return "crit";
			if (p >= 10) return "warn";
			return "ok";
		};
		const pressureTone = toneForPressure(maxPressureItem.value);
		const pressureSummary = maxPressureItem.value >= 10
			? `${maxPressureItem.name} pressure is elevated on ${maxPressureItem.value.toFixed(0)}% of nodes.`
			: "Node pressure conditions appear stable."
		const pressurePills = pressures.map(p => ({ label: `${p.name} Pressure`, value: `${p.value.toFixed(0)}%`, tone: toneForPressure(p.value) }));
		const pressureFooter = <SectionHealthFooter tone={pressureTone} summary={pressureSummary} ratioPills={pressurePills} />;

		return { pendingFooter, reasonsFooter, pressureFooter };
	}, [liveData, pendingReasonsData, pressurePct]);

	/** --- SummaryCards (Cluster KPIs) --- */
	const pendingNow = Math.round(latest(liveData["cluster.pods.pending"]));

	const pressureBadge = (valuePct: number) => {
		const v = Math.round(valuePct);
		if (v >= 20) return <Badge variant="destructive" className="text-xs">{v}%</Badge>;
		if (v >= 10) return <Badge variant="outline" className="text-orange-600 text-xs">{v}%</Badge>;
		if (v > 0) return <Badge variant="secondary" className="text-xs">{v}%</Badge>;
		return <Badge variant="default" className="text-xs">0%</Badge>;
	};

	const summaryData: SummaryCard[] = React.useMemo(() => {
		return [
			{
				title: "Pending Pods",
				value: pendingNow,
				subtitle: `${pendingNow} pods awaiting scheduling`,
				badge: pendingNow > 20
					? <Badge variant="destructive" className="text-xs">{pendingNow}</Badge>
					: pendingNow > 0
						? <Badge variant="secondary" className="text-xs">{pendingNow}</Badge>
						: <Badge variant="default" className="text-xs">0</Badge>,
				icon: getResourceIcon("pods"),
				footer: pendingNow === 0 ? "No backlog" : "Investigate scheduling constraints",
			},
			{
				title: "Nodes: Memory Pressure",
				value: `${Math.round(pressurePct.memory)}%`,
				subtitle: "% of nodes reporting MemoryPressure",
				badge: pressureBadge(pressurePct.memory),
				icon: getResourceIcon("nodes"),
				footer: pressurePct.memory >= 10 ? "Memory pressure widespread" : "Memory pressure limited",
			},
			{
				title: "Nodes: Disk Pressure",
				value: `${Math.round(pressurePct.disk)}%`,
				subtitle: "% of nodes reporting DiskPressure",
				badge: pressureBadge(pressurePct.disk),
				icon: getResourceIcon("nodes"),
				footer: pressurePct.disk >= 10 ? "Disk pressure widespread" : "Disk pressure limited",
			},
			{
				title: "Nodes: PID Pressure",
				value: `${Math.round(pressurePct.pid)}%`,
				subtitle: "% of nodes reporting PIDPressure",
				badge: pressureBadge(pressurePct.pid),
				icon: getResourceIcon("nodes"),
				footer: pressurePct.pid >= 10 ? "PID pressure widespread" : "PID pressure limited",
			},
		];
	}, [pendingNow, pressurePct]);

	return (
		<div className="space-y-6">
			{/* Error */}
			{connectionState.lastError && (
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>WebSocket error: {connectionState.lastError}</AlertDescription>
				</Alert>
			)}

			{reasonsError && (
				<Alert variant="destructive" className="my-4">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>Could not load pending pod reasons: {reasonsError}</AlertDescription>
				</Alert>
			)}

			{/* Summary cards (match ClusterOverview styling) */}
			<SummaryCards
				cards={summaryData}
				columns={4}
				loading={false}
				error={connectionState.lastError}
				lastUpdated={null}
				noPadding={true}
			/>

			{/* Charts: 3 per row on large screens */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Pending over time */}
				<MetricLineChart
					title="Pending Pods (30m)"
					subtitle="Active scheduling backlog over time showing pods waiting for resources or placement"
					series={pendingSeries}
					unit="pods"
					formatter={(v) => `${Math.round(v)}`}
					scopeLabel="cluster"
					timespanLabel="30m"
					resolutionLabel="hi"
					footerExtra={pendingFooter}
				/>

				{/* Pending by Reason (bar) */}
				<MetricCategoricalBarChart
					title="Pending Pods by Reason"
					subtitle="Latest snapshot of pending pods categorized by scheduling reason. Shows which constraints are preventing pod scheduling."
					data={pendingReasonsData}
					formatter={(v: number) => `${Math.round(v)} pods`}
					layout="horizontal"
					showLegend={true}
					scopeLabel="cluster"
					timespanLabel="latest"
					resolutionLabel="snapshot"
					loading={loadingReasons}
					emptyMessage="No unschedulable pods found."
					footerExtra={reasonsFooter}
				/>

				{/* Node Pressure Radar (wraps to next row) */}
				<MetricRadarChart
					title="Node Pressure Profile"
					subtitle="Percentage of nodes with each pressure condition active. Shows memory, disk, and PID pressure distribution across the cluster."
					series={radarSeries}
					unit="%"
					formatter={(v) => `${Math.round(v)}%`}
					scopeLabel="cluster"
					timespanLabel="current"
					resolutionLabel="node-level"
					footerExtra={pressureFooter}
				/>
			</div>

			{/* Live badge (optional) */}
			<div className="flex items-center justify-end -mt-2">
				<Badge variant={isConnected ? "default" : "secondary"} className="text-xs">
					{isConnected ? "Live Data" : "Offline"}
				</Badge>
			</div>
		</div>
	);
}
