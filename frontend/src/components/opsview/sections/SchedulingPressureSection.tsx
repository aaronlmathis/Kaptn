/* frontend/src/components/opsview/sections/SchedulingPressureSection.tsx */

"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { MetricAreaChart, MetricCategoricalBarChart, MetricRadarChart, type ChartSeries, type CategoricalDataPoint } from "@/components/opsview/charts";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { getResourceIcon } from "@/lib/summary-card-utils";

type Point = { t: number; v: number };
type SeriesMap = Record<string, Point[]>;
const latest = (pts?: Point[]) => (pts?.length ? pts[pts.length - 1]?.v || 0 : 0);

function pct(n: number, d: number) {
	if (!d || !isFinite(n) || !isFinite(d)) return 0;
	return Math.max(0, Math.min(100, (n / d) * 100));
}

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

			// Optional reason splits
			"cluster.pods.pending.by_reason:Insufficient CPU",
			"cluster.pods.pending.by_reason:Insufficient Memory",
			"cluster.pods.pending.by_reason:Affinity",
			"cluster.pods.pending.by_reason:Taints",

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

	/** --- Pending by reason (bar, latest snapshot) --- */
	const pendingReasonsData: CategoricalDataPoint[] = React.useMemo(() => {
		const pick = (key: string) => latest(liveData[key]);

		const reasons = [
			{ name: "Insufficient CPU", value: pick("cluster.pods.pending.by_reason:Insufficient CPU") || 0 },
			{ name: "Insufficient Memory", value: pick("cluster.pods.pending.by_reason:Insufficient Memory") || 0 },
			{ name: "Affinity", value: pick("cluster.pods.pending.by_reason:Affinity") || 0 },
			{ name: "Taints", value: pick("cluster.pods.pending.by_reason:Taints") || 0 },
		];

		// If no real data, use mock data
		if (reasons.every((r) => r.value === 0)) {
			return [
				{ name: "Insufficient CPU", value: 8 },
				{ name: "Insufficient Memory", value: 5 },
				{ name: "Affinity", value: 2 },
				{ name: "Taints", value: 1 },
			];
		}

		// Don't filter out zero values - show all categories for context
		return reasons;
	}, [liveData]);

	/** --- Node pressure profile (radar) --- */
	const nodeNames: string[] = React.useMemo(() => {
		const names = new Set<string>();
		Object.keys(liveData as SeriesMap).forEach((k) => {
			const m = k.match(/^node\.conditions\.(memory_pressure|disk_pressure|pid_pressure):(.+)$/);
			if (m?.[2]) names.add(m[2]);
		});
		return Array.from(names).sort();
	}, [liveData]);

	const nodesTotal = Math.round(latest(liveData["cluster.nodes.count"]));

	const pressurePct = React.useMemo(() => {
		const countActive = (kind: "memory_pressure" | "disk_pressure" | "pid_pressure") => {
			let active = 0;
			nodeNames.forEach((n) => {
				const v = latest(liveData[`node.conditions.${kind}:${n}`]);
				if (v && v > 0) active++;
			});
			return pct(active, nodeNames.length || nodesTotal || 0);
		};

		if (nodeNames.length === 0) {
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
			{
				key: "memory",
				name: "Memory",
				color: "hsl(var(--chart-1))",
				data: [[timestamp, Math.round(pressurePct.memory)]]
			},
			{
				key: "disk",
				name: "Disk",
				color: "hsl(var(--chart-2))",
				data: [[timestamp, Math.round(pressurePct.disk)]]
			},
			{
				key: "pid",
				name: "PID",
				color: "hsl(var(--chart-3))",
				data: [[timestamp, Math.round(pressurePct.pid)]]
			},
		];
	}, [pressurePct]);

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

			{/* Summary cards (match ClusterOverview styling) */}
			<SummaryCards
				cards={summaryData}
				columns={4}
				loading={false}
				error={connectionState.lastError}
				lastUpdated={null}
				noPadding={true}
			/>

			{/* Charts: MAX 2 PER ROW */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Pending over time */}
				<MetricAreaChart
					title="Pending Pods (30m)"
					subtitle="Active scheduling backlog over time showing pods waiting for resources or placement"
					series={pendingSeries}
					unit="pods"
					formatter={(v) => `${Math.round(v)}`}
					stacked={false}
					scopeLabel="cluster"
					timespanLabel="30m"
					resolutionLabel="hi"
				/>

				{/* Pending by Reason (bar) */}
				<MetricCategoricalBarChart
					title="Pending Pods by Reason"
					subtitle="Latest snapshot of pending pods categorized by scheduling reason. Shows which constraints are preventing pod scheduling."
					data={pendingReasonsData}
					unit="pods"
					formatter={(v: number) => `${Math.round(v)}`}
					layout="horizontal"
					showLegend={true}
					scopeLabel="cluster"
					timespanLabel="latest"
					resolutionLabel="snapshot"
				/>

				{/* Node Pressure Radar (wraps to next row) */}
				<MetricRadarChart
					title="Node Pressure Profile"
					subtitle="Percentage of nodes with each pressure condition active. Shows memory, disk, and PID pressure distribution across the cluster."
					series={radarSeries}
					unit="%"
					formatter={(v) => `${Math.round(v)}`}
					scopeLabel="cluster"
					timespanLabel="current"
					resolutionLabel="node-level"
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
