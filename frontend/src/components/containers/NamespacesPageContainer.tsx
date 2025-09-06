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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Inner component that can access the namespace context
function NamespacesContent() {
	const { data: namespaces, loading: isLoading, error, isConnected } = useNamespacesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['namespaces.get', 'namespaces.patch', 'namespaces.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedNamespaceForDetails, setSelectedNamespaceForDetails] = React.useState<DashboardNamespace | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', namespaces: DashboardNamespace[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

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
						<IfAllowed feature="namespaces.delete" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', namespaces: [row.original] }); setConfirmDialogOpen(true) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, handleViewDetails])

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
				action: (rows) => { setPendingAction({ type: 'delete', namespaces: rows }); setConfirmDialogOpen(true) }
			})
		}

		return actions
	}, [isAllowed])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			// Simulate API call for deleting namespaces
			console.log('Delete namespaces:', pendingAction.namespaces.map(ns => ns.name))
			setAlert({ variant: 'success', title: `Success: ${pendingAction.namespaces.length} namespaces deleted` })
		} catch (e: unknown) {
			setAlert({ variant: 'error', title: 'Action failed', description: e instanceof Error ? e.message : String(e) })
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Namespaces</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor namespace resources in your Kubernetes cluster
						</p>
					</div>
					{lastUpdated && (
						<div className="text-sm text-muted-foreground">
							Last updated: {new Date(lastUpdated).toLocaleTimeString()}
						</div>
					)}
				</div>
			</div>

			{/* Summary Cards */}
			<SummaryCards
				cards={summaryCards}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<div className="px-4 lg:px-6 space-y-3">
				{alert && (
					<Alert
						className={alert.variant === 'success'
							? 'bg-transparent border-green-600 text-green-700'
							: 'bg-transparent border-red-600 text-red-700'}
						variant='default'
					>
						<AlertTitle>{alert.title}</AlertTitle>
						{alert.description && <AlertDescription>{alert.description}</AlertDescription>}
					</Alert>
				)}
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
				title="Delete Namespaces"
				description="Are you sure you want to delete the selected namespaces? This action cannot be undone."
				actionLabel="Delete Namespaces"
				variant="destructive"
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.namespaces || []).map(ns => ({ name: ns.name, namespace: '' }))}
				safetyViolations={[]}
				warnings={[]}
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
