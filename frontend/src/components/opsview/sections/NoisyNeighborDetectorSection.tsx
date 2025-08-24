import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";
import type { ColumnDef } from "@/lib/table";
import { DataTableFilters, type BulkAction } from "@/components/ui/data-table-filters";
import { Eye, Copy, Download, Trash } from "lucide-react";
import { IconGripVertical } from "@tabler/icons-react";

import { MetricAreaChart, type ChartSeries } from "@/components/opsview/charts";

import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { formatCores, formatBytesIEC } from "@/lib/metric-utils";

import {
	IconUsersGroup,
	IconActivity,
	IconGauge,
	IconAlertTriangle as IconAlertTriangleTabler,
} from "@tabler/icons-react";

// -------------------------------
// Types
// -------------------------------
type NodeEntity = { id: string; name: string };
type NamespaceEntity = { id: string; name: string };
type PodEntity = { id: string; name: string; namespace: string; node: string; status?: string };

type PodRow = {
	namespace: string;
	pod: string;
	node: string;

	cpuUsageCores: number;
	cpuReqCores: number;
	cpuUseOverReq: number; // usage / request

	memWorkingSetBytes: number;
	memReqBytes: number;
	memUseOverReq: number; // mem working set / mem request

	netBps: number; // rx + tx
	ephPct: number; // pod.ephemeral.used.percent

	shareOfNodeCPU: number; // 0..1
	shareOfNSCPU: number;   // 0..1

	score: number; // 0..1 (heuristic)
	reasons: string[];
};

// -------------------------------
// Constants (series bases)
// -------------------------------
const POD_CPU_USE = "pod.cpu.usage.cores";
const POD_MEM_WS = "pod.mem.working_set.bytes";
const POD_NET_RX = "pod.net.rx.bps";
const POD_NET_TX = "pod.net.tx.bps";
const POD_CPU_REQ = "pod.cpu.request.cores";
const POD_MEM_REQ = "pod.mem.request.bytes";
const POD_EPH_PCT = "pod.ephemeral.used.percent";

const NODE_CPU_USE = "node.cpu.usage.cores";
const NS_CPU_USED = "ns.cpu.used.cores";

// -------------------------------
// Helpers
// -------------------------------
const buildPodKey = (base: string, ns: string, pod: string) => `${base}.${ns}.${pod}`;
const buildNodeKey = (base: string, node: string) => `${base}.${node}`;
const buildNSKey = (base: string, ns: string) => `${base}.${ns}`;

// Return most recent v from an array of {t, v} or 0 if missing
function latest(series: any[] | undefined): number {
	if (!series || series.length === 0) return 0;
	const pt = series[series.length - 1];
	const v = typeof pt?.v === "number" ? pt.v : 0;
	// guard rails for NaN/Inf
	return Number.isFinite(v) ? v : 0;
}

// Safe divide
const div = (a: number, b: number): number => (b > 0 ? a / b : 0);

// Clamp
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Compute heuristic score 0..1 and reasons
function computeScore(row: Omit<PodRow, "score" | "reasons">): { score: number; reasons: string[] } {
	const overCPU = row.cpuUseOverReq;           // e.g., 2.0 means 2x request
	const overMem = row.memUseOverReq;
	const nodeShare = row.shareOfNodeCPU;        // 0..1
	const nsShare = row.shareOfNSCPU;            // 0..1
	const net = row.netBps;                      // raw bps, normalize below
	const eph = row.ephPct / 100;                // 0..1

	// Normalize CPU over-request to 0..1 (cap at 3x)
	const nCPU = clamp01(overCPU / 3);
	const nMem = clamp01(overMem / 3);
	const nNode = clamp01(nodeShare);
	const nNS = clamp01(nsShare);

	// Light network normalization: consider >100 Mbps as max (adjust as needed)
	const nNet = clamp01(net / (100 * 1_000_000));

	// Weighted score
	const score =
		0.35 * nCPU +
		0.25 * nNode +
		0.15 * nNS +
		0.15 * nMem +
		0.10 * Math.max(nNet, eph);

	const reasons: string[] = [];
	if (overCPU >= 2) reasons.push("CPU usage >2× request");
	if (nodeShare >= 0.20) reasons.push("≥20% of node CPU");
	if (nsShare >= 0.25) reasons.push("≥25% of namespace CPU");
	if (overMem >= 1.5) reasons.push("Mem usage >1.5× request");
	if (eph >= 0.80) reasons.push("Ephemeral ≥80%");
	if (nNet >= 0.5) reasons.push("High Net I/O");

	return { score: clamp01(score), reasons };
}

