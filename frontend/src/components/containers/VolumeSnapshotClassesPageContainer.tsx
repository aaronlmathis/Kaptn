"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useVolumeSnapshotClassesWithWebSocket } from "@/hooks/useVolumeSnapshotClassesWithWebSocket"
import {
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconCopy, IconDownload, IconDatabase } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { VolumeSnapshotClassDetailDrawer } from "@/components/viewers/VolumeSnapshotClassDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import type { DashboardVolumeSnapshotClass } from '@/lib/k8s-storage'

// Inner component that can access the WebSocket data
function VolumeSnapshotClassesContent() {
	const { data: volumeSnapshotClasses, loading: isLoading, error, isConnected } = useVolumeSnapshotClassesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['volumesnapshotclasses.get', 'volumesnapshotclasses.patch', 'volumesnapshotclasses.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedVolumeSnapshotClassForDetails, setSelectedVolumeSnapshotClassForDetails] = React.useState<DashboardVolumeSnapshotClass | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', volumeSnapshotClasses: DashboardVolumeSnapshotClass[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	React.useEffect(() => {
		fetchAdditional([
			'volumesnapshotclasses.get',
			'volumesnapshotclasses.patch',
			'volumesnapshotclasses.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when volumeSnapshotClasses change
	React.useEffect(() => {
		if (volumeSnapshotClasses && volumeSnapshotClasses.length > 0) {
			setLastUpdated(new Date().toLocaleTimeString())
		}
	}, [volumeSnapshotClasses])

	// Calculate summary data for cards
	const totalClasses = volumeSnapshotClasses?.length || 0

	// Group by driver
	const uniqueDrivers = new Set(volumeSnapshotClasses?.map(vsc => vsc.driver) || []).size

	// Group by deletion policy
	const retainPolicyClasses = volumeSnapshotClasses?.filter(vsc => vsc.deletionPolicy === 'Retain').length || 0
	const deletePolicyClasses = volumeSnapshotClasses?.filter(vsc => vsc.deletionPolicy === 'Delete').length || 0

	// Calculate total parameters across all classes
	const totalParameters = volumeSnapshotClasses?.reduce((sum, vsc) => sum + vsc.parametersCount, 0) || 0

	const summaryCards: SummaryCard[] = [
		{
			title: "Total Snapshot Classes",
			value: totalClasses.toString(),
			subtitle: "Available volume snapshot classes",
			icon: getResourceIcon("volumesnapshotclasses"),
			badge: getHealthTrendBadge(100), // All classes are considered healthy if they exist
		},
		{
			title: "CSI Drivers",
			value: uniqueDrivers.toString(),
			subtitle: "Different storage drivers",
			icon: getResourceIcon("volumesnapshotclasses"),
		},
		{
			title: "Deletion Policies",
			value: `Retain: ${retainPolicyClasses}`,
			subtitle: `Delete: ${deletePolicyClasses}`,
			icon: getResourceIcon("volumesnapshotclasses"),
		},
		{
			title: "Total Parameters",
			value: totalParameters.toString(),
			subtitle: "Configuration parameters",
			icon: getResourceIcon("volumesnapshotclasses"),
		},
	]

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [policyFilter, setPolicyFilter] = React.useState<string>("all")

	const policyOptions: FilterOption[] = React.useMemo(() => {
		const policies = Array.from(new Set(volumeSnapshotClasses?.map(vsc => vsc.deletionPolicy) || [])).sort()
		return policies.map(policy => ({
			value: policy,
			label: policy,
			badge: (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{policy}
				</Badge>
			)
		}))
	}, [volumeSnapshotClasses])

	// Filter data based on global filter and policy filter
	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return volumeSnapshotClasses?.filter(vsc => {
			const matchesQuery = !q || vsc.name.toLowerCase().includes(q) || vsc.driver.toLowerCase().includes(q) || vsc.deletionPolicy.toLowerCase().includes(q)
			const matchesPolicy = policyFilter === 'all' || vsc.deletionPolicy === policyFilter
			return matchesQuery && matchesPolicy
		}) || []
	}, [volumeSnapshotClasses, globalFilter, policyFilter])

	// Bulk actions: preflight validate to show warnings in confirmation dialog
	const validateVolumeSnapshotClassAction = React.useCallback(async (type: 'delete', rows: DashboardVolumeSnapshotClass[]) => {
		try {
			const targets = rows.map(r => ({ namespace: "", name: r.name }))
			const resp = await bulkActionsApi.validateAction('volumesnapshotclasses', { action: 'delete-volumesnapshotclasses', targets })
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
	const columns: ColumnDef<DashboardVolumeSnapshotClass>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Name',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshotClass } }) => (
				<IfAllowed
					feature="volumesnapshotclasses.get"
					cluster={clusterId}
					namespace=""
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedVolumeSnapshotClassForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
		},
		{
			accessorKey: 'driver',
			header: 'Driver',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshotClass } }) => (
				<div className="font-mono text-sm">{row.original.driver}</div>
			),
		},
		{
			accessorKey: 'deletionPolicy',
			header: 'Deletion Policy',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshotClass } }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.deletionPolicy}
				</Badge>
			),
		},
		{
			accessorKey: 'parametersCount',
			header: 'Parameters',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshotClass } }) => (
				<div className="font-mono text-sm">{row.original.parametersCount}</div>
			),
		},
		{
			accessorKey: 'labelsCount',
			header: 'Labels',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshotClass } }) => (
				<div className="font-mono text-sm">{row.original.labelsCount}</div>
			),
		},
		{
			accessorKey: 'annotationsCount',
			header: 'Annotations',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshotClass } }) => (
				<div className="font-mono text-sm">{row.original.annotationsCount}</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshotClass } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardVolumeSnapshotClass } }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="data-[state=open]:bg-muted text-muted-foreground flex size-8">
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed feature="volumesnapshotclasses.get" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedVolumeSnapshotClassForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="volumesnapshotclasses.patch" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace="" resourceKind="VolumeSnapshotClass">
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
								>
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							</ResourceYamlEditor>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="volumesnapshotclasses.delete" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', volumeSnapshotClasses: [row.original] }); setConfirmDialogOpen(true); validateVolumeSnapshotClassAction('delete', [row.original]) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, validateVolumeSnapshotClassAction])

	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardVolumeSnapshotClass[]) => void | Promise<void> }[] = []
		actions.push({ id: 'copy-names', label: 'Copy Class Names', icon: <IconCopy className="size-4" />, requiresSelection: true, action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n')) })
		actions.push({ id: 'copy-drivers', label: 'Copy Drivers', icon: <IconDatabase className="size-4" />, requiresSelection: true, action: (rows) => navigator.clipboard.writeText(Array.from(new Set(rows.map(r => r.driver))).join('\n')) })
		actions.push({ id: 'export-yaml', label: 'Export Selected as YAML', icon: <IconDownload className="size-4" />, requiresSelection: true, action: (rows) => console.log('Export YAML for volume snapshot classes:', rows.map(vsc => vsc.name)) })
		if (isAllowed('volumesnapshotclasses.delete')) actions.push({ id: 'delete-classes', label: 'Delete Selected Classes', icon: <IconTrash className="size-4" />, variant: 'destructive', requiresSelection: true, action: (rows) => { setPendingAction({ type: 'delete', volumeSnapshotClasses: rows }); setConfirmDialogOpen(true); validateVolumeSnapshotClassAction('delete', rows) } })
		return actions
	}, [isAllowed, validateVolumeSnapshotClassAction])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.volumeSnapshotClasses.map(vsc => ({ namespace: "", name: vsc.name }))
			const resp = await bulkActionsApi.executeBulkAction('volumesnapshotclasses', { action: 'delete-volumesnapshotclasses', targets })
			const success = resp?.success
			const total = resp?.resources_total ?? 0
			const affected = resp?.resources_affected ?? 0
			setAlert({ variant: success ? 'success' : 'error', title: success ? `Success: ${affected}/${total} volume snapshot classes processed` : `Errors: ${total - affected} failed`, description: resp?.message })
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
								searchPlaceholder="Search volume snapshot classes by name, driver, or deletion policy..."
								categoryFilter={policyFilter}
								onCategoryFilterChange={setPolicyFilter}
								categoryLabel="Filter by deletion policy"
								categoryOptions={policyOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon || <></>,
									variant: a.variant === 'destructive' ? 'destructive' : 'default',
									requiresSelection: a.requiresSelection || false,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardVolumeSnapshotClass }) => r.original))
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
				title="Delete Volume Snapshot Classes"
				description="Are you sure you want to delete the selected volume snapshot classes? This action cannot be undone."
				actionLabel="Delete Classes"
				variant="destructive"
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.volumeSnapshotClasses || []).map(vsc => ({ name: vsc.name, namespace: "" }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
			/>

			{selectedVolumeSnapshotClassForDetails && (
				<VolumeSnapshotClassDetailDrawer
					item={selectedVolumeSnapshotClassForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedVolumeSnapshotClassForDetails(null)
					}}
				/>
			)}
		</div>
	)
}

export function VolumeSnapshotClassesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["volumesnapshotclasses.list"]} requireAll={false}>
			<VolumeSnapshotClassesContent />
		</RouteGuard>
	)
} 
