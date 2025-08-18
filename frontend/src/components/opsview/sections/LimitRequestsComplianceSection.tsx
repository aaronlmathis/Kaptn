/* frontend/src/components/opsview/sections/LimitRequestsComplianceSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import { 
	MetricAreaChart,
	MetricStackedBarChart, 
	MetricScatterChart,
	MetricBarChart,
	type ChartSeries 
} from "@/components/opsview/charts";
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters";
import { Checkbox } from "@/components/ui/checkbox";
import {
	type ColumnDef,
} from "@/lib/table";
import { formatCores, formatBytesIEC, formatCount } from "@/lib/metric-utils";
import {
	getResourceIcon,
} from "@/lib/summary-card-utils";
import {
	AlertTriangle,
	Eye,
	Copy,
	Download,
	Trash,
	CheckCircle,
	XCircle,
	AlertCircle,
} from "lucide-react";
import { IconGripVertical } from "@tabler/icons-react";

/* ---------- Types & helpers for Non-Compliant Pods ---------- */

interface NonCompliantPod {
	id: string;
	name: string;
	namespace: string;
	cpuRequest?: number;
	cpuLimit?: number;
	cpuUsage: number;
	memRequest?: number;
	memLimit?: number;
	memWorkingSet: number;
	missingRequests: boolean;
	missingLimits: boolean;
	overLimit: boolean;
	node?: string;
}

function getComplianceBadge(pod: NonCompliantPod) {
	if (pod.overLimit) {
		return <Badge variant="destructive" className="text-xs">Over Limit</Badge>;
	}
	if (pod.missingRequests && pod.missingLimits) {
		return <Badge variant="destructive" className="text-xs">No Requests/Limits</Badge>;
	}
	if (pod.missingRequests) {
		return <Badge variant="secondary" className="text-orange-600 text-xs">No Requests</Badge>;
	}
	if (pod.missingLimits) {
		return <Badge variant="outline" className="text-amber-600 text-xs">No Limits</Badge>;
	}
	return <Badge variant="default" className="text-green-600 text-xs">Compliant</Badge>;
}

function getComplianceIcon(pod: NonCompliantPod) {
	if (pod.overLimit) {
		return <XCircle className="h-4 w-4 text-destructive" />;
	}
	if (pod.missingRequests || pod.missingLimits) {
		return <AlertCircle className="h-4 w-4 text-orange-600" />;
	}
	return <CheckCircle className="h-4 w-4 text-green-600" />;
}

