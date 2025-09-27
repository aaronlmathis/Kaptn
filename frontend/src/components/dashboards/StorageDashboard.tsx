"use client"

import * as React from "react"
import {
	HardDrive,
	Warehouse,
	Database,
	Activity,
	Pause,
	Play,
	MoreVertical,
	Server,
	Layers,
	Gauge,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	MetricLineChart,
	MetricBarChart,
	type ChartSeries,
} from "@/components/opsview/charts"
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter"
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries"
import { formatBytesIEC } from "@/lib/metric-utils"

interface DataPoint { t: number; v: number }
type SeriesMap = Record<string, DataPoint[]>

const CLUSTER_STORAGE_KEYS = [
	"cluster.fs.image.used.bytes",
	"cluster.fs.image.capacity.bytes",
]

const NODE_STORAGE_BASES = [
	"node.fs.used.percent",
	"node.imagefs.used.percent",
	"node.fs.inodes.used.percent",
]

const POD_STORAGE_BASES = [
	"pod.ephemeral.used.percent",
	"pod.ephemeral.used.bytes",
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

function parseNodeKey(key: string): { base: string; node: string } | null {
	const idx = key.lastIndexOf(".")
	if (idx <= 0 || idx === key.length - 1) return null
	return { base: key.slice(0, idx), node: key.slice(idx + 1) }
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

const toneForPct = (pct?: number | null): "ok" | "warn" | "crit" => {
	if (!Number.isFinite(pct)) return "ok"
	if (pct! >= 0.9) return "crit"
	if (pct! >= 0.75) return "warn"
	return "ok"
}

const pctDisplay = (value?: number | null): string => {
	if (!Number.isFinite(value)) return "—"
	return `${Math.max(0, value! * 100).toFixed(0)}%`
}

interface NodeStat {
	node: string
	rootPct?: number
	imagePct?: number
	inodesPct?: number
	rootSeries: DataPoint[]
	imageSeries: DataPoint[]
}

interface PodStat {
	namespace: string
	pod: string
	ephemeralPct?: number
	ephemeralBytes?: number
	percentSeries: DataPoint[]
	bytesSeries: DataPoint[]
}

export function StorageDashboard() {
	const [initialCluster, setInitialCluster] = React.useState<SeriesMap>({})
	const [initialNodes, setInitialNodes] = React.useState<SeriesMap>({})
	const [initialPods, setInitialPods] = React.useState<SeriesMap>({})
	const [initialLoaded, setInitialLoaded] = React.useState(false)
	const [initialError, setInitialError] = React.useState<string | null>(null)
	const [nodeFocus, setNodeFocus] = React.useState<string[]>([])
	const [podFocus, setPodFocus] = React.useState<Array<{ namespace: string; pod: string }>>([])

	React.useEffect(() => {
		let cancelled = false
		const load = async () => {
			setInitialError(null)
			try {
				const queryCluster = `/api/v1/timeseries/cluster?series=${encodeURIComponent(CLUSTER_STORAGE_KEYS.join(","))}&since=24h&res=lo`
				const queryNodes = `/api/v1/timeseries/nodes?series=${encodeURIComponent(NODE_STORAGE_BASES.join(","))}&since=12h&res=lo`
				const queryPods = `/api/v1/timeseries/pods?series=${encodeURIComponent(POD_STORAGE_BASES.join(","))}&since=12h&res=lo`
				const [clusterResp, nodeResp, podResp] = await Promise.all([
					fetchJson<{ series: SeriesMap }>(queryCluster),
					fetchJson<{ series: SeriesMap }>(queryNodes),
					fetchJson<{ series: SeriesMap }>(queryPods),
				])
				if (cancelled) return
				setInitialCluster(clusterResp?.series ?? {})
				setInitialNodes(nodeResp?.series ?? {})
				setInitialPods(podResp?.series ?? {})
				setInitialLoaded(true)
			} catch (err) {
				console.error("StorageDashboard: initial load failed", err)
				if (!cancelled) {
					setInitialError((err as Error).message)
				}
			}
		}
		load()
		return () => {
			cancelled = true
		}
	}, [])

	const nodeSeriesKeys = React.useMemo(() => {
		if (!initialLoaded || nodeFocus.length === 0) return []
		const keys: string[] = []
		nodeFocus.forEach(node => {
			NODE_STORAGE_BASES.forEach(base => keys.push(`${base}.${node}`))
		})
		return keys
	}, [initialLoaded, nodeFocus])

	const podSeriesKeys = React.useMemo(() => {
		if (!initialLoaded || podFocus.length === 0) return []
		const keys: string[] = []
		podFocus.forEach(({ namespace, pod }) => {
			POD_STORAGE_BASES.forEach(base => keys.push(`${base}.${namespace}.${pod}`))
		})
		return keys
	}, [initialLoaded, podFocus])

	const clusterLive = useLiveSeriesSubscription("storage-cluster", CLUSTER_STORAGE_KEYS, {
		res: "lo",
		since: "24h",
		autoConnect: initialLoaded,
	})

	const nodeLive = useLiveSeriesSubscription("storage-nodes", nodeSeriesKeys, {
		res: "lo",
		since: "12h",
		autoConnect: initialLoaded && nodeSeriesKeys.length > 0,
	})

	const podLive = useLiveSeriesSubscription("storage-pods", podSeriesKeys, {
		res: "hi",
		since: "6h",
		autoConnect: initialLoaded && podSeriesKeys.length > 0,
	})

	const clusterSeries = React.useMemo(() => mergeSeries(initialCluster, clusterLive.seriesData), [initialCluster, clusterLive.seriesData])
	const nodeSeries = React.useMemo(() => mergeSeries(initialNodes, nodeLive.seriesData), [initialNodes, nodeLive.seriesData])
	const podSeries = React.useMemo(() => mergeSeries(initialPods, podLive.seriesData), [initialPods, podLive.seriesData])

	const nodeStats = React.useMemo<NodeStat[]>(() => {
		const map = new Map<string, NodeStat>()
		for (const [key, points] of Object.entries(nodeSeries)) {
			if (!points || points.length === 0) continue
			const parsed = parseNodeKey(key)
			if (!parsed) continue
			const { base, node } = parsed
			const entry = map.get(node) ?? { node, rootSeries: [], imageSeries: [] }
			const last = points[points.length - 1]?.v
			switch (base) {
				case "node.fs.used.percent":
					entry.rootPct = last
					entry.rootSeries = points
					break
				case "node.imagefs.used.percent":
					entry.imagePct = last
					entry.imageSeries = points
					break
				case "node.fs.inodes.used.percent":
					entry.inodesPct = last
					break
				default:
					break
			}
			map.set(node, entry)
		}
		return Array.from(map.values())
	}, [nodeSeries])

	const podStats = React.useMemo<PodStat[]>(() => {
		const map = new Map<string, PodStat>()
		for (const [key, points] of Object.entries(podSeries)) {
			if (!points || points.length === 0) continue
			const parsed = parsePodKey(key)
			if (!parsed) continue
			const { base, namespace, pod } = parsed
			if (!POD_STORAGE_BASES.includes(base)) continue
			const id = `${namespace}/${pod}`
			const entry = map.get(id) ?? {
				namespace,
				pod,
				ephemeralPct: undefined,
				ephemeralBytes: undefined,
				percentSeries: [],
				bytesSeries: [],
			}
			const last = points[points.length - 1]?.v
			if (base === "pod.ephemeral.used.percent") {
				entry.ephemeralPct = last
				entry.percentSeries = points
			} else if (base === "pod.ephemeral.used.bytes") {
				entry.ephemeralBytes = last
				entry.bytesSeries = points
			}
			map.set(id, entry)
		}
		return Array.from(map.values())
	}, [podSeries])

	React.useEffect(() => {
		if (!initialLoaded) return
		if (nodeFocus.length === 0 && nodeStats.length > 0) {
			const top = nodeStats
				.filter(ns => Number.isFinite(ns.rootPct) || Number.isFinite(ns.imagePct))
				.sort((a, b) => (b.rootPct ?? b.imagePct ?? 0) - (a.rootPct ?? a.imagePct ?? 0))
				.slice(0, 6)
				.map(ns => ns.node)
			setNodeFocus(top)
		}
	}, [initialLoaded, nodeStats, nodeFocus])

	React.useEffect(() => {
		if (!initialLoaded) return
		const currentIds = podFocus.map(item => `${item.namespace}/${item.pod}`)
		const top = podStats
			.filter(ps => Number.isFinite(ps.ephemeralPct))
			.sort((a, b) => (b.ephemeralPct ?? 0) - (a.ephemeralPct ?? 0))
			.slice(0, 6)
		const nextIds = top.map(item => `${item.namespace}/${item.pod}`)
		if (currentIds.length !== nextIds.length || currentIds.some((val, idx) => val !== nextIds[idx])) {
			setPodFocus(top.map(item => ({ namespace: item.namespace, pod: item.pod })))
		}
	}, [initialLoaded, podStats, podFocus])

	const imageUsed = latestValue(clusterSeries, "cluster.fs.image.used.bytes") ?? 0
	const imageCapacity = Math.max(latestValue(clusterSeries, "cluster.fs.image.capacity.bytes") ?? 0, 1e-6)
	const imagePct = imageCapacity > 0 ? imageUsed / imageCapacity : undefined

	const nodesOver80 = nodeStats.filter(ns => (ns.imagePct ?? 0) >= 80 || (ns.rootPct ?? 0) >= 80)
	const podsOver85 = podStats.filter(ps => (ps.ephemeralPct ?? 0) >= 85)

	const clusterSeriesCharts: ChartSeries[] = React.useMemo(() => [
		{
			key: "cluster.fs.image.used.bytes",
			name: "ImageFS used",
			color: "hsl(var(--chart-3))",
			data: (clusterSeries["cluster.fs.image.used.bytes"] ?? []).map(p => [p.t, p.v]),
		},
		{
			key: "cluster.fs.image.capacity.bytes",
			name: "ImageFS capacity",
			color: "hsl(var(--chart-5))",
			data: (clusterSeries["cluster.fs.image.capacity.bytes"] ?? []).map(p => [p.t, p.v]),
		},
	], [clusterSeries])

	const topRootNodes = React.useMemo(() => {
		return nodeStats
			.filter(ns => Number.isFinite(ns.rootPct))
			.sort((a, b) => (b.rootPct ?? 0) - (a.rootPct ?? 0))
			.slice(0, 3)
	}, [nodeStats])

	const topImageNodes = React.useMemo(() => {
		return nodeStats
			.filter(ns => Number.isFinite(ns.imagePct))
			.sort((a, b) => (b.imagePct ?? 0) - (a.imagePct ?? 0))
			.slice(0, 3)
	}, [nodeStats])

	const nodeRootSeries: ChartSeries[] = React.useMemo(() => topRootNodes.map(ns => ({
		key: `node.fs.used.percent.${ns.node}`,
		name: `${ns.node} rootfs%`,
		color: "hsl(var(--chart-2))",
		data: ns.rootSeries.map(p => [p.t, p.v]),
	})), [topRootNodes])

	const nodeImageSeries: ChartSeries[] = React.useMemo(() => topImageNodes.map(ns => ({
		key: `node.imagefs.used.percent.${ns.node}`,
		name: `${ns.node} imagefs%`,
		color: "hsl(var(--chart-4))",
		data: ns.imageSeries.map(p => [p.t, p.v]),
	})), [topImageNodes])

	const topPodSeries: ChartSeries[] = React.useMemo(() => podStats
		.filter(ps => Number.isFinite(ps.ephemeralPct))
		.sort((a, b) => (b.ephemeralPct ?? 0) - (a.ephemeralPct ?? 0))
		.slice(0, 3)
		.map(ps => ({
			key: `pod.ephemeral.used.percent.${ps.namespace}.${ps.pod}`,
			name: `${ps.namespace}/${ps.pod}`,
			color: "hsl(var(--chart-6))",
			data: ps.percentSeries.map(p => [p.t, p.v]),
		})), [podStats])

	const podBarSeries: ChartSeries[] = React.useMemo(() => {
		const timestamp = Date.now()
		return podStats
			.filter(ps => Number.isFinite(ps.ephemeralPct))
			.sort((a, b) => (b.ephemeralPct ?? 0) - (a.ephemeralPct ?? 0))
			.slice(0, 6)
			.map(ps => ({
				key: `pod-ephemeral-${ps.namespace}-${ps.pod}`,
				name: `${ps.namespace}/${ps.pod}`,
				data: [[timestamp, ps.ephemeralPct ?? 0]],
			}))
	}, [podStats])

	const isConnected = clusterLive.isConnected

	const handleToggleLive = React.useCallback(() => {
		if (clusterLive.isConnected) {
			clusterLive.disconnect()
		} else {
			clusterLive.connect().catch(err => console.error("StorageDashboard: failed to reconnect WebSocket", err))
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
									<HardDrive className="h-4 w-4" /> Storage overview
								</Badge>
								<Badge variant="outline" className="border-border text-muted-foreground">Cluster scope</Badge>
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
								<h1 className="text-xl font-semibold tracking-tight">Persistent storage health</h1>
								<p className="text-sm text-muted-foreground max-w-2xl">
									Spot disk pressure before it becomes disruptive. These metrics hydrate from the live timeseries feed and focus on ImageFS saturation, node level root filesystem usage, and pod ephemeral growth.
								</p>
							</div>
						</div>
						<div className="px-6 pb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div className="flex items-center gap-2">
								<Input className="w-72" placeholder="Filter pods, nodes…" />
							</div>
							<div className="flex items-center gap-2">
								<Button size="sm" variant="outline" onClick={handleToggleLive}>
									{isConnected ? (<><Pause className="mr-2 h-4 w-4" />Pause live</>) : (<><Play className="mr-2 h-4 w-4" />Resume live</>)}
								</Button>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button size="sm" variant="outline" className="gap-2">
											<MoreVertical className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem onSelect={() => clusterLive.backoff()}>
											Backoff connection
										</DropdownMenuItem>
										<DropdownMenuItem onSelect={() => clusterLive.disconnect()}>
											Disconnect
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
					</div>
				</div>
			</div>

			{initialError && (
				<div className="px-4 lg:px-6">
					<Alert variant="destructive">
						<AlertTitle>Unable to load storage metrics</AlertTitle>
						<AlertDescription>{initialError}</AlertDescription>
					</Alert>
				</div>
			)}

			<div className="px-4 lg:px-6">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<Card className="border-border">
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-base">
								<Gauge className="h-4 w-4 text-muted-foreground" /> ImageFS headroom
							</CardTitle>
						</CardHeader>
						<CardContent>
							<SectionHealthFooter
								tone={toneForPct(imagePct)}
								summary={`Using ${formatBytesIEC(imageUsed)} of ${formatBytesIEC(imageCapacity)} (${pctDisplay(imagePct)})`}
								usedPct={imagePct}
								ratioPills={[
									{ label: "Nodes over 80%", value: String(nodesOver80.length) },
									{ label: "Pods over 85%", value: String(podsOver85.length) },
								]}
							/>
						</CardContent>
					</Card>
					<Card className="border-border">
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-base">
								<Server className="h-4 w-4 text-muted-foreground" /> Nodes flagged (&gt;80%)
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{nodesOver80.length === 0 ? (
									<div className="text-sm text-muted-foreground">No nodes above 80% usage</div>
								) : (
									nodesOver80.slice(0, 4).map(item => (
										<div key={item.node} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
											<div className="text-sm font-medium">{item.node}</div>
											<div className="flex items-center gap-2 text-xs text-muted-foreground">
												<span>root {item.rootPct?.toFixed(0)}%</span>
												<span>image {item.imagePct?.toFixed(0)}%</span>
											</div>
										</div>
									))
								)}
							</div>
						</CardContent>
					</Card>
					<Card className="border-border">
						<CardHeader className="pb-3">
							<CardTitle className="flex items-center gap-2 text-base">
								<Activity className="h-4 w-4 text-muted-foreground" /> Pods near eviction
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{podsOver85.length === 0 ? (
									<div className="text-sm text-muted-foreground">No pods above 85% ephemeral usage</div>
								) : (
									podsOver85.slice(0, 4).map(item => (
										<div key={`${item.namespace}/${item.pod}`} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
											<div className="text-sm font-medium truncate">{item.namespace}/{item.pod}</div>
											<div className="text-xs text-muted-foreground flex items-center gap-2">
												<span>{item.ephemeralPct?.toFixed(0)}%</span>
												{Number.isFinite(item.ephemeralBytes) && <span>{formatBytesIEC(item.ephemeralBytes ?? 0)}</span>}
											</div>
										</div>
									))
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			<div className="px-4 lg:px-6 space-y-4">
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					<MetricLineChart
						title="Cluster ImageFS"
						subtitle="Used vs capacity"
						series={clusterSeriesCharts}
						formatter={value => formatBytesIEC(value)}
						emptyMessage="No ImageFS data"
						showGrid
						className="border-border"
					/>
					<MetricLineChart
						title="Node root filesystem"
						subtitle="Top nodes by root usage"
						series={nodeRootSeries}
						formatter={value => `${value.toFixed(0)}%`}
						emptyMessage="No node root filesystem data"
						showGrid
						className="border-border"
					/>
				</div>
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					<MetricLineChart
						title="Node ImageFS"
						subtitle="Top nodes by image filesystem usage"
						series={nodeImageSeries}
						formatter={value => `${value.toFixed(0)}%`}
						emptyMessage="No node ImageFS data"
						showGrid
						className="border-border"
					/>
					<MetricLineChart
						title="Pod ephemeral hotspots"
						subtitle="Top pods by ephemeral usage"
						series={topPodSeries}
						formatter={value => `${value.toFixed(0)}%`}
						emptyMessage="No pod ephemeral usage data"
						showGrid
						className="border-border"
					/>
				</div>
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					<MetricBarChart
						title="Pods by ephemeral usage"
						subtitle="Latest percent utilisation"
						series={podBarSeries}
						formatter={value => `${value.toFixed(0)}%`}
						emptyMessage="No pods reporting ephemeral usage"
						className="border-border"
					/>
					<Card className="border-border">
						<CardHeader className="pb-3">
							<CardTitle className="text-base flex items-center gap-2">
								<Warehouse className="h-4 w-4 text-muted-foreground" /> Storage quick links
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="flex flex-col gap-2">
								<a className="text-sm flex items-center gap-2 text-primary" href="/storage/persistent-volume-claims">
									<Database className="h-4 w-4" /> View persistent volume claims
								</a>
								<a className="text-sm flex items-center gap-2 text-primary" href="/storage/persistent-volumes">
									<Server className="h-4 w-4" /> Inspect persistent volumes
								</a>
								<a className="text-sm flex items-center gap-2 text-primary" href="/storage/storage-classes">
									<Layers className="h-4 w-4" /> Manage storage classes
								</a>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
