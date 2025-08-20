/* frontend/src/components/opsview/sections/LimitRequestsComplianceSection.tsx */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards";
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries";
import {
	MetricAreaChart,
	MetricScatterChart,
	type ChartSeries
} from "@/components/opsview/charts";
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable";
import { DataTableFilters, type FilterOption, type BulkAction } from "@/components/ui/data-table-filters";
import { Checkbox } from "@/components/ui/checkbox";
import {
	type ColumnDef,
} from "@/lib/table";
import { formatCores, formatBytesIEC } from "@/lib/metric-utils";
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
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";

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

/* ---------- Types & helpers for Namespace Compliance ---------- */

interface NamespaceCompliance {
	id: string;
	name: string;
	cpuRequests: number;
	cpuLimits: number;
	cpuUsed: number;
	cpuCompliancePercent: number;
	memRequests: number;
	memLimits: number;
	memUsed: number;
	memCompliancePercent: number;
	podsTotal: number;
	podsWithLimits: number;
	podsWithRequests: number;
}

function getCompliancePercentage(used: number, requests: number, limits: number): number {
	// Compliance is based on having proper requests/limits and staying within them
	if (requests === 0 || limits === 0) return 0; // No requests/limits = 0% compliance
	if (used > limits) return Math.max(0, 100 - ((used - limits) / limits) * 100); // Over limit = penalty
	if (used > requests) return 80 + (20 * (1 - (used - requests) / (limits - requests))); // Between request and limit = 80-100%
	return 100; // Under request = 100%
}

function getComplianceBadgeForNamespace(compliancePercent: number) {
	if (compliancePercent >= 90) {
		return <Badge variant="default" className="text-green-600 text-xs">Excellent</Badge>;
	}
	if (compliancePercent >= 70) {
		return <Badge variant="outline" className="text-blue-600 text-xs">Good</Badge>;
	}
	if (compliancePercent >= 50) {
		return <Badge variant="secondary" className="text-orange-600 text-xs">Fair</Badge>;
	}
	return <Badge variant="destructive" className="text-xs">Poor</Badge>;
}

