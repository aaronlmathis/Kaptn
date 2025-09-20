"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { ChevronUp, ChevronDown, AlertTriangle, Server, Blocks, Activity, Info, MoreVertical, Eye, Check } from "lucide-react"
import {
	Card,
	CardContent,
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

import { MetricLineChart, type ChartSeries } from "@/components/opsview/charts"
import { SectionHealthFooter } from "@/components/opsview/SectionHealthFooter"
import { formatCores, formatBytesIEC } from "@/lib/metric-utils"

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

const toneForPct = (pct: number): "ok" | "warn" | "crit" => {
	if (!Number.isFinite(pct)) return "ok"
	if (pct >= 0.85) return "crit"
	if (pct >= 0.7) return "warn"
	return "ok"
}

const formatRatioDisplay = (ratio: number): string => {
	if (!Number.isFinite(ratio)) return "—"
	if (ratio > 5) return `${ratio.toFixed(1)}x`
	return `${Math.max(0, ratio * 100).toFixed(0)}%`
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
	// --- Initial Data Loading via REST API ---
	const [initialDataLoaded, setInitialDataLoaded] = React.useState(false)
	const [initialSeriesData, setInitialSeriesData] = React.useState<Record<string, Array<{ t: number, v: number }>>>({})

	// Load initial data on mount
	React.useEffect(() => {
		let mounted = true

		const loadInitialData = async () => {
			try {
				console.log('ClusterDashboard: Loading initial data via REST API...')

				// Load initial cluster timeseries data
				const clusterResponse = await fetch('/api/v1/timeseries/cluster?since=30m&res=lo')
				if (clusterResponse.ok) {
					const clusterData = await clusterResponse.json()
					if (mounted && clusterData.series) {
						console.log('ClusterDashboard: Loaded cluster metrics:', Object.keys(clusterData.series).length, 'series')
						setInitialSeriesData(prev => ({ ...prev, ...clusterData.series }))
					}
				}

				// Load initial node timeseries data (for all nodes)
				const nodesResponse = await fetch('/api/v1/timeseries/nodes?since=30m&res=lo')
				if (nodesResponse.ok) {
					const nodesData = await nodesResponse.json()
					if (mounted && nodesData.series) {
						console.log('ClusterDashboard: Loaded node metrics:', Object.keys(nodesData.series).length, 'series')
						setInitialSeriesData(prev => ({ ...prev, ...nodesData.series }))
					}
				}

				// Load initial namespace timeseries data (for all namespaces)
				const namespacesResponse = await fetch('/api/v1/timeseries/namespaces?since=30m&res=lo')
				if (namespacesResponse.ok) {
					const namespacesData = await namespacesResponse.json()
					if (mounted && namespacesData.series) {
						console.log('ClusterDashboard: Loaded namespace metrics:', Object.keys(namespacesData.series).length, 'series')
						console.log('ClusterDashboard: Namespace series keys:', Object.keys(namespacesData.series).slice(0, 10))
						setInitialSeriesData(prev => ({ ...prev, ...namespacesData.series }))
					}
				} else {
					console.warn('ClusterDashboard: Failed to load namespace metrics:', namespacesResponse.status)
				} if (mounted) {
					console.log('ClusterDashboard: Initial data loading complete')
					setInitialDataLoaded(true)
				}
			} catch (error) {
				console.error('ClusterDashboard: Failed to load initial data:', error)
				if (mounted) {
					setInitialDataLoaded(true) // Still allow WebSocket to try
				}
			}
		}

		loadInitialData()
		return () => { mounted = false }
	}, [])

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
			'cluster.nodes.notready',
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
		autoConnect: initialDataLoaded, // Only start WebSocket after initial data is loaded
	})

	// Merge initial cluster data with live data
	const combinedClusterData = React.useMemo(() => {
		if (!initialDataLoaded) {
			return {}
		}
		if (!live.isConnected) {
			// Before WebSocket connects, use initial data
			return initialSeriesData
		}
		// After WebSocket connects, prefer live data but fall back to initial data
		const combined = { ...initialSeriesData }
		Object.keys(live.seriesData).forEach(key => {
			if (live.seriesData[key] && live.seriesData[key].length > 0) {
				combined[key] = live.seriesData[key]
			}
		})
		return combined
	}, [initialSeriesData, live.seriesData, live.isConnected, initialDataLoaded])

	const isConnected = live.isConnected

	// Helper: get latest value for a series key
	const latest = React.useCallback((key: string): number | null => {
		const arr = combinedClusterData[key]
		if (arr && arr.length) {
			return arr[arr.length - 1].v
		}
		return null
	}, [combinedClusterData])

	const delta = React.useCallback((key: string): number => {
		const arr = combinedClusterData[key]
		if (!arr || arr.length < 2) {
			return 0
		}
		return arr[arr.length - 1].v - arr[arr.length - 2].v
	}, [combinedClusterData])

	// KPIs from live data (fallback to 0s if not available yet)
	const kpis = React.useMemo(() => {
		const nodesReady = Math.round(latest('cluster.nodes.ready') ?? 0)
		const nodesNotReady = Math.round(latest('cluster.nodes.notready') ?? 0)
		const nodesTotal = Math.round(latest('cluster.nodes.count') ?? 0)

		const podsRunning = Math.round(latest('cluster.pods.running') ?? 0)
		const podsPending = Math.round(latest('cluster.pods.pending') ?? 0)
		const podsFailed = Math.round(latest('cluster.pods.failed') ?? 0)
		const podsTotal = podsRunning + podsPending + podsFailed

		const podsUnschedulable = Math.round(latest('cluster.pods.unschedulable') ?? 0)
		const apiErrorsRate = latest('cluster.apiserver.errors.rate') ?? 0

		return {
			nodesReady: {
				value: nodesReady,
				total: Math.max(nodesTotal, nodesReady + nodesNotReady),
				delta: Math.round(delta('cluster.nodes.ready')),
			},
			pods: {
				running: podsRunning,
				pending: podsPending,
				failed: podsFailed,
				total: podsTotal,
				delta: Math.round(delta('cluster.pods.running')),
			},
			podsProblem: {
				pending: podsPending,
				unschedulable: podsUnschedulable,
				delta: Math.round(delta('cluster.pods.unschedulable')),
			},
			apiErrors: {
				rate: apiErrorsRate,
				delta: delta('cluster.apiserver.errors.rate'),
			},
		}
	}, [latest, delta])

	const cpuSeries: ChartSeries[] = React.useMemo(() => [
		{
			key: 'cluster.cpu.used.cores',
			name: 'Used',
			color: '#2563eb',
			data: (combinedClusterData['cluster.cpu.used.cores'] || []).map(point => [point.t, point.v]),
		},
		{
			key: 'cluster.cpu.allocatable.cores',
			name: 'Allocatable',
			color: '#16a34a',
			data: (combinedClusterData['cluster.cpu.allocatable.cores'] || []).map(point => [point.t, point.v]),
		},
		{
			key: 'cluster.cpu.requested.cores',
			name: 'Requested',
			color: '#f59e0b',
			data: (combinedClusterData['cluster.cpu.requested.cores'] || []).map(point => [point.t, point.v]),
		},
	], [combinedClusterData])

	const memorySeries: ChartSeries[] = React.useMemo(() => [
		{
			key: 'cluster.mem.used.bytes',
			name: 'Used',
			color: '#06b6d4',
			data: (combinedClusterData['cluster.mem.used.bytes'] || []).map(point => [point.t, point.v]),
		},
		{
			key: 'cluster.mem.allocatable.bytes',
			name: 'Allocatable',
			color: '#10b981',
			data: (combinedClusterData['cluster.mem.allocatable.bytes'] || []).map(point => [point.t, point.v]),
		},
		{
			key: 'cluster.mem.requested.bytes',
			name: 'Requested',
			color: '#8b5cf6',
			data: (combinedClusterData['cluster.mem.requested.bytes'] || []).map(point => [point.t, point.v]),
		},
	], [combinedClusterData])

	const cpuUsed = latest('cluster.cpu.used.cores') ?? 0
	const cpuAllocRaw = latest('cluster.cpu.allocatable.cores') ?? 0
	const cpuRequested = latest('cluster.cpu.requested.cores') ?? 0
	const safeCpuAlloc = Math.max(1e-9, cpuAllocRaw)
	const cpuUsedRatio = cpuUsed / safeCpuAlloc
	const cpuReqRatio = cpuRequested / safeCpuAlloc
	const cpuAllocDisplay = cpuAllocRaw

	const cpuSummary = [
		`CPU ${(cpuUsedRatio * 100).toFixed(0)}% utilized (${formatCores(cpuUsed)} / ${formatCores(cpuAllocDisplay)} cores).`,
		cpuRequested > cpuAllocRaw ? `Requests exceed allocatable (${formatCores(cpuRequested)} > ${formatCores(cpuAllocDisplay)}).` : ''
	].join(' ').trim()

	const cpuFooter = (
		<SectionHealthFooter
			tone={toneForPct(cpuUsedRatio)}
			summary={cpuSummary}
			usedPct={cpuUsedRatio}
			ratioPills={[
				{ label: 'Requested/Alloc', value: formatRatioDisplay(cpuReqRatio), tone: cpuReqRatio > 1 ? 'warn' : 'info', title: 'Commitment posture' },
				{ label: 'Used/Requested', value: cpuRequested > 0 ? `${((cpuUsed / Math.max(cpuRequested, 1e-9)) * 100).toFixed(0)}%` : '—', title: 'Headroom vs requested' },
			]}
		/>
	)

	const memUsed = latest('cluster.mem.used.bytes') ?? 0
	const memAllocRaw = latest('cluster.mem.allocatable.bytes') ?? 0
	const memRequested = latest('cluster.mem.requested.bytes') ?? 0
	const memCapacity = latest('cluster.mem.capacity.bytes') ?? memAllocRaw
	const safeMemAlloc = Math.max(1e-9, memAllocRaw || memCapacity)
	const memUsedRatio = memUsed / safeMemAlloc
	const memReqRatio = memRequested / safeMemAlloc
	const memAllocDisplay = memAllocRaw > 0 ? memAllocRaw : memCapacity

	const memSummary = [
		`Memory ${(memUsedRatio * 100).toFixed(0)}% utilized (${formatBytesIEC(memUsed)} / ${formatBytesIEC(memAllocDisplay)}).`,
		memRequested > safeMemAlloc ? `Requests exceed allocatable (${formatBytesIEC(memRequested)} > ${formatBytesIEC(memAllocDisplay)}).` : ''
	].join(' ').trim()

	const memFooter = (
		<SectionHealthFooter
			tone={toneForPct(memUsedRatio)}
			summary={memSummary}
			usedPct={memUsedRatio}
			ratioPills={[
				{ label: 'Requested/Alloc', value: formatRatioDisplay(memReqRatio), tone: memReqRatio > 1 ? 'warn' : 'info', title: 'Commitment posture' },
				{ label: 'Used/Requested', value: memRequested > 0 ? `${((memUsed / Math.max(memRequested, 1e-9)) * 100).toFixed(0)}%` : '—', title: 'Headroom vs requested' },
			]}
		/>
	)

	// --- Node Health & Pressure (live) ---
	const [nodeList, setNodeList] = React.useState<Node[]>([])
	const [nodesLoaded, setNodesLoaded] = React.useState(false)

	React.useEffect(() => {
		let mounted = true
		setNodesLoaded(false)
		getNodes()
			.then(items => {
				if (mounted) {
					setNodeList(items)
					setNodesLoaded(true)
					console.log('ClusterDashboard: Loaded', items.length, 'nodes')
				}
			})
			.catch(err => {
				console.error('ClusterDashboard: Failed to load nodes:', err)
				if (mounted) setNodesLoaded(true) // Set to true even on error to allow empty state
			})
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
		'node.condition.disk_pressure',
		'node.condition.memory_pressure',
		'node.condition.pid_pressure',
	], [])

	const nodeMetricKeys = React.useMemo(() => {
		if (!nodesLoaded || nodeNames.length === 0) return []

		const keys: string[] = []
		for (const name of nodeNames) {
			for (const base of nodeMetricBases) keys.push(`${base}.${name}`)
		}
		console.log('ClusterDashboard: Generated', keys.length, 'node metric keys for', nodeNames.length, 'nodes')
		return keys
	}, [nodeNames, nodeMetricBases, nodesLoaded])

	// Only subscribe to node metrics after nodes are loaded AND initial data is loaded
	const shouldStartWebSocket = nodesLoaded && initialDataLoaded
	const { seriesData: nodeLive, isConnected: _nodeWsConnected, connectionState: nodeConnectionState } = useLiveSeriesSubscription(
		'node-health-grid',
		shouldStartWebSocket ? nodeMetricKeys : [],
		{
			res: 'lo',
			since: '30m',
			autoConnect: shouldStartWebSocket
		}
	)

	// Subscribe to namespace metrics for workload distribution chart
	const namespaceMetricKeys = React.useMemo(() => {
		// We'll subscribe to a few key namespace patterns
		// The actual series keys will be generated as ns.{metric}.{namespace}
		// For now, let's subscribe to namespace metrics we can discover from the store
		if (!initialDataLoaded) return []

		// Get all series keys from initial data and filter for namespace metrics
		const allKeys = Object.keys(initialSeriesData)
		return allKeys.filter(key =>
			key.startsWith('ns.cpu.used.') ||
			key.startsWith('ns.mem.used.') ||
			key.startsWith('ns.cpu.request.') ||
			key.startsWith('ns.mem.request.') ||
			key.startsWith('ns.pods.running.')
		)
	}, [initialDataLoaded, initialSeriesData])

	const { seriesData: namespaceLive } = useLiveSeriesSubscription(
		'namespace-workloads',
		namespaceMetricKeys,
		{
			res: 'lo',
			since: '30m',
			autoConnect: initialDataLoaded
		}
	)

	// Merge initial namespace data with live data
	const combinedNamespaceData = React.useMemo(() => {
		if (!initialDataLoaded) {
			return {}
		}
		if (!live.isConnected) {
			// Before WebSocket connects, use initial data
			return initialSeriesData
		}
		// After WebSocket connects, prefer live data but fall back to initial data
		const combined = { ...initialSeriesData }
		Object.keys(namespaceLive).forEach(key => {
			if (namespaceLive[key] && namespaceLive[key].length > 0) {
				combined[key] = namespaceLive[key]
			}
		})
		return combined
	}, [initialSeriesData, namespaceLive, live.isConnected, initialDataLoaded])

	// Merge initial data with live data
	const combinedNodeData = React.useMemo(() => {
		if (!shouldStartWebSocket) {
			// Before WebSocket starts, use initial data
			return initialSeriesData
		}
		// After WebSocket starts, prefer live data but fall back to initial data
		const combined = { ...initialSeriesData }
		Object.keys(nodeLive).forEach(key => {
			if (nodeLive[key] && nodeLive[key].length > 0) {
				combined[key] = nodeLive[key]
			}
		})
		return combined
	}, [initialSeriesData, nodeLive, shouldStartWebSocket])

	type NodePressureRow = { name: string; ready: boolean; cordoned: boolean; taints: number; values: { cpu: number; mem: number; disk: number; pid: number } }
	const nodes: NodePressureRow[] = React.useMemo(() => {
		if (!nodesLoaded) return []

		const result = nodeList.map(n => {
			const last = (key: string) => {
				const arr = combinedNodeData[key]
				return arr && arr.length ? arr[arr.length - 1].v : 0
			}
			const cpuU = last(`node.cpu.usage.cores.${n.name}`)
			const cpuA = last(`node.allocatable.cpu.cores.${n.name}`)
			const memU = last(`node.mem.usage.bytes.${n.name}`)
			const memA = last(`node.allocatable.mem.bytes.${n.name}`)
			const rootFsPct = last(`node.fs.used.percent.${n.name}`)
			const imageFsPct = last(`node.imagefs.used.percent.${n.name}`)
			const diskPressure = last(`node.condition.disk_pressure.${n.name}`)
			const memPressure = last(`node.condition.memory_pressure.${n.name}`)
			const pidPressure = last(`node.condition.pid_pressure.${n.name}`)

			const cpu = cpuA > 0 ? Math.max(0, Math.min(1, cpuU / cpuA)) : 0
			const mem = memA > 0 ? Math.max(0, Math.min(1, memU / memA)) : 0
			const disk = Math.max(0, Math.min(1, Math.max(rootFsPct, imageFsPct) / 100))
			const pid = pidPressure > 0 ? 1 : 0

			// If pressure conditions are active, override with pressure indicators
			const finalMem = memPressure > 0 ? 1 : mem
			const finalDisk = diskPressure > 0 ? 1 : disk

			return {
				name: n.name,
				ready: !!n.status?.ready,
				cordoned: !!n.status?.unschedulable,
				taints: Array.isArray(n.taints) ? n.taints.length : 0,
				values: { cpu, mem: finalMem, disk: finalDisk, pid }
			}
		})

		// Debug logging
		if (nodeList.length > 0 && Object.keys(combinedNodeData).length === 0) {
			console.log('ClusterDashboard: No node metrics received yet. Keys requested:', nodeMetricKeys.length)
		} else if (nodeList.length > 0 && Object.keys(combinedNodeData).length > 0) {
			console.log('ClusterDashboard: Node metrics received:', Object.keys(combinedNodeData).length, 'series')
		}

		return result
	}, [nodeList, combinedNodeData, nodeMetricKeys, nodesLoaded])

	// Process namespace data for workload chart
	const ns = React.useMemo(() => {
		console.log('ClusterDashboard: Processing namespace data:', {
			combinedNamespaceDataKeys: Object.keys(combinedNamespaceData).length,
			namespaceKeys: Object.keys(combinedNamespaceData).filter(k => k.startsWith('ns.')).slice(0, 10)
		})

		if (!combinedNamespaceData || Object.keys(combinedNamespaceData).length === 0) {
			console.log('ClusterDashboard: No namespace data available yet')
			return []
		}

		// Extract namespace names from series keys
		const namespaceSet = new Set<string>()
		Object.keys(combinedNamespaceData).forEach(key => {
			if (key.startsWith('ns.')) {
				// Format: ns.{metric}.{type}.{namespace} 
				// e.g., "ns.cpu.used.cores.default", "ns.mem.request.bytes.kube-system"
				const parts = key.split('.')
				if (parts.length >= 5) {
					const namespace = parts[parts.length - 1] // Take the last part as namespace
					namespaceSet.add(namespace)
				}
			}
		})

		console.log('ClusterDashboard: Found namespaces:', Array.from(namespaceSet))

		const namespaces = Array.from(namespaceSet)

		// If no namespace data yet, return test data to verify chart works
		if (namespaces.length === 0) {
			console.log('ClusterDashboard: No namespaces found, using test data')
			return [
				{ ns: 'default', cpu: 2.5, mem: 4.2, pods: 8, restarts: 3 },
				{ ns: 'kube-system', cpu: 1.8, mem: 2.1, pods: 12, restarts: 1 },
				{ ns: 'monitoring', cpu: 0.9, mem: 1.5, pods: 4, restarts: 0 },
				{ ns: 'ingress-nginx', cpu: 0.5, mem: 0.8, pods: 2, restarts: 0 },
			]
		}

		// Helper to get latest value for a namespace metric
		const getLatestValue = (metricBase: string, namespace: string): number => {
			const key = `${metricBase}.${namespace}`
			const arr = combinedNamespaceData[key]
			if (arr && arr.length > 0) {
				return arr[arr.length - 1].v
			}
			return 0
		}

		// Process each namespace
		return namespaces.map(namespace => {
			const cpuUsed = getLatestValue('ns.cpu.used.cores', namespace)
			const cpuRequest = getLatestValue('ns.cpu.request.cores', namespace)
			const memUsed = getLatestValue('ns.mem.used.bytes', namespace) / (1024 * 1024 * 1024) // Convert to GiB
			const memRequest = getLatestValue('ns.mem.request.bytes', namespace) / (1024 * 1024 * 1024) // Convert to GiB
			const pods = Math.round(getLatestValue('ns.pods.running', namespace))

			// For display, show higher of used vs requested for better visibility
			const cpu = Math.max(cpuUsed, cpuRequest)
			const mem = Math.max(memUsed, memRequest)

			return {
				ns: namespace,
				cpu: cpu,
				mem: mem,
				pods: pods,
				restarts: 0 // TODO: Add restart metrics when available
			}
		}).filter(item => item.cpu > 0 || item.mem > 0 || item.pods > 0) // Filter out empty namespaces
			.sort((a, b) => {
				// Sort by total resource consumption (normalize CPU cores to similar scale as GiB memory)
				// Assume 1 CPU core ≈ 4 GiB memory for scoring purposes
				const scoreA = (a.cpu * 4) + a.mem
				const scoreB = (b.cpu * 4) + b.mem
				return scoreB - scoreA
			})
			.slice(0, 5) // Top 5 namespaces to match the table header
	}, [combinedNamespaceData])

	// TODO: Replace with real data
	const cp = []
	const crds = { summary: { total: 0, groups: 0, versions: 0 }, top: [] }

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
										{typeof kpis.apiErrors.rate === 'number' && Number.isFinite(kpis.apiErrors.rate) ? kpis.apiErrors.rate.toFixed(2) : '—'}
									</div>
									<Delta value={kpis.apiErrors.delta} />
								</div>
								{/* Headline */}
								<div className="mt-3 text-sm font-medium">
									{typeof kpis.apiErrors.rate === 'number' && kpis.apiErrors.rate > 0 ? 'API errors present' : 'Error rate nominal'}
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
					<MetricLineChart
						title="CPU Usage vs Requests vs Limits"
						subtitle="Real-time cluster CPU utilization showing used cores against requested and limit allocations. Helps identify under-provisioning (usage near requests) and throttling risks (usage near limits)."
						series={cpuSeries}
						unit="cores"
						formatter={formatCores}
						scopeLabel="cluster"
						timespanLabel="15m"
						resolutionLabel="lo"
						footerExtra={cpuFooter}
					/>

					<MetricLineChart
						title="Memory Usage vs Requests vs Limits"
						subtitle="Real-time cluster memory utilization showing used memory against requested and limit allocations. Helps identify under-provisioning (usage near requests) and OOM risks (usage near limits)."
						series={memorySeries}
						unit="bytes"
						formatter={formatBytesIEC}
						scopeLabel="cluster"
						timespanLabel="15m"
						resolutionLabel="lo"
						footerExtra={memFooter}
					/>
				</div>
			</div>

			{/* Node Health & Additional Sections */}
			<div className="px-4 lg:px-6">
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					{/* Node Health */}
					<div className="border rounded-lg bg-card relative">
						{nodeConnectionState.lastError && (
							<div className="px-3 py-2 border-b bg-destructive/10">
								<div className="flex items-center gap-2 text-sm text-destructive">
									<AlertTriangle className="h-4 w-4" />
									<span>Node metrics WebSocket error: {nodeConnectionState.lastError}</span>
								</div>
							</div>
						)}
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
								{!nodesLoaded ? (
									<div className="text-center py-8 text-muted-foreground text-sm">
										Loading nodes...
									</div>
								) : nodes.length === 0 ? (
									<div className="text-center py-8 text-muted-foreground text-sm">
										No nodes discovered
									</div>
								) : (
									nodes.map((n) => (
										<div key={n.name} className="grid grid-cols-12 items-center gap-2">
											<div className="col-span-4 truncate font-medium text-sm">{n.name}</div>
											<div className="col-span-2 flex items-center gap-1">
												{n.ready ? <Badge variant="secondary" className="text-xs">Ready</Badge> : <Badge variant="destructive" className="text-xs">NotReady</Badge>}
												{n.cordoned && <Badge variant="outline" className="text-xs">Cordoned</Badge>}
												{n.taints > 0 && <Badge variant="outline" className="text-xs">Taints</Badge>}
											</div>
											<div className="col-span-6 grid grid-cols-4 gap-1">
												{(["cpu", "mem", "disk", "pid"] as const).map((k) => (
													<div
														key={k}
														className={`h-4 rounded ${cellClass(n.values[k])}`}
														title={`${k.toUpperCase()}: ${(n.values[k] * 100).toFixed(0)}%${n.values[k] >= 1 ? ' (Pressure Active)' : ''}`}
													/>
												))}
											</div>
										</div>
									))
								)}
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
								<div className="text-xs text-muted-foreground mb-2">Ranked by total resource consumption (CPU + Memory)</div>
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
