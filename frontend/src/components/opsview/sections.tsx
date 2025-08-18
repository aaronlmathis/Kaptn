/**
 * OpsView Sections Component
 * 
 * Displays operational metrics in expandable accordion sections
 */

import * as React from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { MetricAreaChart, type ChartSeries } from "@/components/opsview/charts";
import { formatCores, formatBytesIEC } from "@/lib/metric-utils";
import {
	getPodStatusBadge,
	getPodPhaseBadge,
	getResourceIcon,
	getNodeReadinessBadge,
	getRestartCountBadge,
} from "@/lib/summary-card-utils";
import {
	RefreshCw,
	TrendingUp,
	AlertTriangle,
	Activity,
	Calendar,
	Shield,
	Users,
	Zap,
	Server,
	RotateCcw,
	HardDrive,
	Network,
	FolderTree
} from "lucide-react";

interface OpsViewSectionsProps {
	filters: Record<string, unknown>;
	density: string;
	seriesData: Record<string, unknown>;
	capabilities: Record<string, unknown>;
	isLoading: boolean;
	error?: string;
	expandedSections: string[];
	onExpandedSectionsChange: (sections: string[]) => void;
}

/**
 * Section Header Component
 */
function SectionHeader({
	icon,
	title,
	description,
	badge,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	badge?: React.ReactNode;
}) {
	return (
		<div className="flex items-center justify-between w-full min-h-[3.5rem]">
			<div className="flex items-center gap-4">
				{icon && (
					<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
						{icon}
					</div>
				)}
				<div className="space-y-1">
					<h3 className="text-lg font-semibold tracking-tight text-foreground">
						{title}
					</h3>
					<p className="text-sm text-muted-foreground leading-relaxed">
						{description}
					</p>
				</div>
			</div>
			{badge && (
				<div className="flex items-center gap-3 ml-4">
					{badge}
				</div>
			)}
		</div>
	);
}
function ClusterOverview() {
	// WebSocket subscription for cluster overview metrics
	const {
		seriesData: liveData,
		isConnected: wsConnected,
		connectionState,
	} = useLiveSeriesSubscription(
		'cluster-overview-cards',
		[
			'cluster.nodes.ready',
			'cluster.nodes.count',
			'cluster.pods.running',
			'cluster.pods.pending',
			'cluster.pods.restarts.1h',
			'cluster.pods.failed',
			'cluster.cpu.used.cores',
			'cluster.cpu.requested.cores',
			'cluster.cpu.limits.cores',
			'cluster.mem.used.bytes',
			'cluster.mem.requested.bytes',
			'cluster.mem.limits.bytes'
		],
		{
			res: 'lo',
			since: '15m',
			autoConnect: true,
		}
	);

	// Prepare chart series data
	const cpuSeries: ChartSeries[] = [
		{
			key: 'cluster.cpu.used.cores',
			name: 'Used',
			color: '#3b82f6', // Vibrant blue
			data: (liveData['cluster.cpu.used.cores'] || []).map(point => [point.t, point.v])
		},
		{
			key: 'cluster.cpu.requested.cores',
			name: 'Requested',
			color: '#f59e0b', // Vibrant amber
			data: (liveData['cluster.cpu.requested.cores'] || []).map(point => [point.t, point.v])
		},
		{
			key: 'cluster.cpu.limits.cores',
			name: 'Limits',
			color: '#ef4444', // Vibrant red
			data: (liveData['cluster.cpu.limits.cores'] || []).map(point => [point.t, point.v])
		}
	];

	const memorySeries: ChartSeries[] = [
		{
			key: 'cluster.mem.used.bytes',
			name: 'Used',
			color: '#06b6d4', // Vibrant cyan
			data: (liveData['cluster.mem.used.bytes'] || []).map(point => [point.t, point.v])
		},
		{
			key: 'cluster.mem.requested.bytes',
			name: 'Requested',
			color: '#8b5cf6', // Vibrant purple
			data: (liveData['cluster.mem.requested.bytes'] || []).map(point => [point.t, point.v])
		},
		{
			key: 'cluster.mem.limits.bytes',
			name: 'Limits',
			color: '#ec4899', // Vibrant pink
			data: (liveData['cluster.mem.limits.bytes'] || []).map(point => [point.t, point.v])
		}
	];	// Calculate current values from live data (use latest data point)
	const getLatestValue = (key: string): number => {
		const data = liveData[key];
		return data && data.length > 0 ? data[data.length - 1].v : 0;
	};

	// Debug: Log the received data
	React.useEffect(() => {
		console.log('🔍 ClusterOverview: Received live data:', liveData);
		console.log('🔍 ClusterOverview: Available keys:', Object.keys(liveData));
		Object.entries(liveData).forEach(([key, data]) => {
			console.log(`🔍 ${key}:`, data.length, 'points, latest:', data.length > 0 ? data[data.length - 1] : 'no data');
		});
	}, [liveData]);

	const nodesReady = Math.round(getLatestValue('cluster.nodes.ready'));
	const nodesTotal = Math.round(getLatestValue('cluster.nodes.count'));
	const podsRunning = Math.round(getLatestValue('cluster.pods.running'));
	const podsPending = Math.round(getLatestValue('cluster.pods.pending'));
	const podsFailed = Math.round(getLatestValue('cluster.pods.failed'));
	const podsRestarts1h = Math.round(getLatestValue('cluster.pods.restarts.1h'));

	// Generate summary cards data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		return [
			{
				title: "Nodes Ready",
				value: nodesTotal > 0 ? `${nodesReady}/${nodesTotal}` : "0/0",
				subtitle: nodesTotal > 0 ? `${nodesReady} of ${nodesTotal} nodes ready` : "No nodes found",
				badge: getNodeReadinessBadge(nodesReady, nodesTotal),
				icon: getResourceIcon("nodes"),
				footer: nodesReady === nodesTotal && nodesTotal > 0 ?
					"All nodes operational" :
					nodesTotal > 0 ? `${nodesTotal - nodesReady} node(s) not ready` : "No cluster nodes detected"
			},
			{
				title: "Pods Running",
				value: podsRunning,
				subtitle: `${podsRunning} pods currently running`,
				badge: getPodStatusBadge(podsRunning, podsRunning + podsPending + podsFailed),
				icon: getResourceIcon("pods"),
				footer: podsRunning > 0 ? "Workloads active" : "No running workloads"
			},
			{
				title: "Pods Pending",
				value: podsPending,
				subtitle: `${podsPending} pods waiting to start`,
				badge: getPodPhaseBadge(podsPending, podsRunning + podsPending + podsFailed, "Pending"),
				footer: podsPending === 0 ? "No scheduling issues" : "Pods awaiting resources or scheduling"
			},
			{
				title: "Pod Restarts (1h)",
				value: podsRestarts1h,
				subtitle: `${podsRestarts1h} restarts in last hour`,
				badge: getRestartCountBadge(podsRestarts1h),
				footer: podsRestarts1h === 0 ? "No restarts - stable workloads" :
					podsRestarts1h < 10 ? "Low restart activity" :
						podsRestarts1h < 50 ? "Moderate restart activity - monitor" : "High restart activity - investigate"
			},
		];
	}, [nodesReady, nodesTotal, podsRunning, podsPending, podsFailed, podsRestarts1h]);

	return (
		<div className="space-y-6">
			{/* Connection Status */}
			{connectionState.lastError && (
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						WebSocket error: {connectionState.lastError}
					</AlertDescription>
				</Alert>
			)}

			{/* Summary Cards */}
			<div className="space-y-4">
				{wsConnected && (
					<div className="flex items-center justify-end">
						<div className="flex items-center gap-1.5 text-xs text-green-600">
							<div className="size-2 bg-green-500 rounded-full animate-pulse" />
							Live Data
						</div>
					</div>
				)}

				<SummaryCards
					cards={summaryData}
					columns={4}
					loading={false}
					error={connectionState.lastError}
					lastUpdated={null}
					noPadding={true}
				/>
			</div>

			{/* Resource Usage Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* CPU Usage Chart */}
				<MetricAreaChart
					title="CPU Usage vs Requests vs Limits"
					subtitle="Real-time cluster CPU utilization showing used cores against requested and limit allocations. Helps identify under-provisioning (usage near requests) and throttling risks (usage near limits)."
					series={cpuSeries}
					unit="cores"
					formatter={formatCores}
					stacked={true}
					scopeLabel="cluster"
					timespanLabel="15m"
					resolutionLabel="hi"
				/>

				{/* Memory Usage Chart */}
				<MetricAreaChart
					title="Memory Usage vs Requests vs Limits"
					subtitle="Real-time cluster memory utilization showing used memory against requested and limit allocations. Helps identify under-provisioning (usage near requests) and OOM risks (usage near limits)."
					series={memorySeries}
					unit="bytes"
					formatter={formatBytesIEC}
					stacked={true}
					scopeLabel="cluster"
					timespanLabel="15m"
					resolutionLabel="hi"
				/>
			</div>
		</div>
	);
}

