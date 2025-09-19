"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useNamespacesWithWebSocket } from "@/hooks/useNamespacesWithWebSocket"
import {
	getNamespaceStatusBadge,
	getNamespaceResourceBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconCopy, IconDownload, IconCircleCheckFilled, IconLoader, IconAlertTriangle } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { DashboardNamespace } from "@/lib/k8s-cluster"
import { NamespaceDetailDrawer } from "@/components/viewers/NamespaceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { bulkActionsApi } from "@/lib/api/bulk-actions"

// Inner component that can access the namespace context
function NamespacesContent() {
	const { data: namespaces, loading: isLoading, error } = useNamespacesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['namespaces.get', 'namespaces.patch', 'namespaces.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedNamespaceForDetails, setSelectedNamespaceForDetails] = React.useState<DashboardNamespace | null>(null)

	// Confirmation dialog state for destructive actions
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])

	type Item = { name: string; namespace?: string }
	type Scope = 'namespaces'

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
			const warnings: string[] = Array.isArray((details as any)?.results)
				? (details as any).results.flatMap((r: unknown) => Array.isArray((r as any)?.warnings) ? (r as any).warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Ensure namespace-specific capabilities are requested (cluster-scoped)
	React.useEffect(() => {
		fetchAdditional([
			'namespaces.get',
			'namespaces.patch',
			'namespaces.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when namespaces change
	React.useEffect(() => {
		if (namespaces && namespaces.length > 0) {
			// Use ISO string so SummaryCards can format correctly (avoids Invalid Date)
			setLastUpdated(new Date().toISOString())
		}
	}, [namespaces])

	// Calculate summary data for cards
	const totalNamespaces = namespaces?.length || 0
	const activeNamespaces = namespaces?.filter(ns => ns.status === 'Active').length || 0
	const terminatingNamespaces = namespaces?.filter(ns => ns.status === 'Terminating').length || 0
	const failedNamespaces = namespaces?.filter(ns => ns.status === 'Failed').length || 0

	// Label and annotation statistics
	const totalLabels = namespaces?.reduce((sum, ns) => sum + ns.labelsCount, 0) || 0
	const totalAnnotations = namespaces?.reduce((sum, ns) => sum + ns.annotationsCount, 0) || 0

	// Health metrics
	const healthPercentage = totalNamespaces > 0 ? Math.round((activeNamespaces / totalNamespaces) * 100) : 0

	// Resource activity (labels + annotations as a proxy for activity)
	const avgResourcesPerNamespace = totalNamespaces > 0 ? Math.round((totalLabels + totalAnnotations) / totalNamespaces) : 0

	const summaryCards: SummaryCard[] = [
		{
			title: "Total Namespaces",
			value: totalNamespaces.toString(),
			subtitle: "Cluster namespaces",
			icon: getResourceIcon("namespaces"),
			badge: getHealthTrendBadge(healthPercentage),
		},
		{
			title: "Active Namespaces",
			value: `${activeNamespaces}/${totalNamespaces}`,
			subtitle: `${healthPercentage}% operational`,
			icon: getResourceIcon("namespaces"),
			badge: getNamespaceStatusBadge(activeNamespaces, terminatingNamespaces, failedNamespaces, totalNamespaces),
		},
		{
			title: "Resource Activity",
			value: avgResourcesPerNamespace.toString(),
			subtitle: `Avg labels/annotations per namespace`,
			icon: getResourceIcon("namespaces"),
			badge: getNamespaceResourceBadge(avgResourcesPerNamespace),
		},
		{
			title: "Status Distribution",
			// Keep the large title area compact and numeric
			value: terminatingNamespaces + failedNamespaces,
			subtitle: `${terminatingNamespaces} terminating, ${failedNamespaces} failed`,
			badge: getNamespaceStatusBadge(activeNamespaces, terminatingNamespaces, failedNamespaces, totalNamespaces),
			footer: `${activeNamespaces} active out of ${totalNamespaces}`,
		},
	]

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	const statusOptions: FilterOption[] = React.useMemo(() => {
		const statuses = new Set<string>()
		namespaces?.forEach(namespace => {
			if (namespace.status) {
				statuses.add(namespace.status)
			}
		})
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: getStatusBadge(status)
		}))
	}, [namespaces])

	const filtered = React.useMemo(() => {
		let filteredData = namespaces || []

		// Apply status filter
		if (statusFilter !== "all") {
			filteredData = filteredData.filter(namespace => namespace.status === statusFilter)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filteredData = filteredData.filter(namespace =>
				namespace.name.toLowerCase().includes(searchTerm) ||
				namespace.status.toLowerCase().includes(searchTerm) ||
				namespace.age.toLowerCase().includes(searchTerm)
			)
		}

		return filteredData
	}, [namespaces, statusFilter, globalFilter])

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((namespace: DashboardNamespace) => {
		setSelectedNamespaceForDetails(namespace)
		setDetailDrawerOpen(true)
	}, [])

	// Status badge helper function
	function getStatusBadge(status: string) {
		switch (status) {
			case "Active":
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						{status}
					</Badge>
				)
			case "Terminating":
				return (
					<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
						<IconLoader className="size-3 text-yellow-600 mr-1" />
						{status}
					</Badge>
				)
			case "Failed":
				return (
					<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
						<IconAlertTriangle className="size-3 text-red-600 mr-1" />
						{status}
					</Badge>
				)
			default:
				return (
					<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
						{status}
					</Badge>
				)
		}
	}

	const columns: ColumnDef<DashboardNamespace>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Namespace Name',
			cell: ({ row }: { row: { original: DashboardNamespace } }) => (
				<IfAllowed
					feature="namespaces.get"
					cluster={clusterId}
					namespace=""
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => handleViewDetails(row.original)}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
			enableHiding: false,
		},
		{
			accessorKey: 'status',
			header: 'Status',
			cell: ({ row }: { row: { original: DashboardNamespace } }) => getStatusBadge(row.original.status),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: DashboardNamespace } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			accessorKey: 'labelsCount',
			header: 'Labels',
			cell: ({ row }: { row: { original: DashboardNamespace } }) => (
				<div className="text-sm">{row.original.labelsCount} label(s)</div>
			),
		},
		{
			accessorKey: 'annotationsCount',
			header: 'Annotations',
			cell: ({ row }: { row: { original: DashboardNamespace } }) => (
				<div className="text-sm">{row.original.annotationsCount} annotation(s)</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardNamespace } }) => (
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
						<IfAllowed feature="namespaces.get" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => handleViewDetails(row.original)}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="namespaces.patch" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace=""
								resourceKind="Namespace"
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
						<IfAllowed feature="namespaces.delete" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => {
								const item = row.original
								setPendingAction({ scope: 'namespaces', items: [{ name: item.name, namespace: '' }] })
								setConfirmDialogOpen(true)
								validateDelete('namespaces', [{ name: item.name, namespace: '' }])
							}}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, handleViewDetails, validateDelete])

	// Bulk actions based on original NamespacesDataTable
	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardNamespace[]) => void | Promise<void> }[] = []

		actions.push({
			id: 'copy-names',
			label: 'Copy Namespace Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n'))
		})

		if (isAllowed('namespaces.get')) {
			actions.push({
				id: 'export-yaml',
				label: 'Export Selected as YAML',
				icon: <IconDownload className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					console.log('Export YAML for namespaces:', rows.map(ns => ns.name))
				}
			})
		}

		if (isAllowed('namespaces.delete')) {
			actions.push({
				id: 'delete-namespaces',
				label: 'Delete Selected Namespaces',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					const selected = rows.map(r => ({ name: r.name, namespace: '' }))
					setPendingAction({ scope: 'namespaces', items: selected })
					setConfirmDialogOpen(true)
					validateDelete('namespaces', selected)
				}
			})
		}

		return actions
	}, [isAllowed, validateDelete])

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

	return (
		<div className="space-y-6">

			{/* Summary Cards */}
			<SummaryCards
				cards={summaryCards}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<div className="px-4 lg:px-6 space-y-3">
				<UniversalDataTable
					data={filtered}
					columns={columns}
					enableReorder={false}
					enableRowSelection={true}
					loading={isLoading}
					error={error}
					className="px-0 [&_tbody_tr]:bg-background/50"
					renderFilters={({ table, selectedCount, totalCount }) => (
						<div className="space-y-4">
							<DataTableFilters
								globalFilter={globalFilter}
								onGlobalFilterChange={setGlobalFilter}
								searchPlaceholder="Search namespaces by name, status, or age... (Press '/' to focus)"
								categoryFilter={statusFilter}
								onCategoryFilterChange={setStatusFilter}
								categoryLabel="Filter by status"
								categoryOptions={statusOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon || undefined,
									variant: a.variant || 'default',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardNamespace }) => r.original))
								}))}
								table={table}
								showColumnToggle={true}
							/>
						</div>
					)}
				/>
			</div>

			{/* Controlled detail drawer for full namespace details */}
			{selectedNamespaceForDetails && (
				<NamespaceDetailDrawer
					item={selectedNamespaceForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedNamespaceForDetails(null)
						}
					}}
				/>
			)}

			{/* Bulk action confirmation dialog */}
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
		</div>
	)
}

export function NamespacesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["namespaces.list"]} requireAll={false}>
			<NamespacesContent />
		</RouteGuard>
	)
}