// Badge helpers for summary cards
function getNoisyCountBadge(count: number) {
	if (count > 5) {
		return <Badge variant="outline" className="text-red-500 border-red-500/60">{count} pods</Badge>;
	}
	if (count > 2) {
		return <Badge variant="outline" className="text-amber-500 border-amber-500/60">{count} pods</Badge>;
	}
	return <Badge variant="outline" className="text-green-600 border-green-600/60">{count} pods</Badge>;
}

function getMaxDominanceBadge(pct: number) {
	const p = Math.round(pct);
	if (p > 35) {
		return <Badge variant="outline" className="text-red-500 border-red-500/60">{p}%</Badge>;
	}
	if (p >= 20) {
		return <Badge variant="outline" className="text-amber-500 border-amber-500/60">{p}%</Badge>;
	}
	return <Badge variant="outline" className="text-green-600 border-green-600/60">{p}%</Badge>;
}

function getCpuPressureBadge(ratio: number) {
	if (ratio > 1.5) {
		return <Badge variant="outline" className="text-red-500 border-red-500/60">{ratio.toFixed(1)}x</Badge>;
	}
	if (ratio > 1.0) {
		return <Badge variant="outline" className="text-amber-500 border-amber-500/60">{ratio.toFixed(1)}x</Badge>;
	}
	return <Badge variant="outline" className="text-green-600 border-green-600/60">{ratio.toFixed(1)}x</Badge>;
}

function getPressureCountBadge(count: number) {
	if (count > 3) {
		return <Badge variant="outline" className="text-red-500 border-red-500/60">{count} pods</Badge>;
	}
	if (count > 0) {
		return <Badge variant="outline" className="text-amber-500 border-amber-500/60">{count} pods</Badge>;
	}
	return <Badge variant="outline" className="text-green-600 border-green-600/60">{count} pods</Badge>;
}

