"use client"

import * as React from "react"
import {
	Blocks,
	Play,
	Pause,
	AlertTriangle,
	Gauge,
	Server,
	TrendingUp,
	Activity,
	Layers,
	MoreVertical,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
	MetricLineChart,
	MetricBarChart,
	type ChartSeries,
} from "@/components/opsview/charts"
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries"
import { formatBytesIEC, formatCores } from "@/lib/metric-utils"

// Basic point + series shapes
interface DataPoint { t: number; v: number }
type SeriesMap = Record<string, DataPoint[]>

const CLUSTER_SERIES_KEYS = [
	"cluster.pods.running",
	"cluster.pods.pending",
	"cluster.pods.failed",
	"cluster.pods.succeeded",
	"cluster.pods.unschedulable",
	"cluster.pods.restarts.rate",
	"cluster.pods.restarts.1h",
	"cluster.cpu.used.cores",
	"cluster.cpu.requested.cores",
	"cluster.cpu.limits.cores",
	"cluster.mem.used.bytes",
	"cluster.mem.requested.bytes",
	"cluster.mem.limits.bytes",
]

const NAMESPACE_METRIC_BASES = [
	"ns.cpu.used.cores",
	"ns.cpu.request.cores",
	"ns.mem.used.bytes",
	"ns.mem.request.bytes",
	"ns.pods.running",
	"ns.pods.restarts.rate",
]

const POD_RESTART_BASES = [
	"pod.restarts.total",
	"pod.restarts.rate",
]

async function fetchJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
	const res = await fetch(input, init)
	if (!res.ok) {
		throw new Error(`Request failed: ${res.status}`)
	}
	return res.json() as Promise<T>
}

function mergeSeries(base: SeriesMap, override: SeriesMap): SeriesMap {
	if (!override || Object.keys(override).length === 0) return base
	const merged: SeriesMap = { ...base }
	for (const [key, value] of Object.entries(override)) {
		if (value && value.length > 0) {
			merged[key] = value
		}
	}
	return merged
}

function latestValue(series: SeriesMap, key: string): number | null {
	const arr = series[key]
	if (arr && arr.length > 0) {
		return arr[arr.length - 1].v
	}
	return null
}

function deltaValue(series: SeriesMap, key: string): number {
	const arr = series[key]
	if (!arr || arr.length < 2) return 0
	return arr[arr.length - 1].v - arr[arr.length - 2].v
}

function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false
	return a.every((value, index) => value === b[index])
}

interface PodFocus { namespace: string; pod: string }
interface PodHotspot extends PodFocus {
	restartsTotal: number
	restartsRate: number
	rateSeries: DataPoint[]
	totalSeries: DataPoint[]
}

interface NamespaceStat {
	namespace: string
	cpuUsed?: number
	cpuRequest?: number
	cpuLimit?: number
	memUsed?: number
	memRequest?: number
	memLimit?: number
	podsRunning?: number
	restartsRate?: number
}

function parseNamespaceKey(key: string): { base: string; namespace: string } | null {
	const idx = key.lastIndexOf(".")
	if (idx <= 0 || idx === key.length - 1) return null
	return { base: key.slice(0, idx), namespace: key.slice(idx + 1) }
}

function parsePodKey(key: string): { base: string; namespace: string; pod: string } | null {
	const parts = key.split(".")
	if (parts.length < 4) return null
	return {
		base: parts.slice(0, parts.length - 2).join("."),
		namespace: parts[parts.length - 2],
		pod: parts[parts.length - 1],
	}
}

