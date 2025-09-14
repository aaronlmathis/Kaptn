"use client"

import * as React from "react"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useCronJobsWithWebSocket } from "@/hooks/useCronJobsWithWebSocket"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz/RouteGuard"
import { useCapabilities } from "@/hooks/use-capabilities"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
	IconDotsVertical,
	IconEye,
	IconTrash,
	IconEdit,
	IconPlayerPause,
	IconPlayerPlay,
	IconRefresh,
	IconDownload,
	IconCopy,
} from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { CronJobDetailDrawer } from "@/components/viewers/CronJobDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { cronJobSchema } from "@/lib/schemas/cronjob"
import { z } from "zod"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { bulkActionsApi } from "@/lib/api/bulk-actions"

// Inner component that can access the namespace context
function CronJobsContent() {
	const { data: cronJobs, loading: isLoading, error } = useCronJobsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['cronjobs.get', 'cronjobs.patch', 'cronjobs.delete', 'jobs.create'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedCronJobForDetails, setSelectedCronJobForDetails] = React.useState<z.infer<typeof cronJobSchema> | null>(null)
	// Confirmation dialog state for destructive actions
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])

	// Change item type as needed per page (e.g., DashboardService, DashboardConfigMap)
	type Item = { name: string; namespace?: string }
	type Scope = 'pods' | 'deployments' | 'services' | 'configmaps' | 'secrets' | 'daemonsets' | 'statefulsets' | 'cronjobs' | 'nodes' |
		'clusterroles' | 'clusterrolebindings' | 'roles' | 'rolebindings' | string

	const [pendingAction, setPendingAction] = React.useState<null | { scope: Scope, items: Item[], actionType: 'delete' | 'suspend' | 'resume' | 'trigger' }>(null)

	const requireTextConfirm = React.useMemo(() => !!pendingAction && pendingAction.items.length > 0 && pendingAction.actionType === 'delete', [pendingAction])
	const confirmValue = React.useMemo(() => {
		if (!pendingAction || pendingAction.items.length === 0 || pendingAction.actionType !== 'delete') return ''
		const count = pendingAction.items.length
		return count === 1 ? pendingAction.items[0].name : 'DELETE'
	}, [pendingAction])

	const validateDelete = React.useCallback(async (scope: Scope, items: Item[], actionType: 'delete' | 'suspend' | 'resume' | 'trigger') => {
		try {
			const targets = items.map(i => ({ namespace: i.namespace ?? '', name: i.name }))
			let legacyAction = ''
			switch (actionType) {
				case 'delete': legacyAction = 'delete'; break
				case 'suspend': legacyAction = 'suspend'; break
				case 'resume': legacyAction = 'resume'; break
				case 'trigger': legacyAction = 'trigger'; break
			}
			const resp = await bulkActionsApi.validateAction(String(scope), { action: legacyAction, targets })
			const details: any = resp?.details
			const warnings: string[] = Array.isArray(details?.results)
				? details.results.flatMap((r: any) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.items.map(i => ({ namespace: i.namespace ?? '', name: i.name }))
			let legacyAction = ''
			switch (pendingAction.actionType) {
				case 'delete': legacyAction = 'delete'; break
				case 'suspend': legacyAction = 'suspend'; break
				case 'resume': legacyAction = 'resume'; break
				case 'trigger': legacyAction = 'trigger'; break
			}
			await bulkActionsApi.executeBulkAction(String(pendingAction.scope), { action: legacyAction, targets, force_confirm: pendingAction.actionType === 'delete' })
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction])

	// Ensure cronjob-specific capabilities are requested
	React.useEffect(() => {
		fetchAdditional([
			'cronjobs.get',
			'cronjobs.patch',
			'cronjobs.delete',
			'jobs.create',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when cronJobs change
	React.useEffect(() => {
		if (cronJobs.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [cronJobs])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	// Status badge helper for CronJob
	function getSuspendBadge(suspend: boolean) {
		if (suspend) {
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconPlayerPause className="size-3 text-yellow-600 mr-1" />
					Suspended
				</Badge>
			)
		} else {
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconPlayerPlay className="size-3 text-green-600 mr-1" />
					Active
				</Badge>
			)
		}
	}

	// Status filter options
	const statusOptions: FilterOption[] = React.useMemo(() => {
		const statuses = new Set<string>()
		cronJobs.forEach(cronJob => {
			// Create status based on suspend field
			if (cronJob.suspend) {
				statuses.add("Suspended")
			} else {
				statuses.add("Active")
			}
		})
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: (
				<Badge variant="outline" className={status === "Active" ? "text-green-600 border-border bg-transparent px-1.5" : "text-yellow-600 border-border bg-transparent px-1.5"}>
					{status === "Active" ? <IconPlayerPlay className="size-3 mr-1" /> : <IconPlayerPause className="size-3 mr-1" />}
					{status}
				</Badge>
			)
		}))
	}, [cronJobs])

	const filtered = React.useMemo(() => {
		let result = cronJobs

		// Apply category filter (status)
		if (statusFilter !== "all") {
			result = result.filter(cronJob => {
				const status = cronJob.suspend ? "Suspended" : "Active"
				return status === statusFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			result = result.filter(cronJob =>
				cronJob.name.toLowerCase().includes(searchTerm) ||
				cronJob.namespace.toLowerCase().includes(searchTerm) ||
				cronJob.schedule.toLowerCase().includes(searchTerm) ||
				cronJob.image.toLowerCase().includes(searchTerm) ||
				cronJob.age.toLowerCase().includes(searchTerm)
			)
		}

		return result
	}, [cronJobs, statusFilter, globalFilter])

	// Build table columns
	const columns: ColumnDef<z.infer<typeof cronJobSchema>>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'CronJob Name',
			cell: ({ row }) => (
				<IfAllowed
					feature="cronjobs.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedCronJobForDetails(row.original); setDetailDrawerOpen(true) }}
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
			accessorKey: 'schedule',
			header: 'Schedule',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.schedule}</div>
			)
		},
		{
			accessorKey: 'suspend',
			header: 'Status',
			cell: ({ row }) => getSuspendBadge(row.original.suspend)
		},
		{
			accessorKey: 'active',
			header: 'Active',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.active}</div>
			)
		},
		{
			accessorKey: 'lastSchedule',
			header: 'Last Schedule',
			cell: ({ row }) => (
				<div className="text-sm">{row.original.lastSchedule}</div>
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
			accessorKey: 'image',
			header: 'Image',
			cell: ({ row }) => (
				<div className="text-sm truncate max-w-32" title={row.original.image}>
					{row.original.image}
				</div>
			)
		},
		{
			id: 'actions',
			cell: ({ row }) => (
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
							feature="cronjobs.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedCronJobForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="cronjobs.patch"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="CronJob">
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
								>
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							</ResourceYamlEditor>
						</IfAllowed>
						<IfAllowed
							feature="cronjobs.patch"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground">{row.original.suspend ? (<><IconPlayerPlay className="size-4 mr-2" />Resume</>) : (<><IconPlayerPause className="size-4 mr-2" />Suspend</>)}</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => {
								const action = row.original.suspend ? 'resume' : 'suspend'
								const item = row.original
								setPendingAction({ scope: 'cronjobs', items: [{ name: item.name, namespace: item.namespace }], actionType: action });
								setConfirmDialogOpen(true);
								validateDelete('cronjobs', [{ name: item.name, namespace: item.namespace }], action)
							}}>
								{row.original.suspend ? (
									<>
										<IconPlayerPlay className="size-4 mr-2" />
										Resume
									</>
								) : (
									<>
										<IconPlayerPause className="size-4 mr-2" />
										Suspend
									</>
								)}
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="jobs.create"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconRefresh className="size-4 mr-2" />Trigger Job</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => {
								const item = row.original
								setPendingAction({ scope: 'cronjobs', items: [{ name: item.name, namespace: item.namespace }], actionType: 'trigger' });
								setConfirmDialogOpen(true);
								validateDelete('cronjobs', [{ name: item.name, namespace: item.namespace }], 'trigger')
							}}>
								<IconRefresh className="size-4 mr-2" />
								Trigger Job
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="cronjobs.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconDownload className="size-4 mr-2" />Export YAML</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { const cj = row.original; console.log('Export YAML for CronJob:', `${cj.name} in ${cj.namespace}`) }}>
								<IconDownload className="size-4 mr-2" />
								Export YAML
							</DropdownMenuItem>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed
							feature="cronjobs.delete"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => {
								const item = row.original
								setPendingAction({ scope: 'cronjobs', items: [{ name: item.name, namespace: item.namespace }], actionType: 'delete' });
								setConfirmDialogOpen(true);
								validateDelete('cronjobs', [{ name: item.name, namespace: item.namespace }], 'delete')
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
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: z.infer<typeof cronJobSchema>[]) => void | Promise<void> }[] = []

		// Copy names action - always available
		actions.push({
			id: 'copy-names',
			label: 'Copy CronJob Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n'))
		})

		// Export YAML - available if has cronjobs.get
		if (isAllowed('cronjobs.get')) {
			actions.push({
				id: 'export-yaml',
				label: 'Export Selected as YAML',
				icon: <IconDownload className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					console.log('Export YAML for CronJobs:', rows.map(cj => cj.name))
				}
			})
		}

		// Resume/Suspend actions - available if has cronjobs.patch
		if (isAllowed('cronjobs.patch')) {
			actions.push({
				id: 'resume-cronjobs',
				label: 'Resume Selected CronJobs',
				icon: <IconPlayerPlay className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					const selected = rows.map(cj => ({ name: cj.name, namespace: cj.namespace }))
					setPendingAction({ scope: 'cronjobs', items: selected, actionType: 'resume' });
					setConfirmDialogOpen(true);
					validateDelete('cronjobs', selected, 'resume')
				}
			})
			actions.push({
				id: 'suspend-cronjobs',
				label: 'Suspend Selected CronJobs',
				icon: <IconPlayerPause className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					const selected = rows.map(cj => ({ name: cj.name, namespace: cj.namespace }))
					setPendingAction({ scope: 'cronjobs', items: selected, actionType: 'suspend' });
					setConfirmDialogOpen(true);
					validateDelete('cronjobs', selected, 'suspend')
				}
			})
		}

		// Trigger jobs - available if has jobs.create
		if (isAllowed('jobs.create')) {
			actions.push({
				id: 'trigger-jobs',
				label: 'Trigger Jobs For Selected',
				icon: <IconRefresh className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					const selected = rows.map(cj => ({ name: cj.name, namespace: cj.namespace }))
					setPendingAction({ scope: 'cronjobs', items: selected, actionType: 'trigger' });
					setConfirmDialogOpen(true);
					validateDelete('cronjobs', selected, 'trigger')
				}
			})
		}

		// Delete action - available if has cronjobs.delete
		if (isAllowed('cronjobs.delete')) {
			actions.push({
				id: 'delete-cronjobs',
				label: 'Delete Selected CronJobs',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					const selected = rows.map(cj => ({ name: cj.name, namespace: cj.namespace }))
					setPendingAction({ scope: 'cronjobs', items: selected, actionType: 'delete' });
					setConfirmDialogOpen(true);
					validateDelete('cronjobs', selected, 'delete')
				}
			})
		}

		return actions
	}, [isAllowed, validateDelete])

	// Generate summary cards from cronjob data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!cronJobs || cronJobs.length === 0) {
			return [
				{
					title: "Total CronJobs",
					value: 0,
					subtitle: "No CronJobs found"
				},
				{
					title: "Active Jobs",
					value: 0,
					subtitle: "0 running"
				},
				{
					title: "Suspended",
					value: 0,
					subtitle: "0 suspended"
				},
				{
					title: "Health",
					value: "0%",
					subtitle: "No data"
				}
			]
		}

		const totalCronJobs = cronJobs.length

		// Calculate cronjob metrics
		const totalActiveJobs = cronJobs.reduce((sum, cj) => sum + cj.active, 0)
		const suspendedJobs = cronJobs.filter(cj => cj.suspend).length
		const runningJobs = cronJobs.filter(cj => !cj.suspend).length
		const activeCronJobs = cronJobs.filter(cj => cj.active > 0).length

		// Calculate health metrics
		const healthPercentage = totalCronJobs > 0 ? (runningJobs / totalCronJobs) * 100 : 0

		// Calculate activity percentage
		const activityPercentage = totalCronJobs > 0 ? (activeCronJobs / totalCronJobs) * 100 : 0

		return [
			{
				title: "Total CronJobs",
				value: totalCronJobs,
				subtitle: `${runningJobs}/${totalCronJobs} active`,
				badge: getReplicaStatusBadge(runningJobs, totalCronJobs),
				icon: getResourceIcon("cronjobs"),
				footer: totalCronJobs > 0 ? "All CronJob resources in cluster" : "No CronJobs found"
			},
			{
				title: "Active Jobs",
				value: totalActiveJobs,
				subtitle: `${activeCronJobs} CronJobs with active jobs`,
				badge: getHealthTrendBadge(activityPercentage),
				footer: totalActiveJobs > 0 ? "Currently running jobs" : "No active jobs"
			},
			{
				title: "Suspended",
				value: suspendedJobs,
				subtitle: `${suspendedJobs}/${totalCronJobs} suspended`,
				badge: suspendedJobs > 0 ? getUpdateStatusBadge(suspendedJobs, totalCronJobs) : getHealthTrendBadge(100),
				footer: suspendedJobs > 0 ? "CronJobs are paused" : "All CronJobs are active"
			},
			{
				title: "Health Status",
				value: `${Math.round(healthPercentage)}%`,
				subtitle: `${runningJobs} operational CronJobs`,
				badge: getReplicaStatusBadge(runningJobs, totalCronJobs),
				footer: healthPercentage > 80 ? "Good CronJob health" : "Some CronJobs suspended"
			}
		]
	}, [cronJobs])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}


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
								searchPlaceholder="Search cronjobs by name, namespace, schedule, image, or age... (Press '/' to focus)"
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
									variant: (a.variant === 'destructive' ? 'destructive' : 'default') as 'default' | 'destructive',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as z.infer<typeof cronJobSchema>))
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
				title={getConfirmDialogTitle(pendingAction?.actionType)}
				description={getConfirmDialogDescription(pendingAction?.actionType)}
				actionLabel={getConfirmDialogActionLabel(pendingAction?.actionType)}
				variant={pendingAction?.actionType === 'delete' ? 'destructive' : 'default'}
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.items || []).map(i => ({ name: i.name, namespace: i.namespace }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
				requireTextConfirm={requireTextConfirm}
				confirmPrompt={pendingAction?.items && pendingAction.items.length === 1 ? 'Type the resource name to confirm' : 'Type DELETE to confirm'}
				confirmValue={confirmValue}
			/>

			{selectedCronJobForDetails && (
				<CronJobDetailDrawer
					item={selectedCronJobForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedCronJobForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

// Helper functions for confirmation dialog
function getConfirmDialogTitle(type?: string) {
	switch (type) {
		case 'delete': return 'Delete CronJobs'
		case 'suspend': return 'Suspend CronJobs'
		case 'resume': return 'Resume CronJobs'
		case 'trigger': return 'Trigger Jobs'
		default: return 'Confirm Action'
	}
}

function getConfirmDialogDescription(type?: string) {
	switch (type) {
		case 'delete': return 'Are you sure you want to delete the selected CronJobs? This action cannot be undone.'
		case 'suspend': return 'Are you sure you want to suspend the selected CronJobs? They will stop running on schedule.'
		case 'resume': return 'Are you sure you want to resume the selected CronJobs? They will start running on schedule again.'
		case 'trigger': return 'Are you sure you want to trigger jobs for the selected CronJobs? This will create new job instances.'
		default: return 'Are you sure you want to perform this action?'
	}
}

function getConfirmDialogActionLabel(type?: string) {
	switch (type) {
		case 'delete': return 'Delete CronJobs'
		case 'suspend': return 'Suspend CronJobs'
		case 'resume': return 'Resume CronJobs'
		case 'trigger': return 'Trigger Jobs'
		default: return 'Confirm'
	}
}

export function CronJobsPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["cronjobs.list"]} requireAll={false}>
			<CronJobsContent />
		</RouteGuard>
	)
}