const loadingCard = (title: string, icon: React.ReactNode): SummaryCard => ({
	title,
	value: "...",
	subtitle: "...",
	icon,
});
// -------------------------------
// Component
// -------------------------------
export function NoisyNeighborDetectionSection(): JSX.Element {
	// Local UI/filters
	const [since, setSince] = React.useState<"15m" | "30m" | "1h">("30m");
	const [selectedNode, setSelectedNode] = React.useState<string>("");
	const [maxPods, setMaxPods] = React.useState<number>(200);
	const [topN, setTopN] = React.useState<number>(5);
	const [globalFilter, setGlobalFilter] = React.useState("");

	// Entities
	const [nodes, setNodes] = React.useState<NodeEntity[]>([]);
	const [namespaces, setNamespaces] = React.useState<NamespaceEntity[]>([]);
	const [pods, setPods] = React.useState<PodEntity[]>([]);
	const [loadingEntities, setLoadingEntities] = React.useState<boolean>(true);
	const [entityError, setEntityError] = React.useState<string | null>(null);

	// Discover entities (simple built-in discovery per timeseries API)
	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				setLoadingEntities(true);
				setEntityError(null);

				const [nodesRes, nsRes] = await Promise.all([
					fetch("/api/v1/timeseries/entities/nodes"),
					fetch("/api/v1/timeseries/entities/namespaces"),
				]);
				const nodesJson = await nodesRes.json();
				const nsJson = await nsRes.json();

				const nodesList: NodeEntity[] = (nodesJson?.entities ?? []).map((n: any) => ({ id: n.id ?? n.name, name: n.name }));
				const nsList: NamespaceEntity[] = (nsJson?.entities ?? []).map((n: any) => ({ id: n.id ?? n.name, name: n.name }));

				// fetch pods for each namespace (light pagination: limit=100 per ns)
				const podPromises = nsList.map((ns) =>
					fetch(`/api/v1/timeseries/entities/pods?namespace=${encodeURIComponent(ns.name)}&limit=100`).then((r) => r.json())
				);
				const podsJsonArr = await Promise.all(podPromises);
				const podsList: PodEntity[] = podsJsonArr.flatMap((pj) =>
					(pj?.entities ?? []).map((p: any) => ({
						id: p.id,
						name: p.name,
						namespace: p.namespace,
						node: p.node,
						status: p.status,
					}))
				);

				if (cancelled) return;
				setNodes(nodesList);
				setNamespaces(nsList);
				setPods(podsList);
				if (!selectedNode && nodesList.length > 0) setSelectedNode(nodesList[0].name);
			} catch (e: any) {
				if (!cancelled) setEntityError(e?.message ?? "Failed to load entities");
			} finally {
				if (!cancelled) setLoadingEntities(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []); // once

	// Limit pod universe (safety for series cap)
	const visiblePods = React.useMemo(() => pods.slice(0, Math.max(1, maxPods)), [pods, maxPods]);

	// Build metric keys
	const nodeKeys = React.useMemo(() => {
		const uniqueNodeNames = Array.from(new Set(visiblePods.map((p) => p.node).concat(nodes.map((n) => n.name))));
		return uniqueNodeNames.map((n) => buildNodeKey(NODE_CPU_USE, n));
	}, [visiblePods, nodes]);

	const nsKeys = React.useMemo(() => {
		const uniqueNS = Array.from(new Set(visiblePods.map((p) => p.namespace)));
		return uniqueNS.map((ns) => buildNSKey(NS_CPU_USED, ns));
	}, [visiblePods]);

	const podKeys = React.useMemo(() => {
		const arr: string[] = [];
		for (const p of visiblePods) {
			arr.push(buildPodKey(POD_CPU_USE, p.namespace, p.name));
			arr.push(buildPodKey(POD_MEM_WS, p.namespace, p.name));
			arr.push(buildPodKey(POD_NET_RX, p.namespace, p.name));
			arr.push(buildPodKey(POD_NET_TX, p.namespace, p.name));
			arr.push(buildPodKey(POD_CPU_REQ, p.namespace, p.name));
			arr.push(buildPodKey(POD_MEM_REQ, p.namespace, p.name));
			arr.push(buildPodKey(POD_EPH_PCT, p.namespace, p.name));
		}
		return arr;
	}, [visiblePods]);

	const allKeys = React.useMemo(() => [...nodeKeys, ...nsKeys, ...podKeys], [nodeKeys, nsKeys, podKeys]);

	// Live series subscription
	const { seriesData, connectionState, isLoading: isLiveLoading } = useLiveSeriesSubscription(
		"noisy-neighbor-detection",
		allKeys,
		{
			res: "lo",
			since,
			autoConnect: allKeys.length > 0,
		}
	);

	const nodeCPU = React.useMemo(() => {
		if (!seriesData) return {};
		const cpuMap: Record<string, number> = {};
		for (const n of nodes) {
			cpuMap[n.name] = latest(seriesData[buildNodeKey(NODE_CPU_USE, n.name)]);
		}
		return cpuMap;
	}, [seriesData, nodes]);

	const sortedNodes = React.useMemo(() => {
		return [...nodes].sort((a, b) => (nodeCPU[b.name] ?? 0) - (nodeCPU[a.name] ?? 0));
	}, [nodes, nodeCPU]);

	const nsCPU = React.useMemo(() => {
		if (!seriesData) return {};
		const cpuMap: Record<string, number> = {};
		for (const ns of namespaces) {
			cpuMap[ns.name] = latest(seriesData[buildNSKey(NS_CPU_USED, ns.name)]);
		}
		return cpuMap;
	}, [seriesData, namespaces]);

	// Build table rows
	const rows: PodRow[] = React.useMemo(() => {
		if (!seriesData) return [];

		const out: PodRow[] = [];
		for (const p of visiblePods) {
			const cpuUse = latest(seriesData[buildPodKey(POD_CPU_USE, p.namespace, p.name)]);
			const cpuReq = latest(seriesData[buildPodKey(POD_CPU_REQ, p.namespace, p.name)]);
			const memWS = latest(seriesData[buildPodKey(POD_MEM_WS, p.namespace, p.name)]);
			const memReq = latest(seriesData[buildPodKey(POD_MEM_REQ, p.namespace, p.name)]);
			const rx = latest(seriesData[buildPodKey(POD_NET_RX, p.namespace, p.name)]);
			const tx = latest(seriesData[buildPodKey(POD_NET_TX, p.namespace, p.name)]);
			const ephPct = latest(seriesData[buildPodKey(POD_EPH_PCT, p.namespace, p.name)]);

			const nCPU = nodeCPU[p.node] ?? 0;
			const nsC = nsCPU[p.namespace] ?? 0;

			const cpuUseOverReq = div(cpuUse, cpuReq);
			const memUseOverReq = div(memWS, memReq);
			const shareOfNodeCPU = div(cpuUse, nCPU);
			const shareOfNSCPU = div(cpuUse, nsC);
			const netBps = rx + tx;

			const base: Omit<PodRow, "score" | "reasons"> = {
				namespace: p.namespace,
				pod: p.name,
				node: p.node,

				cpuUsageCores: cpuUse,
				cpuReqCores: cpuReq,
				cpuUseOverReq,

				memWorkingSetBytes: memWS,
				memReqBytes: memReq,
				memUseOverReq,

				netBps,
				ephPct,

				shareOfNodeCPU,
				shareOfNSCPU,
			};
			const { score, reasons } = computeScore(base);
			out.push({ ...base, score, reasons });
		}

		// Sort by score desc
		out.sort((a, b) => b.score - a.score);
		return out;
	}, [seriesData, visiblePods, nodeCPU, nsCPU]);

	const filteredRows = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase();
		if (!q) return rows;

		return rows.filter((p) => {
			return (
				p.pod.toLowerCase().includes(q) ||
				p.namespace.toLowerCase().includes(q) ||
				p.node.toLowerCase().includes(q) ||
				p.reasons.some(r => r.toLowerCase().includes(q))
			);
		});
	}, [rows, globalFilter]);

	const summaryData = React.useMemo((): SummaryCard[] => {
		const hasDataPoints = seriesData && Object.values(seriesData).some(s => Array.isArray(s) && s.length > 0);

		if (loadingEntities || isLiveLoading || !seriesData || visiblePods.length === 0 || !hasDataPoints) {
			return [
				loadingCard("Potential Noisy Neighbors", <IconUsersGroup />),
				loadingCard("Max Node Dominance", <IconActivity />),
				loadingCard("CPU Over-Request Pressure", <IconGauge />),
				loadingCard("Memory / Ephemeral Pressure", <IconAlertTriangleTabler />),
			];
		}

		// We can safely assume firstKey exists due to the hasDataPoints check above
		const firstKey = allKeys.find(k => seriesData[k]?.length > 0)!;
		const allTimestamps = seriesData[firstKey].map(p => p.t).sort((a, b) => a - b);

		// Cards are always based on a fixed recent window (e.g., 15m) regardless of chart 'since'
		const summaryWindowSecs = 15 * 60;
		const latestTimestamp = allTimestamps.length > 0 ? allTimestamps[allTimestamps.length - 1] : (Date.now() / 1000);
		const summaryStartTimestamp = latestTimestamp - summaryWindowSecs;
		const timestamps = allTimestamps.filter(t => t >= summaryStartTimestamp);

		const seriesDataAsMaps = new Map<string, Map<number, number>>();
		for (const key of allKeys) {
			if (seriesData[key]) {
				seriesDataAsMaps.set(key, new Map(seriesData[key].map(p => [p.t, p.v])));
			}
		}
		const getValueAtT = (key: string, t: number): number => seriesDataAsMaps.get(key)?.get(t) ?? 0;

		const noisyCountTrend: [number, number][] = [];
		const pressureCountTrend: [number, number][] = [];
		const maxDominanceTrend: [number, number][] = [];
		const cpuPressureTrend: [number, number][] = [];
		const topOffenders: { pod: PodEntity, share: number }[] = [];

		for (const t of timestamps) {
			let noisyCount = 0;
			let pressureCount = 0;
			let maxDominance = 0;
			let currentTopOffender: PodEntity | null = null;
			const cpuRatiosForP95: number[] = [];

			for (const p of visiblePods) {
				const cpuUse = getValueAtT(buildPodKey(POD_CPU_USE, p.namespace, p.name), t);
				const cpuReq = getValueAtT(buildPodKey(POD_CPU_REQ, p.namespace, p.name), t);
				const memWS = getValueAtT(buildPodKey(POD_MEM_WS, p.namespace, p.name), t);
				const memReq = getValueAtT(buildPodKey(POD_MEM_REQ, p.namespace, p.name), t);
				const ephPct = getValueAtT(buildPodKey(POD_EPH_PCT, p.namespace, p.name), t);
				const nCPU = getValueAtT(buildNodeKey(NODE_CPU_USE, p.node), t);
				const rx = getValueAtT(buildPodKey(POD_NET_RX, p.namespace, p.name), t);
				const tx = getValueAtT(buildPodKey(POD_NET_TX, p.namespace, p.name), t);
				const netBps = rx + tx;

				const cpuOverReq = div(cpuUse, cpuReq);
				const nodeShare = div(cpuUse, nCPU);
				const memOverReq = div(memWS, memReq);

				if (cpuOverReq >= 2.0 || nodeShare >= 0.20 || memOverReq >= 1.5 || ephPct >= 80 || netBps >= 100e6) {
					noisyCount++;
				}
				if ((memReq > 0 && memOverReq >= 1.5) || ephPct >= 80) {
					pressureCount++;
				}
				if (nodeShare > maxDominance) {
					maxDominance = nodeShare;
					currentTopOffender = p;
				}
				if (cpuReq > 0) {
					cpuRatiosForP95.push(cpuOverReq);
				}
			}

			noisyCountTrend.push([t, noisyCount]);
			pressureCountTrend.push([t, pressureCount]);
			maxDominanceTrend.push([t, maxDominance * 100]);
			if (currentTopOffender) {
				topOffenders.push({ pod: currentTopOffender, share: maxDominance });
			}

			if (cpuRatiosForP95.length > 0) {
				cpuRatiosForP95.sort((a, b) => a - b);
				const p95Index = Math.floor(0.95 * (cpuRatiosForP95.length - 1));
				cpuPressureTrend.push([t, cpuRatiosForP95[p95Index]]);
			} else {
				cpuPressureTrend.push([t, 0]);
			}
		}

		const latest = <T,>(arr: [number, T][]): T | undefined => arr.length > 0 ? arr[arr.length - 1][1] : undefined;

		const noisyCount = latest(noisyCountTrend) ?? 0;
		const topOffenderAtEnd = topOffenders.length > 0 ? topOffenders[topOffenders.length - 1] : null;
		const maxDominanceValue = topOffenderAtEnd ? topOffenderAtEnd.share * 100 : 0;
		const maxDominanceSubtitle = topOffenderAtEnd ? `${topOffenderAtEnd.pod.namespace}/${topOffenderAtEnd.pod.name} @ ${topOffenderAtEnd.pod.node}` : "N/A";

		let topOffenderTrend: [number, number][] = [];
		if (topOffenderAtEnd) {
			const p = topOffenderAtEnd.pod;
			const podCpuMap = seriesDataAsMaps.get(buildPodKey(POD_CPU_USE, p.namespace, p.name));
			const nodeCpuMap = seriesDataAsMaps.get(buildNodeKey(NODE_CPU_USE, p.node));
			if (podCpuMap && nodeCpuMap) {
				topOffenderTrend = timestamps.map(t => [t, div(podCpuMap.get(t) ?? 0, nodeCpuMap.get(t) ?? 0) * 100]);
			}
		} else {
			topOffenderTrend = maxDominanceTrend;
		}

		const cpuPressure = latest(cpuPressureTrend) ?? 0;
		const pressureCount = latest(pressureCountTrend) ?? 0;

		return [
			{ title: "Potential Noisy Neighbors", value: noisyCount, subtitle: "rules matched in last 15m", badge: getNoisyCountBadge(noisyCount), icon: <IconUsersGroup />, trend: noisyCountTrend },
			{ title: "Max Node Dominance", value: `${maxDominanceValue.toFixed(0)}%`, subtitle: maxDominanceSubtitle, badge: getMaxDominanceBadge(maxDominanceValue), icon: <IconActivity />, trend: topOffenderTrend },
			{ title: "CPU Over-Request Pressure", value: `${cpuPressure.toFixed(2)}×`, subtitle: "p95 usage vs request", badge: getCpuPressureBadge(cpuPressure), icon: <IconGauge />, trend: cpuPressureTrend },
			{ title: "Memory / Ephemeral Pressure", value: pressureCount, subtitle: "mem/ephemeral risk in last 15m", badge: getPressureCountBadge(pressureCount), icon: <IconAlertTriangleTabler />, trend: pressureCountTrend },
		];
	}, [seriesData, visiblePods, allKeys, nodes, loadingEntities, isLiveLoading]);

	// Stacked dominance series for selected node (top N pods by share of node)
	const dominanceSeries: ChartSeries[] = React.useMemo(() => {
		if (!selectedNode || rows.length === 0 || !seriesData) return [];

		const podsOnNode = rows.filter((r) => r.node === selectedNode);
		if (podsOnNode.length === 0) return [];

		const topPods = [...podsOnNode].sort((a, b) => b.shareOfNodeCPU - a.shareOfNodeCPU).slice(0, Math.max(1, topN));

		const podSeries: ChartSeries[] = topPods.map((r) => {
			const key = buildPodKey(POD_CPU_USE, r.namespace, r.pod);
			return {
				key: key,
				name: `${r.namespace}/${r.pod}`,
				data: (seriesData[key] || []).map((p: any) => [p.t, p.v]),
			};
		});

		// Calculate "Other" series: Other = Node Total - Sum(Top N pods)
		const nodeCpuKey = buildNodeKey(NODE_CPU_USE, selectedNode);
		const nodeCpuData: [number, number][] = (seriesData[nodeCpuKey] || []).map((p: any) => [p.t, p.v]);

		const podSumByTimestamp: Record<number, number> = {};
		for (const series of podSeries) {
			for (const [t, v] of (series.data as [number, number][])) {
				podSumByTimestamp[t] = (podSumByTimestamp[t] || 0) + v;
			}
		}

		const otherData: [number, number][] = nodeCpuData.map(([t, nodeV]) => {
			const podsSum = podSumByTimestamp[t] || 0;
			return [t, Math.max(0, nodeV - podsSum)]; // Other cannot be negative
		});

		const otherSeries: ChartSeries = { key: "other-cpu", name: "Other Pods", data: otherData, color: "#a0a0a0" };

		return [...podSeries, otherSeries];
	}, [rows, selectedNode, topN, seriesData]);

	// Table columns
	const columns: ColumnDef<PodRow>[] = React.useMemo(() => [

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
			accessorKey: "pod",
			header: "Pod",
			cell: ({ row }) => <button className="text-left hover:underline focus:underline focus:outline-none font-mono text-xs">{row.original.pod}</button>,
			enableHiding: false,
		},
		{
			accessorKey: "node",
			header: "Node",
			cell: ({ row }) => <span className="font-mono text-xs">{row.original.node}</span>,
			enableHiding: false,
		},
				{
			accessorKey: "namespace",
			header: "Namespace",
			cell: ({ row }) => <span className="font-mono text-xs">{row.original.namespace}</span>,
			enableHiding: false,
		},
		{
			id: "cpu",
			header: "CPU (use / req)",
			cell: ({ row }) => {
				const r = row.original;
				return (
					<div className="flex flex-col">
						<span>{formatCores(r.cpuUsageCores)} / {formatCores(r.cpuReqCores)}</span>
						<span className={`text-xs ${r.cpuUseOverReq >= 1 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
							{(r.cpuUseOverReq || 0).toFixed(2)}×
						</span>
					</div>
				);
			},
		},
		{
			id: "mem",
			header: "Memory (WS / req)",
			cell: ({ row }) => {
				const r = row.original;
				return (
					<div className="flex flex-col">
						<span>{formatBytesIEC(r.memWorkingSetBytes)} / {formatBytesIEC(r.memReqBytes)}</span>
						<span className={`text-xs ${r.memUseOverReq >= 1 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
							{(r.memUseOverReq || 0).toFixed(2)}×
						</span>
					</div>
				);
			},
		},
		{
			accessorKey: "netBps",
			header: "Net (bps)",
			cell: ({ row }) => <span>{Intl.NumberFormat().format(Math.round(row.original.netBps))}</span>,
		},
		{
			accessorKey: "ephPct",
			header: "Ephemeral",
			cell: ({ row }) => <span>{(row.original.ephPct || 0).toFixed(0)}%</span>,
		},
		{
			accessorKey: "shareOfNodeCPU",
			header: "Node CPU Share",
			cell: ({ row }) => <span>{(row.original.shareOfNodeCPU * 100).toFixed(1)}%</span>,
		},
		{
			accessorKey: "shareOfNSCPU",
			header: "NS CPU Share",
			cell: ({ row }) => <span>{(row.original.shareOfNSCPU * 100).toFixed(1)}%</span>,
		},
		{
			accessorKey: "score",
			header: "Score",
			cell: ({ row }) => {
				const s = row.original.score;
				const color =
					s >= 0.75 ? "bg-red-600" :
						s >= 0.5 ? "bg-amber-600" :
							s >= 0.25 ? "bg-yellow-600" : "bg-emerald-600";
				return (
					<div className="flex items-center gap-2">
						<div className="h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
							<div className={`h-2 ${color}`} style={{ width: `${Math.round(s * 100)}%` }} />
						</div>
						<span className="text-xs">{Math.round(s * 100)}</span>
					</div>
				);
			},
			sortingFn: (a, b) => (b.original.score - a.original.score),
		},
		{
			accessorKey: "reasons",
			header: "Reasons",
			cell: ({ row }) => (
				<div className="flex flex-wrap gap-1">
					{row.original.reasons.map((r, i) => (
						<Badge key={i} variant="secondary" className="text-[10px]">{r}</Badge>
					))}
				</div>
			),
		},
	], []);

	const podBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "view-details",
			label: "View Details",
			icon: <Eye className="size-4" />,
			action: () => { },
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Pod Names",
			icon: <Copy className="size-4" />,
			action: () => { },
			requiresSelection: true,
		},
		{
			id: "export-yaml",
			label: "Export as YAML",
			icon: <Download className="size-4" />,
			action: () => { },
			requiresSelection: true,
		},
		{
			id: "delete-pods",
			label: "Delete Selected Pods",
			icon: <Trash className="size-4" />,
			action: () => { },
			variant: "destructive" as const,
			requiresSelection: true,
		},
	], []);

	// Use a higher-precision formatter for tooltips to avoid rounding artifacts
	const highPrecisionFormatCores = (v: number) => formatCores(v, 3);

	return (
		<div className="space-y-6">
			<SummaryCards
				cards={summaryData}
				columns={4}
				loading={isLiveLoading || loadingEntities}
				noPadding={true}
			/>

			<div className="flex items-center justify-end gap-2">
				<Select value={since} onValueChange={(v: any) => setSince(v)}>
					<SelectTrigger className="w-[110px] h-8">
						<SelectValue placeholder="Window" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="15m">Last 15m</SelectItem>
						<SelectItem value="30m">Last 30m</SelectItem>
						<SelectItem value="1h">Last 1h</SelectItem>
					</SelectContent>
				</Select>
				<div className="flex items-center gap-1">
					<span className="text-xs text-muted-foreground">Pods</span>
					<Input
						className="h-8 w-20"
						type="number"
						min={50}
						max={800}
						value={maxPods}
						onChange={(e) => setMaxPods(parseInt(e.target.value || "200", 10))}
					/>
				</div>
				<div className="flex items-center gap-1">
					<span className="text-xs text-muted-foreground">Top</span>
					<Input
						className="h-8 w-16"
						type="number"
						min={3}
						max={12}
						value={topN}
						onChange={(e) => setTopN(parseInt(e.target.value || "5", 10))}
					/>
				</div>
			</div>

			{entityError && (
				<Alert variant="destructive">
					<AlertDescription>Failed to load entities: {entityError}</AlertDescription>
				</Alert>
			)}

			{/* Charts */}
			<div className="grid grid-cols-1 gap-6">
				<MetricAreaChart
					title={`Pod CPU on ${selectedNode || "..."}`}
					subtitle={`Stacked CPU usage for the top ${topN} most dominant pods on node ${selectedNode || "—"}.`}
					capabilities={
						<Select value={selectedNode} onValueChange={setSelectedNode}>
							<SelectTrigger className="w-[180px] h-8">
								<SelectValue placeholder="Node" />
							</SelectTrigger>
							<SelectContent>
								{nodes.map((n) => (<SelectItem key={n.name} value={n.name}>{n.name}</SelectItem>))}
							</SelectContent>
						</Select>
					}
					series={dominanceSeries}
					stacked
					unit="cores"
					formatter={highPrecisionFormatCores}
					emptyMessage={`No pod data for node ${selectedNode || "..."}`}
					isLoading={isLiveLoading || loadingEntities}
					error={entityError}
				/>
				<MetricAreaChart
					title={`CPU Usage (Top ${topN} Nodes)`}
					series={sortedNodes.slice(0, topN).map((n) => {
						const key = buildNodeKey(NODE_CPU_USE, n.name);
						return {
							key: key,
							name: n.name,
							data: (seriesData?.[key] || []).map((p: any) => [p.t, p.v]),
						};
					})}
					stacked
					unit="cores"
					formatter={highPrecisionFormatCores}
					emptyMessage="No node CPU data available."
					isLoading={isLiveLoading || loadingEntities}
					error={entityError}
				/>
			</div>

			{/* Table Card */}
			<div className="border rounded-lg bg-card">
				<div className="p-4 border-b">
					<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="text-xl font-semibold">Potential Noisy Neighbors</h2>
							<p className="text-sm text-muted-foreground mt-1">
								Pods with high resource usage that may be impacting others, sorted by a heuristic score.
							</p>
						</div>
						<Badge variant="outline" className="text-xs">
							{rows.length} pods analyzed
						</Badge>
					</div>
				</div>

				<div className="px-4 pb-6">
					<UniversalDataTable
						data={filteredRows}
						columns={columns}
						enableReorder={true}
						enableRowSelection={true}
						className="px-0 [&_tbody_tr]:bg-background/50"
						getRowId={(r) => `${r.namespace}/${r.pod}`}
						renderFilters={({ table, selectedCount, totalCount }) => (
							<div className="p-4 space-y-4">
								<DataTableFilters
									globalFilter={globalFilter}
									onGlobalFilterChange={setGlobalFilter}
									searchPlaceholder="Filter by pod, namespace, node, or reason..."
									selectedCount={selectedCount}
									totalCount={totalCount}
									bulkActions={podBulkActions}
									bulkActionsLabel="Pod Actions"
									table={table}
									showColumnToggle={true}
								/>
							</div>
						)}
						emptyMessage={loadingEntities ? "Discovering pods..." : "No pods found in the current window."}
					/>
				</div>
			</div>
		</div>
	);
}

export default NoisyNeighborDetectionSection;
