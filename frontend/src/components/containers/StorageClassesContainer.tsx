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
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import type { DashboardStorageClass } from "@/lib/k8s-storage"
import {
	getStorageClassStatusBadge,
	getStorageClassProvisionerBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"
import { useCapabilities } from "@/hooks/use-capabilities"

export function StorageClassesContainer() {
	const { data: storageClasses, loading: isLoading, error } = useStorageClassesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['storageclasses.get', 'storageclasses.patch', 'storageclasses.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedStorageClassForDetails, setSelectedStorageClassForDetails] = React.useState<DashboardStorageClass | null>(null)
	// Confirmation dialog state for destructive actions
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])

	type Item = { name: string; namespace?: string }
	type Scope = 'storageclasses' | string

	const [pendingAction, setPendingAction] = React.useState<null | { scope: Scope, items: Item[] }>(null)

	const requireTextConfirm = React.useMemo(() => !!pendingAction && pendingAction.items.length > 0, [pendingAction])
	const confirmValue = React.useMemo(() => {
		if (!pendingAction || pendingAction.items.length === 0) return ''
		const count = pendingAction.items.length
		return count === 1 ? pendingAction.items[0].name : 'DELETE'
	}, [pendingAction])

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

	const validateDelete = React.useCallback(async (scope: Scope, items: Item[]) => {
		try {
			const targets = items.map(i => ({ namespace: i.namespace ?? '', name: i.name }))
			const resp = await bulkActionsApi.validateAction(String(scope), { action: 'delete', targets })
			const details = resp?.details as Record<string, unknown> | undefined
			const warnings: string[] = Array.isArray(details?.results)
				? (details.results as Array<{ warnings?: string[] }>).flatMap((r) => Array.isArray(r.warnings) ? r.warnings : [])
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
							<DropdownMenuItem className="text-red-600" onClick={() => {
								const item = row.original
								setPendingAction({ scope: 'storageclasses', items: [{ name: item.name, namespace: '' }] })
								setConfirmDialogOpen(true)
								validateDelete('storageclasses', [{ name: item.name, namespace: '' }])
							}}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, validateDelete])

	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardStorageClass[]) => void | Promise<void> }[] = []

		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				const selected = rows.map(r => ({ name: r.name, namespace: '' }))
				navigator.clipboard.writeText(selected.map(i => i.name).join('\n'))
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
					const selected = rows.map(r => ({ name: r.name, namespace: '' }))
					setPendingAction({ scope: 'storageclasses', items: selected })
					setConfirmDialogOpen(true)
					validateDelete('storageclasses', selected)
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
				cards={summaryData}
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
