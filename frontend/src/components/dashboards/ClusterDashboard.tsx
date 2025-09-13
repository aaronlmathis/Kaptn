"use client"

import * as React from "react"
import {
	Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
	CardAction,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { ChevronUp, ChevronDown, AlertTriangle, Server, Blocks } from "lucide-react"

import {
	LineChart, Line, BarChart, Bar, ComposedChart, Area,
	XAxis, YAxis, CartesianGrid, Brush,
} from "recharts"
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	ChartLegend,
	type ChartConfig,
} from "@/components/ui/chart"

/** Mock data hooks (swap with your real data) */
function useKPIs() {
	return {
		nodesReady: { value: 5, total: 5, delta: +0 },
		podsRunning: { value: 48, delta: +3 },
		podsProblem: { pending: 3, unschedulable: 3, delta: +1 },
		apiErrors: { rate: 0.3, delta: -0.1 },
	}
}
function useCapacityVsUsage() {
	return Array.from({ length: 30 }).map((_, i) => ({
		t: i,
		cpuAlloc: 10,
		cpuReq: 3.2 + Math.sin(i / 4) * 0.4,
		cpuUsed: 1.1 + Math.sin(i / 6) * 0.6,
		memAlloc: 19.1,
		memReq: 6.2 + Math.sin(i / 3) * 0.8,
		memUsed: 7.2 + Math.sin(i / 5) * 0.6,
	}))
}
function useNodePressure() {
	const nodes = ["ip-10-0-1-10", "ip-10-0-1-11", "ip-10-0-1-12", "ip-10-0-1-13", "ip-10-0-1-14"]
	return nodes.map((name, idx) => ({
		name,
		ready: idx !== 3,
		cordoned: idx === 2,
		taints: idx === 2 ? ["NoSchedule"] : [],
		values: { cpu: 0.18 + idx * 0.07, mem: 0.32 + idx * 0.05, disk: 0.22 + idx * 0.03, pid: 0.12 + idx * 0.02 },
	}))
}
function useNamespaceUsage() {
	return [
		{ ns: "kube-system", cpu: 1.8, mem: 3.2, pods: 42, restarts: 11, quota: 0.41 },
		{ ns: "default", cpu: 0.8, mem: 1.1, pods: 8, restarts: 0, quota: 0.28 },
		{ ns: "monitoring", cpu: 2.4, mem: 4.7, pods: 12, restarts: 3, quota: 0.72 },
		{ ns: "ingress", cpu: 0.9, mem: 1.5, pods: 6, restarts: 1, quota: 0.51 },
		{ ns: "apps", cpu: 1.1, mem: 2.0, pods: 18, restarts: 5, quota: 0.46 },
	]
}
function usePodStatus() {
	return [
		{ status: "Running", count: 48 },
		{ status: "Pending", count: 3 },
		{ status: "CrashLoopBackOff", count: 2 },
		{ status: "ImagePullBackOff", count: 1 },
		{ status: "Evicted", count: 0 },
	]
}
function useControlPlane() {
	return Array.from({ length: 48 }).map((_, i) => ({
		t: i,
		apiP50: 18 + Math.sin(i / 4) * 4,
		apiP95: 46 + Math.sin(i / 5) * 8,
		rps: 120 + Math.sin(i / 6) * 30,
		schedQ: 2 + Math.max(0, Math.sin(i / 7) * 2),
		ctrlQ: 3 + Math.max(0, Math.sin(i / 8) * 2),
	}))
}
function useCRDs() {
	return {
		summary: { total: 36, groups: 9, versions: 18 },
		top: [
			{ kind: "PrometheusRule", objects: 120, versions: ["v1"], skew: false },
			{ kind: "Alertmanager", objects: 4, versions: ["v1beta1", "v1"], skew: true },
			{ kind: "GrafanaDashboard", objects: 55, versions: ["v1alpha1"], skew: false },
			{ kind: "Certificate", objects: 31, versions: ["v1"], skew: false },
			{ kind: "IngressRoute", objects: 22, versions: ["v1alpha1", "v1"], skew: true },
			{ kind: "Canary", objects: 12, versions: ["v1alpha1"], skew: false },
			{ kind: "KEDA", objects: 9, versions: ["v1alpha1", "v1"], skew: true },
			{ kind: "KafkaTopic", objects: 7, versions: ["v1beta1"], skew: false },
		],
	}
}
function useEvents() {
	return [
		{ ts: "10:12:04", type: "Warning", reason: "FailedScheduling", obj: "pod/web-7d8f", ns: "apps", msg: "0/5 nodes are available: 3 Insufficient cpu." },
		{ ts: "10:10:37", type: "Warning", reason: "BackOff", obj: "pod/api-64bc", ns: "default", msg: "Back-off restarting failed container" },
		{ ts: "10:09:50", type: "Normal", reason: "Pulled", obj: "pod/agent-2b1c", ns: "monitoring", msg: "Successfully pulled image" },
	]
}
function useObjectGrowth() {
	return Array.from({ length: 30 }).map((_, i) => ({
		t: i,
		pods: 40 + Math.floor(Math.sin(i / 4) * 5),
		deployments: 12 + Math.floor(Math.sin(i / 6) * 2),
		services: 18 + Math.floor(Math.sin(i / 7) * 2),
		crs: 210 + Math.floor(Math.sin(i / 5) * 10),
	}))
}

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
	const kpis = useKPIs()
	const cap = useCapacityVsUsage()
	const nodes = useNodePressure()
	const ns = useNamespaceUsage()
	const podStatus = usePodStatus()
	const cp = useControlPlane()
	const crds = useCRDs()
	const events = useEvents()
	const growth = useObjectGrowth()

	return (
		<div className="space-y-6">

			{/* Unified controls -> matches your page paddings */}
			<div className="px-4 lg:px-6">
				<Card data-slot="card" className="@container/card">
					<CardContent className="py-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
						<div className="flex gap-2 items-center">
							<Badge variant="secondary" className="gap-1"><Server className="h-4 w-4" /> Cluster</Badge>
							<Badge variant="outline">All Namespaces</Badge>
							<Badge variant="outline">Resolution: Low</Badge>
						</div>
						<div className="flex gap-2 items-center">
							<Input placeholder="Filter operations data and sections…" className="w-72" />
							<Button size="sm" variant="outline">Pause Live</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* KPIs + Capacity — 2col: left=2x2 KPI grid, right=chart */}
			<div className="px-4 lg:px-6">
				<div
					className="
      /* slot-based card styles */
      [data-slot=card]:bg-gradient-to-t
      [data-slot=card]:from-primary/5
      [data-slot=card]:to-card
      [data-slot=card]:shadow-xs
      dark:[data-slot=card]:bg-card

      /* 2-column layout at xl+ */
      grid grid-cols-1 gap-4
      @xl/main:grid-cols-2
    "
				>
					{/* LEFT: 2x2 KPI grid */}
					<div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
						<Card data-slot="card" className="@container/card">
							<CardHeader>
								<CardDescription>Nodes Ready</CardDescription>
								<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl flex items-center gap-2">
									{kpis.nodesReady.value}/{kpis.nodesReady.total}
									<CardAction><Delta value={kpis.nodesReady.delta} /></CardAction>
								</CardTitle>
								<CardAction><Badge variant="outline">Operational</Badge></CardAction>
							</CardHeader>
							<CardFooter className="justify-end">
								<Button size="sm" variant="ghost" asChild><a href="/cluster/nodes">Open</a></Button>
							</CardFooter>
						</Card>

						<Card data-slot="card" className="@container/card">
							<CardHeader>
								<CardDescription>Pods Running</CardDescription>
								<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl flex items-center gap-2">
									{kpis.podsRunning.value}
									<CardAction><Delta value={kpis.podsRunning.delta} /></CardAction>
								</CardTitle>
								<CardAction><Badge variant="outline"><Blocks className="h-3.5 w-3.5 mr-1" /> Workloads</Badge></CardAction>
							</CardHeader>
							<CardFooter className="justify-end">
								<Button size="sm" variant="ghost" asChild><a href="/workloads/pods">Open</a></Button>
							</CardFooter>
						</Card>

						<Card data-slot="card" className="@container/card">
							<CardHeader>
								<CardDescription>Unschedulable Pods</CardDescription>
								<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl flex items-center gap-2">
									{kpis.podsProblem.unschedulable}
									<AlertTriangle className="h-4 w-4 text-yellow-600" />
								</CardTitle>
								<CardAction><Badge variant="destructive">Attention</Badge></CardAction>
							</CardHeader>
							<CardFooter className="justify-end">
								<Button size="sm" variant="ghost" asChild><a href="/workloads/pods?status=unschedulable">Open</a></Button>
							</CardFooter>
						</Card>

						{/* KPI 4 (icon-free to avoid hydrate issues) */}
						<Card data-slot="card" className="@container/card">
							<CardHeader>
								<CardDescription>API Errors/s</CardDescription>
								<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl flex items-center gap-2">
									{Number.isFinite(kpis?.apiErrors?.rate) ? kpis.apiErrors.rate.toFixed(2) : "—"}
									<CardAction><Delta value={kpis?.apiErrors?.delta ?? 0} /></CardAction>
								</CardTitle>
								<CardAction><Badge variant="outline">API</Badge></CardAction>
							</CardHeader>
							<CardFooter className="justify-end">
								<Button size="sm" variant="ghost" asChild><a href="/cluster/apiserver">Open</a></Button>
							</CardFooter>
						</Card>
					</div>

					{/* RIGHT: Capacity vs Usage chart */}
					<Card data-slot="card" className="@container/card">
						<CardHeader>
							<CardDescription>Capacity vs Usage</CardDescription>
							<CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
								CPU & Memory
							</CardTitle>
						</CardHeader>
						<CardContent className="h-56">
							<ChartContainer config={clusterChartConfig} className="h-full w-full">
								<ComposedChart data={cap} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="t" hide />
									<YAxis yAxisId="left" />
									<YAxis yAxisId="right" orientation="right" hide />
									<ChartTooltip content={<ChartTooltipContent />} />
									<ChartLegend />
									<Bar yAxisId="left" dataKey="cpuReq" name="CPU Requested" fill="var(--color-cpuReq)" />
									<Line yAxisId="left" dataKey="cpuUsed" name="CPU Used" strokeWidth={2} dot={false} stroke="var(--color-cpuUsed)" />
									{/* If ReferenceLine causes issues in your setup, just keep these two lines removed */}
									{/* <ReferenceLine ... /> */}
									<Area yAxisId="right" dataKey="memUsed" name="Mem Used" fillOpacity={0.15} fill="var(--color-memUsed)" stroke="var(--color-memUsed)" />
									{/* <ReferenceLine ... /> */}
									<Brush height={12} travellerWidth={8} />
								</ComposedChart>
							</ChartContainer>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Node Health & API/Control-plane (two-up) */}
			<div className="px-4 lg:px-6">
				<div
					className="
            [data-slot=card]:bg-gradient-to-t
            [data-slot=card]:from-primary/5
            [data-slot=card]:to-card
            [data-slot=card]:shadow-xs
            dark:[data-slot=card]:bg-card

            grid grid-cols-1 gap-4
            @xl/main:grid-cols-2
          "
				>
					<Card data-slot="card" className="@container/card">
						<CardHeader>
							<CardDescription>Node Health & Pressure</CardDescription>
							<CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">Readiness, cordons, taints</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
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
										<div className="col-span-4 truncate font-medium">{n.name}</div>
										<div className="col-span-2 flex items-center gap-2">
											{n.ready ? <Badge variant="secondary">Ready</Badge> : <Badge variant="destructive">NotReady</Badge>}
											{n.cordoned && <Badge variant="outline">Cordoned</Badge>}
											{n.taints.length > 0 && <Badge variant="outline">Taints</Badge>}
										</div>
										<div className="col-span-6 grid grid-cols-4 gap-1">
											{(["cpu", "mem", "disk", "pid"] as const).map((k) => (
												<div key={k} className={`h-4 rounded ${cellClass(n.values[k])}`} title={`${k.toUpperCase()} ${(n.values[k] * 100).toFixed(0)}%`} />
											))}
										</div>
									</div>
								))}
							</div>
						</CardContent>
						<CardFooter className="justify-end">
							<Button size="sm" variant="ghost" asChild><a href="/cluster/nodes">Open</a></Button>
						</CardFooter>
					</Card>

					<Card data-slot="card" className="@container/card">
						<CardHeader>
							<CardDescription>API & Control Plane</CardDescription>
							<CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">Latency • RPS • Queues</CardTitle>
						</CardHeader>
						<CardContent className="h-64">
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
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Namespace distribution + CRDs */}
			<div className="px-4 lg:px-6">
				<div
					className="
            [data-slot=card]:bg-gradient-to-t
            [data-slot=card]:from-primary/5
            [data-slot=card]:to-card
            [data-slot=card]:shadow-xs
            dark:[data-slot=card]:bg-card

            grid grid-cols-1 gap-4
            @xl/main:grid-cols-2
          "
				>
					<Card data-slot="card" className="@container/card">
						<CardHeader>
							<CardDescription>Workload by Namespace</CardDescription>
							<CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">CPU & Mem vs Pods</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
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
						</CardContent>
					</Card>

					<Card data-slot="card" className="@container/card">
						<CardHeader>
							<CardDescription>CRDs At a Glance</CardDescription>
							<CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">Kinds • Groups • Versions</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
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
											<div className="text-right">{r.skew ? <Badge variant="destructive">Skew</Badge> : <Badge variant="outline">OK</Badge>}</div>
										</div>
									))}
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Pod status + Events */}
			<div className="px-4 lg:px-6">
				<div
					className="
            [data-slot=card]:bg-gradient-to-t
            [data-slot=card]:from-primary/5
            [data-slot=card]:to-card
            [data-slot=card]:shadow-xs
            dark:[data-slot=card]:bg-card

            grid grid-cols-1 gap-4
            @xl/main:grid-cols-2
          "
				>
					<Card data-slot="card" className="@container/card">
						<CardHeader>
							<CardDescription>Pod Status</CardDescription>
							<CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">Running • Pending • Failures</CardTitle>
						</CardHeader>
						<CardContent className="h-64">
							<ChartContainer config={clusterChartConfig} className="h-full w-full">
								<BarChart data={usePodStatus()}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="status" />
									<YAxis />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar dataKey="count" name="Pods" fill="var(--color-pods)" />
								</BarChart>
							</ChartContainer>
						</CardContent>
					</Card>

					<Card data-slot="card" className="@container/card">
						<CardHeader>
							<CardDescription>Events (recent)</CardDescription>
							<CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">Warnings & Errors</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{useEvents().map((e, i) => (
								<div key={i} className="flex items-start gap-3 text-sm">
									<Badge variant={e.type === "Warning" ? "destructive" : "secondary"}>{e.type}</Badge>
									<div className="min-w-16 text-xs text-muted-foreground mt-0.5">{e.ts}</div>
									<div className="flex-1">
										<div className="font-medium">{e.reason}</div>
										<div className="text-muted-foreground">{e.ns} · {e.obj}</div>
										<div className="text-muted-foreground line-clamp-1">{e.msg}</div>
									</div>
								</div>
							))}
						</CardContent>
						<CardFooter className="justify-end">
							<Button size="sm" variant="ghost" asChild><a href="/cluster/events">Open</a></Button>
						</CardFooter>
					</Card>
				</div>
			</div>

			{/* Object Growth + Quick Links */}
			<div className="px-4 lg:px-6 space-y-4">
				<Card data-slot="card" className="@container/card">
					<CardHeader>
						<CardDescription>Object Growth</CardDescription>
						<CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">Pods • Deployments • Services • CRs</CardTitle>
					</CardHeader>
					<CardContent className="h-64">
						<ChartContainer config={clusterChartConfig} className="h-full w-full">
							<LineChart data={useObjectGrowth()}>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis dataKey="t" hide />
								<YAxis />
								<ChartTooltip content={<ChartTooltipContent />} />
								<ChartLegend />
								<Line type="monotone" dataKey="pods" strokeWidth={2} dot={false} stroke="var(--color-pods)" />
								<Line type="monotone" dataKey="deployments" strokeWidth={2} dot={false} stroke="var(--color-deployments)" />
								<Line type="monotone" dataKey="services" strokeWidth={2} dot={false} stroke="var(--color-services)" />
								<Line type="monotone" dataKey="crs" strokeWidth={2} dot={false} stroke="var(--color-crs)" />
							</LineChart>
						</ChartContainer>
					</CardContent>
				</Card>

				<Card data-slot="card" className="@container/card">
					<CardHeader>
						<CardDescription>Quick Links</CardDescription>
						<CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">Jump to details</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
							<LinkCard label="Nodes" stat="5 Ready" href="/cluster/nodes" />
							<LinkCard label="Namespaces" stat="12 total" href="/cluster/namespaces" />
							<LinkCard label="CRDs" stat="36 kinds" href="/cluster/crds" />
							<LinkCard label="Events" stat="2 warnings" href="/cluster/events" />
							<LinkCard label="Quotas" stat="3 near limit" href="/cluster/quotas" />
							<LinkCard label="Certificates" stat="1 expiring" href="/cluster/certificates" />
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

/** Reusable pieces */
function LinkCard({ label, stat, href }: { label: string; stat?: string; href: string }) {
	return (
		<a href={href} className="block">
			<Card data-slot="card" className="@container/card">
				<CardContent className="py-4">
					<div className="text-sm text-muted-foreground">{label}</div>
					<div className="text-lg font-semibold">{stat}</div>
				</CardContent>
			</Card>
		</a>
	)
}