function Delta({ value }: { value: number }) {
	const up = value >= 0
	const magnitude = Math.abs(value)
	return (
		<div className="flex items-center gap-1 text-xs text-muted-foreground">
			{up ? <TrendingUp className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5 rotate-180" />}
			{magnitude === 0 ? "" : `${up ? "+" : "-"}${magnitude.toFixed(0)}`}
		</div>
	)
}

const toneForPct = (pct?: number | null): "ok" | "warn" | "crit" => {
	if (!Number.isFinite(pct)) return "ok"
	if (pct! >= 0.85) return "crit"
	if (pct! >= 0.7) return "warn"
	return "ok"
}

const ratioDisplay = (value?: number | null): string => {
	if (!Number.isFinite(value)) return "—"
	if (value! > 5) return `${value!.toFixed(1)}x`
	return `${Math.max(0, value! * 100).toFixed(0)}%`
}

export function WorkloadsDashboard() {
	const [initialCluster, setInitialCluster] = React.useState<SeriesMap>({})
	const [initialNamespaces, setInitialNamespaces] = React.useState<SeriesMap>({})
	const [initialPods, setInitialPods] = React.useState<SeriesMap>({})
	const [initialLoaded, setInitialLoaded] = React.useState(false)
	const [initialError, setInitialError] = React.useState<string | null>(null)
	const [namespaceFocus, setNamespaceFocus] = React.useState<string[]>([])
	const [podFocus, setPodFocus] = React.useState<PodFocus[]>([])

	React.useEffect(() => {
		let cancelled = false
		const load = async () => {
			setInitialError(null)
			try {
				const [clusterResp, nsResp, podResp] = await Promise.all([
					fetchJson<{ series: SeriesMap }>("/api/v1/timeseries/cluster?since=60m&res=lo"),
					fetchJson<{ series: SeriesMap }>("/api/v1/timeseries/namespaces?since=60m&res=lo"),
					fetchJson<{ series: SeriesMap }>("/api/v1/timeseries/pods?series=pod.restarts.total,pod.restarts.rate&since=90m&res=lo"),
				])
				if (cancelled) return
				setInitialCluster(clusterResp?.series ?? {})
				setInitialNamespaces(nsResp?.series ?? {})
				setInitialPods(podResp?.series ?? {})
				setInitialLoaded(true)
			} catch (err) {
				console.error("WorkloadsDashboard: initial load failed", err)
				if (!cancelled) setInitialError((err as Error).message)
			}
		}
		load()
		return () => {
			cancelled = true
		}
	}, [])

	const namespaceSeriesKeys = React.useMemo(() => {
		if (!initialLoaded || namespaceFocus.length === 0) return []
		const unique = new Set<string>()
		namespaceFocus.forEach(ns => {
			NAMESPACE_METRIC_BASES.forEach(base => unique.add(`${base}.${ns}`))
		})
		return Array.from(unique)
	}, [initialLoaded, namespaceFocus])

	const podSeriesKeys = React.useMemo(() => {
		if (!initialLoaded || podFocus.length === 0) return []
		const unique = new Set<string>()
		podFocus.forEach(({ namespace, pod }) => {
			POD_RESTART_BASES.forEach(base => unique.add(`${base}.${namespace}.${pod}`))
		})
		return Array.from(unique)
	}, [initialLoaded, podFocus])

	const clusterLive = useLiveSeriesSubscription("workloads-cluster", CLUSTER_SERIES_KEYS, {
		res: "lo",
		since: "60m",
		autoConnect: initialLoaded,
	})

	const namespaceLive = useLiveSeriesSubscription("workloads-namespaces", namespaceSeriesKeys, {
		res: "lo",
		since: "60m",
		autoConnect: initialLoaded && namespaceSeriesKeys.length > 0,
	})

	const podLive = useLiveSeriesSubscription("workloads-pods", podSeriesKeys, {
		res: "hi",
		since: "60m",
		autoConnect: initialLoaded && podSeriesKeys.length > 0,
	})

	const clusterSeries = React.useMemo(() => mergeSeries(initialCluster, clusterLive.seriesData), [initialCluster, clusterLive.seriesData])
	const namespaceSeries = React.useMemo(() => mergeSeries(initialNamespaces, namespaceLive.seriesData), [initialNamespaces, namespaceLive.seriesData])
	const podSeries = React.useMemo(() => mergeSeries(initialPods, podLive.seriesData), [initialPods, podLive.seriesData])

	const namespaceStats = React.useMemo<NamespaceStat[]>(() => {
		const map = new Map<string, NamespaceStat>()
		for (const [key, points] of Object.entries(namespaceSeries)) {
			if (!points || points.length === 0) continue
			const parsed = parseNamespaceKey(key)
			if (!parsed) continue
			const { base, namespace } = parsed
			const last = points[points.length - 1]?.v
			if (!Number.isFinite(last)) continue
			const entry = map.get(namespace) ?? { namespace }
			switch (base) {
				case "ns.cpu.used.cores":
					entry.cpuUsed = last
					break
				case "ns.cpu.request.cores":
					entry.cpuRequest = last
					break
				case "ns.cpu.limit.cores":
					entry.cpuLimit = last
					break
				case "ns.mem.used.bytes":
					entry.memUsed = last
					break
				case "ns.mem.request.bytes":
					entry.memRequest = last
					break
				case "ns.mem.limit.bytes":
					entry.memLimit = last
					break
				case "ns.pods.running":
					entry.podsRunning = last
					break
				case "ns.pods.restarts.rate":
					entry.restartsRate = last
					break
				default:
					break
			}
			map.set(namespace, entry)
		}
		return Array.from(map.values()).sort((a, b) => (b.cpuUsed ?? 0) - (a.cpuUsed ?? 0))
	}, [namespaceSeries])

	const podHotspots = React.useMemo<PodHotspot[]>(() => {
		const map = new Map<string, PodHotspot>()
		for (const [key, points] of Object.entries(podSeries)) {
			if (!points || points.length === 0) continue
			const parsed = parsePodKey(key)
			if (!parsed) continue
			const { base, namespace, pod } = parsed
			if (!POD_RESTART_BASES.includes(base)) continue
			const id = `${namespace}/${pod}`
			const entry = map.get(id) ?? {
				namespace,
				pod,
				restartsRate: 0,
				restartsTotal: 0,
				rateSeries: [],
				totalSeries: [],
			}
			const last = points[points.length - 1]?.v ?? 0
			if (base === "pod.restarts.rate") {
				entry.restartsRate = last
				entry.rateSeries = points
			} else if (base === "pod.restarts.total") {
				entry.restartsTotal = last
				entry.totalSeries = points
			}
			map.set(id, entry)
		}
		return Array.from(map.values()).sort((a, b) => (b.restartsRate ?? 0) - (a.restartsRate ?? 0))
	}, [podSeries])

	React.useEffect(() => {
		if (!initialLoaded) return
		if (namespaceFocus.length === 0 && namespaceStats.length > 0) {
			const top = namespaceStats.slice(0, 6).map(ns => ns.namespace)
			setNamespaceFocus(top)
		}
	}, [initialLoaded, namespaceStats, namespaceFocus])

	React.useEffect(() => {
		if (!initialLoaded) return
		const currentIds = podFocus.map(item => `${item.namespace}/${item.pod}`)
		const top = podHotspots.slice(0, 6)
		const nextIds = top.map(item => `${item.namespace}/${item.pod}`)
		if (currentIds.length !== nextIds.length || currentIds.some((val, idx) => val !== nextIds[idx])) {
			setPodFocus(top.map(item => ({ namespace: item.namespace, pod: item.pod })))
		}
	}, [initialLoaded, podHotspots, podFocus])

	const podsRunning = Math.max(0, Math.round(latestValue(clusterSeries, "cluster.pods.running") ?? 0))
	const podsPending = Math.max(0, Math.round(latestValue(clusterSeries, "cluster.pods.pending") ?? 0))
	const podsFailed = Math.max(0, Math.round(latestValue(clusterSeries, "cluster.pods.failed") ?? 0))
	const podsSucceeded = Math.max(0, Math.round(latestValue(clusterSeries, "cluster.pods.succeeded") ?? 0))
	const podsUnschedulable = Math.max(0, Math.round(latestValue(clusterSeries, "cluster.pods.unschedulable") ?? 0))
	const podsTotal = podsRunning + podsPending + podsFailed + podsSucceeded

	const restartsRate = latestValue(clusterSeries, "cluster.pods.restarts.rate") ?? 0
	const restarts1h = latestValue(clusterSeries, "cluster.pods.restarts.1h") ?? 0

	const cpuUsed = latestValue(clusterSeries, "cluster.cpu.used.cores") ?? 0
	const cpuRequest = latestValue(clusterSeries, "cluster.cpu.requested.cores") ?? 0
	const cpuLimit = Math.max(latestValue(clusterSeries, "cluster.cpu.limits.cores") ?? 0, 1e-6)
	const memUsed = latestValue(clusterSeries, "cluster.mem.used.bytes") ?? 0
	const memRequest = latestValue(clusterSeries, "cluster.mem.requested.bytes") ?? 0
	const memLimit = Math.max(latestValue(clusterSeries, "cluster.mem.limits.bytes") ?? 0, 1e-6)

	const cpuUsedPct = cpuLimit > 0 ? cpuUsed / cpuLimit : undefined
	const cpuRequestPct = cpuLimit > 0 ? cpuRequest / cpuLimit : undefined
	const memUsedPct = memLimit > 0 ? memUsed / memLimit : undefined
	const memRequestPct = memLimit > 0 ? memRequest / memLimit : undefined

	const podsStateSeries: ChartSeries[] = React.useMemo(() => [
		{
			key: "cluster.pods.running",
			name: "Running",
			color: "hsl(var(--chart-2))",
			data: (clusterSeries["cluster.pods.running"] ?? []).map(p => [p.t, p.v]),
		},
		{
			key: "cluster.pods.pending",
			name: "Pending",
			color: "hsl(var(--chart-3))",
			data: (clusterSeries["cluster.pods.pending"] ?? []).map(p => [p.t, p.v]),
		},
		{
			key: "cluster.pods.failed",
			name: "Failed",
			color: "hsl(var(--chart-5))",
			data: (clusterSeries["cluster.pods.failed"] ?? []).map(p => [p.t, p.v]),
		},
	], [clusterSeries])

	const restartRateSeries: ChartSeries[] = React.useMemo(() => [
		{
			key: "cluster.pods.restarts.rate",
			name: "Restart rate (pods/min)",
			color: "hsl(var(--chart-5))",
			data: (clusterSeries["cluster.pods.restarts.rate"] ?? []).map(p => [p.t, p.v]),
		},
		{
			key: "cluster.pods.restarts.1h",
			name: "Restarts (1h window)",
			color: "hsl(var(--chart-4))",
			data: (clusterSeries["cluster.pods.restarts.1h"] ?? []).map(p => [p.t, p.v]),
		},
	], [clusterSeries])

	const cpuSeriesCharts: ChartSeries[] = React.useMemo(() => [
		{
			key: "cluster.cpu.used.cores",
			name: "Used",
			color: "#2563eb",
			data: (clusterSeries["cluster.cpu.used.cores"] ?? []).map(p => [p.t, p.v]),
		},
		{
			key: "cluster.cpu.requested.cores",
			name: "Requested",
			color: "#f97316",
			data: (clusterSeries["cluster.cpu.requested.cores"] ?? []).map(p => [p.t, p.v]),
		},
		{
			key: "cluster.cpu.limits.cores",
			name: "Limits",
			color: "#16a34a",
			data: (clusterSeries["cluster.cpu.limits.cores"] ?? []).map(p => [p.t, p.v]),
		},
	], [clusterSeries])

	const memSeriesCharts: ChartSeries[] = React.useMemo(() => [
		{
			key: "cluster.mem.used.bytes",
			name: "Used",
			color: "#0ea5e9",
			data: (clusterSeries["cluster.mem.used.bytes"] ?? []).map(p => [p.t, p.v]),
		},
		{
			key: "cluster.mem.requested.bytes",
			name: "Requested",
			color: "#a855f7",
			data: (clusterSeries["cluster.mem.requested.bytes"] ?? []).map(p => [p.t, p.v]),
		},
		{
			key: "cluster.mem.limits.bytes",
			name: "Limits",
			color: "#10b981",
			data: (clusterSeries["cluster.mem.limits.bytes"] ?? []).map(p => [p.t, p.v]),
		},
	], [clusterSeries])

	const topNamespaces = React.useMemo(() => {
		return namespaceStats
			.map(ns => {
				const cpu = Math.max(ns.cpuUsed ?? 0, ns.cpuRequest ?? 0, ns.cpuLimit ?? 0)
				const mem = Math.max(ns.memUsed ?? 0, ns.memRequest ?? 0, ns.memLimit ?? 0)
				return { namespace: ns.namespace, cpu, mem }
			})
			.filter(ns => ns.cpu > 0 || ns.mem > 0)
			.sort((a, b) => (b.cpu * 4 + b.mem) - (a.cpu * 4 + a.mem))
			.slice(0, 6)
	}, [namespaceStats])

	const namespaceCpuSeries: ChartSeries[] = React.useMemo(() => {
		const timestamp = Date.now()
		return topNamespaces.map(ns => ({
			key: `namespace-cpu-${ns.namespace}`,
			name: ns.namespace,
			data: [[timestamp, ns.cpu]],
		}))
	}, [topNamespaces])

	const namespaceMemSeries: ChartSeries[] = React.useMemo(() => {
		const timestamp = Date.now()
		return topNamespaces.map(ns => ({
			key: `namespace-mem-${ns.namespace}`,
			name: ns.namespace,
			data: [[timestamp, ns.mem]],
		}))
	}, [topNamespaces])

	const podRestartSeries: ChartSeries[] = React.useMemo(() => podFocus.slice(0, 3).map(({ namespace, pod }) => ({
		key: `pod.restarts.rate.${namespace}.${pod}`,
		name: `${namespace}/${pod}`,
		data: (podSeries[`pod.restarts.rate.${namespace}.${pod}`] ?? []).map(p => [p.t, p.v]),
	})), [podFocus, podSeries])

	const isConnected = clusterLive.isConnected

	const handleToggleLive = React.useCallback(() => {
		if (clusterLive.isConnected) {
			clusterLive.disconnect()
		} else {
			clusterLive.connect().catch(err => console.error("WorkloadsDashboard: failed to reconnect WebSocket", err))
		}
	}, [clusterLive])

	return (
		<div className="space-y-6 pb-16">
			<div className="px-4 lg:px-6">
				<div className="rounded-3xl border border-border bg-gradient-to-br from-background via-background to-muted shadow-sm overflow-hidden">
					<div className="px-6 py-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div className="space-y-2">
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="outline" className="gap-1 border-border text-foreground">
									<Layers className="h-4 w-4" /> Workloads overview
								</Badge>
								<Badge variant="outline" className="border-border text-muted-foreground">All namespaces</Badge>
								<Badge variant="outline" className="border-border text-muted-foreground">Resolution: Low</Badge>
								{isConnected ? (
									<Badge variant="outline" className="gap-1 border-border text-green-600">
										<span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /> Live
									</Badge>
								) : (
									<Badge variant="outline" className="gap-1 border-border text-amber-600">
										<span className="h-2 w-2 rounded-full bg-amber-500" /> Paused
									</Badge>
								)}
							</div>
							<div>
								<h1 className="text-xl font-semibold tracking-tight">Workload performance & health</h1>
								<p className="text-sm text-muted-foreground max-w-2xl">
									Monitor pod lifecycle, restart pressure, and namespace-level resource demand. Metrics hydrate from the live timeseries WebSocket feed.
								</p>
							</div>
						</div>
						<div className="px-6 pb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div className="flex items-center gap-2">
								<Input className="w-72" placeholder="Filter workloads, namespaces…" />
							</div>
							<div className="flex items-center gap-2">
								<Button size="sm" variant="outline" onClick={handleToggleLive}>
									{isConnected ? (<><Pause className="mr-2 h-4 w-4" />Pause live</>) : (<><Play className="mr-2 h-4 w-4" />Resume live</>)}
								</Button>
							</div>
						</div>
					</div>
				</div>
			</div>

			{initialError && (
				<div className="px-4 lg:px-6">
					<Alert variant="destructive">
						<AlertTitle>Unable to load workload metrics</AlertTitle>
						<AlertDescription>{initialError}</AlertDescription>
					</Alert>
				</div>
			)}

			<div className="px-4 lg:px-6">
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
					<Card className="border-border relative overflow-hidden">
						<CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
							<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
								<Blocks className="h-4 w-4" /> Running pods
							</div>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" className="h-8 w-8">
										<MoreVertical className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem asChild>
										<a href="/workloads/pods">View pods</a>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</CardHeader>
						<CardContent className="space-y-2">
							<div className="text-2xl font-semibold tabular-nums">{podsRunning}</div>
							<div className="flex items-center justify-between text-xs text-muted-foreground">
								<span>{podsTotal} total pods</span>
								<Delta value={deltaValue(clusterSeries, "cluster.pods.running")} />
							</div>
						</CardContent>
					</Card>

					<Card className="border-border relative overflow-hidden">
						<CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
							<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
								<Gauge className="h-4 w-4" /> Pending pods
							</div>
						</CardHeader>
						<CardContent className="space-y-2">
							<div className={`text-2xl font-semibold tabular-nums ${podsPending > 0 ? "text-amber-600" : ""}`}>{podsPending}</div>
							<div className="flex items-center justify-between text-xs text-muted-foreground">
								<span>{podsPending > 0 ? "Check scheduling pressure" : "Within normal range"}</span>
								<Delta value={deltaValue(clusterSeries, "cluster.pods.pending")} />
							</div>
						</CardContent>
					</Card>

					<Card className="border-border relative overflow-hidden">
						<CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
							<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
								<AlertTriangle className="h-4 w-4" /> Restarts (1h)
							</div>
						</CardHeader>
						<CardContent className="space-y-2">
							<div className={`text-2xl font-semibold tabular-nums ${restarts1h > 0 ? "text-red-500" : ""}`}>{restarts1h.toFixed(0)}</div>
							<div className="flex items-center justify-between text-xs text-muted-foreground">
								<span>{restartsRate.toFixed(2)} pods/min</span>
								<Delta value={deltaValue(clusterSeries, "cluster.pods.restarts.1h")} />
							</div>
						</CardContent>
					</Card>

					<Card className="border-border relative overflow-hidden">
						<CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
							<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
								<Server className="h-4 w-4" /> Unschedulable pods
							</div>
						</CardHeader>
						<CardContent className="space-y-2">
							<div className={`text-2xl font-semibold tabular-nums ${podsUnschedulable > 0 ? "text-red-500" : ""}`}>{podsUnschedulable}</div>
							<div className="flex items-center justify-between text-xs text-muted-foreground">
								<span>{podsUnschedulable > 0 ? "Investigate scheduling failures" : "All schedulable"}</span>
								<Delta value={deltaValue(clusterSeries, "cluster.pods.unschedulable")} />
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			<div className="px-4 lg:px-6 space-y-4">
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					<MetricLineChart
						title="Pod lifecycle"
						subtitle="Running vs pending vs failed"
						series={podsStateSeries}
						emptyMessage="No pod data"
						showGrid
						className="border-border"
					/>
					<MetricLineChart
						title="Restart pressure"
						subtitle="Rate and 1h aggregate"
						series={restartRateSeries}
						formatter={value => `${value.toFixed(2)}`}
						emptyMessage="No restart data"
						showGrid
						className="border-border"
					/>
				</div>

				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					<MetricLineChart
						title="CPU commitment"
						subtitle="Usage vs requests vs limits"
						series={cpuSeriesCharts}
						formatter={value => `${value.toFixed(2)} cores`}
						emptyMessage="No CPU data"
						showGrid
						className="border-border"
						footerExtra={
								<SectionHealthFooter
									tone={toneForPct(cpuUsedPct)}
									summary={`Using ${formatCores(cpuUsed)} of ${formatCores(cpuLimit)} (${ratioDisplay(cpuUsedPct)})`}
									usedPct={cpuUsedPct}
									ratioPills={[
										{ label: "Req/Limit", value: ratioDisplay(cpuRequestPct) },
										{ label: "Used", value: formatCores(cpuUsed) },
									]}
								/>
						}
					/>
					<MetricLineChart
						title="Memory commitment"
						subtitle="Usage vs requests vs limits"
						series={memSeriesCharts}
						formatter={value => formatBytesIEC(value)}
						emptyMessage="No memory data"
						showGrid
						className="border-border"
						footerExtra={
								<SectionHealthFooter
									tone={toneForPct(memUsedPct)}
									summary={`Using ${formatBytesIEC(memUsed)} of ${formatBytesIEC(memLimit)} (${ratioDisplay(memUsedPct)})`}
									usedPct={memUsedPct}
									ratioPills={[
										{ label: "Req/Limit", value: ratioDisplay(memRequestPct) },
										{ label: "Used", value: formatBytesIEC(memUsed) },
									]}
								/>
						}
					/>
				</div>

				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					<MetricBarChart
						title="Top namespaces by CPU"
						subtitle="Latest CPU usage"
						series={namespaceCpuSeries}
						formatter={value => `${value.toFixed(2)} cores`}
						emptyMessage="No namespace CPU data"
						className="border-border"
					/>
					<MetricBarChart
						title="Top namespaces by memory"
						subtitle="Latest memory usage"
						series={namespaceMemSeries}
						formatter={value => formatBytesIEC(value)}
						emptyMessage="No namespace memory data"
						className="border-border"
					/>
				</div>

				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					<MetricLineChart
						title="Pod restart hotspots"
						subtitle="Top pods by restart rate"
						series={podRestartSeries}
						formatter={value => `${value.toFixed(2)} pods/min`}
						emptyMessage="No pod restart activity"
						showGrid
						className="border-border"
					/>
					<Card className="border-border">
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Pods with most restarts</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{podHotspots.slice(0, 6).length === 0 ? (
								<div className="text-sm text-muted-foreground">No restart activity detected</div>
							) : (
								<div className="space-y-3">
									{podHotspots.slice(0, 6).map(item => (
										<div key={`${item.namespace}/${item.pod}`} className="flex flex-col gap-1 border border-border rounded-xl p-3">
											<div className="flex items-center justify-between">
												<div className="font-medium text-sm truncate">{item.pod}</div>
												<Badge variant="outline" className="text-muted-foreground border-border">{item.namespace}</Badge>
											</div>
											<div className="flex items-center justify-between text-xs text-muted-foreground">
												<span>{item.restartsTotal.toFixed(0)} total restarts</span>
												<span>{item.restartsRate.toFixed(2)} pods/min</span>
											</div>
										</div>
									))}
									<Button variant="link" size="sm" className="px-0 h-6" asChild>
										<a href="/workloads/pods">See all pods →</a>
									</Button>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
