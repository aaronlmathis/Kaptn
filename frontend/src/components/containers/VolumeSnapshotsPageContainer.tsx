"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useVolumeSnapshotsWithWebSocket } from "@/hooks/useVolumeSnapshotsWithWebSocket"
import {
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { type ColumnDef } from "@/lib/table"
import type { DashboardVolumeSnapshot } from "@/lib/k8s-storage"
import { VolumeSnapshotDetailDrawer } from "@/components/viewers/VolumeSnapshotDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import {
	IconDotsVertical,
	IconEye,
	IconTrash,
	IconEdit,
	IconDownload,
	IconCopy,
	IconDatabase,
	IconCircleCheckFilled,
	IconLoader
} from "@tabler/icons-react"

// Inner component that can access the namespace context
function VolumeSnapshotsContent() {
	const { data: volumeSnapshots, loading: isLoading, error, isConnected } = useVolumeSnapshotsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['volumesnapshots.get', 'volumesnapshots.patch', 'volumesnapshots.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedVolumeSnapshotForDetails, setSelectedVolumeSnapshotForDetails] = React.useState<DashboardVolumeSnapshot | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', snapshots: DashboardVolumeSnapshot[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	React.useEffect(() => {
		fetchAdditional([
			'volumesnapshots.get',
			'volumesnapshots.patch',
			'volumesnapshots.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when volumeSnapshots change
	React.useEffect(() => {
		if (volumeSnapshots && volumeSnapshots.length > 0) {
			setLastUpdated(new Date().toLocaleTimeString())
		}
	}, [volumeSnapshots])

	// Calculate summary data for cards
	const totalSnapshots = volumeSnapshots?.length || 0
	const readySnapshots = volumeSnapshots?.filter(snapshot => snapshot.readyToUse).length || 0
	const notReadySnapshots = totalSnapshots - readySnapshots

	// Health metrics
	const healthPercentage = totalSnapshots > 0 ? Math.round((readySnapshots / totalSnapshots) * 100) : 0

	// Group by source PVC
	const uniquePVCs = new Set(volumeSnapshots?.map(snapshot => snapshot.sourcePVC) || []).size

	// Group by snapshot class
	const snapshotClasses = new Set(volumeSnapshots?.map(snapshot => snapshot.volumeSnapshotClassName) || []).size

	const summaryCards: SummaryCard[] = [
		{
			title: "Total Volume Snapshots",
			value: totalSnapshots.toString(),
			subtitle: "Active volume snapshots",
			icon: getResourceIcon("volumesnapshots"),
			badge: getHealthTrendBadge(healthPercentage),
		},
		{
			title: "Ready Snapshots",
			value: `${readySnapshots}/${totalSnapshots}`,
			subtitle: `${healthPercentage}% ready to use`,
			icon: getResourceIcon("volumesnapshots"),
			badge: getHealthTrendBadge(healthPercentage),
		},
		{
			title: "Not Ready",
			value: notReadySnapshots.toString(),
			subtitle: "Snapshots not ready",
			icon: getResourceIcon("volumesnapshots"),
			badge: notReadySnapshots > 0 ? getHealthTrendBadge(0) : undefined,
		},
		{
			title: "Source PVCs",
			value: uniquePVCs.toString(),
			subtitle: `Snapshots from ${snapshotClasses} classes`,
			icon: getResourceIcon("volumesnapshots"),
		},
	]

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	// Status badge helper
	function getReadyStatusBadge(readyToUse: boolean) {
		if (readyToUse) {
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					Ready
				</Badge>
			)
		} else {
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-yellow-600 mr-1" />
					Not Ready
				</Badge>
			)
		}
	}

	const statusOptions: FilterOption[] = React.useMemo(() => [
		{
			value: "ready",
			label: "Ready",
			badge: getReadyStatusBadge(true)
		},
		{
			value: "not-ready",
			label: "Not Ready",
			badge: getReadyStatusBadge(false)
		}
	], [])

	const filtered = React.useMemo(() => {
		let result = volumeSnapshots || []

		// Apply status filter
		if (statusFilter !== "all") {
			result = result.filter(vs => {
				if (statusFilter === "ready") return vs.readyToUse
				if (statusFilter === "not-ready") return !vs.readyToUse
				return true
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			result = result.filter(vs =>
				vs.name.toLowerCase().includes(searchTerm) ||
				vs.namespace.toLowerCase().includes(searchTerm) ||
				vs.sourcePVC.toLowerCase().includes(searchTerm) ||
				vs.volumeSnapshotClassName.toLowerCase().includes(searchTerm) ||
				vs.restoreSize.toLowerCase().includes(searchTerm)
			)
		}

		return result
	}, [volumeSnapshots, statusFilter, globalFilter])

	// Bulk actions: preflight validate to show warnings in confirmation dialog
	const validateSnapshotsAction = React.useCallback(async (type: 'delete', rows: DashboardVolumeSnapshot[]) => {
		try {
			const targets = rows.map(r => ({ namespace: r.namespace, name: r.name }))
			const resp = await bulkActionsApi.validateAction('volumesnapshots', { action: 'delete-volumesnapshots', targets })
			const details = resp?.details as Record<string, unknown>
			const warnings: string[] = Array.isArray(details?.results)
				? details.results.flatMap((r: Record<string, unknown>) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Build table columns
	const columns: ColumnDef<DashboardVolumeSnapshot>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Volume Snapshot Name',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshot } }) => (
				<IfAllowed
					feature="volumesnapshots.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedVolumeSnapshotForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
			enableHiding: false,
		},
		{
			accessorKey: 'namespace',
			header: 'Namespace',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshot } }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: 'readyToUse',
			header: 'Status',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshot } }) => getReadyStatusBadge(row.original.readyToUse),
		},
		{
			accessorKey: 'sourcePVC',
			header: 'Source PVC',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshot } }) => (
				<div className="text-sm">{row.original.sourcePVC}</div>
			),
		},
		{
			accessorKey: 'volumeSnapshotClassName',
			header: 'Snapshot Class',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshot } }) => (
				<div className="text-sm">{row.original.volumeSnapshotClassName}</div>
			),
		},
		{
			accessorKey: 'restoreSize',
			header: 'Restore Size',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshot } }) => (
				<div className="font-mono text-sm">{row.original.restoreSize}</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshot } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshot } }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="data-[state=open]:bg-muted text-muted-foreground flex size-8">
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed feature="volumesnapshots.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedVolumeSnapshotForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="volumesnapshots.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="VolumeSnapshot">
								<button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer" style={{ background: 'transparent', border: 'none', textAlign: 'left' }}>
									<IconEdit className="size-4" />
									Edit YAML
								</button>
							</ResourceYamlEditor>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="volumesnapshots.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', snapshots: [row.original] }); setConfirmDialogOpen(true); validateSnapshotsAction('delete', [row.original]) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, validateSnapshotsAction])

	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardVolumeSnapshot[]) => void | Promise<void> }[] = []

		// Export YAML action
		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				console.log('Export YAML for volume snapshots:', rows.map(vs => `${vs.name} in ${vs.namespace}`))
				// TODO: Implement bulk YAML export
			}
		})

		// Copy snapshot names
		actions.push({
			id: 'copy-names',
			label: 'Copy Snapshot Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				const names = rows.map(vs => vs.name).join('\n')
				navigator.clipboard.writeText(names)
			}
		})

		// Copy source PVCs
		actions.push({
			id: 'copy-pvcs',
			label: 'Copy Source PVCs',
			icon: <IconDatabase className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				const uniquePVCs = rows.map(vs => vs.sourcePVC)
				const pvcs = Array.from(new Set(uniquePVCs)).join('\n')
				navigator.clipboard.writeText(pvcs)
			}
		})

		// Delete snapshots (only if allowed)
		if (isAllowed('volumesnapshots.delete')) {
			actions.push({
				id: 'delete-snapshots',
				label: 'Delete Selected Snapshots',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					setPendingAction({ type: 'delete', snapshots: rows });
					setConfirmDialogOpen(true);
					validateSnapshotsAction('delete', rows)
				}
			})
		}

		return actions
	}, [isAllowed, validateSnapshotsAction])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.snapshots.map((s: DashboardVolumeSnapshot) => ({ namespace: s.namespace, name: s.name }))
			const resp = await bulkActionsApi.executeBulkAction('volumesnapshots', { action: 'delete-volumesnapshots', targets })
			const success = resp?.success
			const total = resp?.resources_total ?? 0
			const affected = resp?.resources_affected ?? 0
			setAlert({ variant: success ? 'success' : 'error', title: success ? `Success: ${affected}/${total} snapshots deleted` : `Errors: ${total - affected} failed`, description: resp?.message })
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
								searchPlaceholder="Search volume snapshots by name, namespace, source PVC, snapshot class, or restore size..."
								categoryFilter={statusFilter}
								onCategoryFilterChange={setStatusFilter}
								categoryLabel="Filter by ready status"
								categoryOptions={statusOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon || undefined,
									variant: a.variant || 'default',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardVolumeSnapshot }) => r.original))
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
				title={'Delete Volume Snapshots'}
				description={'Are you sure you want to delete the selected volume snapshots? This action cannot be undone.'}
				actionLabel={'Delete Snapshots'}
				variant={'destructive'}
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.snapshots || []).map(s => ({ name: s.name, namespace: s.namespace }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
			/>

			{/* Controlled detail drawer */}
			{selectedVolumeSnapshotForDetails && (
				<VolumeSnapshotDetailDrawer
					item={selectedVolumeSnapshotForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedVolumeSnapshotForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

export function VolumeSnapshotsPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["volumesnapshots.list"]} requireAll={false}>
			<VolumeSnapshotsContent />
		</RouteGuard>
	)
}
