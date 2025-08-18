/* frontend/src/components/opsview/sections.tsx */

import * as React from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	RefreshCw,
	TrendingUp,
	AlertTriangle,
	Activity,
	Calendar,
	Shield,
	Users,
	Server,
	RotateCcw,
	HardDrive,
	Network,
	FolderTree,
} from "lucide-react";

// Section Imports
import ClusterOverviewSection from "./sections/ClusterOverviewSection";
import CapacityHeadroomSection from "./sections/CapacityHeadroomSection";
import SchedulingPressureSection from "./sections/SchedulingPressureSection";
import ReliabilitySection from "./sections/ReliabilitySection";
import LimitRequestsComplianceSection from "./sections/LimitRequestsComplianceSection";


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
 * Section Header Component (kept local)
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

/* ---------- Placeholder sections (remaining) ---------- */

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

/* ---------- Main exported component ---------- */

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
							{/* ⬇️ replaced inline content with extracted component */}
							<ClusterOverviewSection />
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
							<CapacityHeadroomSection />
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
							<SchedulingPressureSection />
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
							<ReliabilitySection />
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
							<LimitRequestsComplianceSection />
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
							icon={<RotateCcw className="h-5 w-5" />}
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