function createNamespaceComplianceColumns(
	onDrilldown: (namespace: NamespaceCompliance) => void
): ColumnDef<NamespaceCompliance>[] {
	return [
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
			accessorKey: "name",
			header: "Namespace",
			cell: ({ row }) => (
				<button
					onClick={() => onDrilldown(row.original)}
					className="text-left hover:underline focus:underline focus:outline-none text-sm font-medium"
				>
					{row.original.name}
				</button>
			),
			enableHiding: false,
		},
		{
			id: "cpuCompliance",
			header: "CPU Compliance",
			cell: ({ row }) => (
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						{getComplianceBadgeForNamespace(row.original.cpuCompliancePercent)}
						<span className="text-sm font-mono">{row.original.cpuCompliancePercent.toFixed(1)}%</span>
					</div>
					<div className="text-xs text-muted-foreground space-y-0.5">
						<div>Req: {formatCores(row.original.cpuRequests)}</div>
						<div>Lim: {formatCores(row.original.cpuLimits)}</div>
						<div>Used: {formatCores(row.original.cpuUsed)}</div>
					</div>
				</div>
			),
		},
		{
			id: "memCompliance",
			header: "Memory Compliance",
			cell: ({ row }) => (
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						{getComplianceBadgeForNamespace(row.original.memCompliancePercent)}
						<span className="text-sm font-mono">{row.original.memCompliancePercent.toFixed(1)}%</span>
					</div>
					<div className="text-xs text-muted-foreground space-y-0.5">
						<div>Req: {formatBytesIEC(row.original.memRequests)}</div>
						<div>Lim: {formatBytesIEC(row.original.memLimits)}</div>
						<div>Used: {formatBytesIEC(row.original.memUsed)}</div>
					</div>
				</div>
			),
		},
		{
			id: "podStats",
			header: "Pod Stats",
			cell: ({ row }) => (
				<div className="text-sm space-y-1">
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground w-16">Total:</span>
						<span className="font-mono">{row.original.podsTotal}</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground w-16">w/ Limits:</span>
						<span className="font-mono">
							{row.original.podsWithLimits}
							<span className="text-muted-foreground ml-1">
								({((row.original.podsWithLimits / row.original.podsTotal) * 100).toFixed(0)}%)
							</span>
						</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground w-16">w/ Reqs:</span>
						<span className="font-mono">
							{row.original.podsWithRequests}
							<span className="text-muted-foreground ml-1">
								({((row.original.podsWithRequests / row.original.podsTotal) * 100).toFixed(0)}%)
							</span>
						</span>
					</div>
				</div>
			),
		},
	];
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
			cell: () => (
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

/* ---------- Namespace Compliance Table Section ---------- */

interface NamespaceComplianceTableProps {
	onDrilldown: (namespace: string | null) => void;
	selectedNamespace: string | null;
	liveData: Record<string, Array<{ t: number; v: number }>>;
}

function NamespaceComplianceTable({ onDrilldown, selectedNamespace, liveData }: NamespaceComplianceTableProps) {
	// Generate mock namespace compliance data - in reality this would come from liveData
	const mockNamespaceData: NamespaceCompliance[] = React.useMemo(() => {
		// Extract namespace list from live data keys
		const availableKeys = Object.keys(liveData);
		const requestKeys = availableKeys.filter(key => key.startsWith('ns.cpu.request.cores.'));
		const namespaces = requestKeys.map(key => key.replace('ns.cpu.request.cores.', ''));

		// Create mock data for each namespace + some additional ones
		const allNamespaces = [...new Set([...namespaces, 'production', 'staging', 'cache', 'monitoring', 'ml-workloads', 'default', 'kube-system'])];

		return allNamespaces.map((namespace) => {
			// Get latest values from live data if available
			const cpuReqKey = `ns.cpu.request.cores.${namespace}`;
			const cpuLimKey = `ns.cpu.limit.cores.${namespace}`;
			const cpuUsedKey = `ns.cpu.used.cores.${namespace}`;
			const memReqKey = `ns.mem.request.bytes.${namespace}`;
			const memLimKey = `ns.mem.limit.bytes.${namespace}`;
			const memUsedKey = `ns.mem.used.bytes.${namespace}`;

			const getLatest = (key: string) => {
				const data = liveData[key];
				return data && data.length > 0 ? data[data.length - 1].v : 0;
			};

			// Use live data if available, otherwise generate realistic mock data
			const cpuRequests = getLatest(cpuReqKey) || (Math.random() * 10 + 1);
			const cpuLimits = getLatest(cpuLimKey) || (cpuRequests * (1.2 + Math.random() * 0.8));
			const cpuUsed = getLatest(cpuUsedKey) || (cpuRequests * (0.3 + Math.random() * 0.6));

			const memRequests = getLatest(memReqKey) || (Math.random() * 50 + 10) * 1024 * 1024 * 1024;
			const memLimits = getLatest(memLimKey) || (memRequests * (1.2 + Math.random() * 0.8));
			const memUsed = getLatest(memUsedKey) || (memRequests * (0.4 + Math.random() * 0.5));

			const podsTotal = Math.floor(Math.random() * 50 + 5);
			const podsWithLimits = Math.floor(podsTotal * (0.6 + Math.random() * 0.3));
			const podsWithRequests = Math.floor(podsTotal * (0.7 + Math.random() * 0.25));

			return {
				id: namespace,
				name: namespace,
				cpuRequests,
				cpuLimits,
				cpuUsed,
				cpuCompliancePercent: getCompliancePercentage(cpuUsed, cpuRequests, cpuLimits),
				memRequests,
				memLimits,
				memUsed,
				memCompliancePercent: getCompliancePercentage(memUsed, memRequests, memLimits),
				podsTotal,
				podsWithLimits,
				podsWithRequests,
			};
		});
	}, [liveData]);

	const [globalFilter, setGlobalFilter] = React.useState("");
	const [complianceFilter, setComplianceFilter] = React.useState<string>("all");

	const handleDrilldown = React.useCallback((namespace: NamespaceCompliance) => {
		onDrilldown(namespace.name);
	}, [onDrilldown]);

	const handleResetDrilldown = React.useCallback(() => {
		onDrilldown(null);
	}, [onDrilldown]);

	const columns = React.useMemo(
		() => createNamespaceComplianceColumns(handleDrilldown),
		[handleDrilldown]
	);

	const complianceOptions: FilterOption[] = React.useMemo(() => [
		{ value: "excellent", label: "Excellent (90%+)", badge: <Badge variant="default" className="text-green-600 text-xs">Excellent</Badge> },
		{ value: "good", label: "Good (70-89%)", badge: <Badge variant="outline" className="text-blue-600 text-xs">Good</Badge> },
		{ value: "fair", label: "Fair (50-69%)", badge: <Badge variant="secondary" className="text-orange-600 text-xs">Fair</Badge> },
		{ value: "poor", label: "Poor (<50%)", badge: <Badge variant="destructive" className="text-xs">Poor</Badge> },
	], []);

	const namespaceBulkActions: BulkAction[] = React.useMemo(() => [
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
			label: "Copy Namespace Names",
			icon: <Copy className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
		{
			id: "export-report",
			label: "Export Compliance Report",
			icon: <Download className="size-4" />,
			action: () => {
				console.log('Bulk action triggered - this should be handled by the table');
			},
			requiresSelection: true,
		},
	], []);

	return (
		<div className="border rounded-lg bg-card">
			<div className="p-4 border-b">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-xl font-semibold">Namespace Resource Compliance</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Resource usage and compliance metrics for each namespace
						</p>
						{selectedNamespace && (
							<div className="flex items-center gap-2 mt-2">
								<Badge variant="outline" className="text-xs">
									Viewing: {selectedNamespace}
								</Badge>
								<Button
									variant="ghost"
									size="sm"
									onClick={handleResetDrilldown}
									className="text-xs h-6"
								>
									Show All
								</Button>
							</div>
						)}
					</div>
					<div className="flex gap-2">
						<Badge variant="outline" className="text-xs">
							{mockNamespaceData.length} namespaces
						</Badge>
					</div>
				</div>
			</div>

			<div className="px-4 pb-6">
				<UniversalDataTable
					data={mockNamespaceData}
					columns={columns}
					enableReorder={false}
					enableRowSelection={true}
					className="px-0 [&_tbody_tr]:bg-background/50"
					renderFilters={({ table, selectedCount, totalCount }) => (
						<div className="p-4 space-y-4">
							<DataTableFilters
								globalFilter={globalFilter}
								onGlobalFilterChange={setGlobalFilter}
								searchPlaceholder="Search namespaces by name..."
								categoryFilter={complianceFilter}
								onCategoryFilterChange={setComplianceFilter}
								categoryLabel="Filter by compliance"
								categoryOptions={complianceOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={namespaceBulkActions}
								bulkActionsLabel="Namespace Actions"
								table={table}
								showColumnToggle={true}
								onRefresh={() => {
									console.log('Refresh namespace compliance data');
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
	const CLUSTER_KEYS = React.useMemo(() => [
		'cluster.cpu.requested.cores',
		'cluster.cpu.allocatable.cores',
		'cluster.cpu.limits.cores',
		'cluster.cpu.capacity.cores',
		'cluster.mem.requested.bytes',
		'cluster.mem.allocatable.bytes',
		'cluster.mem.limits.bytes',
		'cluster.mem.capacity.bytes',
	], []);

	const NS_BASES = React.useMemo(() => [
		'ns.cpu.request.cores',
		'ns.cpu.limit.cores',
		'ns.cpu.used.cores',
		'ns.mem.request.bytes',
		'ns.mem.limit.bytes',
		'ns.mem.used.bytes',
	], []);

	const [seriesKeys, setSeriesKeys] = React.useState<string[]>(CLUSTER_KEYS);
	const [selectedNamespaces, setSelectedNamespaces] = React.useState<string[]>([]);
	const [drilldownNamespace, setDrilldownNamespace] = React.useState<string | null>(null);
	const [showTopN, setShowTopN] = React.useState<number>(5);
	const [availableNamespaces, setAvailableNamespaces] = React.useState<string[]>([]);

	// bootstrap: discover concrete namespace series and subscribe to those
	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const resp = await fetch('/api/v1/timeseries/namespaces?since=15m&res=hi');
				const json = await resp.json();
				const allKeys: string[] = Object.keys(json?.series || {});
				const nsKeys = allKeys.filter(k => NS_BASES.some(b => k.startsWith(b + '.')));

				// Extract unique namespaces from keys
				const namespaces = new Set<string>();
				nsKeys.forEach(key => {
					NS_BASES.forEach(base => {
						if (key.startsWith(base + '.')) {
							const namespace = key.replace(base + '.', '');
							namespaces.add(namespace);
						}
					});
				});

				if (!cancelled) {
					setSeriesKeys([...CLUSTER_KEYS, ...nsKeys]);
					setAvailableNamespaces(Array.from(namespaces));
				}
			} catch (e) {
				console.error('ns discovery failed', e);
				// fall back to cluster-only; charts will just be empty for ns
				setSeriesKeys(CLUSTER_KEYS);
				setAvailableNamespaces([]);
			}
		})();
		return () => { cancelled = true; };
	}, [CLUSTER_KEYS, NS_BASES]);

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
	const { filteredNamespaceCpuSeries, filteredNamespaceMemorySeries } = React.useMemo(() => {
		const availableKeys = Object.keys(liveData);

		// If drilldown mode, only show the selected namespace
		if (drilldownNamespace) {
			const cpuSeries: ChartSeries[] = [];
			const memorySeries: ChartSeries[] = [];

			const requestCpuKey = `ns.cpu.request.cores.${drilldownNamespace}`;
			const limitCpuKey = `ns.cpu.limit.cores.${drilldownNamespace}`;
			const usedCpuKey = `ns.cpu.used.cores.${drilldownNamespace}`;

			const requestMemKey = `ns.mem.request.bytes.${drilldownNamespace}`;
			const limitMemKey = `ns.mem.limit.bytes.${drilldownNamespace}`;
			const usedMemKey = `ns.mem.used.bytes.${drilldownNamespace}`;

			const baseColor = '#3b82f6';

			if (liveData[requestCpuKey]) {
				cpuSeries.push({
					key: requestCpuKey,
					name: 'Requests',
					color: baseColor,
					data: liveData[requestCpuKey].map(point => [point.t, point.v])
				});
			}

			if (liveData[limitCpuKey]) {
				cpuSeries.push({
					key: limitCpuKey,
					name: 'Limits',
					color: '#ef4444',
					data: liveData[limitCpuKey].map(point => [point.t, point.v])
				});
			}

			if (liveData[usedCpuKey]) {
				cpuSeries.push({
					key: usedCpuKey,
					name: 'Used',
					color: '#22c55e',
					data: liveData[usedCpuKey].map(point => [point.t, point.v])
				});
			}

			if (liveData[requestMemKey]) {
				memorySeries.push({
					key: requestMemKey,
					name: 'Requests',
					color: baseColor,
					data: liveData[requestMemKey].map(point => [point.t, point.v])
				});
			}

			if (liveData[limitMemKey]) {
				memorySeries.push({
					key: limitMemKey,
					name: 'Limits',
					color: '#ef4444',
					data: liveData[limitMemKey].map(point => [point.t, point.v])
				});
			}

			if (liveData[usedMemKey]) {
				memorySeries.push({
					key: usedMemKey,
					name: 'Used',
					color: '#22c55e',
					data: liveData[usedMemKey].map(point => [point.t, point.v])
				});
			}

			return {
				filteredNamespaceCpuSeries: cpuSeries,
				filteredNamespaceMemorySeries: memorySeries
			};
		}

		// Find all namespace-specific keys
		const requestCpuKeys = availableKeys.filter(key => key.startsWith('ns.cpu.request.cores.'));
		const limitCpuKeys = availableKeys.filter(key => key.startsWith('ns.cpu.limit.cores.'));
		const usedCpuKeys = availableKeys.filter(key => key.startsWith('ns.cpu.used.cores.'));

		const requestMemKeys = availableKeys.filter(key => key.startsWith('ns.mem.request.bytes.'));
		const limitMemKeys = availableKeys.filter(key => key.startsWith('ns.mem.limit.bytes.'));
		const usedMemKeys = availableKeys.filter(key => key.startsWith('ns.mem.used.bytes.'));

		// Extract unique namespaces from both CPU and memory keys
		const namespaces = new Set([
			...requestCpuKeys.map(key => key.replace('ns.cpu.request.cores.', '')),
			...limitCpuKeys.map(key => key.replace('ns.cpu.limit.cores.', '')),
			...usedCpuKeys.map(key => key.replace('ns.cpu.used.cores.', '')),
			...requestMemKeys.map(key => key.replace('ns.mem.request.bytes.', '')),
			...limitMemKeys.map(key => key.replace('ns.mem.limit.bytes.', '')),
			...usedMemKeys.map(key => key.replace('ns.mem.used.bytes.', ''))
		]);

		// Get current usage for each namespace to determine Top N
		const namespaceUsage = Array.from(namespaces).map(namespace => {
			const usedCpuKey = `ns.cpu.used.cores.${namespace}`;
			const usedMemKey = `ns.mem.used.bytes.${namespace}`;

			const cpuUsage = liveData[usedCpuKey]?.length > 0 ?
				liveData[usedCpuKey][liveData[usedCpuKey].length - 1].v : 0;
			const memUsage = liveData[usedMemKey]?.length > 0 ?
				liveData[usedMemKey][liveData[usedMemKey].length - 1].v : 0;

			return {
				namespace,
				cpuUsage,
				memUsage,
				totalUsage: cpuUsage + (memUsage / (1024 * 1024 * 1024)) // normalize memory to GB for comparison
			};
		}).sort((a, b) => b.totalUsage - a.totalUsage);

		// Determine which namespaces to show
		let namespacesToShow: string[] = [];
		if (selectedNamespaces.length > 0) {
			// User has manually selected namespaces
			namespacesToShow = selectedNamespaces;
		} else {
			// Show Top N namespaces
			namespacesToShow = namespaceUsage.slice(0, showTopN).map(item => item.namespace);
		}

		// Calculate "Others" aggregation if there are remaining namespaces
		const otherNamespaces = namespaceUsage.slice(showTopN).map(item => item.namespace);
		const shouldShowOthers = otherNamespaces.length > 0 && selectedNamespaces.length === 0;

		const cpuSeries: ChartSeries[] = [];
		const memorySeries: ChartSeries[] = [];

		// Create series for each namespace with different colors
		const colors = ['#3b82f6', '#f59e0b', '#ef4444', '#22c55e', '#8b5cf6', '#06b6d4'];
		namespacesToShow.forEach((namespace, index) => {
			const baseColor = colors[index % colors.length];

			const requestCpuKey = `ns.cpu.request.cores.${namespace}`;
			const limitCpuKey = `ns.cpu.limit.cores.${namespace}`;
			const usedCpuKey = `ns.cpu.used.cores.${namespace}`;

			const requestMemKey = `ns.mem.request.bytes.${namespace}`;
			const limitMemKey = `ns.mem.limit.bytes.${namespace}`;
			const usedMemKey = `ns.mem.used.bytes.${namespace}`;

			if (liveData[requestCpuKey]) {
				cpuSeries.push({
					key: requestCpuKey,
					name: `${namespace} Requests`,
					color: baseColor,
					data: liveData[requestCpuKey].map(point => [point.t, point.v])
				});
			}

			if (liveData[limitCpuKey]) {
				cpuSeries.push({
					key: limitCpuKey,
					name: `${namespace} Limits`,
					color: baseColor + '80',
					data: liveData[limitCpuKey].map(point => [point.t, point.v])
				});
			}

			if (liveData[usedCpuKey]) {
				cpuSeries.push({
					key: usedCpuKey,
					name: `${namespace} Used`,
					color: baseColor + '40',
					data: liveData[usedCpuKey].map(point => [point.t, point.v])
				});
			}

			if (liveData[requestMemKey]) {
				memorySeries.push({
					key: requestMemKey,
					name: `${namespace} Requests`,
					color: baseColor,
					data: liveData[requestMemKey].map(point => [point.t, point.v])
				});
			}

			if (liveData[limitMemKey]) {
				memorySeries.push({
					key: limitMemKey,
					name: `${namespace} Limits`,
					color: baseColor + '80',
					data: liveData[limitMemKey].map(point => [point.t, point.v])
				});
			}

			if (liveData[usedMemKey]) {
				memorySeries.push({
					key: usedMemKey,
					name: `${namespace} Used`,
					color: baseColor + '40',
					data: liveData[usedMemKey].map(point => [point.t, point.v])
				});
			}
		});

		// Add "Others" aggregated series if needed
		if (shouldShowOthers && otherNamespaces.length > 0) {
			const othersColor = '#6b7280';

			// Aggregate data for other namespaces
			const aggregateData = (keys: string[]) => {
				const allPoints = new Map<number, number>();

				keys.forEach(key => {
					if (liveData[key]) {
						liveData[key].forEach(point => {
							const existing = allPoints.get(point.t) || 0;
							allPoints.set(point.t, existing + point.v);
						});
					}
				});

				return Array.from(allPoints.entries()).sort((a, b) => a[0] - b[0]);
			};

			const otherRequestCpuKeys = otherNamespaces.map(ns => `ns.cpu.request.cores.${ns}`).filter(key => liveData[key]);
			const otherLimitCpuKeys = otherNamespaces.map(ns => `ns.cpu.limit.cores.${ns}`).filter(key => liveData[key]);
			const otherUsedCpuKeys = otherNamespaces.map(ns => `ns.cpu.used.cores.${ns}`).filter(key => liveData[key]);

			const otherRequestMemKeys = otherNamespaces.map(ns => `ns.mem.request.bytes.${ns}`).filter(key => liveData[key]);
			const otherLimitMemKeys = otherNamespaces.map(ns => `ns.mem.limit.bytes.${ns}`).filter(key => liveData[key]);
			const otherUsedMemKeys = otherNamespaces.map(ns => `ns.mem.used.bytes.${ns}`).filter(key => liveData[key]);

			if (otherRequestCpuKeys.length > 0) {
				cpuSeries.push({
					key: 'others.cpu.request',
					name: 'Others Requests',
					color: othersColor,
					data: aggregateData(otherRequestCpuKeys)
				});
			}

			if (otherLimitCpuKeys.length > 0) {
				cpuSeries.push({
					key: 'others.cpu.limit',
					name: 'Others Limits',
					color: othersColor + '80',
					data: aggregateData(otherLimitCpuKeys)
				});
			}

			if (otherUsedCpuKeys.length > 0) {
				cpuSeries.push({
					key: 'others.cpu.used',
					name: 'Others Used',
					color: othersColor + '40',
					data: aggregateData(otherUsedCpuKeys)
				});
			}

			if (otherRequestMemKeys.length > 0) {
				memorySeries.push({
					key: 'others.mem.request',
					name: 'Others Requests',
					color: othersColor,
					data: aggregateData(otherRequestMemKeys)
				});
			}

			if (otherLimitMemKeys.length > 0) {
				memorySeries.push({
					key: 'others.mem.limit',
					name: 'Others Limits',
					color: othersColor + '80',
					data: aggregateData(otherLimitMemKeys)
				});
			}

			if (otherUsedMemKeys.length > 0) {
				memorySeries.push({
					key: 'others.mem.used',
					name: 'Others Used',
					color: othersColor + '40',
					data: aggregateData(otherUsedMemKeys)
				});
			}
		}

		return {
			filteredNamespaceCpuSeries: cpuSeries,
			filteredNamespaceMemorySeries: memorySeries
		};
	}, [liveData, selectedNamespaces, drilldownNamespace, showTopN]);

	// Namespace filter options for the multi-select
	const namespaceOptions: MultiSelectOption[] = React.useMemo(() => {
		return availableNamespaces.map(namespace => ({
			value: namespace,
			label: namespace
		}));
	}, [availableNamespaces]);

	// Drilldown handler
	const handleNamespaceDrilldown = React.useCallback((namespace: string | null) => {
		setDrilldownNamespace(namespace);
		if (namespace) {
			setSelectedNamespaces([]); // Clear manual selections when drilling down
		}
	}, []);

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
		console.log('🔍 CPU series count:', filteredNamespaceCpuSeries.length);
		console.log('🔍 Memory series count:', filteredNamespaceMemorySeries.length);

		// Debug summary card data
		console.log('🔍 Summary card cluster values:');
		console.log('  CPU requested:', getLatestValue('cluster.cpu.requested.cores'));
		console.log('  CPU allocatable:', getLatestValue('cluster.cpu.allocatable.cores'));
		console.log('  Memory requested:', getLatestValue('cluster.mem.requested.bytes'));
		console.log('  Memory allocatable:', getLatestValue('cluster.mem.allocatable.bytes'));

		Object.entries(liveData).forEach(([key, data]) => {
			console.log(`🔍 ${key}:`, data.length, 'points, latest:', data.length > 0 ? data[data.length - 1] : 'no data');
		});
	}, [liveData, filteredNamespaceCpuSeries, filteredNamespaceMemorySeries, getLatestValue]);

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
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-semibold">Namespace Resource Compliance</h3>

					<div className="flex items-center gap-4">
						{/* Top N selector */}
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground">Show top:</span>
							<select
								value={showTopN}
								onChange={(e) => setShowTopN(Number(e.target.value))}
								className="px-2 py-1 text-xs border rounded bg-background"
								disabled={selectedNamespaces.length > 0 || drilldownNamespace !== null}
							>
								<option value={3}>3</option>
								<option value={5}>5</option>
								<option value={10}>10</option>
								<option value={-1}>All</option>
							</select>
						</div>

						{/* Namespace filter */}
						<div className="w-64">
							<MultiSelectCombobox
								options={namespaceOptions}
								values={selectedNamespaces}
								onValuesChange={setSelectedNamespaces}
								placeholder="Filter namespaces..."
								searchPlaceholder="Search namespaces..."
								emptyText="No namespaces found"
								disabled={drilldownNamespace !== null}
								className="text-xs"
							/>
						</div>

						{/* Reset button */}
						{(selectedNamespaces.length > 0 || drilldownNamespace !== null) && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setSelectedNamespaces([]);
									setDrilldownNamespace(null);
								}}
								className="text-xs"
							>
								Reset View
							</Button>
						)}
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<MetricAreaChart
						title={drilldownNamespace ? `CPU: ${drilldownNamespace} (Request/Limit/Used)` : "CPU by Namespace (Request/Limit/Used)"}
						subtitle={drilldownNamespace ?
							`Resource allocation timeline for ${drilldownNamespace} namespace` :
							`Shows CPU resource allocation across ${selectedNamespaces.length > 0 ? 'selected' : 'top'} namespaces`
						}
						series={filteredNamespaceCpuSeries}
						unit="cores"
						formatter={formatCores}
						stacked={true}
						scopeLabel={drilldownNamespace ? drilldownNamespace : "namespace"}
						timespanLabel="15m"
						resolutionLabel="lo"
					/>

					<MetricAreaChart
						title={drilldownNamespace ? `Memory: ${drilldownNamespace} (Request/Limit/Used)` : "Memory by Namespace (Request/Limit/Used)"}
						subtitle={drilldownNamespace ?
							`Resource allocation timeline for ${drilldownNamespace} namespace` :
							`Shows memory resource allocation across ${selectedNamespaces.length > 0 ? 'selected' : 'top'} namespaces`
						}
						series={filteredNamespaceMemorySeries}
						unit="bytes"
						formatter={formatBytesIEC}
						stacked={true}
						scopeLabel={drilldownNamespace ? drilldownNamespace : "namespace"}
						timespanLabel="15m"
						resolutionLabel="lo"
					/>
				</div>

				{/* Namespace Compliance Table */}
				<NamespaceComplianceTable
					onDrilldown={handleNamespaceDrilldown}
					selectedNamespace={drilldownNamespace}
					liveData={liveData}
				/>
			</div>

			{/* Pod Resource Compliance Section */}
			<div className="space-y-6">
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
