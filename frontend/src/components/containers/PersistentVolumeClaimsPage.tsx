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
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconDownload, IconCopy, IconCircleCheckFilled, IconLoader, IconAlertTriangle } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { usePersistentVolumeClaimsWithWebSocket } from "@/hooks/usePersistentVolumeClaimsWithWebSocket"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import {
	getPersistentVolumeClaimStatusBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"
import { PersistentVolumeClaimDetailDrawer } from "@/components/viewers/PersistentVolumeClaimDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import type { DashboardPersistentVolumeClaim } from "@/lib/k8s-storage"

function PersistentVolumeClaimsContent() {
	const { data: persistentVolumeClaims, loading: isLoading, error, isConnected } = usePersistentVolumeClaimsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['persistentvolumeclaims.get', 'persistentvolumeclaims.patch', 'persistentvolumeclaims.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedPVCForDetails, setSelectedPVCForDetails] = React.useState<DashboardPersistentVolumeClaim | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', pvcs: DashboardPersistentVolumeClaim[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Ensure PVC-specific action capabilities are requested
	React.useEffect(() => {
		fetchAdditional([
			'persistentvolumeclaims.get',
			'persistentvolumeclaims.patch',
			'persistentvolumeclaims.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when persistent volume claims change
	React.useEffect(() => {
		if (persistentVolumeClaims.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [persistentVolumeClaims])

	// Generate summary cards from persistent volume claim data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!persistentVolumeClaims || persistentVolumeClaims.length === 0) {
			return [
				{
					title: "Total Persistent Volume Claims",
					value: 0,
					subtitle: "No persistent volume claims found"
				}
			]
		}

		const totalPVCs = persistentVolumeClaims.length
		const boundPVCs = persistentVolumeClaims.filter(pvc => pvc.status.toLowerCase() === 'bound').length
		const pendingPVCs = persistentVolumeClaims.filter(pvc => pvc.status.toLowerCase() === 'pending').length
		const lostPVCs = persistentVolumeClaims.filter(pvc => pvc.status.toLowerCase() === 'lost').length
		const availablePVCs = persistentVolumeClaims.filter(pvc => pvc.status.toLowerCase() === 'available').length

		return [
			{
				title: "Total Persistent Volume Claims",
				value: totalPVCs,
				subtitle: `${totalPVCs} volume claims`,
				badge: getPersistentVolumeClaimStatusBadge(boundPVCs, pendingPVCs, lostPVCs, totalPVCs),
				icon: getResourceIcon("persistentvolumeclaims"),
				footer: totalPVCs > 0 ? "All volume claims in cluster" : "No volume claims found"
			},
			{
				title: "Bound",
				value: boundPVCs,
				subtitle: "Claims bound to volumes",
				footer: boundPVCs > 0 ? "Claims actively in use" : "No bound claims"
			},
			{
				title: "Pending",
				value: pendingPVCs,
				subtitle: "Awaiting volume binding",
				footer: pendingPVCs > 0 ? "Claims waiting for volumes" : "No pending claims"
			},
			{
				title: "Available/Lost",
				value: availablePVCs + lostPVCs,
				subtitle: "Needs attention",
				footer: (availablePVCs + lostPVCs) > 0 ? "Claims needing review" : "All claims healthy"
			}
		]
	}, [persistentVolumeClaims])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	const statusOptions: FilterOption[] = React.useMemo(() => {
		const statuses = Array.from(new Set(persistentVolumeClaims.map(pvc => pvc.status))).filter(Boolean).sort()
		return statuses.map(status => ({ value: status, label: status, badge: getStatusBadge(status) }))
	}, [persistentVolumeClaims])

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return persistentVolumeClaims.filter(pvc => {
			const matchesQuery = !q ||
				pvc.name.toLowerCase().includes(q) ||
				pvc.namespace.toLowerCase().includes(q) ||
				pvc.status.toLowerCase().includes(q) ||
				(pvc.volume && pvc.volume.toLowerCase().includes(q)) ||
				pvc.capacity.toLowerCase().includes(q) ||
				pvc.storageClass.toLowerCase().includes(q) ||
				pvc.accessModesDisplay.toLowerCase().includes(q)
			const matchesStatus = statusFilter === 'all' || pvc.status === statusFilter
			return matchesQuery && matchesStatus
		})
	}, [persistentVolumeClaims, globalFilter, statusFilter])

	// Status badge helper function (declared here so it's hoisted and can be used above)
	function getStatusBadge(status: string) {
		switch (status.toLowerCase()) {
			case 'bound':
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						{status}
					</Badge>
				)
			case 'pending':
				return (
					<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
						<IconLoader className="size-3 text-yellow-600 mr-1" />
						{status}
					</Badge>
				)
			case 'lost':
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
	const validatePVCsAction = React.useCallback(async (type: 'delete', rows: DashboardPersistentVolumeClaim[]) => {
		try {
			const targets = rows.map(r => ({ namespace: r.namespace, name: r.name }))
			const legacyAction = 'delete-pvcs'
			const resp = await bulkActionsApi.validateAction('persistentvolumeclaims', { action: legacyAction, targets })
			const details = resp?.details as { results?: Array<{ warnings?: string[] }> }
			const warnings: string[] = Array.isArray(details?.results)
				? details.results.flatMap((r) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Build table columns
	const columns: ColumnDef<DashboardPersistentVolumeClaim>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Name',
			cell: ({ row }: { row: { original: DashboardPersistentVolumeClaim } }) => (
				<IfAllowed
					feature="persistentvolumeclaims.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedPVCForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
		},
		{
			accessorKey: 'namespace',
			header: 'Namespace',
			cell: ({ row }: { row: { original: DashboardPersistentVolumeClaim } }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			)
		},
		{
			accessorKey: 'status',
			header: 'Status',
			cell: ({ row }: { row: { original: DashboardPersistentVolumeClaim } }) => getStatusBadge(row.original.status)
		},
		{
			accessorKey: 'volume',
			header: 'Volume',
			cell: ({ row }: { row: { original: DashboardPersistentVolumeClaim } }) => (
				<div className="text-sm">{row.original.volume || "<none>"}</div>
			)
		},
		{
			accessorKey: 'capacity',
			header: 'Capacity',
			cell: ({ row }: { row: { original: DashboardPersistentVolumeClaim } }) => (
				<div className="font-mono text-sm">{row.original.capacity}</div>
			)
		},
		{
			accessorKey: 'accessModesDisplay',
			header: 'Access Modes',
			cell: ({ row }: { row: { original: DashboardPersistentVolumeClaim } }) => (
				<div className="text-sm">{row.original.accessModesDisplay}</div>
			)
		},
		{
			accessorKey: 'storageClass',
			header: 'Storage Class',
			cell: ({ row }: { row: { original: DashboardPersistentVolumeClaim } }) => (
				<div className="text-sm">{row.original.storageClass}</div>
			)
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: DashboardPersistentVolumeClaim } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			)
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardPersistentVolumeClaim } }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="data-[state=open]:bg-muted text-muted-foreground flex size-8">
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed feature="persistentvolumeclaims.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedPVCForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="persistentvolumeclaims.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="PersistentVolumeClaim">
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
								>
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							</ResourceYamlEditor>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="persistentvolumeclaims.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', pvcs: [row.original] }); setConfirmDialogOpen(true); validatePVCsAction('delete', [row.original]) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, setSelectedPVCForDetails, setDetailDrawerOpen, setPendingAction, setConfirmDialogOpen, validatePVCsAction])

	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardPersistentVolumeClaim[]) => void | Promise<void> }[] = []

		// Export YAML action (always available)
		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				console.log('Export YAML for PVCs:', rows.map(pvc => pvc.name))
				// TODO: Implement bulk YAML export
			}
		})

		// Copy names action (always available)
		actions.push({
			id: 'copy-names',
			label: 'Copy PVC Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n'))
		})

		// Delete action (capability gated)
		if (isAllowed('persistentvolumeclaims.delete')) {
			actions.push({
				id: 'delete-pvcs',
				label: 'Delete Selected PVCs',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					setPendingAction({ type: 'delete', pvcs: rows });
					setConfirmDialogOpen(true);
					validatePVCsAction('delete', rows)
				}
			})
		}

		return actions
	}, [isAllowed, validatePVCsAction])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.pvcs.map(pvc => ({ namespace: pvc.namespace, name: pvc.name }))
			const legacyAction = 'delete-pvcs'
			const resp = await bulkActionsApi.executeBulkAction('persistentvolumeclaims', { action: legacyAction, targets })
			const success = resp?.success
			const total = resp?.resources_total ?? 0
			const affected = resp?.resources_affected ?? 0
			setAlert({ variant: success ? 'success' : 'error', title: success ? `Success: ${affected}/${total} PVCs processed` : `Errors: ${total - affected} failed`, description: resp?.message })
		} catch (e) {
			setAlert({ variant: 'error', title: 'Action failed', description: e instanceof Error ? e.message : String(e) })
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
				cards={summaryData}
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
								searchPlaceholder="Search PVCs by name, namespace, status, volume, capacity, storage class, or access modes..."
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
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardPersistentVolumeClaim }) => r.original))
								}))}
								table={table}
								showColumnToggle={true}
							/>
						</div>
					)}
				/>
			</div>

			{/* Bulk action confirmation dialog */}
			<ActionConfirmationDialog
				open={confirmDialogOpen}
				onOpenChange={setConfirmDialogOpen}
				title="Delete Persistent Volume Claims"
				description="Are you sure you want to delete the selected persistent volume claims? This action cannot be undone."
				actionLabel="Delete PVCs"
				variant="destructive"
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.pvcs || []).map(pvc => ({ name: pvc.name, namespace: pvc.namespace }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
			/>

			{selectedPVCForDetails && (
				<PersistentVolumeClaimDetailDrawer
					item={selectedPVCForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedPVCForDetails(null)
					}}
				/>
			)}
		</div>
	)
}

export function PersistentVolumeClaimsPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["persistentvolumeclaims.list"]} requireAll={false}>
			<PersistentVolumeClaimsContent />
		</RouteGuard>
	)
}
