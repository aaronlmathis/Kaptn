"use client"

import * as React from "react"
import { UniversalDataTable, type BulkAction } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceQuotasWithWebSocket } from "@/hooks/useResourceQuotasWithWebSocket"
import {
	getHealthTrendBadge,
	getReplicaStatusBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconDownload, IconCopy } from "@tabler/icons-react"
import { type ColumnDef, type Row } from "@/lib/table"
import type { DashboardResourceQuota } from "@/lib/k8s-cluster"
import { ResourceQuotaDetailDrawer } from "@/components/viewers/ResourceQuotaDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { bulkActionsApi } from "@/lib/api/bulk-actions"

// Inner component that can access the namespace context
function ResourceQuotasContent() {
	const { data: resourceQuotas, loading: isLoading, error } = useResourceQuotasWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [resourceTypeFilter, setResourceTypeFilter] = React.useState<string>("all")
	const [selectedResourceQuotaForDetails, setSelectedResourceQuotaForDetails] = React.useState<DashboardResourceQuota | null>(null)

	// Confirmation dialog state for destructive actions
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])

	type Item = { name: string; namespace?: string }
	type Scope = 'resourcequotas'

	const [pendingAction, setPendingAction] = React.useState<null | { scope: Scope, items: Item[] }>(null)

	const requireTextConfirm = React.useMemo(() => !!pendingAction && pendingAction.items.length > 0, [pendingAction])
	const confirmValue = React.useMemo(() => {
		if (!pendingAction || pendingAction.items.length === 0) return ''
		const count = pendingAction.items.length
		return count === 1 ? pendingAction.items[0].name : 'DELETE'
	}, [pendingAction])

	// Validate function — sets warnings on dialog before running destructive action
	const validateDelete = React.useCallback(async (scope: Scope, items: Item[]) => {
		try {
			const targets = items.map(i => ({ namespace: i.namespace ?? '', name: i.name }))
			const resp = await bulkActionsApi.validateAction(String(scope), { action: 'delete', targets })
			const details: unknown = resp?.details
			const warnings: string[] = Array.isArray((details as { results?: Array<{ warnings?: string[] }> })?.results)
				? (details as { results: Array<{ warnings?: string[] }> }).results.flatMap((r) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Confirm handler — executes with `force_confirm: true`
	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.items.map(i => ({ namespace: i.namespace ?? '', name: i.name }))
			await bulkActionsApi.executeBulkAction(String(pendingAction.scope), { action: 'delete', targets, force_confirm: true })
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction])

	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()

	React.useEffect(() => {
		fetchAdditional([
			'resourcequotas.list',
			'resourcequotas.get',
			'resourcequotas.patch',
			'resourcequotas.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when resource quotas change
	React.useEffect(() => {
		if (resourceQuotas.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [resourceQuotas])

	// Resource type filters
	const resourceTypeFilters: FilterOption[] = React.useMemo(() => {
		const types = new Set<string>()
		resourceQuotas.forEach(quota => {
			quota.hardLimits.forEach(limit => {
				const resourceName = limit.name.replace(/^(requests\.|limits\.)/, '')
				const displayName = resourceName.charAt(0).toUpperCase() + resourceName.slice(1)
				types.add(displayName)
			})
		})

		return [
			{ value: "all", label: "All Resource Types" },
			...Array.from(types).sort().map(type => ({ value: type, label: type }))
		]
	}, [resourceQuotas])

	// Filtered data
	const filteredData = React.useMemo(() => {
		let filtered = [...resourceQuotas]

		// Apply resource type filter
		if (resourceTypeFilter !== "all") {
			filtered = filtered.filter(quota => {
				return quota.hardLimits.some(limit => {
					const resourceName = limit.name.replace(/^(requests\.|limits\.)/, '')
					const displayName = resourceName.charAt(0).toUpperCase() + resourceName.slice(1)
					return displayName === resourceTypeFilter
				})
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
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
								>
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
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
									const item = row.original
									setPendingAction({ scope: 'resourcequotas', items: [{ name: item.name, namespace: item.namespace }] })
									setConfirmDialogOpen(true)
									validateDelete('resourcequotas', [{ name: item.name, namespace: item.namespace }])
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
	], [clusterId, validateDelete])

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
				const selected = selectedResourceQuotas.map(r => ({ name: r.name, namespace: r.namespace }))
				setPendingAction({ scope: 'resourcequotas', items: selected })
				setConfirmDialogOpen(true)
				validateDelete('resourcequotas', selected)
			},
			variant: "destructive" as const,
			requiresSelection: true,
		},
	], [validateDelete])

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
				badge: getHealthTrendBadge(totalQuotas > 0 ? 100 : 0)
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
	}, [resourceQuotas])

	return (
		<>


			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
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
						>

						</DataTableFilters>
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
					title={'Delete ' + (pendingAction?.scope ?? 'Resources')}
					description={'Are you sure you want to delete the selected items? This action cannot be undone.'}
					actionLabel={pendingAction?.items && pendingAction.items.length > 1 ? 'Delete Selected' : 'Delete'}
					variant={'destructive'}
					isExecuting={isConfirmExecuting}
					onConfirm={handleConfirmAction}
					resources={(pendingAction?.items || []).map(i => ({ name: i.name, namespace: i.namespace }))}
					safetyViolations={[]}
					warnings={confirmWarnings}
					requireTextConfirm={requireTextConfirm}
					confirmPrompt={pendingAction?.items && pendingAction.items.length === 1 ? 'Type the resource name to confirm' : 'Type DELETE to confirm'}
					confirmValue={confirmValue}
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
