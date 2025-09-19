"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { ChevronUp, ChevronDown, AlertTriangle, Server, Blocks, Activity, Info, MoreVertical, Download, Copy, Eye, Check } from "lucide-react"
import {
	Card,
	CardContent,
	CardFooter,
} from "@/components/ui/card"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"

import {
	ComposedChart, Area, Line, Bar,
	XAxis, YAxis, CartesianGrid,
} from "recharts"
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	ChartLegend,
	type ChartConfig,
} from "@/components/ui/chart"

// Live timeseries streaming (shared with OpsView)
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries"
import { getNodes, type Node } from "@/lib/k8s-cluster"

/** Helpers */
function Delta({ value }: { value: number }) {
	const up = value >= 0
	return (
		<div className="flex items-center text-xs text-muted-foreground">
			{up ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {Math.abs(value)}
		</div>
	)
}
function cellClass(v: number) {
	if (v >= 0.85) return "bg-red-500/60"
	if (v >= 0.7) return "bg-orange-500/60"
	if (v >= 0.55) return "bg-amber-500/60"
	if (v >= 0.4) return "bg-yellow-500/60"
	if (v >= 0.25) return "bg-lime-500/60"
	return "bg-emerald-500/60"
}

/** Chart color config for ChartContainer */
const clusterChartConfig = {
	cpuReq: { label: "CPU Requested", color: "hsl(var(--chart-1))" },
	cpuUsed: { label: "CPU Used", color: "hsl(var(--chart-2))" },
	cpuAlloc: { label: "CPU Allocatable", color: "hsl(var(--muted-foreground))" },
	memReq: { label: "Mem Requested", color: "hsl(var(--chart-3))" },
	memUsed: { label: "Mem Used", color: "hsl(var(--chart-4))" },
	memAlloc: { label: "Mem Allocatable", color: "hsl(var(--muted-foreground))" },
	apiP50: { label: "API p50 (ms)", color: "hsl(var(--chart-1))" },
	apiP95: { label: "API p95 (ms)", color: "hsl(var(--chart-2))" },
	rps: { label: "Requests/s", color: "hsl(var(--chart-3))" },
	schedQ: { label: "Scheduler Q", color: "hsl(var(--chart-4))" },
	ctrlQ: { label: "Controller Q", color: "hsl(var(--chart-5))" },
	pods: { label: "Pods", color: "hsl(var(--chart-1))" },
	deployments: { label: "Deployments", color: "hsl(var(--chart-2))" },
	services: { label: "Services", color: "hsl(var(--chart-3))" },
	crs: { label: "Custom Resources", color: "hsl(var(--chart-4))" },
} satisfies ChartConfig

/** Main */
export default function ClusterDashboard() {
	// Subscribe to live cluster series (same WS client as OpsView)
	const seriesKeys = React.useMemo(
		() => [
			// CPU
			'cluster.cpu.used.cores',
			'cluster.cpu.allocatable.cores',
			'cluster.cpu.requested.cores',
			// Memory (bytes)
			'cluster.mem.used.bytes',
			'cluster.mem.allocatable.bytes',
			'cluster.mem.requested.bytes',
			// KPIs
			'cluster.nodes.ready',
			'cluster.nodes.count',
			'cluster.pods.running',
			'cluster.pods.pending',
			'cluster.pods.failed',
			'cluster.pods.unschedulable',
		],
		[]
	)

	const live = useLiveSeriesSubscription('cluster-dashboard', seriesKeys, {
		res: 'lo',
		since: '60m',
		autoConnect: true,
	})

	const isConnected = live.isConnected

	// Helper: get latest value for a series key
	const latest = React.useCallback((key: string): number => {
		const arr = live.seriesData[key]
		return arr && arr.length ? arr[arr.length - 1].v : 0
	}, [live.seriesData])

	// KPIs from live data (fallback to 0s if not available yet)
	const kpis = React.useMemo(() => {
		const nodesReady = Math.round(latest('cluster.nodes.ready'))
		const nodesTotal = Math.round(latest('cluster.nodes.count'))

		const podsRunning = Math.round(latest('cluster.pods.running'))
		const podsPending = Math.round(latest('cluster.pods.pending'))
		const podsFailed = Math.round(latest('cluster.pods.failed'))
		const podsTotal = podsRunning + podsPending + podsFailed

		return {
			nodesReady: { value: nodesReady, total: nodesTotal, delta: 0 },
			pods: { running: podsRunning, pending: podsPending, failed: podsFailed, total: podsTotal, delta: 0 },
			podsProblem: { pending: podsPending, unschedulable: Math.round(latest('cluster.pods.unschedulable')), delta: 0 },
			apiErrors: { rate: 0, delta: 0 },
		}
	}, [latest])

	// Align multiple series into a single recharts data array with progressive fill
	type AlignConfig = { key: string; field: string; transform?: (v: number) => number }
	function alignSeries(config: AlignConfig[]) {
		const timestamps = new Set<number>()
		for (const { key } of config) {
			const arr = live.seriesData[key] || []
			for (const p of arr) timestamps.add(p.t)
		}
		const sortedTs = Array.from(timestamps).sort((a, b) => a - b)

		// Build fast lookup per key
		const seriesSorted: Record<string, { t: number; v: number }[]> = {}
		for (const { key } of config) {
			const arr = (live.seriesData[key] || []).slice().sort((a, b) => a.t - b.t)
			seriesSorted[key] = arr
		}

		const pointers: Record<string, number> = {}
		const lastVal: Record<string, number | undefined> = {}
		for (const { key } of config) pointers[key] = 0

		const data: Array<any> = []
		for (const t of sortedTs) {
			const row: any = { t }
			for (const { key, field, transform } of config) {
				const arr = seriesSorted[key]
				let i = pointers[key]
				while (i < arr.length && arr[i].t <= t) {
					lastVal[key] = arr[i].v
					i++
				}
				pointers[key] = i
				const v = lastVal[key]
				row[field] = typeof v === 'number' ? (transform ? transform(v) : v) : undefined
			}
			data.push(row)
		}
		return data
	}

	// Chart datasets
	const capCpu = React.useMemo(() => alignSeries([
		{ key: 'cluster.cpu.allocatable.cores', field: 'cpuAlloc' },
		{ key: 'cluster.cpu.requested.cores', field: 'cpuReq' },
		{ key: 'cluster.cpu.used.cores', field: 'cpuUsed' },
	]), [live.seriesData])

	const capMem = React.useMemo(() => alignSeries([
		// Convert bytes -> GiB for readability
		{ key: 'cluster.mem.allocatable.bytes', field: 'memAlloc', transform: (v) => v / (1024 ** 3) },
		{ key: 'cluster.mem.requested.bytes', field: 'memReq', transform: (v) => v / (1024 ** 3) },
		{ key: 'cluster.mem.used.bytes', field: 'memUsed', transform: (v) => v / (1024 ** 3) },
	]), [live.seriesData])

	// Fallbacks if no live data yet
	// Fallback empty data if live data unavailable
	const cap = capCpu.length > 0 && capMem.length > 0 ? undefined : []
	// --- Node Health & Pressure (live) ---
	const [nodeList, setNodeList] = React.useState<Node[]>([])
	React.useEffect(() => {
		let mounted = true
		getNodes()
			.then(items => { if (mounted) setNodeList(items) })
			.catch(() => { /* ignore, leave empty */ })
		return () => { mounted = false }
	}, [])

	const nodeNames = React.useMemo(() => nodeList.map(n => n.name), [nodeList])

	const nodeMetricBases = React.useMemo(() => [
		'node.cpu.usage.cores',
		'node.allocatable.cpu.cores',
		'node.mem.usage.bytes',
		'node.allocatable.mem.bytes',
		'node.fs.used.percent',
		'node.imagefs.used.percent',
		'node.condition.pid_pressure',
	], [])

	const nodeMetricKeys = React.useMemo(() => {
		const keys: string[] = []
		for (const name of nodeNames) {
			for (const base of nodeMetricBases) keys.push(`${base}.${name}`)
		}
		return keys
	}, [nodeNames, nodeMetricBases])

	const { seriesData: nodeLive } = useLiveSeriesSubscription('node-health-grid', nodeMetricKeys, { res: 'lo', since: '30m', autoConnect: true })

	type NodePressureRow = { name: string; ready: boolean; cordoned: boolean; taints: number; values: { cpu: number; mem: number; disk: number; pid: number } }
	const nodes: NodePressureRow[] = React.useMemo(() => {
		return nodeList.map(n => {
			const last = (key: string) => {
				const arr = nodeLive[key]
				return arr && arr.length ? arr[arr.length - 1]!.v : 0
			}
			const cpuU = last(`node.cpu.usage.cores.${n.name}`)
			const cpuA = last(`node.allocatable.cpu.cores.${n.name}`)
			const memU = last(`node.mem.usage.bytes.${n.name}`)
			const memA = last(`node.allocatable.mem.bytes.${n.name}`)
			const rootFsPct = last(`node.fs.used.percent.${n.name}`)
			const imageFsPct = last(`node.imagefs.used.percent.${n.name}`)
			const pidPressure = last(`node.condition.pid_pressure.${n.name}`)

			const cpu = cpuA > 0 ? Math.max(0, Math.min(1, cpuU / cpuA)) : 0
			const mem = memA > 0 ? Math.max(0, Math.min(1, memU / memA)) : 0
			const disk = Math.max(0, Math.min(1, Math.max(rootFsPct, imageFsPct) / 100))
			const pid = pidPressure > 0 ? 1 : 0

			return {
				name: n.name,
				ready: !!n.status?.ready,
				cordoned: !!n.status?.unschedulable,
				taints: Array.isArray(n.taints) ? n.taints.length : 0,
				values: { cpu, mem, disk, pid }
			}
		})
	}, [nodeList, nodeLive])
	// TODO: Replace with real data
	const ns = []
	const cp = []
	const crds = { summary: { total: 0, groups: 0, versions: 0 }, top: [] }

	// Calculate latest values for health footers
	const latestCpu = (capCpu.length ? capCpu[capCpu.length - 1] : (cap ? cap[cap.length - 1] : undefined)) as any
	const latestMem = (capMem.length ? capMem[capMem.length - 1] : (cap ? cap[cap.length - 1] : undefined)) as any
	const cpuUsedPct = latestCpu ? (latestCpu.cpuUsed || 0) / Math.max(1e-9, latestCpu.cpuAlloc || 0) : 0
	const memUsedPct = latestMem ? (latestMem.memUsed || 0) / Math.max(1e-9, latestMem.memAlloc || 0) : 0
	const cpuReqPct = latestCpu ? (latestCpu.cpuReq || 0) / Math.max(1e-9, latestCpu.cpuAlloc || 0) : 0
	const memReqPct = latestMem ? (latestMem.memReq || 0) / Math.max(1e-9, latestMem.memAlloc || 0) : 0

	const cpuTone: "ok" | "warn" | "crit" = cpuUsedPct > 0.85 ? "crit" : cpuUsedPct > 0.7 ? "warn" : "ok"
	const memTone: "ok" | "warn" | "crit" = memUsedPct > 0.85 ? "crit" : memUsedPct > 0.7 ? "warn" : "ok"

	return (
		<div className="space-y-6">
			{/* Page Controls */}
			<div className="px-4 lg:px-6">
				<div className="border rounded-lg bg-card">
					<div className="px-4 py-3 border-b border-border">
						<h2 className="text-lg font-semibold">Cluster Overview</h2>
						<p className="text-sm text-muted-foreground">Monitor cluster health, capacity, and workload distribution</p>
					</div>
					<div className="px-4 py-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
						<div className="flex gap-2 items-center">
							<Badge variant="outline" className="gap-1 text-foreground border-border"><Server className="h-4 w-4" /> Cluster</Badge>
							<Badge variant="outline" className="text-muted-foreground border-border">All Namespaces</Badge>
							<Badge variant="outline" className="text-muted-foreground border-border">Resolution: Low</Badge>
							{isConnected ? (
								<Badge variant="outline" className="gap-1 text-green-600 border-border">
									<span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
									Live
								</Badge>
							) : (
								<Badge variant="outline" className="gap-1 text-amber-600 border-border">
									<span className="h-2 w-2 rounded-full bg-amber-500" />
									Paused
								</Badge>
							)}
						</div>
						<div className="flex gap-2 items-center">
							<Input placeholder="Filter operations data and sections…" className="w-72" />
							{isConnected ? (
								<Button size="sm" variant="outline" onClick={() => live.disconnect()}>Pause Live</Button>
							) : (
								<Button size="sm" variant="default" onClick={() => live.connect()}>Resume Live</Button>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* KPI Cards Grid */}
			<div className="px-4 lg:px-6">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{/* Nodes Ready */}
					<div className="w-full max-w-[var(--card-max)] mx-auto">
						<Card className="@container/chart p-0 gap-0 relative">
							{/* Card Type Header */}
							<div className="flex items-center justify-between px-3 py-2 border-b">
								<div className="flex items-center gap-2">
									<Server className="h-4 w-4 text-muted-foreground" />
									<span className="text-sm text-muted-foreground font-medium">Nodes Ready</span>
								</div>
								<div className="flex items-center gap-2">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="ghost" size="icon" className="h-8 w-8">
												<MoreVertical className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem asChild>
												<a href="/cluster/nodes"><Eye className="mr-2 h-4 w-4" />View Details</a>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>

							<CardContent className="px-3 pb-3 pt-3 flex flex-col justify-center min-h-[120px]">
								{/* Big value */}
								<div className="flex items-center gap-3">
									<div className="text-2xl font-semibold tabular-nums @[250px]/chart:text-3xl">
										{kpis.nodesReady.value}/{kpis.nodesReady.total}
									</div>
									<Delta value={kpis.nodesReady.delta} />
								</div>
								{/* Headline */}
								<div className="mt-3 text-sm font-medium flex items-center gap-1">
									{kpis.nodesReady.total > 0 && kpis.nodesReady.value === kpis.nodesReady.total ? (
										<>
											<span>All nodes ready</span>
											<Check className="h-4 w-4" />
										</>
									) : (
										<span>{kpis.nodesReady.total > 0 ? `${kpis.nodesReady.total - kpis.nodesReady.value} node(s) not ready` : 'No cluster nodes detected'}</span>
									)}
								</div>
								{/* Subline */}
								<div className="mt-1 text-sm text-muted-foreground">All systems operational</div>
							</CardContent>

							{/* Info Tooltip - Bottom Right Corner */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
									>
										<Info className="h-3 w-3" />
									</Button>
								</TooltipTrigger>
								<TooltipContent
									side="left"
									align="end"
									className="max-w-[300px] bg-popover border border-border shadow-md"
								>
									<div className="space-y-1">
										<div className="font-medium text-sm text-popover-foreground">Nodes Ready</div>
										<div className="text-xs text-muted-foreground leading-relaxed">
											Cluster infrastructure health - shows the number of ready nodes out of total nodes in the cluster
										</div>
									</div>
								</TooltipContent>
							</Tooltip>
						</Card>
					</div>

					{/* Pods Running */}
					<div className="w-full max-w-[var(--card-max)] mx-auto">
						<Card className="@container/chart p-0 gap-0 relative">
							{/* Card Type Header */}
							<div className="flex items-center justify-between px-3 py-2 border-b">
								<div className="flex items-center gap-2">
									<Blocks className="h-4 w-4 text-muted-foreground" />
									<span className="text-sm text-muted-foreground font-medium">Pods Running</span>
								</div>
								<div className="flex items-center gap-2">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="ghost" size="icon" className="h-8 w-8">
												<MoreVertical className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem asChild>
												<a href="/workloads/pods"><Eye className="mr-2 h-4 w-4" />View Details</a>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>

							<CardContent className="px-3 pb-3 pt-3 flex flex-col justify-center min-h-[120px]">
								{/* Big value */}
								<div className="flex items-center gap-3">
									<div className="text-2xl font-semibold tabular-nums @[250px]/chart:text-3xl">
										{kpis.pods.total > 0 ? `${kpis.pods.running}/${kpis.pods.total}` : `${kpis.pods.running}`}
									</div>
									<Delta value={kpis.pods.delta} />
								</div>
								{/* Headline */}
								<div className="mt-3 text-sm font-medium flex items-center gap-1">
									{kpis.pods.total > 0 ? (
										<>
											<span>{Math.round((kpis.pods.running / Math.max(1, kpis.pods.total)) * 100)}% pods running successfully</span>
											<Check className="h-4 w-4" />
										</>
									) : (
										<span>No workload activity</span>
									)}
								</div>
								{/* Subline */}
								<div className="mt-1 text-sm text-muted-foreground">
									{kpis.pods.pending > 0 ? `${kpis.pods.pending} pod(s) pending startup` : 'All pods scheduled'}
								</div>
							</CardContent>

							{/* Info Tooltip - Bottom Right Corner */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
									>
										<Info className="h-3 w-3" />
									</Button>
								</TooltipTrigger>
								<TooltipContent
									side="left"
									align="end"
									className="max-w-[300px] bg-popover border border-border shadow-md"
								>
									<div className="space-y-1">
										<div className="font-medium text-sm text-popover-foreground">Pods Running</div>
										<div className="text-xs text-muted-foreground leading-relaxed">
											Active workload instances - total number of pods currently running across all namespaces
										</div>
									</div>
								</TooltipContent>
							</Tooltip>
						</Card>
					</div>

					{/* Unschedulable Pods */}
					<div className="w-full max-w-[var(--card-max)] mx-auto">
						<Card className="@container/chart p-0 gap-0 relative">
							{/* Card Type Header */}
							<div className="flex items-center justify-between px-3 py-2 border-b">
								<div className="flex items-center gap-2">
									<AlertTriangle className="h-4 w-4 text-muted-foreground" />
									<span className="text-sm text-muted-foreground font-medium">Unschedulable Pods</span>
								</div>
								<div className="flex items-center gap-2">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="ghost" size="icon" className="h-8 w-8">
												<MoreVertical className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem asChild>
												<a href="/workloads/pods?status=unschedulable"><Eye className="mr-2 h-4 w-4" />View Details</a>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>

							<CardContent className="px-3 pb-3 pt-3 flex flex-col justify-center min-h-[120px]">
								{/* Big value */}
								<div className="flex items-center gap-3">
									<div className="text-2xl font-semibold tabular-nums @[250px]/chart:text-3xl">
										{kpis.podsProblem.unschedulable}
									</div>
									<AlertTriangle className="h-5 w-5 text-amber-600" />
								</div>
								{/* Headline */}
								<div className="mt-3 text-sm font-medium">{kpis.podsProblem.unschedulable > 0 ? 'Unschedulable pods detected' : 'No unschedulable pods'}</div>
								{/* Subline */}
								<div className="mt-1 text-sm text-muted-foreground">Pods awaiting placement or resources</div>
							</CardContent>

							{/* Info Tooltip - Bottom Right Corner */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
									>
										<Info className="h-3 w-3" />
									</Button>
								</TooltipTrigger>
								<TooltipContent
									side="left"
									align="end"
									className="max-w-[300px] bg-popover border border-border shadow-md"
								>
									<div className="space-y-1">
										<div className="font-medium text-sm text-popover-foreground">Unschedulable Pods</div>
										<div className="text-xs text-muted-foreground leading-relaxed">
											Pods awaiting placement - pods that cannot be scheduled due to resource constraints or node affinity rules
										</div>
									</div>
								</TooltipContent>
							</Tooltip>
						</Card>
					</div>

					{/* API Errors */}
					<div className="w-full max-w-[var(--card-max)] mx-auto">
						<Card className="@container/chart p-0 gap-0 relative">
							{/* Card Type Header */}
							<div className="flex items-center justify-between px-3 py-2 border-b">
								<div className="flex items-center gap-2">
									<Activity className="h-4 w-4 text-muted-foreground" />
									<span className="text-sm text-muted-foreground font-medium">API Errors/s</span>
								</div>
								<div className="flex items-center gap-2">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="ghost" size="icon" className="h-8 w-8">
												<MoreVertical className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem asChild>
												<a href="/cluster/apiserver"><Eye className="mr-2 h-4 w-4" />View Details</a>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>

							<CardContent className="px-3 pb-3 pt-3 flex flex-col justify-center min-h-[120px]">
								{/* Big value */}
								<div className="flex items-center gap-3">
									<div className="text-2xl font-semibold tabular-nums @[250px]/chart:text-3xl">
										{Number.isFinite(kpis?.apiErrors?.rate) ? kpis.apiErrors.rate.toFixed(2) : '—'}
									</div>
									<Delta value={kpis?.apiErrors?.delta ?? 0} />
								</div>
								{/* Headline */}
								<div className="mt-3 text-sm font-medium">
									{kpis.apiErrors.rate > 0 ? 'API errors present' : 'Error rate nominal'}
								</div>
								{/* Subline */}
								<div className="mt-1 text-sm text-muted-foreground">API server error rate (errors/s)</div>
							</CardContent>

							{/* Info Tooltip - Bottom Right Corner */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
									>
										<Info className="h-3 w-3" />
									</Button>
								</TooltipTrigger>
								<TooltipContent
									side="left"
									align="end"
									className="max-w-[300px] bg-popover border border-border shadow-md"
								>
									<div className="space-y-1">
										<div className="font-medium text-sm text-popover-foreground">API Errors/s</div>
										<div className="text-xs text-muted-foreground leading-relaxed">
											Control plane reliability - rate of API server errors per second indicating cluster health
										</div>
									</div>
								</TooltipContent>
							</Tooltip>
						</Card>
					</div>
				</div>
			</div>

			{/* Resource Utilization Charts */}
			<div className="px-4 lg:px-6">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* CPU Chart */}
					<div className="w-full max-w-[var(--card-max)] mx-auto">
						<Card className="@container/chart p-0 relative">
							{/* Chart Type Header */}
							<div className="flex items-center justify-between px-3 py-2 border-b">
								<div className="flex items-center gap-2">
									<Activity className="h-4 w-4 text-muted-foreground" />
									<span className="text-sm text-muted-foreground font-medium">CPU Usage vs Requests vs Limits</span>
								</div>
								<div className="flex items-center gap-2">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="ghost" size="icon" className="h-8 w-8">
												<MoreVertical className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem>
												<Download className="mr-2 h-4 w-4" />
												Download CSV
											</DropdownMenuItem>
											<DropdownMenuItem>
												<Copy className="mr-2 h-4 w-4" />
												Copy chart as PNG
											</DropdownMenuItem>
											<DropdownMenuItem>
												<Eye className="mr-2 h-4 w-4" />
												Inspect series
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>

							<CardContent className="px-3 pb-3 pt-3">
								<div className="h-64">
									<ChartContainer config={clusterChartConfig} className="h-full w-full">
										<ComposedChart data={capCpu.length ? capCpu : (cap || [])} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
											<CartesianGrid strokeDasharray="3 3" />
											<XAxis dataKey="t" hide />
											<YAxis />
											<ChartTooltip content={<ChartTooltipContent />} />
											<ChartLegend />
											<Area dataKey="cpuAlloc" name="Allocatable" fill="var(--color-cpuAlloc)" fillOpacity={0.1} stroke="var(--color-cpuAlloc)" connectNulls />
											<Area dataKey="cpuReq" name="Requested" fill="var(--color-cpuReq)" fillOpacity={0.3} stroke="var(--color-cpuReq)" connectNulls />
											<Line dataKey="cpuUsed" name="Used" strokeWidth={2} dot={false} stroke="var(--color-cpuUsed)" connectNulls />
										</ComposedChart>
									</ChartContainer>
								</div>
							</CardContent>

							{/* Info Tooltip - Bottom Right Corner */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
									>
										<Info className="h-3 w-3" />
									</Button>
								</TooltipTrigger>
								<TooltipContent
									side="left"
									align="end"
									className="max-w-[300px] bg-popover border border-border shadow-md"
								>
									<div className="space-y-1">
										<div className="font-medium text-sm text-popover-foreground">CPU Utilization</div>
										<div className="text-xs text-muted-foreground leading-relaxed">
											Cluster CPU usage over time showing used, requested, and allocatable resources
										</div>
									</div>
								</TooltipContent>
							</Tooltip>

							<CardFooter className="flex-col items-start gap-2 text-sm px-3 pt-2 pb-3">
								{/* Health Footer */}
								<div className={`flex items-start gap-2 rounded-md px-2 py-1.5 w-full ${cpuTone === "crit" ? "bg-red-900/30" : cpuTone === "warn" ? "bg-amber-900/30" : "bg-emerald-900/30"}`}>
									<div className="flex-1">
										<div className="text-sm">
											<span className={`font-medium ${cpuTone === "crit" ? "text-red-300" : cpuTone === "warn" ? "text-amber-300" : "text-emerald-300"}`}>
												CPU {(cpuUsedPct * 100).toFixed(0)}% utilized ({(latestCpu?.cpuUsed ?? 0).toFixed(1)} / {(latestCpu?.cpuAlloc ?? 0).toFixed(1)} cores)
											</span>
										</div>
										{typeof cpuUsedPct === "number" && (
											<div className="mt-1">
												<div className="h-1.5 w-full rounded bg-slate-800/60 overflow-hidden">
													<div
														className={`h-1.5 transition-all ${cpuTone === "crit" ? "bg-red-500" : cpuTone === "warn" ? "bg-amber-500" : "bg-emerald-500"}`}
														style={{ width: `${(cpuUsedPct * 100).toFixed(0)}%` }}
													/>
												</div>
												<div className="mt-1 text-[11px] text-slate-400">{(cpuUsedPct * 100).toFixed(0)}% of capacity</div>
											</div>
										)}
										<div className="flex flex-wrap gap-1.5 pt-1">
											<span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] border border-white/10 bg-slate-800/40 text-slate-200">
												<span className="opacity-80">Requested/Alloc:</span>
												<span className="font-semibold">{(cpuReqPct * 100).toFixed(0)}%</span>
											</span>
										</div>
									</div>
								</div>
							</CardFooter>
						</Card>
					</div>

					{/* Memory Chart */}
					<div className="w-full max-w-[var(--card-max)] mx-auto">
						<Card className="@container/chart p-0 relative">
							{/* Chart Type Header */}
							<div className="flex items-center justify-between px-3 py-2 border-b">
								<div className="flex items-center gap-2">
									<Activity className="h-4 w-4 text-muted-foreground" />
									<span className="text-sm text-muted-foreground font-medium">Memory Usage vs Requests vs Limits</span>
								</div>
								<div className="flex items-center gap-2">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="ghost" size="icon" className="h-8 w-8">
												<MoreVertical className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem>
												<Download className="mr-2 h-4 w-4" />
												Download CSV
											</DropdownMenuItem>
											<DropdownMenuItem>
												<Copy className="mr-2 h-4 w-4" />
												Copy chart as PNG
											</DropdownMenuItem>
											<DropdownMenuItem>
												<Eye className="mr-2 h-4 w-4" />
												Inspect series
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>

							<CardContent className="px-3 pb-3 pt-3">
								<div className="h-64">
									<ChartContainer config={clusterChartConfig} className="h-full w-full">
										<ComposedChart data={capMem.length ? capMem : (cap || [])} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
											<CartesianGrid strokeDasharray="3 3" />
											<XAxis dataKey="t" hide />
											<YAxis />
											<ChartTooltip content={<ChartTooltipContent />} />
											<ChartLegend />
											<Area dataKey="memAlloc" name="Allocatable" fill="var(--color-memAlloc)" fillOpacity={0.1} stroke="var(--color-memAlloc)" connectNulls />
											<Area dataKey="memReq" name="Requested" fill="var(--color-memReq)" fillOpacity={0.3} stroke="var(--color-memReq)" connectNulls />
											<Line dataKey="memUsed" name="Used" strokeWidth={2} dot={false} stroke="var(--color-memUsed)" connectNulls />
										</ComposedChart>
									</ChartContainer>
								</div>
							</CardContent>

							{/* Info Tooltip - Bottom Right Corner */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
									>
										<Info className="h-3 w-3" />
									</Button>
								</TooltipTrigger>
								<TooltipContent
									side="left"
									align="end"
									className="max-w-[300px] bg-popover border border-border shadow-md"
								>
									<div className="space-y-1">
										<div className="font-medium text-sm text-popover-foreground">Memory Utilization</div>
										<div className="text-xs text-muted-foreground leading-relaxed">
											Cluster memory usage over time showing used, requested, and allocatable resources
										</div>
									</div>
								</TooltipContent>
							</Tooltip>

							<CardFooter className="flex-col items-start gap-2 text-sm px-3 pt-2 pb-3">
								{/* Health Footer */}
								<div className={`flex items-start gap-2 rounded-md px-2 py-1.5 w-full ${memTone === "crit" ? "bg-red-900/30" : memTone === "warn" ? "bg-amber-900/30" : "bg-emerald-900/30"}`}>
									<div className="flex-1">
										<div className="text-sm">
											<span className={`font-medium ${memTone === "crit" ? "text-red-300" : memTone === "warn" ? "text-amber-300" : "text-emerald-300"}`}>
												Memory {(memUsedPct * 100).toFixed(0)}% utilized ({(latestMem?.memUsed ?? 0).toFixed(1)} / {(latestMem?.memAlloc ?? 0).toFixed(1)} GiB)
											</span>
										</div>
										{typeof memUsedPct === "number" && (
											<div className="mt-1">
												<div className="h-1.5 w-full rounded bg-slate-800/60 overflow-hidden">
													<div
														className={`h-1.5 transition-all ${memTone === "crit" ? "bg-red-500" : memTone === "warn" ? "bg-amber-500" : "bg-emerald-500"}`}
														style={{ width: `${(memUsedPct * 100).toFixed(0)}%` }}
													/>
												</div>
												<div className="mt-1 text-[11px] text-slate-400">{(memUsedPct * 100).toFixed(0)}% of capacity</div>
											</div>
										)}
										<div className="flex flex-wrap gap-1.5 pt-1">
											<span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] border border-white/10 bg-slate-800/40 text-slate-200">
												<span className="opacity-80">Requested/Alloc:</span>
												<span className="font-semibold">{(memReqPct * 100).toFixed(0)}%</span>
											</span>
										</div>
									</div>
								</div>
							</CardFooter>
						</Card>
					</div>
				</div>
			</div>

			{/* Node Health & Additional Sections */}
			<div className="px-4 lg:px-6">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Node Health */}
					<div className="border rounded-lg bg-card relative">
						<div className="flex items-center justify-between px-3 py-2 border-b">
							<div className="flex items-center gap-2">
								<Server className="h-4 w-4 text-muted-foreground" />
								<span className="text-sm text-muted-foreground font-medium">Node Health & Pressure</span>
							</div>
							<div className="flex items-center gap-2">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="h-8 w-8">
											<MoreVertical className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem asChild>
											<a href="/cluster/nodes"><Eye className="mr-2 h-4 w-4" />View Details</a>
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
						<div className="p-4 space-y-4">
							<div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium">
								<div className="col-span-4">Node</div>
								<div className="col-span-2">State</div>
								<div className="col-span-6 grid grid-cols-4 gap-1">
									<div className="text-center">CPU</div>
									<div className="text-center">Mem</div>
									<div className="text-center">Disk</div>
									<div className="text-center">PID</div>
								</div>
							</div>
							<Separator />
							<div className="space-y-2">
								{nodes.map((n) => (
									<div key={n.name} className="grid grid-cols-12 items-center gap-2">
										<div className="col-span-4 truncate font-medium text-sm">{n.name}</div>
										<div className="col-span-2 flex items-center gap-1">
											{n.ready ? <Badge variant="secondary" className="text-xs">Ready</Badge> : <Badge variant="destructive" className="text-xs">NotReady</Badge>}
											{n.cordoned && <Badge variant="outline" className="text-xs">Cordoned</Badge>}
											{n.taints > 0 && <Badge variant="outline" className="text-xs">Taints</Badge>}
										</div>
										<div className="col-span-6 grid grid-cols-4 gap-1">
											{(["cpu", "mem", "disk", "pid"] as const).map((k) => (
												<div key={k} className={`h-4 rounded ${cellClass(n.values[k])}`} title={`${k.toUpperCase()} ${(n.values[k] * 100).toFixed(0)}%`} />
											))}
										</div>
									</div>
								))}
							</div>
						</div>
						<div className="px-4 pb-4 flex justify-end">
							<Button size="sm" variant="ghost" asChild>
								<a href="/cluster/nodes">View All Nodes</a>
							</Button>
						</div>

						{/* Info Tooltip - Bottom Right Corner */}
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
								>
									<Info className="h-3 w-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="left" align="end" className="max-w-[320px] bg-popover border border-border shadow-md">
								<div className="space-y-1">
									<div className="font-medium text-sm text-popover-foreground">Node Health & Pressure</div>
									<div className="text-xs text-muted-foreground leading-relaxed">Node readiness, cordons, taints, and resource pressure</div>
								</div>
							</TooltipContent>
						</Tooltip>
					</div>

					{/* API & Control Plane */}
					<div className="border rounded-lg bg-card relative">
						<div className="flex items-center justify-between px-3 py-2 border-b">
							<div className="flex items-center gap-2">
								<Activity className="h-4 w-4 text-muted-foreground" />
								<span className="text-sm text-muted-foreground font-medium">API & Control Plane</span>
							</div>
							<div className="flex items-center gap-2">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="h-8 w-8">
											<MoreVertical className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem asChild>
											<a href="/cluster/apiserver"><Eye className="mr-2 h-4 w-4" />View Details</a>
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
						<div className="p-4">
							<div className="h-64">
								<ChartContainer config={clusterChartConfig} className="h-full w-full">
									<ComposedChart data={cp} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis dataKey="t" hide />
										<YAxis />
										<ChartTooltip content={<ChartTooltipContent />} />
										<ChartLegend />
										<Line type="monotone" dataKey="apiP50" name="API p50 (ms)" strokeWidth={2} dot={false} stroke="var(--color-apiP50)" />
										<Line type="monotone" dataKey="apiP95" name="API p95 (ms)" strokeWidth={2} dot={false} stroke="var(--color-apiP95)" />
										<Area type="monotone" dataKey="rps" name="Requests/s" fillOpacity={0.12} fill="var(--color-rps)" stroke="var(--color-rps)" />
										<Bar dataKey="schedQ" name="Scheduler Q" fill="var(--color-schedQ)" />
										<Bar dataKey="ctrlQ" name="Controller Q" fill="var(--color-ctrlQ)" />
									</ComposedChart>
								</ChartContainer>
							</div>
						</div>
						{/* Info Tooltip - Bottom Right Corner */}
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
								>
									<Info className="h-3 w-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="left" align="end" className="max-w-[320px] bg-popover border border-border shadow-md">
								<div className="space-y-1">
									<div className="font-medium text-sm text-popover-foreground">API & Control Plane</div>
									<div className="text-xs text-muted-foreground leading-relaxed">API server latency, request rate, and control queues</div>
								</div>
							</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</div>

			{/* Namespace Distribution & CRDs */}
			<div className="px-4 lg:px-6">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Namespace Distribution */}
					<div className="border rounded-lg bg-card relative">
						<div className="flex items-center justify-between px-3 py-2 border-b">
							<div className="flex items-center gap-2">
								<Blocks className="h-4 w-4 text-muted-foreground" />
								<span className="text-sm text-muted-foreground font-medium">Workload by Namespace</span>
							</div>
							<div className="flex items-center gap-2">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="h-8 w-8">
											<MoreVertical className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem asChild>
											<a href="/cluster/namespaces"><Eye className="mr-2 h-4 w-4" />View Details</a>
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
						<div className="p-4 space-y-4">
							<div className="h-56">
								<ChartContainer config={clusterChartConfig} className="h-full w-full">
									<ComposedChart data={ns} layout="vertical" margin={{ left: 20 }}>
										<CartesianGrid strokeDasharray="3 3" />
										<XAxis type="number" />
										<YAxis dataKey="ns" type="category" width={120} />
										<ChartTooltip content={<ChartTooltipContent />} />
										<ChartLegend />
										<Bar dataKey="cpu" name="CPU (cores)" fill="var(--color-cpuReq)" />
										<Bar dataKey="mem" name="Mem (GiB)" fill="var(--color-memUsed)" />
										<Line dataKey="pods" name="Pods" strokeWidth={2} stroke="var(--color-services)" />
									</ComposedChart>
								</ChartContainer>
							</div>

							<div className="rounded-lg border border-muted-foreground/25 p-3">
								<div className="text-sm font-medium mb-2">Top 5 namespaces</div>
								<div className="grid grid-cols-5 text-xs text-muted-foreground">
									<div>Namespace</div>
									<div className="text-right">Pods</div>
									<div className="text-right">Restarts (24h)</div>
									<div className="text-right">CPU</div>
									<div className="text-right">Mem</div>
								</div>
								<Separator className="my-2" />
								<div className="space-y-1">
									{ns.map((r) => (
										<div key={r.ns} className="grid grid-cols-5 text-sm">
											<a className="truncate hover:underline" href={`/namespaces/${r.ns}`}>{r.ns}</a>
											<div className="text-right">{r.pods}</div>
											<div className="text-right">{r.restarts}</div>
											<div className="text-right">{r.cpu.toFixed(1)}</div>
											<div className="text-right">{r.mem.toFixed(1)}</div>
										</div>
									))}
								</div>
							</div>
							{/* Info Tooltip - Bottom Right Corner */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
									>
										<Info className="h-3 w-3" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="left" align="end" className="max-w-[320px] bg-popover border border-border shadow-md">
									<div className="space-y-1">
										<div className="font-medium text-sm text-popover-foreground">Workload by Namespace</div>
										<div className="text-xs text-muted-foreground leading-relaxed">Resource usage across namespaces</div>
									</div>
								</TooltipContent>
							</Tooltip>
						</div>
					</div>

					{/* CRDs */}
					<div className="border rounded-lg bg-card relative">
						<div className="flex items-center justify-between px-3 py-2 border-b">
							<div className="flex items-center gap-2">
								<Blocks className="h-4 w-4 text-muted-foreground" />
								<span className="text-sm text-muted-foreground font-medium">Custom Resources</span>
							</div>
							<div className="flex items-center gap-2">
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="h-8 w-8">
											<MoreVertical className="h-4 w-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem asChild>
											<a href="/cluster/crds"><Eye className="mr-2 h-4 w-4" />View Details</a>
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
						<div className="p-4 space-y-4">
							<div className="flex gap-2 flex-wrap">
								<Badge variant="secondary">CRDs: {crds.summary.total}</Badge>
								<Badge variant="secondary">Groups: {crds.summary.groups}</Badge>
								<Badge variant="secondary">Versions: {crds.summary.versions}</Badge>
							</div>
							<div className="rounded-lg border border-muted-foreground/25">
								<div className="grid grid-cols-4 px-3 py-2 text-xs text-muted-foreground">
									<div>Kind</div>
									<div className="text-right">Objects</div>
									<div className="text-right">Versions</div>
									<div className="text-right">Skew</div>
								</div>
								<Separator />
								<div className="divide-y divide-muted-foreground/25">
									{crds.top.map((r) => (
										<div key={r.kind} className="grid grid-cols-4 px-3 py-2 text-sm">
											<a className="truncate hover:underline" href={`/cluster/crds/${r.kind}`}>{r.kind}</a>
											<div className="text-right">{r.objects}</div>
											<div className="text-right truncate">{r.versions.join(", ")}</div>
											<div className="text-right">{r.skew ? <Badge variant="destructive" className="text-xs">Skew</Badge> : <Badge variant="outline" className="text-xs">OK</Badge>}</div>
										</div>
									))}
								</div>
							</div>
							{/* Info Tooltip - Bottom Right Corner */}
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="absolute bottom-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground z-10"
									>
										<Info className="h-3 w-3" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="left" align="end" className="max-w-[320px] bg-popover border border-border shadow-md">
									<div className="space-y-1">
										<div className="font-medium text-sm text-popover-foreground">Custom Resources</div>
										<div className="text-xs text-muted-foreground leading-relaxed">CRDs, groups, versions, and object counts</div>
									</div>
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
				</div>
			</div>

			{/* Quick Links */}
			<div className="px-4 lg:px-6">
				<div className="border rounded-lg bg-card">
					<div className="px-4 py-3 border-b border-border">
						<h3 className="font-semibold">Quick Access</h3>
						<p className="text-sm text-muted-foreground">Jump to detailed views</p>
					</div>
					<div className="p-4">
						<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
							<LinkCard label="Nodes" stat="5 Ready" href="/cluster/nodes" />
							<LinkCard label="Namespaces" stat="12 total" href="/cluster/namespaces" />
							<LinkCard label="CRDs" stat="36 kinds" href="/cluster/crds" />
							<LinkCard label="Events" stat="2 warnings" href="/cluster/events" />
							<LinkCard label="Quotas" stat="3 near limit" href="/cluster/quotas" />
							<LinkCard label="Certificates" stat="1 expiring" href="/cluster/certificates" />
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

/** Reusable pieces */
function LinkCard({ label, stat, href }: { label: string; stat?: string; href: string }) {
	return (
		<a href={href} className="block">
			<div className="border rounded-lg bg-card hover:bg-accent/50 transition-colors">
				<div className="px-3 py-4">
					<div className="text-sm text-muted-foreground">{label}</div>
					<div className="text-lg font-semibold">{stat}</div>
				</div>
			</div>
		</a>
	)
}
