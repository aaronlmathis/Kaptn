"use client"

import * as React from "react"
import { UniversalDataTable, type BulkAction } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceQuotasWithWebSocket } from "@/hooks/useResourceQuotasWithWebSocket"
import {
	getConnectionStatusBadge,
	getHealthTrendBadge,
	getReplicaStatusBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useCluster } from "@/hooks/useCluster"
import { useNavigation } from "@/contexts/navigation-context"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconDownload, IconCopy } from "@tabler/icons-react"
import { type ColumnDef, type Row } from "@/lib/table"
import type { DashboardResourceQuota } from "@/lib/k8s-cluster"
import { ResourceQuotaDetailDrawer } from "@/components/viewers/ResourceQuotaDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"

// Inner component that can access the namespace context
function ResourceQuotasContent() {
	const { data: resourceQuotas, loading: isLoading, error, isConnected } = useResourceQuotasWithWebSocket(true)
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [resourceTypeFilter, setResourceTypeFilter] = React.useState<string>("all")
	const [selectedResourceQuotaForDetails, setSelectedResourceQuotaForDetails] = React.useState<DashboardResourceQuota | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [pendingAction, setPendingAction] = React.useState<{ type: 'delete', items: DashboardResourceQuota[] } | null>(null)

	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { setPageTitle } = useNavigation()

	// Set page title when component mounts
	React.useEffect(() => {
		setPageTitle("Resource Quotas", "Manage and monitor resource quota limits in your Kubernetes cluster")
	}, [setPageTitle])

	// Debug: Log the hook results
	React.useEffect(() => {
		console.log('DEBUG: Hook results - ResourceQuotas:', resourceQuotas.length, 'Loading:', isLoading, 'Error:', error, 'Connected:', isConnected)
	}, [resourceQuotas, isLoading, error, isConnected])

	React.useEffect(() => {
		fetchAdditional([
			'resourcequotas.list',
			'resourcequotas.get',
			'resourcequotas.patch',
			'resourcequotas.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Helper function to get resource type badge
	const getResourceTypeBadge = React.useCallback((type: string) => {
		switch (type.toLowerCase()) {
			case 'cpu':
				return <Badge variant="outline" className="text-xs text-blue-600 border-border bg-transparent">CPU</Badge>
			case 'memory':
				return <Badge variant="outline" className="text-xs text-green-600 border-border bg-transparent">Memory</Badge>
			case 'storage':
				return <Badge variant="outline" className="text-xs text-purple-600 border-border bg-transparent">Storage</Badge>
			case 'ephemeral-storage':
				return <Badge variant="outline" className="text-xs text-orange-600 border-border bg-transparent">Ephemeral</Badge>
			case 'pods':
				return <Badge variant="outline" className="text-xs text-cyan-600 border-border bg-transparent">Pods</Badge>
			case 'services':
				return <Badge variant="outline" className="text-xs text-indigo-600 border-border bg-transparent">Services</Badge>
			case 'secrets':
				return <Badge variant="outline" className="text-xs text-red-600 border-border bg-transparent">Secrets</Badge>
			case 'configmaps':
				return <Badge variant="outline" className="text-xs text-yellow-600 border-border bg-transparent">ConfigMaps</Badge>
			case 'persistentvolumeclaims':
				return <Badge variant="outline" className="text-xs text-pink-600 border-border bg-transparent">PVCs</Badge>
			case 'replicationcontrollers':
				return <Badge variant="outline" className="text-xs text-teal-600 border-border bg-transparent">RCs</Badge>
			case 'resourcequotas':
				return <Badge variant="outline" className="text-xs text-slate-600 border-border bg-transparent">Quotas</Badge>
			default:
				return <Badge variant="outline" className="text-xs">{type}</Badge>
		}
	}, [])

	// Resource type filters
	const resourceTypeFilters: FilterOption[] = React.useMemo(() => {
		const types = new Set<string>()

		resourceQuotas.forEach((quota) => {
			quota.hardLimits.forEach((limit) => {
				const resourceName = limit.name.replace(/^(requests\.|limits\.)/, '')
				const displayName = resourceName.charAt(0).toUpperCase() + resourceName.slice(1)
				types.add(displayName)
			})
		})

		return [
			...Array.from(types).sort().map(type => ({
				value: type,
				label: type,
				badge: getResourceTypeBadge(type)
			}))
		]
	}, [resourceQuotas, getResourceTypeBadge])

	// Filtered data
	const filteredData = React.useMemo(() => {
		let filtered = [...resourceQuotas]

		// Apply resource type filter
		if (resourceTypeFilter !== "all") {
			filtered = filtered.filter(quota => {
				const hasMatchingLimit = quota.hardLimits.some(limit => {
					const resourceName = limit.name.replace(/^(requests\.|limits\.)/, '')
					const displayName = resourceName.charAt(0).toUpperCase() + resourceName.slice(1)
					return displayName === resourceTypeFilter
				})
				return hasMatchingLimit
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(quota =>
				quota.name.toLowerCase().includes(searchTerm) ||
				quota.namespace.toLowerCase().includes(searchTerm) ||
				quota.hardLimits.some(limit =>
					limit.name.toLowerCase().includes(searchTerm) ||
					limit.limit.toLowerCase().includes(searchTerm) ||
					limit.used.toLowerCase().includes(searchTerm)
				) ||
				quota.usedResources.some(resource =>
					resource.name.toLowerCase().includes(searchTerm) ||
					resource.quantity.toLowerCase().includes(searchTerm)
				)
			)
		}

		return filtered
	}, [resourceQuotas, resourceTypeFilter, globalFilter])

	// Columns definition
	const columns: ColumnDef<DashboardResourceQuota>[] = React.useMemo(() => [
		{
			id: "name",
			accessorKey: "name",
			header: "Resource Quota Name",
			cell: ({ row }: { row: Row<DashboardResourceQuota> }) => {
				return (
					<IfAllowed
						feature="resourcequotas.get"
						cluster={clusterId}
						namespace={row.original.namespace}
						resourceName={row.original.name}
						fallback={<span>{row.original.name}</span>}
					>
						<Button
							variant="link"
							className="h-auto p-0 text-left font-normal"
							onClick={() => setSelectedResourceQuotaForDetails(row.original)}
						>
							{row.original.name}
						</Button>
					</IfAllowed>
				)
			},
			enableHiding: false,
		},
		{
			id: "namespace",
			accessorKey: "namespace",
			header: "Namespace",
			cell: ({ row }: { row: Row<DashboardResourceQuota> }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			id: "resourceTypes",
			accessorKey: "hardLimits",
			header: "Resource Types",
			cell: ({ row }: { row: Row<DashboardResourceQuota> }) => {
				const types = row.original.hardLimits.map(limit => {
					const resourceName = limit.name.replace(/^(requests\.|limits\.)/, '')
					const displayName = resourceName.charAt(0).toUpperCase() + resourceName.slice(1)
					return displayName
				})
				const uniqueTypes = Array.from(new Set(types)).sort()

				return (
					<div className="flex flex-wrap gap-1">
						{uniqueTypes.slice(0, 3).map((type: string) => (
							<span key={type}>
								{getResourceTypeBadge(type)}
							</span>
						))}
						{uniqueTypes.length > 3 && (
							<Badge variant="outline" className="text-xs">
								+{uniqueTypes.length - 3} more
							</Badge>
						)}
					</div>
				)
			},
		},
		{
			id: "age",
			accessorKey: "age",
			header: "Age",
			cell: ({ row }: { row: Row<DashboardResourceQuota> }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: "hardLimits",
			accessorKey: "hardLimits",
			header: "Hard Limits",
			cell: ({ row }: { row: Row<DashboardResourceQuota> }) => (
				<div className="font-mono text-sm">
					{row.original.hardLimits.length} limits
				</div>
			),
		},
		{
			id: "usedResources",
			accessorKey: "usedResources",
			header: "Used Resources",
			cell: ({ row }: { row: Row<DashboardResourceQuota> }) => (
				<div className="font-mono text-sm">
					{row.original.usedResources.length} resources
				</div>
			),
		},
		{
			id: "actions",
			cell: ({ row }: { row: Row<DashboardResourceQuota> }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
							size="icon"
						>
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed
							feature="resourcequotas.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconEye className="size-4 mr-2" />
									View Details
								</DropdownMenuItem>
							}
						>
							<DropdownMenuItem onClick={() => setSelectedResourceQuotaForDetails(row.original)}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="resourcequotas.patch"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace={row.original.namespace}
								resourceKind="ResourceQuota"
							>
								<button
									className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer"
									style={{ background: 'transparent', border: 'none', textAlign: 'left' }}
								>
									<IconEdit className="size-4" />
									Edit YAML
								</button>
							</ResourceYamlEditor>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed
							feature="resourcequotas.delete"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconTrash className="size-4 mr-2" />
									Delete
								</DropdownMenuItem>
							}
						>
							<DropdownMenuItem
								className="text-red-600"
								onClick={() => {
									setPendingAction({ type: 'delete', items: [row.original] })
									setConfirmDialogOpen(true)
								}}
							>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	], [clusterId, getResourceTypeBadge])

	// Bulk actions
	const bulkActions: BulkAction<DashboardResourceQuota>[] = React.useMemo(() => [
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: (selectedResourceQuotas: DashboardResourceQuota[]) => {
				console.log('Export YAML for ResourceQuotas:', selectedResourceQuotas.map(rq => rq.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "copy-names",
			label: "Copy ResourceQuota Names",
			icon: <IconCopy className="size-4" />,
			action: (selectedResourceQuotas: DashboardResourceQuota[]) => {
				const names = selectedResourceQuotas.map(rq => rq.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied ResourceQuota names:', names)
			},
			requiresSelection: true,
		},
		{
			id: "delete-resource-quotas",
			label: "Delete Selected ResourceQuotas",
			icon: <IconTrash className="size-4" />,
			action: (selectedResourceQuotas: DashboardResourceQuota[]) => {
				setPendingAction({ type: 'delete', items: selectedResourceQuotas })
				setConfirmDialogOpen(true)
			},
			variant: "destructive" as const,
			requiresSelection: true,
		},
	], [])

	// Handle delete confirmation
	const handleDeleteConfirm = async () => {
		if (!pendingAction || pendingAction.type !== 'delete') return

		try {
			// Use the standard bulk action API pattern like other resources
			const targets = pendingAction.items.map(item => ({
				namespace: item.namespace,
				name: item.name,
			}))

			// For now, use individual API calls until ResourceQuotas bulk API is available
			await Promise.all(
				targets.map(target =>
					fetch(`/api/v1/resources`, {
						method: 'DELETE',
						headers: {
							'Content-Type': 'application/json',
							'X-CSRF-Token': document.cookie.split('; ').find(row => row.startsWith('csrf_token='))?.split('=')[1] || '',
						},
						credentials: 'include',
						body: JSON.stringify({
							kind: 'ResourceQuota',
							namespace: target.namespace,
							name: target.name,
						})
					})
				)
			)
		} catch (error) {
			console.error('Error deleting resource quotas:', error)
		} finally {
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}

	// Generate summary cards from resource quota data
	const summaryData = React.useMemo(() => {
		if (!resourceQuotas || resourceQuotas.length === 0) {
			return [
				{
					title: "Total Resource Quotas",
					value: 0,
					subtitle: "No resource quotas found"
				},
				{
					title: "Active Quotas",
					value: 0,
					subtitle: "Quotas with limits"
				},
				{
					title: "Resource Types",
					value: 0,
					subtitle: "Limited resource types"
				},
				{
					title: "Total Hard Limits",
					value: 0,
					subtitle: "Individual limit rules"
				}
			]
		}

		const totalQuotas = resourceQuotas.length
		const activeQuotas = resourceQuotas.filter(q => q.hardLimits.length > 0).length
		const totalResourceTypes = new Set(
			resourceQuotas.flatMap(q => q.hardLimits.map(l => l.name))
		).size

		return [
			{
				title: "Total Resource Quotas",
				value: totalQuotas,
				subtitle: `${totalQuotas} quota${totalQuotas !== 1 ? 's' : ''}`,
				footer: totalQuotas > 0 ? "Resource quotas across all namespaces" : "No resource quotas found",
				badge: getConnectionStatusBadge(isConnected)
			},
			{
				title: "Active Quotas",
				value: activeQuotas,
				subtitle: `${activeQuotas} with hard limits`,
				footer: "Quotas defining resource limits",
				badge: getReplicaStatusBadge(activeQuotas, totalQuotas)
			},
			{
				title: "Resource Types",
				value: totalResourceTypes,
				subtitle: "Types under quota control",
				footer: "CPU, memory, storage, etc.",
				badge: getHealthTrendBadge(totalResourceTypes > 0 ? 100 : 0)
			},
			{
				title: "Total Hard Limits",
				value: resourceQuotas.reduce((sum, q) => sum + q.hardLimits.length, 0),
				subtitle: "Individual limit rules",
				footer: "Sum of all hard limit entries",
				badge: getHealthTrendBadge(resourceQuotas.reduce((sum, q) => sum + q.hardLimits.length, 0) > 0 ? 100 : 0)
			}
		]
	}, [resourceQuotas, isConnected])

	return (
		<>
			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
			/>
			<div className="px-4 lg:px-6">
				<UniversalDataTable
					data={filteredData}
					columns={columns}
					enableReorder={false}
					enableRowSelection={true}
					loading={isLoading}
					error={error}
					bulkActions={bulkActions}
					renderFilters={({ table, selectedCount, totalCount }) => (
						<DataTableFilters
							globalFilter={globalFilter}
							onGlobalFilterChange={setGlobalFilter}
							searchPlaceholder="Search ResourceQuotas by name, namespace, limits, or usage... (Press '/' to focus)"
							categoryFilter={resourceTypeFilter}
							onCategoryFilterChange={setResourceTypeFilter}
							categoryLabel="Filter by resource type"
							categoryOptions={resourceTypeFilters}
							selectedCount={selectedCount}
							totalCount={totalCount}
							bulkActions={bulkActions.map(a => ({
								id: a.id,
								label: a.label,
								icon: a.icon,
								variant: a.variant === "destructive" ? "destructive" : "default",
								requiresSelection: a.requiresSelection,
								action: () => a.action(table.getFilteredSelectedRowModel().rows.map((row: Row<DashboardResourceQuota>) => row.original))
							}))}
							table={table}
							showColumnToggle={true}
						/>
					)}
				/>
			</div>
			{/* Detail drawer */}
			{selectedResourceQuotaForDetails && (
				<ResourceQuotaDetailDrawer
					open={!!selectedResourceQuotaForDetails}
					onOpenChange={(open) => !open && setSelectedResourceQuotaForDetails(null)}
					item={selectedResourceQuotaForDetails}
				/>
			)}

			{/* Confirmation dialog */}
			{pendingAction && (
				<ActionConfirmationDialog
					open={confirmDialogOpen}
					onOpenChange={setConfirmDialogOpen}
					title={pendingAction.type === 'delete' ? 'Delete Resource Quotas' : 'Confirm Action'}
					description={
						pendingAction.type === 'delete'
							? `Are you sure you want to delete ${pendingAction.items.length} resource quota${pendingAction.items.length === 1 ? '' : 's'}? This action cannot be undone.`
							: 'Are you sure you want to perform this action?'
					}
					actionLabel={pendingAction.type === 'delete' ? 'Delete' : 'Confirm'}
					variant={pendingAction.type === 'delete' ? 'destructive' : 'default'}
					resources={pendingAction.items.map(item => ({
						name: item.name,
						namespace: item.namespace,
						kind: 'ResourceQuota'
					}))}
					onConfirm={handleDeleteConfirm}
				/>
			)}
		</>
	)
}

export function ResourceQuotasPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["resourcequotas.list"]} requireAll={false}>
			<ResourceQuotasContent />
		</RouteGuard>
	)
}
