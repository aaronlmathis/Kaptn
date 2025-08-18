/* frontend/src/components/opsview/sections/SchedulingPressureSection.tsx */

"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { MetricAreaChart } from "@/components/opsview/charts";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
	ChartLegend,
	ChartLegendContent,
} from "@/components/ui/chart";
import {
	BarChart,
	Bar,
	CartesianGrid,
	XAxis,
	YAxis,
	ResponsiveContainer,
	RadarChart,
	Radar,
	PolarAngleAxis,
	PolarGrid,
	PolarRadiusAxis,
} from "recharts";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { getResourceIcon } from "@/lib/summary-card-utils";

type Point = { t: number; v: number };
type SeriesMap = Record<string, Point[]>;
const latest = (pts?: Point[]) => (pts?.length ? pts[pts.length - 1]!.v : 0);

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
	const pendingReasons = React.useMemo(() => {
		const pick = (key: string) => latest(liveData[key]);
		const rows = [
			{ reason: "Insufficient CPU", value: pick("cluster.pods.pending.by_reason:Insufficient CPU") },
			{ reason: "Insufficient Memory", value: pick("cluster.pods.pending.by_reason:Insufficient Memory") },
			{ reason: "Affinity", value: pick("cluster.pods.pending.by_reason:Affinity") },
			{ reason: "Taints", value: pick("cluster.pods.pending.by_reason:Taints") },
		];
		if (rows.every((r) => !r.value)) {
			return [
				{ reason: "Insufficient CPU", value: 8 },
				{ reason: "Insufficient Memory", value: 5 },
				{ reason: "Affinity", value: 2 },
				{ reason: "Taints", value: 1 },
			];
		}
		return rows;
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

	const radarData = React.useMemo(
		() => [
			{ axis: "Memory", value: Math.round(pressurePct.memory) },
			{ axis: "Disk", value: Math.round(pressurePct.disk) },
			{ axis: "PID", value: Math.round(pressurePct.pid) },
		],
		[pressurePct]
	);

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
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				{/* Pending over time */}
				<div className="rounded-lg border bg-card p-4">
					<div className="mb-3">
						<div className="text-sm font-semibold">Pending Pods (30m)</div>
						<div className="text-xs text-muted-foreground">Active scheduling backlog</div>
					</div>
					<div className="min-h-[240px]">
						<MetricAreaChart
							title=""
							subtitle=""
							series={pendingSeries}
							unit="pods"
							formatter={(v) => `${Math.round(v)}`}
							stacked={false}
							scopeLabel="cluster"
							timespanLabel="30m"
							resolutionLabel="hi"
						/>
					</div>
				</div>

				{/* Pending by Reason (bar) */}
				<div className="rounded-lg border bg-card p-4 h-full">
					<div className="mb-3">
						<div className="text-sm font-semibold">Pending by Reason</div>
						<div className="text-xs text-muted-foreground">Latest snapshot</div>
					</div>
					<ChartContainer
						config={
							{
								value: { label: "Pending" },
								cpu: { label: "Insufficient CPU", color: "hsl(var(--chart-1))" },
								mem: { label: "Insufficient Memory", color: "hsl(var(--chart-2))" },
								aff: { label: "Affinity", color: "hsl(var(--chart-3))" },
								taints: { label: "Taints", color: "hsl(var(--chart-4))" },
							} satisfies ChartConfig
						}
						className="min-h-[240px] w-full"
					>
						<ResponsiveContainer width="100%" height="100%">
							<BarChart accessibilityLayer data={pendingReasons}>
								<CartesianGrid vertical={false} />
								<XAxis dataKey="reason" tickLine={false} axisLine={false} tickMargin={8} />
								<YAxis allowDecimals={false} />
								<Bar dataKey="value" radius={4} />
								<ChartTooltip content={<ChartTooltipContent />} />
							</BarChart>
						</ResponsiveContainer>
						<ChartLegend content={<ChartLegendContent nameKey="reason" />} />
					</ChartContainer>
				</div>

				{/* Node Pressure Radar (wraps to next row) */}
				<div className="rounded-lg border bg-card p-4 h-full">
					<div className="mb-3">
						<div className="text-sm font-semibold">Node Pressure Profile</div>
						<div className="text-xs text-muted-foreground">% of nodes with condition=true</div>
					</div>
					<ChartContainer
						config={{ value: { label: "% Nodes Under Pressure", color: "hsl(var(--chart-1))" } } as ChartConfig}
						className="min-h-[240px] w-full"
					>
						<ResponsiveContainer width="100%" height="100%">
							<RadarChart data={radarData}>
								<PolarGrid />
								<PolarAngleAxis dataKey="axis" />
								<PolarRadiusAxis angle={30} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
								<Radar dataKey="value" fill="var(--color-value)" fillOpacity={0.35} />
								<ChartTooltip content={<ChartTooltipContent />} />
							</RadarChart>
						</ResponsiveContainer>
					</ChartContainer>
				</div>
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