function createNonCompliantPodsColumns(
	onViewDetails: (pod: NonCompliantPod) => void
): ColumnDef<NonCompliantPod>[] {
	return [
		{
			id: "drag",
			header: () => null,
			cell: ({ row }) => (
				<Button
					variant="ghost"
					size="icon"
					className="text-muted-foreground size-7 hover:bg-transparent cursor-grab"
				>
					<IconGripVertical className="text-muted-foreground size-3" />
					<span className="sr-only">Drag to reorder</span>
				</Button>
			),
			enableSorting: false,
			enableHiding: false,
		},
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
		},
		{
			id: "compliance",
			header: "Status",
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					{getComplianceIcon(row.original)}
					{getComplianceBadge(row.original)}
				</div>
			),
		},
		{
			accessorKey: "name",
			header: "Pod Name",
			cell: ({ row }) => (
				<button
					onClick={() => onViewDetails(row.original)}
					className="text-left hover:underline focus:underline focus:outline-none text-sm font-medium"
				>
					{row.original.name}
				</button>
			),
			enableHiding: false,
		},
		{
			accessorKey: "namespace",
			header: "Namespace",
			cell: ({ row }) => (
				<Badge variant="outline" className="text-muted-foreground text-xs px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			id: "cpuResources",
			header: "CPU (Request/Limit/Usage)",
			cell: ({ row }) => {
				const { cpuRequest, cpuLimit, cpuUsage } = row.original;
				return (
					<div className="text-sm space-y-1">
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground w-12">Req:</span>
							<span className="font-mono">
								{cpuRequest ? formatCores(cpuRequest) : <span className="text-orange-600">none</span>}
							</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground w-12">Lim:</span>
							<span className="font-mono">
								{cpuLimit ? formatCores(cpuLimit) : <span className="text-amber-600">none</span>}
							</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground w-12">Use:</span>
							<span className="font-mono font-medium">
								{formatCores(cpuUsage)}
							</span>
						</div>
					</div>
				);
			},
		},
		{
			id: "memResources",
			header: "Memory (Request/Limit/Working Set)",
			cell: ({ row }) => {
				const { memRequest, memLimit, memWorkingSet } = row.original;
				return (
					<div className="text-sm space-y-1">
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground w-12">Req:</span>
							<span className="font-mono">
								{memRequest ? formatBytesIEC(memRequest) : <span className="text-orange-600">none</span>}
							</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground w-12">Lim:</span>
							<span className="font-mono">
								{memLimit ? formatBytesIEC(memLimit) : <span className="text-amber-600">none</span>}
							</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground w-12">Work:</span>
							<span className="font-mono font-medium">
								{formatBytesIEC(memWorkingSet)}
							</span>
						</div>
					</div>
				);
			},
		},
		{
			id: "flags",
			header: "Issues",
			cell: ({ row }) => {
				const { missingRequests, missingLimits, overLimit } = row.original;
				const flags = [];
				
				if (missingRequests) flags.push("Missing Requests");
				if (missingLimits) flags.push("Missing Limits");
				if (overLimit) flags.push("Over Limit");
				
				if (flags.length === 0) {
					return <span className="text-green-600 text-sm">Compliant</span>;
				}
				
				return (
					<div className="space-y-1">
						{flags.map(flag => (
							<div key={flag} className="text-xs text-destructive">
								{flag}
							</div>
						))}
					</div>
				);
			},
		},
		{
			accessorKey: "node",
			header: "Node",
			cell: ({ row }) => (
				<div className="text-sm font-mono text-muted-foreground">
					{row.original.node || "N/A"}
				</div>
			),
		},
	];
}

/* ---------- Non-Compliant Pods Section ---------- */

