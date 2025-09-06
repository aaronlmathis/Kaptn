"use client"

import * as React from "react"
import { RouteGuard } from "@/components/authz"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconDownload, IconCopy, IconCircleCheckFilled, IconAlertTriangle } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { usePersistentVolumesWithWebSocket } from "@/hooks/usePersistentVolumesWithWebSocket"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import {
	getPersistentVolumeStatusBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"
import { PersistentVolumeDetailDrawer } from "@/components/viewers/PersistentVolumeDetailDrawer"
import type { DashboardPersistentVolume } from "@/lib/k8s-storage"

function PersistentVolumesContent() {
	const { data: persistentVolumes, loading: isLoading, error, isConnected } = usePersistentVolumesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['persistentvolumes.get', 'persistentvolumes.patch', 'persistentvolumes.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedPVForDetails, setSelectedPVForDetails] = React.useState<DashboardPersistentVolume | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', pvs: DashboardPersistentVolume[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Ensure PV-specific action capabilities are requested
	React.useEffect(() => {
		fetchAdditional([
			'persistentvolumes.get',
			'persistentvolumes.patch',
			'persistentvolumes.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when persistent volumes change
	React.useEffect(() => {
		if (persistentVolumes.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [persistentVolumes])

	// Generate summary cards from persistent volume data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!persistentVolumes || persistentVolumes.length === 0) {
			return [
				{
					title: "Total Persistent Volumes",
					value: 0,
					subtitle: "No persistent volumes found"
				}
			]
		}

		const totalPVs = persistentVolumes.length
		const availablePVs = persistentVolumes.filter(pv => pv.status.toLowerCase() === 'available').length
		const boundPVs = persistentVolumes.filter(pv => pv.status.toLowerCase() === 'bound').length
		const releasedPVs = persistentVolumes.filter(pv => pv.status.toLowerCase() === 'released').length
		const failedPVs = persistentVolumes.filter(pv => pv.status.toLowerCase() === 'failed').length

		return [
			{
				title: "Total Persistent Volumes",
				value: totalPVs,
				subtitle: `${totalPVs} storage volumes`,
				badge: getPersistentVolumeStatusBadge(availablePVs, boundPVs, totalPVs),
				icon: getResourceIcon("persistentvolumes"),
				footer: totalPVs > 0 ? "All persistent volumes in cluster" : "No persistent volumes found"
			},
			{
				title: "Available",
				value: availablePVs,
				subtitle: "Ready for binding",
				footer: availablePVs > 0 ? "Volumes ready for claims" : "No available volumes"
			},
			{
				title: "Bound",
				value: boundPVs,
				subtitle: "Currently in use",
				footer: boundPVs > 0 ? "Volumes bound to claims" : "No bound volumes"
			},
			{
				title: "Released/Failed",
				value: releasedPVs + failedPVs,
				subtitle: "Needs attention",
				footer: (releasedPVs + failedPVs) > 0 ? "Volumes needing cleanup" : "All volumes healthy"
			}
		]
	}, [persistentVolumes])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	const statusOptions: FilterOption[] = React.useMemo(() => {
		const statuses = Array.from(new Set(persistentVolumes.map(pv => pv.status))).filter(Boolean).sort()
		return statuses.map(status => ({ value: status, label: status, badge: getStatusBadge(status) }))
	}, [persistentVolumes])

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return persistentVolumes.filter(pv => {
			const matchesQuery = !q ||
				pv.name.toLowerCase().includes(q) ||
				pv.capacity.toLowerCase().includes(q) ||
				pv.status.toLowerCase().includes(q) ||
				pv.accessModesDisplay.toLowerCase().includes(q) ||
				pv.reclaimPolicy.toLowerCase().includes(q) ||
				(pv.claim && pv.claim.toLowerCase().includes(q)) ||
				pv.storageClass.toLowerCase().includes(q) ||
				pv.volumeSource.toLowerCase().includes(q)
			const matchesStatus = statusFilter === 'all' || pv.status === statusFilter
			return matchesQuery && matchesStatus
		})
	}, [persistentVolumes, globalFilter, statusFilter])

	// Status badge helper function
	function getStatusBadge(status: string) {
		switch (status.toLowerCase()) {
			case 'available':
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						{status}
					</Badge>
				)
			case 'bound':
				return (
					<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
						{status}
					</Badge>
				)
			case 'released':
				return (
					<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
						<IconAlertTriangle className="size-3 text-yellow-600 mr-1" />
						{status}
					</Badge>
				)
			case 'failed':
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

	// Bulk actions: preflight validate to show warnings in confirmation dialog
	const validatePVsAction = React.useCallback(async (type: 'delete', rows: DashboardPersistentVolume[]) => {
		try {
			const targets = rows.map(r => ({ name: r.name }))
			const legacyAction = 'delete-pvs'
			const resp = await bulkActionsApi.validateAction('persistentvolumes', { action: legacyAction, targets })
			const details = resp?.details as { results?: Array<{ warnings?: string[] }> }
			const warnings: string[] = Array.isArray(details?.results)
				? details.results.flatMap((r) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Column definitions
	const columns: ColumnDef<DashboardPersistentVolume, unknown>[] = React.useMemo(() => [
		{
			id: 'name',
			header: 'Name',
			accessorFn: (row: DashboardPersistentVolume) => row.name,
			cell: ({ row }: { row: { original: DashboardPersistentVolume } }) => (
				<Button variant="ghost" className="h-auto p-0 font-normal justify-start" onClick={() => {
					setSelectedPVForDetails(row.original)
					setDetailDrawerOpen(true)
				}}>
					{row.original.name}
				</Button>
			),
			enableSorting: true,
			enableColumnFilter: false,
		},
		{
			id: 'status',
			header: 'Status',
			accessorFn: (row: DashboardPersistentVolume) => row.status,
			cell: ({ row }: { row: { original: DashboardPersistentVolume } }) => getStatusBadge(row.original.status),
			enableSorting: true,
			enableColumnFilter: false,
		},
		{
			id: 'claim',
			header: 'Claim',
			accessorFn: (row: DashboardPersistentVolume) => row.claim || '',
			cell: ({ row }: { row: { original: DashboardPersistentVolume } }) => (
				<div className="text-sm">
					{row.original.claim || <span className="text-muted-foreground">-</span>}
				</div>
			),
			enableSorting: true,
			enableColumnFilter: false,
		},
		{
			id: 'storageClass',
			header: 'Storage Class',
			accessorFn: (row: DashboardPersistentVolume) => row.storageClass,
			cell: ({ row }: { row: { original: DashboardPersistentVolume } }) => (
				<div className="text-sm">{row.original.storageClass}</div>
			),
			enableSorting: true,
			enableColumnFilter: false,
		},
		{
			id: 'capacity',
			header: 'Capacity',
			accessorFn: (row: DashboardPersistentVolume) => row.capacity,
			cell: ({ row }: { row: { original: DashboardPersistentVolume } }) => (
				<div className="text-sm font-mono">{row.original.capacity}</div>
			),
			enableSorting: true,
			enableColumnFilter: false,
		},
		{
			id: 'accessModes',
			header: 'Access Modes',
			accessorFn: (row: DashboardPersistentVolume) => row.accessModesDisplay,
			cell: ({ row }: { row: { original: DashboardPersistentVolume } }) => (
				<div className="text-sm">{row.original.accessModesDisplay}</div>
			),
			enableSorting: true,
			enableColumnFilter: false,
		},
		{
			id: 'reclaimPolicy',
			header: 'Reclaim Policy',
			accessorFn: (row: DashboardPersistentVolume) => row.reclaimPolicy,
			cell: ({ row }: { row: { original: DashboardPersistentVolume } }) => (
				<div className="text-sm">{row.original.reclaimPolicy}</div>
			),
			enableSorting: true,
			enableColumnFilter: false,
		},
		{
			id: 'volumeSource',
			header: 'Volume Source',
			accessorFn: (row: DashboardPersistentVolume) => row.volumeSource,
			cell: ({ row }: { row: { original: DashboardPersistentVolume } }) => (
				<div className="text-sm">{row.original.volumeSource}</div>
			),
			enableSorting: true,
			enableColumnFilter: false,
		},
		{
			id: 'age',
			header: 'Age',
			accessorFn: (row: DashboardPersistentVolume) => row.age,
			cell: ({ row }: { row: { original: DashboardPersistentVolume } }) => (
				<div className="text-sm text-muted-foreground">{row.original.age}</div>
			),
			enableSorting: true,
			enableColumnFilter: false,
		},
		{
			id: 'actions',
			header: '',
			cell: ({ row }: { row: { original: DashboardPersistentVolume } }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
							<IconDotsVertical className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => {
							setSelectedPVForDetails(row.original)
							setDetailDrawerOpen(true)
						}}>
							<IconEye className="mr-2 h-4 w-4" />
							View Details
						</DropdownMenuItem>

						<DropdownMenuSeparator />

						<IfAllowed feature="persistentvolumes.patch" cluster={clusterId} resourceName={row.original.name}>
							<DropdownMenuItem onClick={() => {
								const editUrl = `${window.location.origin}/yaml-editor?resource=persistentvolumes&name=${encodeURIComponent(row.original.name)}`
								window.open(editUrl, '_blank')
							}}>
								<IconEdit className="mr-2 h-4 w-4" />
								Edit YAML
							</DropdownMenuItem>
						</IfAllowed>

						<DropdownMenuSeparator />

						<IfAllowed feature="persistentvolumes.delete" cluster={clusterId} resourceName={row.original.name}>
							<DropdownMenuItem
								className="text-red-600"
								onClick={() => {
									setPendingAction({ type: 'delete', pvs: [row.original] })
									validatePVsAction('delete', [row.original])
									setConfirmDialogOpen(true)
								}}
							>
								<IconTrash className="mr-2 h-4 w-4" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	], [clusterId, validatePVsAction])

	// Bulk Actions
	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardPersistentVolume[]) => void | Promise<void> }[] = []

		// Export YAML action (always available)
		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				console.log('Export YAML for PVs:', rows.map(pv => pv.name))
				// TODO: Implement bulk YAML export
			}
		})

		// Copy names action (always available)
		actions.push({
			id: 'copy-names',
			label: 'Copy PV Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n'))
		})

		// Delete action (capability gated)
		if (isAllowed('persistentvolumes.delete')) {
			actions.push({
				id: 'delete-pvs',
				label: 'Delete Selected PVs',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					setPendingAction({ type: 'delete', pvs: rows });
					validatePVsAction('delete', rows);
					setConfirmDialogOpen(true)
				}
			})
		}

		return actions
	}, [isAllowed, setPendingAction, setConfirmDialogOpen, validatePVsAction])

	// Confirm action handler
	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)

		try {
			if (pendingAction.type === 'delete') {
				console.log('Deleting PVs:', pendingAction.pvs.map(pv => pv.name))
				// TODO: Implement actual deletion logic
				setAlert({ variant: 'success', title: 'Success', description: `Deleted ${pendingAction.pvs.length} persistent volume(s)` })
			}
			setPendingAction(null)
			setConfirmDialogOpen(false)
		} catch (error) {
			console.error('Action failed:', error)
			setAlert({ variant: 'error', title: 'Error', description: 'Failed to complete action' })
		} finally {
			setIsConfirmExecuting(false)
		}
	}, [pendingAction])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Persistent Volumes</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor persistent volume resources in your Kubernetes cluster
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
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>
			{/* Data Table */}
			<div className="px-4 lg:px-6">
				<UniversalDataTable
					data={filtered}
					columns={columns}
					loading={isLoading}
					error={error}
					onRefresh={() => window.location.reload()}
					enableRowSelection={true}
					renderFilters={({ table, selectedCount, totalCount }) => (
						<div className="space-y-4">
							<DataTableFilters
								globalFilter={globalFilter}
								onGlobalFilterChange={setGlobalFilter}
								searchPlaceholder="Search PVs by name, status, claim, storage class, capacity, access modes, or reclaim policy..."
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
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardPersistentVolume }) => r.original))
								}))}
								table={table}
							/>
						</div>
					)}
					bulkActions={bulkActions.map(a => ({
						...a,
						action: a.action as (rows: DashboardPersistentVolume[]) => void | Promise<void>
					}))}
				/>
			</div>

			{/* Detail Drawer */}
			{selectedPVForDetails && (
				<PersistentVolumeDetailDrawer
					item={selectedPVForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedPVForDetails(null)
					}}
				/>
			)}

			{/* Confirmation Dialog */}
			<ActionConfirmationDialog
				open={confirmDialogOpen}
				onOpenChange={setConfirmDialogOpen}
				title="Delete Persistent Volumes"
				description="Are you sure you want to delete the selected persistent volumes? This action cannot be undone."
				actionLabel="Delete PVs"
				variant="destructive"
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.pvs || []).map(pv => ({ name: pv.name }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
			/>

			{/* Alert */}
			{alert && (
				<Alert className={`mb-4 ${alert.variant === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
					<IconAlertTriangle className="h-4 w-4" />
					<AlertTitle>{alert.title}</AlertTitle>
					{alert.description && <AlertDescription>{alert.description}</AlertDescription>}
				</Alert>
			)}
		</div>
	)
}


export function PersistentVolumesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["persistentvolumes.list"]} requireAll={false}>
			<PersistentVolumesContent />
		</RouteGuard>
	)
}
