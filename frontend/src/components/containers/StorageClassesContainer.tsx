"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconCopy, IconDownload, IconDatabase, IconCircleCheckFilled } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useStorageClassesWithWebSocket } from "@/hooks/useStorageClassesWithWebSocket"
import { StorageClassDetailDrawer } from "@/components/viewers/StorageClassDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import type { DashboardStorageClass } from "@/lib/k8s-storage"
import {
	getStorageClassStatusBadge,
	getStorageClassProvisionerBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"
import { useCapabilities } from "@/hooks/use-capabilities"

export function StorageClassesContainer() {
	const { data: storageClasses, loading: isLoading, error, isConnected } = useStorageClassesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['storageclasses.get', 'storageclasses.patch', 'storageclasses.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedStorageClassForDetails, setSelectedStorageClassForDetails] = React.useState<DashboardStorageClass | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete' | 'export', storageClasses: DashboardStorageClass[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Ensure StorageClass-specific action capabilities are requested
	React.useEffect(() => {
		fetchAdditional([
			'storageclasses.get',
			'storageclasses.patch',
			'storageclasses.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when storage classes change
	React.useEffect(() => {
		if (storageClasses.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [storageClasses])

	// Generate summary cards from storage class data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!storageClasses || storageClasses.length === 0) {
			return [
				{
					title: "Total Storage Classes",
					value: 0,
					subtitle: "No storage classes found"
				}
			]
		}

		const totalSCs = storageClasses.length
		const defaultSCs = storageClasses.filter(sc => sc.isDefault).length
		const allowExpansionSCs = storageClasses.filter(sc => sc.allowVolumeExpansion).length
		const uniqueProvisioners = new Set(storageClasses.map(sc => sc.provisioner)).size

		return [
			{
				title: "Total Storage Classes",
				value: totalSCs,
				subtitle: `${totalSCs} storage options`,
				badge: getStorageClassStatusBadge(totalSCs, defaultSCs),
				icon: getResourceIcon("storageclasses"),
				footer: totalSCs > 0 ? "All storage classes in cluster" : "No storage classes found"
			},
			{
				title: "Default Classes",
				value: defaultSCs,
				subtitle: "Auto-selection enabled",
				footer: defaultSCs === 1 ? "Properly configured" : defaultSCs === 0 ? "No default set" : "Multiple defaults found"
			},
			{
				title: "Expansion Enabled",
				value: allowExpansionSCs,
				subtitle: "Volume growth allowed",
				footer: allowExpansionSCs > 0 ? "Storage can be expanded" : "No expandable storage"
			},
			{
				title: "Unique Provisioners",
				value: uniqueProvisioners,
				subtitle: "Storage backends",
				badge: getStorageClassProvisionerBadge(uniqueProvisioners),
				footer: uniqueProvisioners > 1 ? "Diverse storage options" : "Single storage backend"
			}
		]
	}, [storageClasses])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [reclaimPolicyFilter, setReclaimPolicyFilter] = React.useState<string>("all")

	// Create filter options based on reclaim policy
	const reclaimPolicyOptions: FilterOption[] = React.useMemo(() => {
		const policies = Array.from(new Set(storageClasses.map(sc => sc.reclaimPolicy))).filter(Boolean).sort()
		return policies.map(policy => ({
			value: policy,
			label: policy,
			badge: getReclaimPolicyBadge(policy)
		}))
	}, [storageClasses])

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return storageClasses.filter(sc => {
			const matchesQuery = !q ||
				sc.name.toLowerCase().includes(q) ||
				sc.provisioner.toLowerCase().includes(q) ||
				sc.reclaimPolicy.toLowerCase().includes(q) ||
				sc.volumeBindingMode.toLowerCase().includes(q)
			const matchesReclaimPolicy = reclaimPolicyFilter === 'all' || sc.reclaimPolicy === reclaimPolicyFilter
			return matchesQuery && matchesReclaimPolicy
		})
	}, [storageClasses, globalFilter, reclaimPolicyFilter])

	// Helper functions for badges
	function getReclaimPolicyBadge(reclaimPolicy: string) {
		switch (reclaimPolicy) {
			case "Retain":
				return (
					<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
						{reclaimPolicy}
					</Badge>
				)
			case "Delete":
				return (
					<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
						{reclaimPolicy}
					</Badge>
				)
			default:
				return (
					<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
						{reclaimPolicy}
					</Badge>
				)
		}
	}

	function getVolumeBindingModeBadge(volumeBindingMode: string) {
		switch (volumeBindingMode) {
			case "Immediate":
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						{volumeBindingMode}
					</Badge>
				)
			case "WaitForFirstConsumer":
				return (
					<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
						WaitForConsumer
					</Badge>
				)
			default:
				return (
					<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
						{volumeBindingMode}
					</Badge>
				)
		}
	}

	// Bulk actions: preflight validate to show warnings in confirmation dialog
	const validateStorageClassesAction = React.useCallback(async (type: 'delete' | 'export', rows: DashboardStorageClass[]) => {
		try {
			if (type === 'export') {
				setConfirmWarnings([])
				return
			}
			const targets = rows.map(r => ({ namespace: "", name: r.name }))
			const resp = await bulkActionsApi.validateAction('storageclasses', { action: 'delete-storageclasses', targets })
			const details: Record<string, unknown> = resp?.details || {}
			const warnings: string[] = Array.isArray(details.results)
				? (details.results as Array<{ warnings?: string[] }>).flatMap(r => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Build table columns
	const columns: ColumnDef<DashboardStorageClass>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Storage Class Name',
			cell: ({ row }: { row: { original: DashboardStorageClass } }) => (
				<div className="flex items-center gap-2">
					<IfAllowed
						feature="storageclasses.get"
						cluster={clusterId}
						namespace=""
						resourceName={row.original.name}
						fallback={<span>{row.original.name}</span>}
					>
						<button
							onClick={() => { setSelectedStorageClassForDetails(row.original); setDetailDrawerOpen(true) }}
							className="text-left hover:underline focus:underline focus:outline-none"
						>
							{row.original.name}
						</button>
					</IfAllowed>
					{row.original.isDefault && (
						<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
							<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
							Default
						</Badge>
					)}
				</div>
			),
			enableHiding: false,
		},
		{
			accessorKey: 'provisioner',
			header: 'Provisioner',
			cell: ({ row }: { row: { original: DashboardStorageClass } }) => (
				<div className="font-mono text-sm">{row.original.provisioner}</div>
			),
		},
		{
			accessorKey: 'reclaimPolicy',
			header: 'Reclaim Policy',
			cell: ({ row }: { row: { original: DashboardStorageClass } }) => getReclaimPolicyBadge(row.original.reclaimPolicy),
		},
		{
			accessorKey: 'volumeBindingMode',
			header: 'Volume Binding Mode',
			cell: ({ row }: { row: { original: DashboardStorageClass } }) => getVolumeBindingModeBadge(row.original.volumeBindingMode),
		},
		{
			accessorKey: 'allowVolumeExpansion',
			header: 'Allow Expansion',
			cell: ({ row }: { row: { original: DashboardStorageClass } }) => (
				<div className="font-mono text-sm">
					{row.original.allowVolumeExpansion ? "Yes" : "No"}
				</div>
			),
		},
		{
			accessorKey: 'parametersCount',
			header: 'Parameters',
			cell: ({ row }: { row: { original: DashboardStorageClass } }) => (
				<div className="font-mono text-sm">{row.original.parametersCount}</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: DashboardStorageClass } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardStorageClass } }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="data-[state=open]:bg-muted text-muted-foreground flex size-8">
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed feature="storageclasses.get" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedStorageClassForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="storageclasses.patch" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace="" resourceKind="StorageClass">
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
								>
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							</ResourceYamlEditor>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="storageclasses.delete" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', storageClasses: [row.original] }); setConfirmDialogOpen(true); validateStorageClassesAction('delete', [row.original]) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, validateStorageClassesAction])

	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardStorageClass[]) => void | Promise<void> }[] = []

		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				setPendingAction({ type: 'export', storageClasses: rows });
				setConfirmDialogOpen(true);
				validateStorageClassesAction('export', rows)
			}
		})

		actions.push({
			id: 'copy-names',
			label: 'Copy StorageClass Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n'))
		})

		actions.push({
			id: 'copy-provisioners',
			label: 'Copy Provisioner Names',
			icon: <IconDatabase className="size-4" />,
			requiresSelection: true,
			action: (rows) => navigator.clipboard.writeText(rows.map(r => r.provisioner).join('\n'))
		})

		if (isAllowed('storageclasses.delete')) {
			actions.push({
				id: 'delete-storageclasses',
				label: 'Delete Selected StorageClasses',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					setPendingAction({ type: 'delete', storageClasses: rows });
					setConfirmDialogOpen(true);
					validateStorageClassesAction('delete', rows)
				}
			})
		}

		return actions
	}, [isAllowed, validateStorageClassesAction])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			if (pendingAction.type === 'export') {
				const names = pendingAction.storageClasses.map(sc => sc.name).join(', ')
				console.log('Export YAML for StorageClasses:', names)
				setAlert({ variant: 'success', title: 'Export initiated', description: `Exporting YAML for ${pendingAction.storageClasses.length} storage classes` })
			} else {
				const targets = pendingAction.storageClasses.map(sc => ({ namespace: "", name: sc.name }))
				const resp = await bulkActionsApi.executeBulkAction('storageclasses', { action: 'delete-storageclasses', targets })
				const success = resp?.success
				const total = resp?.resources_total ?? 0
				const affected = resp?.resources_affected ?? 0
				setAlert({
					variant: success ? 'success' : 'error',
					title: success ? `Success: ${affected}/${total} storage classes processed` : `Errors: ${total - affected} failed`,
					description: resp?.message
				})
			}
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e)
			setAlert({ variant: 'error', title: 'Action failed', description: errorMessage })
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
								searchPlaceholder="Search storage classes by name, provisioner, reclaim policy, or volume binding mode..."
								categoryFilter={reclaimPolicyFilter}
								onCategoryFilterChange={setReclaimPolicyFilter}
								categoryLabel="Filter by reclaim policy"
								categoryOptions={reclaimPolicyOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon ?? <IconCopy className="size-4" />,
									variant: (a.variant === 'destructive' ? 'destructive' : 'default') as 'default' | 'destructive',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardStorageClass }) => r.original))
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
				title={pendingAction?.type === 'export' ? 'Export StorageClasses as YAML' : 'Delete StorageClasses'}
				description={pendingAction?.type === 'export' ? 'Export the selected storage classes as YAML files.' : 'Are you sure you want to delete the selected storage classes? This action cannot be undone.'}
				actionLabel={pendingAction?.type === 'export' ? 'Export YAML' : 'Delete StorageClasses'}
				variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.storageClasses || []).map(sc => ({ name: sc.name, namespace: "" }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
			/>

			{selectedStorageClassForDetails && (
				<StorageClassDetailDrawer
					item={selectedStorageClassForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedStorageClassForDetails(null)
					}}
				/>
			)}
		</div>
	)
}