function NonCompliantPodsSection() {
	// Mock data - replace with real data from metrics
	const mockNonCompliantPods: NonCompliantPod[] = React.useMemo(() => [
		{
			id: "1",
			name: "webapp-deploy-5f7d8c9b4-x7k2m",
			namespace: "production",
			cpuRequest: undefined, // Missing request
			cpuLimit: 2.0,
			cpuUsage: 1.8,
			memRequest: undefined, // Missing request
			memLimit: 4 * 1024 * 1024 * 1024, // 4GB
			memWorkingSet: 3.8 * 1024 * 1024 * 1024, // 3.8GB
			missingRequests: true,
			missingLimits: false,
			overLimit: false,
			node: "worker-node-1",
		},
		{
			id: "2",
			name: "redis-cluster-2",
			namespace: "cache",
			cpuRequest: 0.5,
			cpuLimit: undefined, // Missing limit
			cpuUsage: 0.8,
			memRequest: 2 * 1024 * 1024 * 1024, // 2GB
			memLimit: undefined, // Missing limit
			memWorkingSet: 2.1 * 1024 * 1024 * 1024, // 2.1GB
			missingRequests: false,
			missingLimits: true,
			overLimit: false,
			node: "worker-node-2",
		},
		{
			id: "3",
			name: "ml-training-gpu-pod",
			namespace: "ml-workloads",
			cpuRequest: 4.0,
			cpuLimit: 6.0,
			cpuUsage: 6.5, // Over limit!
			memRequest: 16 * 1024 * 1024 * 1024, // 16GB
			memLimit: 20 * 1024 * 1024 * 1024, // 20GB
			memWorkingSet: 21 * 1024 * 1024 * 1024, // 21GB - Over limit!
			missingRequests: false,
			missingLimits: false,
			overLimit: true,
			node: "gpu-node-1",
		},
		{
			id: "4",
			name: "api-server-abc123",
			namespace: "default",
			cpuRequest: undefined, // Missing
			cpuLimit: undefined, // Missing
			cpuUsage: 0.3,
			memRequest: undefined, // Missing
			memLimit: undefined, // Missing
			memWorkingSet: 512 * 1024 * 1024, // 512MB
			missingRequests: true,
			missingLimits: true,
			overLimit: false,
			node: "worker-node-3",
		},
	], []);

	const [globalFilter, setGlobalFilter] = React.useState("");
	const [complianceFilter, setComplianceFilter] = React.useState<string>("all");

	const handleViewDetails = React.useCallback((pod: NonCompliantPod) => {
		console.log('View details for pod:', pod.name);
		// TODO: Implement pod detail view
	}, []);

	const columns = React.useMemo(
		() => createNonCompliantPodsColumns(handleViewDetails),
		[handleViewDetails]
	);

	const complianceOptions: FilterOption[] = React.useMemo(() => [
		{ value: "over-limit", label: "Over Limit", badge: <Badge variant="destructive" className="text-xs">Over Limit</Badge> },
		{ value: "missing-requests", label: "Missing Requests", badge: <Badge variant="secondary" className="text-orange-600 text-xs">No Requests</Badge> },
		{ value: "missing-limits", label: "Missing Limits", badge: <Badge variant="outline" className="text-amber-600 text-xs">No Limits</Badge> },
		{ value: "compliant", label: "Compliant", badge: <Badge variant="default" className="text-green-600 text-xs">Compliant</Badge> },
	], []);

	const podBulkActions: BulkAction[] = React.useMemo(() => [
		{
			id: "view-details",
			label: "View Details",
			icon: <Eye className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy Pod Names",
			icon: <Copy className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "export-yaml",
			label: "Export as YAML",
			icon: <Download className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "delete-pods",
			label: "Delete Selected Pods",
			icon: <Trash className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			variant: "destructive" as const,
			requiresSelection: true,
		},
	], []);

	const nonCompliantCount = mockNonCompliantPods.length;
	const overLimitCount = mockNonCompliantPods.filter(p => p.overLimit).length;

	return (
		<div className="border rounded-lg bg-card">
			<div className="p-4 border-b">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold">Non-Compliant Pods</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Pods missing resource constraints or exceeding limits
						</p>
					</div>
					<div className="flex gap-2">
						{overLimitCount > 0 && (
							<Badge variant="destructive" className="text-xs">
								{overLimitCount} over limit
							</Badge>
						)}
						<Badge variant="outline" className="text-xs">
							{nonCompliantCount} non-compliant
						</Badge>
					</div>
				</div>
			</div>

			<div className="px-4 pb-6">
				<UniversalDataTable
					data={mockNonCompliantPods}
					columns={columns}
					enableReorder={true}
					enableRowSelection={true}
					className="px-0 [&_tbody_tr]:bg-background/50"
					renderFilters={({ table, selectedCount, totalCount }) => (
						<div className="p-4 space-y-4">
							<DataTableFilters
								globalFilter={globalFilter}
								onGlobalFilterChange={setGlobalFilter}
								searchPlaceholder="Search pods by name, namespace, or node..."
								categoryFilter={complianceFilter}
								onCategoryFilterChange={setComplianceFilter}
								categoryLabel="Filter by compliance"
								categoryOptions={complianceOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={podBulkActions}
								bulkActionsLabel="Pod Actions"
								table={table}
								showColumnToggle={true}
								onRefresh={() => {
									console.log('Refresh non-compliant pods data');
								}}
								isRefreshing={false}
							/>
						</div>
					)}
				/>
			</div>
		</div>
	);
}

/* ---------- Main Limits/Requests Compliance Section ---------- */

export default function LimitRequestsComplianceSection() {
	const CLUSTER_KEYS = [
		'cluster.cpu.requested.cores',
		'cluster.cpu.allocatable.cores',
		'cluster.cpu.limits.cores',
		'cluster.cpu.capacity.cores',
		'cluster.mem.requested.bytes',
		'cluster.mem.allocatable.bytes',
		'cluster.mem.limits.bytes',
		'cluster.mem.capacity.bytes',
	];

	const NS_BASES = [
		'ns.cpu.request.cores',
		'ns.cpu.limit.cores',
		'ns.cpu.used.cores',
		'ns.mem.request.bytes',
		'ns.mem.limit.bytes',
		'ns.mem.used.bytes',
	];

	const [seriesKeys, setSeriesKeys] = React.useState<string[]>(CLUSTER_KEYS);

	// bootstrap: discover concrete namespace series and subscribe to those
	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const resp = await fetch('/api/v1/timeseries/namespaces?since=15m&res=hi');
				const json = await resp.json();
				const allKeys: string[] = Object.keys(json?.series || {});
				const nsKeys = allKeys.filter(k => NS_BASES.some(b => k.startsWith(b + '.')));
				if (!cancelled) {
					setSeriesKeys([...CLUSTER_KEYS, ...nsKeys]);
				}
			} catch (e) {
				console.error('ns discovery failed', e);
				// fall back to cluster-only; charts will just be empty for ns
				setSeriesKeys(CLUSTER_KEYS);
			}
		})();
		return () => { cancelled = true; };
	}, []);

	// use hi-res to ensure initial payload has points
	const { seriesData: liveData, isConnected: wsConnected, connectionState } =
		useLiveSeriesSubscription('limits-compliance-cards', seriesKeys, {
			res: 'hi',
			since: '15m',
			autoConnect: true,
		});

	const getLatestValue = React.useCallback((key: string): number => {
		const data = liveData[key];
		return data && data.length > 0 ? data[data.length - 1].v : 0;
	}, [liveData]);

	// Calculate percentages for cards
	const cpuRequestsAllocatable = React.useMemo(() => {
		const requested = getLatestValue('cluster.cpu.requested.cores');
		const allocatable = getLatestValue('cluster.cpu.allocatable.cores');
		return allocatable > 0 ? (requested / allocatable) * 100 : 0;
	}, [getLatestValue]);

	const memRequestsAllocatable = React.useMemo(() => {
		const requested = getLatestValue('cluster.mem.requested.bytes');
		const allocatable = getLatestValue('cluster.mem.allocatable.bytes');
		return allocatable > 0 ? (requested / allocatable) * 100 : 0;
	}, [getLatestValue]);

	const cpuLimitsCoverage = React.useMemo(() => {
		const limits = getLatestValue('cluster.cpu.limits.cores');
		const capacity = getLatestValue('cluster.cpu.capacity.cores');
		return capacity > 0 ? (limits / capacity) * 100 : 0;
	}, [getLatestValue]);

	const memLimitsCoverage = React.useMemo(() => {
		const limits = getLatestValue('cluster.mem.limits.bytes');
		const capacity = getLatestValue('cluster.mem.capacity.bytes');
		return capacity > 0 ? (limits / capacity) * 100 : 0;
	}, [getLatestValue]);

	const summaryData: SummaryCard[] = React.useMemo(() => {
		return [
			{
				title: "CPU Requests vs Allocatable",
				value: `${cpuRequestsAllocatable.toFixed(1)}%`,
				subtitle: `${formatCores(getLatestValue('cluster.cpu.requested.cores'))} of ${formatCores(getLatestValue('cluster.cpu.allocatable.cores'))} requested`,
				badge: cpuRequestsAllocatable > 80 ? 
					<Badge variant="destructive">High</Badge> : 
					cpuRequestsAllocatable > 60 ? 
					<Badge variant="secondary">Medium</Badge> : 
					<Badge variant="default">Healthy</Badge>,
				icon: getResourceIcon("pods"),
				footer: cpuRequestsAllocatable > 80 ? 
					"CPU requests approaching allocatable capacity" : 
					"CPU requests within healthy range"
			},
			{
				title: "Memory Requests vs Allocatable",
				value: `${memRequestsAllocatable.toFixed(1)}%`,
				subtitle: `${formatBytesIEC(getLatestValue('cluster.mem.requested.bytes'))} of ${formatBytesIEC(getLatestValue('cluster.mem.allocatable.bytes'))} requested`,
				badge: memRequestsAllocatable > 80 ? 
					<Badge variant="destructive">High</Badge> : 
					memRequestsAllocatable > 60 ? 
					<Badge variant="secondary">Medium</Badge> : 
					<Badge variant="default">Healthy</Badge>,
				icon: getResourceIcon("nodes"),
				footer: memRequestsAllocatable > 80 ? 
					"Memory requests approaching allocatable capacity" : 
					"Memory requests within healthy range"
			},
			{
				title: "CPU Limits Coverage",
				value: `${cpuLimitsCoverage.toFixed(1)}%`,
				subtitle: `${formatCores(getLatestValue('cluster.cpu.limits.cores'))} of ${formatCores(getLatestValue('cluster.cpu.capacity.cores'))} capped by limits`,
				badge: cpuLimitsCoverage < 50 ? 
					<Badge variant="secondary">Low Coverage</Badge> : 
					cpuLimitsCoverage > 90 ? 
					<Badge variant="destructive">Over-Limited</Badge> : 
					<Badge variant="default">Good Coverage</Badge>,
				footer: cpuLimitsCoverage < 50 ? 
					"Many workloads missing CPU limits" : 
					"CPU limits appropriately configured"
			},
			{
				title: "Memory Limits Coverage",
				value: `${memLimitsCoverage.toFixed(1)}%`,
				subtitle: `${formatBytesIEC(getLatestValue('cluster.mem.limits.bytes'))} of ${formatBytesIEC(getLatestValue('cluster.mem.capacity.bytes'))} capped by limits`,
				badge: memLimitsCoverage < 50 ? 
					<Badge variant="secondary">Low Coverage</Badge> : 
					memLimitsCoverage > 90 ? 
					<Badge variant="destructive">Over-Limited</Badge> : 
					<Badge variant="default">Good Coverage</Badge>,
				footer: memLimitsCoverage < 50 ? 
					"Many workloads missing memory limits" : 
					"Memory limits appropriately configured"
			},
		];
	}, [cpuRequestsAllocatable, memRequestsAllocatable, cpuLimitsCoverage, memLimitsCoverage, getLatestValue]);

	// Prepare data for pod compliance scatter charts using live data
	const podScatterData = React.useMemo(() => {
		// Extract pod metrics from live data where available
		const podNames = ['webapp-deploy-5f7d8c9b4-x7k2m']; // In reality, this would be dynamically discovered
		
		const cpuData = podNames.map(pod => {
			const requestKey = `pod.cpu.request.cores.production.${pod}`;
			const usageKey = `pod.cpu.usage.cores.production.${pod}`;
			const limitKey = `pod.cpu.limit.cores.production.${pod}`;
			
			const request = liveData[requestKey]?.length > 0 ? liveData[requestKey][liveData[requestKey].length - 1].v : 0.5;
			const usage = liveData[usageKey]?.length > 0 ? liveData[usageKey][liveData[usageKey].length - 1].v : 0.3;
			const limit = liveData[limitKey]?.length > 0 ? liveData[limitKey][liveData[limitKey].length - 1].v : null;
			
			return {
				name: pod,
				request,
				usage,
				hasLimit: limit !== null,
				limit: limit || 0,
				namespace: "production"
			};
		});

		const memoryData = podNames.map(pod => {
			const requestKey = `pod.mem.request.bytes.production.${pod}`;
			const workingSetKey = `pod.mem.working_set.bytes.production.${pod}`;
			const limitKey = `pod.mem.limit.bytes.production.${pod}`;
			
			const request = liveData[requestKey]?.length > 0 ? liveData[requestKey][liveData[requestKey].length - 1].v / (1024 * 1024 * 1024) : 1.0;
			const workingSet = liveData[workingSetKey]?.length > 0 ? liveData[workingSetKey][liveData[workingSetKey].length - 1].v / (1024 * 1024 * 1024) : 0.8;
			const limit = liveData[limitKey]?.length > 0 ? liveData[limitKey][liveData[limitKey].length - 1].v / (1024 * 1024 * 1024) : null;
			
			return {
				name: pod,
				request,
				workingSet,
				hasLimit: limit !== null,
				limit: limit || 0,
				namespace: "production"
			};
		});

		// Add some mock data if no live data available (for demo purposes)
		const mockCpuData = [
			{
				name: "redis-cluster-2",
				request: 0.25,
				usage: 0.4,
				hasLimit: false,
				namespace: "cache"
			},
			{
				name: "ml-training-gpu-pod",
				request: 4.0,
				usage: 6.5,
				hasLimit: true,
				limit: 6.0,
				namespace: "ml-workloads"
			},
		];

		const mockMemData = [
			{
				name: "redis-cluster-2",
				request: 1.0,
				workingSet: 2.1,
				hasLimit: false,
				namespace: "cache"
			},
			{
				name: "ml-training-gpu-pod",
				request: 16.0,
				workingSet: 21.0,
				hasLimit: true,
				limit: 20.0,
				namespace: "ml-workloads"
			},
		];

		return {
			cpu: [...cpuData, ...mockCpuData],
			memory: [...memoryData, ...mockMemData]
		};
	}, [liveData]);

	// Create chart series data dynamically from available namespace data
	const namespaceCpuSeries: ChartSeries[] = React.useMemo(() => {
		const series: ChartSeries[] = [];
		const availableKeys = Object.keys(liveData);
		
		// Find all namespace-specific CPU keys
		const requestKeys = availableKeys.filter(key => key.startsWith('ns.cpu.request.cores.'));
		const limitKeys = availableKeys.filter(key => key.startsWith('ns.cpu.limit.cores.'));
		const usedKeys = availableKeys.filter(key => key.startsWith('ns.cpu.used.cores.'));
		
		// Extract unique namespaces
		const namespaces = new Set([
			...requestKeys.map(key => key.replace('ns.cpu.request.cores.', '')),
			...limitKeys.map(key => key.replace('ns.cpu.limit.cores.', '')),
			...usedKeys.map(key => key.replace('ns.cpu.used.cores.', ''))
		]);
		
		// Create series for each namespace with different colors
		const colors = ['#3b82f6', '#f59e0b', '#ef4444', '#22c55e', '#8b5cf6', '#06b6d4'];
		Array.from(namespaces).forEach((namespace, index) => {
			const baseColor = colors[index % colors.length];
			
			const requestKey = `ns.cpu.request.cores.${namespace}`;
			const limitKey = `ns.cpu.limit.cores.${namespace}`;
			const usedKey = `ns.cpu.used.cores.${namespace}`;
			
			if (liveData[requestKey]) {
				series.push({
					key: requestKey,
					name: `${namespace} Requests`,
					color: baseColor,
					data: liveData[requestKey].map(point => [point.t, point.v])
				});
			}
			
			if (liveData[limitKey]) {
				series.push({
					key: limitKey,
					name: `${namespace} Limits`,
					color: baseColor + '80',
					data: liveData[limitKey].map(point => [point.t, point.v])
				});
			}
			
			if (liveData[usedKey]) {
				series.push({
					key: usedKey,
					name: `${namespace} Used`,
					color: baseColor + '40',
					data: liveData[usedKey].map(point => [point.t, point.v])
				});
			}
		});
		
		return series;
	}, [liveData]);

	const namespaceMemorySeries: ChartSeries[] = React.useMemo(() => {
		const series: ChartSeries[] = [];
		const availableKeys = Object.keys(liveData);
		
		// Find all namespace-specific memory keys
		const requestKeys = availableKeys.filter(key => key.startsWith('ns.mem.request.bytes.'));
		const limitKeys = availableKeys.filter(key => key.startsWith('ns.mem.limit.bytes.'));
		const usedKeys = availableKeys.filter(key => key.startsWith('ns.mem.used.bytes.'));
		
		// Extract unique namespaces
		const namespaces = new Set([
			...requestKeys.map(key => key.replace('ns.mem.request.bytes.', '')),
			...limitKeys.map(key => key.replace('ns.mem.limit.bytes.', '')),
			...usedKeys.map(key => key.replace('ns.mem.used.bytes.', ''))
		]);
		
		// Create series for each namespace with different colors
		const colors = ['#06b6d4', '#8b5cf6', '#ec4899', '#22c55e', '#f59e0b', '#ef4444'];
		Array.from(namespaces).forEach((namespace, index) => {
			const baseColor = colors[index % colors.length];
			
			const requestKey = `ns.mem.request.bytes.${namespace}`;
			const limitKey = `ns.mem.limit.bytes.${namespace}`;
			const usedKey = `ns.mem.used.bytes.${namespace}`;
			
			if (liveData[requestKey]) {
				series.push({
					key: requestKey,
					name: `${namespace} Requests`,
					color: baseColor,
					data: liveData[requestKey].map(point => [point.t, point.v])
				});
			}
			
			if (liveData[limitKey]) {
				series.push({
					key: limitKey,
					name: `${namespace} Limits`,
					color: baseColor + '80',
					data: liveData[limitKey].map(point => [point.t, point.v])
				});
			}
			
			if (liveData[usedKey]) {
				series.push({
					key: usedKey,
					name: `${namespace} Used`,
					color: baseColor + '40',
					data: liveData[usedKey].map(point => [point.t, point.v])
				});
			}
		});
		
		return series;
	}, [liveData]);

	React.useEffect(() => {
		console.log('🔍 LimitsCompliance: Received live data:', liveData);
		console.log('🔍 LimitsCompliance: Available keys:', Object.keys(liveData));
		
		// Debug base keys we're subscribing to
		const baseKeys = [
			'ns.cpu.request.cores',
			'ns.cpu.limit.cores', 
			'ns.cpu.used.cores',
			'ns.mem.request.bytes',
			'ns.mem.limit.bytes',
			'ns.mem.used.bytes'
		];
		
		console.log('🔍 Checking base namespace keys:');
		baseKeys.forEach(key => {
			const data = liveData[key];
			console.log(`  "${key}":`, data ? `${data.length} points` : 'NO DATA');
		});

		// Debug any namespace-specific keys that might exist
		const availableKeys = Object.keys(liveData);
		const namespaceKeys = availableKeys.filter(key => key.startsWith('ns.'));
		console.log('🔍 All namespace keys found:', namespaceKeys);

		// Debug chart series
		console.log('🔍 CPU series count:', namespaceCpuSeries.length);
		console.log('🔍 Memory series count:', namespaceMemorySeries.length);
		
		// Debug summary card data
		console.log('🔍 Summary card cluster values:');
		console.log('  CPU requested:', getLatestValue('cluster.cpu.requested.cores'));
		console.log('  CPU allocatable:', getLatestValue('cluster.cpu.allocatable.cores'));
		console.log('  Memory requested:', getLatestValue('cluster.mem.requested.bytes'));
		console.log('  Memory allocatable:', getLatestValue('cluster.mem.allocatable.bytes'));
		
		Object.entries(liveData).forEach(([key, data]) => {
			console.log(`🔍 ${key}:`, data.length, 'points, latest:', data.length > 0 ? data[data.length - 1] : 'no data');
		});
	}, [liveData, namespaceCpuSeries, namespaceMemorySeries, getLatestValue]);

	return (
		<div className="space-y-6">
			{connectionState.lastError && (
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertDescription>
						WebSocket error: {connectionState.lastError}
					</AlertDescription>
				</Alert>
			)}

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

			{/* Charts Section */}
			<div className="space-y-6">
				<h3 className="text-lg font-semibold">Namespace Resource Compliance</h3>
				
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<MetricAreaChart
						title="CPU by Namespace (Request/Limit/Used)"
						subtitle="Shows CPU resource allocation across namespaces"
						series={namespaceCpuSeries}
						unit="cores"
						formatter={formatCores}
						stacked={false}
						scopeLabel="namespace"
						timespanLabel="15m"
						resolutionLabel="lo"
					/>

					<MetricAreaChart
						title="Memory by Namespace (Request/Limit/Used)"
						subtitle="Shows memory resource allocation across namespaces"
						series={namespaceMemorySeries}
						unit="bytes"
						formatter={formatBytesIEC}
						stacked={false}
						scopeLabel="namespace"
						timespanLabel="15m"
						resolutionLabel="lo"
					/>
				</div>

				<h3 className="text-lg font-semibold">Pod Resource Compliance</h3>
				
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<MetricScatterChart
						title="Pod CPU: Requests vs Usage"
						subtitle="Each point represents a pod. Color indicates presence of CPU limits. Points above the diagonal line indicate usage exceeding requests."
						data={podScatterData.cpu}
						xKey="request"
						yKey="usage"
						colorKey="hasLimit"
						unit="cores"
						formatter={formatCores}
						colors={{
							true: '#22c55e',
							false: '#ef4444'
						}}
						scopeLabel="pod"
						timespanLabel="current"
						resolutionLabel="live"
					/>

					<MetricScatterChart
						title="Pod Memory: Requests vs Working Set"
						subtitle="Each point represents a pod. Color indicates presence of memory limits. Points above the diagonal line indicate usage exceeding requests."
						data={podScatterData.memory}
						xKey="request"
						yKey="workingSet"
						colorKey="hasLimit"
						unit="GB"
						formatter={(value) => `${value.toFixed(2)}`}
						colors={{
							true: '#22c55e',
							false: '#ef4444'
						}}
						scopeLabel="pod"
						timespanLabel="current"
						resolutionLabel="live"
					/>
				</div>
			</div>

			<NonCompliantPodsSection />
		</div>
	);
}