function CapacityHeadroom() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Capacity vs Usage (Headroom)</CardTitle>
					<CardDescription>Forecast saturation and available capacity</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Headroom charts and node capacity tables will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function SchedulingPressure() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Scheduling & Pressure</CardTitle>
					<CardDescription>Pending pods and node pressure analysis</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Scheduling pressure metrics and pending pods table will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function ReliabilityMetrics() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Reliability (Restarts, OOM, CrashLoops)</CardTitle>
					<CardDescription>Find unstable workloads and failure patterns</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Reliability metrics and restart analysis will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function LimitsCompliance() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Limits/Requests Compliance</CardTitle>
					<CardDescription>Enforce good SRE hygiene and resource governance</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Compliance metrics and resource governance tables will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function NoisyNeighbors() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Noisy Neighbor Detector</CardTitle>
					<CardDescription>Identify workloads causing resource contention</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Noisy neighbor detection and impact analysis will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function OverLimitsThrottling() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Over-Limits / Throttling</CardTitle>
					<CardDescription>Catch sustained CPU throttling and imminent OOM</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Over-limits detection and throttling analysis will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function NodeHealth() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Node Health & Hotspots</CardTitle>
					<CardDescription>Keep the fleet steady and identify problematic nodes</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Node health metrics and hotspot analysis will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function PodLifecycle() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Pod Lifecycle & Churn</CardTitle>
					<CardDescription>Reveal instability and costly rescheduling patterns</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Pod lifecycle metrics and churn analysis will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function EphemeralStorage() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Ephemeral/Storage</CardTitle>
					<CardDescription>Prevent node eviction and pull failures</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Storage metrics and ephemeral usage analysis will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function NetworkHealth() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Network Health</CardTitle>
					<CardDescription>Spot network extremes and performance regressions</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Network health metrics and traffic analysis will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function NamespaceViews() {
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Namespace / Team Views</CardTitle>
					<CardDescription>Multi-tenancy accountability and resource allocation</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Namespace-scoped metrics and team resource usage will be implemented here
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

export function OpsViewSections({
	// filters,
	// density,
	// seriesData,
	// capabilities,
	isLoading,
	error,
	expandedSections,
	onExpandedSectionsChange,
}: OpsViewSectionsProps) {
	return (
		<div className="space-y-6">
			<Accordion
				type="multiple"
				value={expandedSections}
				onValueChange={onExpandedSectionsChange}
				className="space-y-4"
			>
				{/* Cluster Overview - Open by default */}
				<AccordionItem value="cluster-overview" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/40 cursor-pointer">
						<SectionHeader
							icon={<Activity className="h-5 w-5" />}
							title="Cluster Overview"
							description="Real-time operational metrics and health indicators"
							badge={<Badge variant="secondary" className="ml-2">NOC Screen</Badge>}
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<ClusterOverview />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Capacity vs Usage (Headroom) */}
				<AccordionItem value="capacity-headroom" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<TrendingUp className="h-5 w-5" />}
							title="Capacity vs Usage (Headroom)"
							description="Forecast saturation and available capacity"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<CapacityHeadroom />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Scheduling & Pressure */}
				<AccordionItem value="scheduling-pressure" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<Calendar className="h-5 w-5" />}
							title="Scheduling & Pressure"
							description="Pending pods and node pressure analysis"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<SchedulingPressure />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Reliability */}
				<AccordionItem value="reliability" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<Shield className="h-5 w-5" />}
							title="Reliability (Restarts, OOM, CrashLoops)"
							description="Find unstable workloads and failure patterns"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<ReliabilityMetrics />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Limits/Requests Compliance */}
				<AccordionItem value="limits-compliance" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<AlertTriangle className="h-5 w-5" />}
							title="Limits/Requests Compliance"
							description="Enforce good SRE hygiene and resource governance"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<LimitsCompliance />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Noisy Neighbor Detector */}
				<AccordionItem value="noisy-neighbors" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<Users className="h-5 w-5" />}
							title="Noisy Neighbor Detector"
							description="Identify workloads causing resource contention"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<NoisyNeighbors />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Over-Limits / Throttling */}
				<AccordionItem value="over-limits" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<Zap className="h-5 w-5" />}
							title="Over-Limits / Throttling"
							description="Catch sustained CPU throttling and imminent OOM"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<OverLimitsThrottling />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Node Health & Hotspots */}
				<AccordionItem value="node-health" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<Server className="h-5 w-5" />}
							title="Node Health & Hotspots"
							description="Keep the fleet steady and identify problematic nodes"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<NodeHealth />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Pod Lifecycle & Churn */}
				<AccordionItem value="pod-lifecycle" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<RotateCcw className="h-5 w-5" />}
							title="Pod Lifecycle & Churn"
							description="Reveal instability and costly rescheduling patterns"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<PodLifecycle />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Ephemeral/Storage */}
				<AccordionItem value="ephemeral-storage" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<HardDrive className="h-5 w-5" />}
							title="Ephemeral/Storage"
							description="Prevent node eviction and pull failures"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<EphemeralStorage />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Network Health */}
				<AccordionItem value="network-health" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<Network className="h-5 w-5" />}
							title="Network Health"
							description="Spot network extremes and performance regressions"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<NetworkHealth />
						</div>
					</AccordionContent>
				</AccordionItem>

				{/* Namespace / Team Views */}
				<AccordionItem value="namespace-views" className="border border-border/60 rounded-xl bg-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
					<AccordionTrigger className="px-6 py-5 hover:no-underline hover:bg-muted/30 transition-colors duration-200 data-[state=open]:bg-muted/20 data-[state=open]:border-b data-[state=open]:border-border/40 data-[state=open]:hover:bg-muted/30 cursor-pointer">
						<SectionHeader
							icon={<FolderTree className="h-5 w-5" />}
							title="Namespace / Team Views"
							description="Multi-tenancy accountability and resource allocation"
						/>
					</AccordionTrigger>
					<AccordionContent className="px-6 pb-6 pt-2 bg-background/50">
						<div className="border-t border-border/20 pt-6">
							<NamespaceViews />
						</div>
					</AccordionContent>
				</AccordionItem>
			</Accordion>

			{/* Loading and Error States */}
			{isLoading && (
				<div className="flex items-center justify-center py-12">
					<RefreshCw className="h-6 w-6 animate-spin mr-2" />
					<span>Loading operational metrics...</span>
				</div>
			)}

			{error && (
				<Card className="border-destructive">
					<CardContent className="pt-6">
						<div className="flex items-center gap-2 text-destructive">
							<AlertTriangle className="h-4 w-4" />
							<span>Error loading metrics: {error}</span>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
