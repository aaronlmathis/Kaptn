"use client"

import * as React from "react"
import { UniversalDataTable, type BulkAction } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useJobsWithWebSocket } from "@/hooks/useJobsWithWebSocket"
import { JobDetailDrawer } from "@/components/viewers/JobDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ActionConfirmationDialog"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	IconDotsVertical,
	IconEye,
	IconEdit,
	IconRefresh,
	IconDownload,
	IconTrash,
	IconCopy,
	IconCircleCheckFilled,
	IconLoader,
	IconAlertTriangle,
} from "@tabler/icons-react"
import { jobSchema } from "@/lib/schemas/job"
import { z } from "zod"
import { type ColumnDef } from "@/lib/table"

type DashboardJob = z.infer<typeof jobSchema>

// Status badge helper
function getStatusBadge(status: string) {
	switch (status) {
		case "Complete":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					{status}
				</Badge>
			)
		case "Running":
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-blue-600 mr-1" />
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

// Inner component that can access the namespace context
function JobsContent() {
	const { data: jobs, loading: isLoading, error, isConnected } = useJobsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { isAllowed } = useAuthzCapabilitiesInContext(['jobs.get', 'jobs.patch', 'jobs.delete'])
	const { clusterId } = useCluster()

	// Detail drawer state
	const [selectedJobForDetails, setSelectedJobForDetails] = React.useState<DashboardJob | null>(null)
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)

	// Filters state
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	// Confirmation dialog state
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [pendingAction, setPendingAction] = React.useState<{ type: 'delete' | 'restart', items: DashboardJob[] } | null>(null)
	const [_isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [_confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Ensure job-specific action capabilities are requested
	React.useEffect(() => {
		fetchAdditional([
			'jobs.get',
			'jobs.patch',
			'jobs.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when jobs change
	React.useEffect(() => {
		if (jobs.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [jobs])

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((job: DashboardJob) => {
		setSelectedJobForDetails(job)
		setDetailDrawerOpen(true)
	}, [])

	// Create filter options for job statuses
	const jobStatuses = React.useMemo(() => {
		const statuses = new Set(jobs.map(job => job.status).filter(status => status && status.trim() !== ""))
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: getStatusBadge(status)
		}))
	}, [jobs])

	// Filter data based on global filter and status filter
	const filteredData = React.useMemo(() => {
		let filtered = jobs

		// Apply category filter (status)
		if (statusFilter !== "all") {
			filtered = filtered.filter(job => job.status === statusFilter)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(job =>
				job.name.toLowerCase().includes(searchTerm) ||
				job.namespace.toLowerCase().includes(searchTerm) ||
				(job.status && job.status.toLowerCase().includes(searchTerm)) ||
				job.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [jobs, statusFilter, globalFilter])

	const validateJobsAction = React.useCallback(async (type: 'delete' | 'restart', rows: DashboardJob[]) => {
		try {
			const targets = rows.map(r => ({ namespace: r.namespace, name: r.name }))
			const legacyAction = type === 'delete' ? 'delete-job' : 'restart-job'
			const resp = await bulkActionsApi.validateAction('jobs', { action: legacyAction, targets })
			const details: any = resp?.details
			const warnings: string[] = Array.isArray(details?.results)
				? details.results.flatMap((r: any) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Bulk actions (capability-aware)
	const bulkActions: BulkAction<DashboardJob>[] = React.useMemo(() => {
		const actions: BulkAction<DashboardJob>[] = []

		// Copy Job Names (always available)
		actions.push({
			id: 'copy-names',
			label: 'Copy Job Names',
			icon: <IconCopy className="size-4" />,
			action: (rows) => {
				const names = rows.map(j => j.name).join('\n')
				navigator.clipboard.writeText(names)
			},
			requiresSelection: true,
		})

		// Export YAML (gated by jobs.get)
		if (isAllowed('jobs.get')) {
			actions.push({
				id: 'export-yaml',
				label: 'Export Selected as YAML',
				icon: <IconDownload className="size-4" />,
				action: (rows) => {
					console.log('Export YAML for jobs:', rows.map(j => j.name))
					// TODO: Implement YAML export
				},
				requiresSelection: true,
			})
		}

		// Restart Jobs (gated by jobs.patch)
		if (isAllowed('jobs.patch')) {
			actions.push({
				id: 'restart-jobs',
				label: 'Restart Selected Jobs',
				icon: <IconRefresh className="size-4" />,
				action: (rows) => {
					setPendingAction({ type: 'restart', items: rows })
					setConfirmDialogOpen(true)
					validateJobsAction('restart', rows)
				},
				requiresSelection: true,
			})
		}

		// Delete Jobs (gated by jobs.delete)
		if (isAllowed('jobs.delete')) {
			actions.push({
				id: 'delete-jobs',
				label: 'Delete Selected Jobs',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive' as const,
				action: (rows) => {
					setPendingAction({ type: 'delete', items: rows })
					setConfirmDialogOpen(true)
					validateJobsAction('delete', rows)
				},
				requiresSelection: true,
			})
		}

		return actions
	}, [isAllowed, validateJobsAction])

	// Table columns
	const columns: ColumnDef<DashboardJob>[] = React.useMemo(() => [
		{
			accessorKey: "name",
			header: "Job Name",
			cell: ({ row }) => {
				return (
					<IfAllowed
						feature="jobs.get"
						cluster={clusterId}
						namespace={row.original.namespace}
						resourceName={row.original.name}
						fallback={<span className="text-muted-foreground">{row.original.name}</span>}
					>
						<button
							onClick={() => handleViewDetails(row.original)}
							className="text-left hover:underline focus:underline focus:outline-none"
						>
							{row.original.name}
						</button>
					</IfAllowed>
				)
			},
			enableHiding: false,
		},
		{
			accessorKey: "namespace",
			header: "Namespace",
			cell: ({ row }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => getStatusBadge(row.original.status),
		},
		{
			accessorKey: "completions",
			header: "Completions",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.completions}</div>
			),
		},
		{
			accessorKey: "duration",
			header: "Duration",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.duration}</div>
			),
		},
		{
			accessorKey: "age",
			header: "Age",
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			accessorKey: "image",
			header: "Image",
			cell: ({ row }) => (
				<div className="text-sm truncate max-w-[200px]" title={row.original.image}>
					{row.original.image}
				</div>
			),
		},
		{
			id: "actions",
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
							feature="jobs.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconEye className="size-4 mr-2" />
									View Details
								</DropdownMenuItem>
							}
						>
							<DropdownMenuItem onClick={() => handleViewDetails(row.original)}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>

						<IfAllowed
							feature="jobs.patch"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="Job">
								<button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer" style={{ background: 'transparent', border: 'none', textAlign: 'left' }}>
									<IconEdit className="size-4" />
									Edit YAML
								</button>
							</ResourceYamlEditor>
						</IfAllowed>

						<IfAllowed
							feature="jobs.patch"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconRefresh className="size-4 mr-2" />
									Restart Job
								</DropdownMenuItem>
							}
						>
							<DropdownMenuItem onClick={() => {
								setPendingAction({ type: 'restart', items: [row.original] })
								setConfirmDialogOpen(true)
							}}>
								<IconRefresh className="size-4 mr-2" />
								Restart Job
							</DropdownMenuItem>
						</IfAllowed>

						<IfAllowed
							feature="jobs.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconDownload className="size-4 mr-2" />
									Export YAML
								</DropdownMenuItem>
							}
						>
							<DropdownMenuItem onClick={() => {
								const j = row.original
								console.log('Export YAML for Job:', `${j.name} in ${j.namespace}`)
							}}>
								<IconDownload className="size-4 mr-2" />
								Export YAML
							</DropdownMenuItem>
						</IfAllowed>

						<DropdownMenuSeparator />

						<IfAllowed
							feature="jobs.delete"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconTrash className="size-4 mr-2" />
									Delete
								</DropdownMenuItem>
							}
						>
							<DropdownMenuItem
								className="text-red-600"
								onClick={() => {
									setPendingAction({ type: 'delete', items: [row.original] })
									setConfirmDialogOpen(true)
								}}
							>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	], [handleViewDetails, clusterId])

	// Handle confirmation dialog actions
	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.items.map(j => ({ namespace: j.namespace, name: j.name }))
			const legacyAction = pendingAction.type === 'delete' ? 'delete-job' : 'restart-job'
			const resp = await bulkActionsApi.executeBulkAction('jobs', { action: legacyAction, targets })
			const success = resp?.success
			const total = resp?.resources_total ?? 0
			const affected = resp?.resources_affected ?? 0
			setAlert({ variant: success ? 'success' : 'error', title: success ? `Success: ${affected}/${total} jobs processed` : `Errors: ${total - affected} failed`, description: resp?.message })
		} catch (e: any) {
			setAlert({ variant: 'error', title: 'Action failed', description: e?.message ?? String(e) })
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction])

	// Generate summary cards from jobs data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!jobs || jobs.length === 0) {
			return [
				{
					title: "Total Jobs",
					value: 0,
					subtitle: "No jobs found"
				},
				{
					title: "Complete",
					value: 0,
					subtitle: "0/0 complete"
				},
				{
					title: "Running",
					value: 0,
					subtitle: "0 running"
				},
				{
					title: "Failed",
					value: 0,
					subtitle: "0 failed"
				}
			]
		}

		const totalJobs = jobs.length

		// Calculate job statuses
		const completeJobs = jobs.filter(job => job.status === "Complete").length
		const runningJobs = jobs.filter(job => job.status === "Running").length
		const failedJobs = jobs.filter(job => job.status === "Failed").length

		return [
			{
				title: "Total Jobs",
				value: totalJobs,
				subtitle: `${completeJobs} complete, ${runningJobs} running`,
				badge: getReplicaStatusBadge(completeJobs, totalJobs),
				icon: getResourceIcon("jobs"),
				footer: totalJobs > 0 ? "All job resources in cluster" : "No jobs found"
			},
			{
				title: "Complete",
				value: completeJobs,
				subtitle: `${completeJobs}/${totalJobs} jobs completed`,
				badge: getUpdateStatusBadge(completeJobs, totalJobs),
				footer: completeJobs > 0 ? "Successfully finished jobs" : "No completed jobs"
			},
			{
				title: "Running",
				value: runningJobs,
				subtitle: `${runningJobs} jobs running`,
				badge: runningJobs > 0 ? getHealthTrendBadge(100) : getHealthTrendBadge(0),
				footer: runningJobs > 0 ? "Currently executing jobs" : "No running jobs"
			},
			{
				title: "Failed",
				value: failedJobs,
				subtitle: failedJobs > 0 ? `${failedJobs} jobs failed` : "No failures",
				badge: getReplicaStatusBadge(totalJobs - failedJobs, totalJobs),
				footer: failedJobs > 0 ? "Jobs that encountered errors" : "All jobs healthy"
			}
		]
	}, [jobs])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor job resources in your Kubernetes cluster
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

			{/* Universal Data Table */}
			<div className="px-4 lg:px-6">
				<UniversalDataTable
					data={filteredData}
					columns={columns}
					enableReorder={false}
					enableRowSelection={true}
					loading={isLoading}
					error={error}
					renderFilters={({ table, selectedCount, totalCount }) => (
						<DataTableFilters
							globalFilter={globalFilter}
							onGlobalFilterChange={setGlobalFilter}
							searchPlaceholder="Search jobs by name, namespace, status, or age... (Press '/' to focus)"
							categoryFilter={statusFilter}
							onCategoryFilterChange={setStatusFilter}
							categoryLabel="Filter by status"
							categoryOptions={jobStatuses}
							selectedCount={selectedCount}
							totalCount={totalCount}
							bulkActions={bulkActions.map(a => ({
								id: a.id,
								label: a.label,
								icon: a.icon || null,
								variant: a.variant === "destructive" ? "destructive" : "default",
								requiresSelection: a.requiresSelection,
								action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardJob))
							}))}
							bulkActionsLabel="Actions"
							table={table}
							showColumnToggle={true}
						>
							{/* Real-time updates indicator */}
							{isConnected && (
								<div className="flex items-center space-x-1 text-xs text-green-600">
									<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
									<span>Real-time updates enabled</span>
								</div>
							)}
						</DataTableFilters>
					)}
				/>
			</div>

			{/* Controlled detail drawer for full job details */}
			{selectedJobForDetails && (
				<JobDetailDrawer
					item={selectedJobForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedJobForDetails(null)
						}
					}}
				/>
			)}

			{/* Action result alert */}
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

			{/* Confirmation dialog for destructive actions */}
			<ActionConfirmationDialog
				open={confirmDialogOpen}
				action={pendingAction?.type === 'delete' ? 'delete-job' : 'restart-job'}
				resources={pendingAction?.items?.map(job => `${job.namespace}/${job.name}`) || []}
				onConfirm={handleConfirmAction}
				onCancel={() => {
					setConfirmDialogOpen(false)
					setPendingAction(null)
				}}
			/>
		</div>
	)
}

export function JobsPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["jobs.list"]} requireAll={false}>
			<JobsContent />
		</RouteGuard>
	)
}
