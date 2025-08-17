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
 * Individual section components
 */
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
		],
		{
			res: 'lo',
			since: '15m',
			autoConnect: true,
		}
	);

	// Calculate current values from live data (use latest data point)
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

			{/* Placeholder for charts and tables */}
			<Card>
				<CardHeader>
					<CardTitle>Resource Usage Trends</CardTitle>
					<CardDescription>CPU and Memory usage vs requests vs limits</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-64 flex items-center justify-center text-muted-foreground">
						Charts will be implemented here
					</div>
				</CardContent>
			</Card>
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
				<AccordionItem value="cluster-overview" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<Activity className="h-4 w-4" />
							<span className="font-semibold">Cluster Overview</span>
							<Badge variant="secondary" className="ml-2">
								NOC Screen
							</Badge>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<ClusterOverview />
					</AccordionContent>
				</AccordionItem>

				{/* Capacity vs Usage (Headroom) */}
				<AccordionItem value="capacity-headroom" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<TrendingUp className="h-4 w-4" />
							<span className="font-semibold">Capacity vs Usage (Headroom)</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<CapacityHeadroom />
					</AccordionContent>
				</AccordionItem>

				{/* Scheduling & Pressure */}
				<AccordionItem value="scheduling-pressure" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<Calendar className="h-4 w-4" />
							<span className="font-semibold">Scheduling & Pressure</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<SchedulingPressure />
					</AccordionContent>
				</AccordionItem>

				{/* Reliability */}
				<AccordionItem value="reliability" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<Shield className="h-4 w-4" />
							<span className="font-semibold">Reliability (Restarts, OOM, CrashLoops)</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<ReliabilityMetrics />
					</AccordionContent>
				</AccordionItem>

				{/* Limits/Requests Compliance */}
				<AccordionItem value="limits-compliance" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<AlertTriangle className="h-4 w-4" />
							<span className="font-semibold">Limits/Requests Compliance</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<LimitsCompliance />
					</AccordionContent>
				</AccordionItem>

				{/* Noisy Neighbor Detector */}
				<AccordionItem value="noisy-neighbors" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<Users className="h-4 w-4" />
							<span className="font-semibold">Noisy Neighbor Detector</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<NoisyNeighbors />
					</AccordionContent>
				</AccordionItem>

				{/* Over-Limits / Throttling */}
				<AccordionItem value="over-limits" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<Zap className="h-4 w-4" />
							<span className="font-semibold">Over-Limits / Throttling</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<OverLimitsThrottling />
					</AccordionContent>
				</AccordionItem>

				{/* Node Health & Hotspots */}
				<AccordionItem value="node-health" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<Server className="h-4 w-4" />
							<span className="font-semibold">Node Health & Hotspots</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<NodeHealth />
					</AccordionContent>
				</AccordionItem>

				{/* Pod Lifecycle & Churn */}
				<AccordionItem value="pod-lifecycle" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<RotateCcw className="h-4 w-4" />
							<span className="font-semibold">Pod Lifecycle & Churn</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<PodLifecycle />
					</AccordionContent>
				</AccordionItem>

				{/* Ephemeral/Storage */}
				<AccordionItem value="ephemeral-storage" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<HardDrive className="h-4 w-4" />
							<span className="font-semibold">Ephemeral/Storage</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<EphemeralStorage />
					</AccordionContent>
				</AccordionItem>

				{/* Network Health */}
				<AccordionItem value="network-health" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<Network className="h-4 w-4" />
							<span className="font-semibold">Network Health</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<NetworkHealth />
					</AccordionContent>
				</AccordionItem>

				{/* Namespace / Team Views */}
				<AccordionItem value="namespace-views" className="border rounded-lg">
					<AccordionTrigger className="px-4 hover:no-underline">
						<div className="flex items-center gap-3">
							<FolderTree className="h-4 w-4" />
							<span className="font-semibold">Namespace / Team Views</span>
						</div>
					</AccordionTrigger>
					<AccordionContent className="px-4 pb-4">
						<NamespaceViews />
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
