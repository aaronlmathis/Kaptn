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
import { IconDotsVertical, IconEye, IconTrash, IconDownload, IconCopy, IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { DashboardDaemonSet } from "@/lib/k8s-workloads"
import { DaemonSetDetailDrawer } from "@/components/viewers/DaemonSetDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useDaemonSetsWithWebSocket } from "@/hooks/useDaemonSetsWithWebSocket"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function DaemonSetsContent() {
	const { data: daemonSets, loading: isLoading, error } = useDaemonSetsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['daemonsets.get', 'daemonsets.patch', 'daemonsets.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedDaemonSetForDetails, setSelectedDaemonSetForDetails] = React.useState<DashboardDaemonSet | null>(null)
	// Confirmation dialog state for destructive actions
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])

	type Item = { name: string; namespace: string }
	type Scope = 'daemonsets'
	const [pendingAction, setPendingAction] = React.useState<null | { scope: Scope, items: Item[] }>(null)

	const requireTextConfirm = React.useMemo(() => !!pendingAction && pendingAction.items.length > 0, [pendingAction])
	const confirmValue = React.useMemo(() => {
		if (!pendingAction || pendingAction.items.length === 0) return ''
		const count = pendingAction.items.length
		return count === 1 ? pendingAction.items[0].name : 'DELETE'
	}, [pendingAction])

	// Ensure daemonset-specific action capabilities are requested
	React.useEffect(() => {
		fetchAdditional([
			'daemonsets.get',
			'daemonsets.patch',
			'daemonsets.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when daemonSets change
	React.useEffect(() => {
		if (daemonSets.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [daemonSets])

	// Generate summary cards from daemonset data.
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!daemonSets || daemonSets.length === 0) {
			return [
				{
					title: "Total DaemonSets",
					value: 0,
					subtitle: "No DaemonSets found"
				},
				{
					title: "Ready Replicas",
					value: 0,
					subtitle: "0 ready"
				},
				{
					title: "Desired Replicas",
					value: 0,
					subtitle: "0 desired"
				},
				{
					title: "Health",
					value: "0%",
					subtitle: "No data"
				}
			]
		}

		const totalDaemonSets = daemonSets.length

		// Calculate daemonset metrics
		const totalDesired = daemonSets.reduce((sum, ds) => sum + ds.desired, 0)
		const totalReady = daemonSets.reduce((sum, ds) => sum + ds.ready, 0)
		const totalCurrent = daemonSets.reduce((sum, ds) => sum + ds.current, 0)
		const totalAvailable = daemonSets.reduce((sum, ds) => sum + ds.available, 0)

		// Calculate health metrics
		const healthyDaemonSets = daemonSets.filter(ds => ds.ready === ds.desired && ds.desired > 0).length
		const healthPercentage = totalDaemonSets > 0 ? (healthyDaemonSets / totalDaemonSets) * 100 : 0

		// Calculate readiness percentage
		const readyPercentage = totalDesired > 0 ? (totalReady / totalDesired) * 100 : 0

		return [
			{
				title: "Total DaemonSets",
				value: totalDaemonSets,
				subtitle: `${healthyDaemonSets}/${totalDaemonSets} healthy`,
				badge: getReplicaStatusBadge(healthyDaemonSets, totalDaemonSets),
				icon: getResourceIcon("daemonsets"),
				footer: totalDaemonSets > 0 ? "All DaemonSet resources in cluster" : "No DaemonSets found"
			},
			{
				title: "Ready Replicas",
				value: totalReady,
				subtitle: `${totalReady}/${totalDesired} ready`,
				badge: getHealthTrendBadge(readyPercentage),
				footer: totalReady > 0 ? "Ready pods across all DaemonSets" : "No ready pods"
			},
			{
				title: "Desired Replicas",
				value: totalDesired,
				subtitle: `${totalCurrent} current replicas`,
				badge: getUpdateStatusBadge(totalCurrent, totalDesired),
				footer: totalDesired > 0 ? "Target replica count" : "No desired replicas"
			},
			{
				title: "Health Coverage",
				value: `${Math.round(healthPercentage)}%`,
				subtitle: `${totalAvailable} available replicas`,
				badge: getReplicaStatusBadge(healthyDaemonSets, totalDaemonSets),
				footer: healthPercentage > 80 ? "Good DaemonSet health" : "Some DaemonSets need attention"
			}
		]
	}, [daemonSets])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	const statusOptions: FilterOption[] = React.useMemo(() => {
		const statuses = new Set<string>()
		daemonSets.forEach(daemonSet => {
			const isReady = daemonSet.ready === daemonSet.desired && daemonSet.desired > 0
			const isPartial = daemonSet.ready > 0 && daemonSet.ready < daemonSet.desired
			if (isReady) {
				statuses.add("Ready")
			} else if (isPartial) {
				statuses.add("Partial")
			} else {
				statuses.add("Not Ready")
			}
		})

		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: getStatusBadge(status)
		}))
	}, [daemonSets])

	const filtered = React.useMemo(() => {
		let filtered = daemonSets

		// Apply status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter(daemonSet => {
				const isReady = daemonSet.ready === daemonSet.desired && daemonSet.desired > 0
				const isPartial = daemonSet.ready > 0 && daemonSet.ready < daemonSet.desired
				const status = isReady ? "Ready" : isPartial ? "Partial" : "Not Ready"
				return status === statusFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(daemonSet =>
				daemonSet.name.toLowerCase().includes(searchTerm) ||
				daemonSet.namespace.toLowerCase().includes(searchTerm) ||
				daemonSet.updateStrategy.toLowerCase().includes(searchTerm) ||
				daemonSet.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [daemonSets, statusFilter, globalFilter])

	// Build table columns - helper functions first
	function getStatusBadge(status: string) {
		switch (status) {
			case 'Ready':
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						{status}
					</Badge>
				)
			case 'Partial':
				return (
					<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
						<IconLoader className="size-3 text-yellow-600 mr-1" />
						{status}
					</Badge>
				)
			case 'Not Ready':
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
	const validateDelete = React.useCallback(async (scope: Scope, items: Item[]) => {
		try {
			const targets = items.map(i => ({ namespace: i.namespace, name: i.name }))
			const resp = await bulkActionsApi.validateAction(String(scope), { action: 'delete', targets })
			const details = resp?.details as { results?: { warnings?: string[] }[] } | undefined
			const warnings: string[] = Array.isArray(details?.results)
				? details.results.flatMap((r) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	const columns: ColumnDef<DashboardDaemonSet>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'DaemonSet Name',
			cell: ({ row }) => (
				<IfAllowed
					feature="daemonsets.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedDaemonSetForDetails(row.original); setDetailDrawerOpen(true) }}
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
			cell: ({ row }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			)
		},
		{
			accessorKey: 'desired',
			header: 'Desired',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.desired}</div>
			)
		},
		{
			accessorKey: 'current',
			header: 'Current',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.current}</div>
			)
		},
		{
			accessorKey: 'ready',
			header: 'Ready',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.ready}</div>
			)
		},
		{
			accessorKey: 'available',
			header: 'Available',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.available}</div>
			)
		},
		{
			accessorKey: 'unavailable',
			header: 'Unavailable',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.unavailable}</div>
			)
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			)
		},
		{
			accessorKey: 'updateStrategy',
			header: 'Update Strategy',
			cell: ({ row }) => (
				<div className="text-sm">{row.original.updateStrategy}</div>
			)
		},
		{
			id: 'actions',
			cell: ({ row }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="data-[state=open]:bg-muted text-muted-foreground flex size-8">
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed feature="daemonsets.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedDaemonSetForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="daemonsets.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="DaemonSet">
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
								>
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							</ResourceYamlEditor>
						</IfAllowed>
						<IfAllowed feature="daemonsets.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconDownload className="size-4 mr-2" />Export YAML</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => console.log('Export YAML for DaemonSet:', `${row.original.name} in ${row.original.namespace}`)}>
								<IconDownload className="size-4 mr-2" />
								Export YAML
							</DropdownMenuItem>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="daemonsets.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem
								className="text-red-600"
								onClick={() => {
									const item = row.original
									setPendingAction({ scope: 'daemonsets', items: [{ name: item.name, namespace: item.namespace }] })
									setConfirmDialogOpen(true)
									validateDelete('daemonsets', [{ name: item.name, namespace: item.namespace }])
								}}
							>
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
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardDaemonSet[]) => void | Promise<void> }[] = []

		actions.push({
			id: 'copy-names',
			label: 'Copy DaemonSet Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n'))
		})

		if (isAllowed('daemonsets.get')) {
			actions.push({
				id: 'export-yaml',
				label: 'Export Selected as YAML',
				icon: <IconDownload className="size-4" />,
				requiresSelection: true,
				action: (rows) => console.log('Export YAML for daemon sets:', rows.map(ds => ds.name))
			})
		}

		if (isAllowed('daemonsets.delete')) {
			actions.push({
				id: 'delete-daemonsets',
				label: 'Delete Selected DaemonSets',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					const selected = rows.map(r => ({ name: r.name, namespace: r.namespace }))
					setPendingAction({ scope: 'daemonsets', items: selected })
					setConfirmDialogOpen(true)
					validateDelete('daemonsets', selected)
				}
			})
		}

		return actions
	}, [isAllowed, validateDelete])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.items.map(i => ({ namespace: i.namespace, name: i.name }))
			await bulkActionsApi.executeBulkAction(String(pendingAction.scope), { action: 'delete', targets, force_confirm: true })
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction])

	return (
		<div className="space-y-6">

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
								searchPlaceholder="Search daemon sets by name, namespace, update strategy, or age..."
								categoryFilter={statusFilter}
								onCategoryFilterChange={setStatusFilter}
								categoryLabel="Filter by readiness"
								categoryOptions={statusOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon || <></>,
									variant: a.variant === 'destructive' ? 'destructive' : 'default',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardDaemonSet))
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

			{selectedDaemonSetForDetails && (
				<DaemonSetDetailDrawer
					item={selectedDaemonSetForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedDaemonSetForDetails(null)
					}}
				/>
			)}
		</div>
	)
}

export function DaemonSetsPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["daemonsets.list"]} requireAll={false}>
			<DaemonSetsContent />
		</RouteGuard>
	)
}
