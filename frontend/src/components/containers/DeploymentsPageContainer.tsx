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
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconRefresh, IconScale, IconCopy, IconDownload, IconCircleCheckFilled, IconLoader, IconAlertTriangle } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { DashboardDeployment } from "@/lib/k8s-workloads"
import { DeploymentDetailDrawer } from "@/components/viewers/DeploymentDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useDeploymentsWithWebSocket } from "@/hooks/useDeploymentsWithWebSocket"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import {
	getDeploymentStatusBadge,
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"
// Inner component that can access the namespace context
function DeploymentsContent() {
	const { data: deployments, loading: isLoading, error, isConnected } = useDeploymentsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['deployments.get', 'deployments.patch', 'deployments.delete', 'deployments.restart', 'deployments.scale.update'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedDeploymentForDetails, setSelectedDeploymentForDetails] = React.useState<DashboardDeployment | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete' | 'restart' | 'scale', deployments: DashboardDeployment[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)
    const requireTextConfirm = React.useMemo(() => pendingAction?.type === 'delete' && (pendingAction?.deployments?.length || 0) > 0, [pendingAction])
    const confirmValue = React.useMemo(() => {
        if (!pendingAction || pendingAction.type !== 'delete') return ''
        const count = pendingAction.deployments.length
        return count === 1 ? pendingAction.deployments[0].name : 'DELETE'
    }, [pendingAction])

	// Ensure deployment-specific action capabilities are requested (default is conservative)
	React.useEffect(() => {
		fetchAdditional([
			'deployments.get',
			'deployments.patch', // edit YAML / rollout changes
			'deployments.delete',
			'deployments.restart',
			'deployments.scale.update',
		]).catch(() => { /* noop */ })
		// run once on mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when deployments change
	React.useEffect(() => {
		if (deployments.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [deployments])

	// Generate summary cards from deployment data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!deployments || deployments.length === 0) {
			return [
				{
					title: "Total Deployments",
					value: 0,
					subtitle: "No deployments found"
				},
				{
					title: "Ready",
					value: 0,
					subtitle: "0/0 ready"
				},
				{
					title: "Up-to-Date",
					value: 0,
					subtitle: "0 up-to-date"
				},
				{
					title: "Available",
					value: 0,
					subtitle: "0 available"
				}
			]
		}

		const totalDeployments = deployments.length

		// Calculate ready deployments (where ready fraction equals 1)
		const readyDeployments = deployments.filter(d => {
			const [ready, total] = d.ready.split('/').map(Number)
			return ready === total && total > 0
		}).length

		// Calculate total replicas stats
		const totalUpToDate = deployments.reduce((sum, d) => sum + d.upToDate, 0)
		const totalAvailable = deployments.reduce((sum, d) => sum + d.available, 0)
		const totalReplicas = deployments.reduce((sum, d) => {
			const [, total] = d.ready.split('/').map(Number)
			return sum + (total || 0)
		}, 0)
		const totalReadyReplicas = deployments.reduce((sum, d) => {
			const [ready] = d.ready.split('/').map(Number)
			return sum + (ready || 0)
		}, 0)

		return [
			{
				title: "Total Deployments",
				value: totalDeployments,
				subtitle: `${readyDeployments}/${totalDeployments} ready`,
				badge: getDeploymentStatusBadge(readyDeployments, totalDeployments),
				icon: getResourceIcon("deployments"),
				footer: totalDeployments > 0 ? "All deployment resources in cluster" : "No deployments found"
			},
			{
				title: "Ready Replicas",
				value: `${totalReadyReplicas}/${totalReplicas}`,
				subtitle: totalReplicas > 0 ? `${Math.round((totalReadyReplicas / totalReplicas) * 100)}% ready` : "No replicas",
				badge: getReplicaStatusBadge(totalReadyReplicas, totalReplicas),
				footer: totalReplicas > 0 ? "Pod instances across all deployments" : "No pod replicas"
			},
			{
				title: "Up-to-Date",
				value: totalUpToDate,
				subtitle: `${totalUpToDate} replicas up-to-date`,
				badge: getUpdateStatusBadge(totalUpToDate, totalReplicas),
				footer: totalReplicas > 0 ? "Running latest deployment version" : "No replicas to update"
			},
			{
				title: "Available",
				value: totalAvailable,
				subtitle: `${totalAvailable} replicas available`,
				badge: getHealthTrendBadge(totalReplicas > 0 ? (totalAvailable / totalReplicas) * 100 : 0),
				footer: totalAvailable > 0 ? "Ready to serve traffic" : "No available replicas"
			}
		]
	}, [deployments])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	const statusOptions: FilterOption[] = React.useMemo(() => {
		const statuses = Array.from(new Set(deployments.map(d => {
			// Create status based on availability
			return d.available > 0 ? "Available" : "Unavailable"
		}))).filter(Boolean).sort()
		return statuses.map(status => ({
			value: status,
			label: status,
			badge: getStatusBadge(status)
		}))
	}, [deployments])

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return deployments.filter(d => {
			const matchesQuery = !q || d.name.toLowerCase().includes(q) || d.namespace.toLowerCase().includes(q) || d.image.toLowerCase().includes(q)
			const status = d.available > 0 ? "Available" : "Unavailable"
			const matchesStatus = statusFilter === 'all' || status === statusFilter
			return matchesQuery && matchesStatus
		})
	}, [deployments, globalFilter, statusFilter])

	// Bulk actions: preflight validate to show warnings in confirmation dialog
	const validateDeploymentsAction = React.useCallback(async (type: 'delete' | 'restart' | 'scale', rows: DashboardDeployment[]) => {
		try {
			const targets = rows.map(d => ({ namespace: d.namespace, name: d.name }))
			const legacyAction = type === 'delete' ? 'delete-deployments' : type === 'restart' ? 'restart-deployments' : 'scale-deployments'
			const resp = await bulkActionsApi.validateAction('deployments', { action: legacyAction, targets })
			const details: any = resp?.details
			const warnings: string[] = Array.isArray(details?.results)
				? details.results.flatMap((r: any) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Build table columns with status badge functions
	function getStatusBadge(status: string) {
		switch (status) {
			case 'Available':
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						{status}
					</Badge>
				)
			case 'Unavailable':
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

	function getReadyBadge(ready: string) {
		const parts = ready.split('/')
		if (parts.length !== 2) {
			return <div className="font-mono text-sm">{ready}</div>
		}
		const current = Number(parts[0])
		const total = Number(parts[1])
		const isReady = current === total && total > 0
		const isPartial = current > 0 && current < total
		if (isReady) {
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					{ready}
				</Badge>
			)
		} else if (isPartial) {
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-yellow-600 mr-1" />
					{ready}
				</Badge>
			)
		}
		return (
			<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
				<IconAlertTriangle className="size-3 text-red-600 mr-1" />
				{ready}
			</Badge>
		)
	}

	const columns: ColumnDef<DashboardDeployment>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Deployment',
			cell: ({ row }) => (
				<IfAllowed
					feature="deployments.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedDeploymentForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
		},
		{ accessorKey: 'namespace', header: 'Namespace', cell: ({ row }) => (<Badge variant="outline" className="text-muted-foreground px-1.5">{row.original.namespace}</Badge>) },
		{ accessorKey: 'ready', header: 'Ready', cell: ({ row }) => getReadyBadge(row.original.ready) },
		{ accessorKey: 'upToDate', header: 'Up-to-Date', cell: ({ row }) => (<div className="font-mono text-sm">{row.original.upToDate}</div>) },
		{ accessorKey: 'available', header: 'Available', cell: ({ row }) => (<div className="font-mono text-sm">{row.original.available}</div>) },
		{ accessorKey: 'age', header: 'Age', cell: ({ row }) => (<div className="font-mono text-sm">{row.original.age}</div>) },
		{ accessorKey: 'image', header: 'Image', cell: ({ row }) => (<div className="font-mono text-sm truncate max-w-48">{row.original.image}</div>) },
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
						<IfAllowed feature="deployments.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedDeploymentForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="deployments.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="Deployment">
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
								>
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							</ResourceYamlEditor>
						</IfAllowed>

						<IfAllowed feature="deployments.scale.update" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconScale className="size-4 mr-2" />Scale</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => console.log('Scale deployment', row.original.namespace, row.original.name)}>
								<IconScale className="size-4 mr-2" />
								Scale
							</DropdownMenuItem>
						</IfAllowed>

						<IfAllowed feature="deployments.restart" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconRefresh className="size-4 mr-2" />Restart</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setPendingAction({ type: 'restart', deployments: [row.original] }); setConfirmDialogOpen(true); validateDeploymentsAction('restart', [row.original]) }}>
								<IconRefresh className="size-4 mr-2" />
								Restart
							</DropdownMenuItem>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="deployments.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', deployments: [row.original] }); setConfirmDialogOpen(true); validateDeploymentsAction('delete', [row.original]) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, setSelectedDeploymentForDetails, setDetailDrawerOpen, setPendingAction, setConfirmDialogOpen, validateDeploymentsAction])

	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardDeployment[]) => void | Promise<void> }[] = []
		actions.push({ id: 'copy-names', label: 'Copy Deployment Names', icon: <IconCopy className="size-4" />, requiresSelection: true, action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n')) })
		if (isAllowed('deployments.get')) actions.push({ id: 'export-yaml', label: 'Export Selected as YAML', icon: <IconDownload className="size-4" />, requiresSelection: true, action: (rows) => console.log('Export YAML bulk', rows) })
		if (isAllowed('deployments.scale.update')) actions.push({ id: 'scale-deployments', label: 'Scale Selected Deployments', icon: <IconScale className="size-4" />, requiresSelection: true, action: (rows) => { setPendingAction({ type: 'scale', deployments: rows }); setConfirmDialogOpen(true); validateDeploymentsAction('scale', rows) } })
		if (isAllowed('deployments.restart')) actions.push({ id: 'restart-deployments', label: 'Restart Selected Deployments', icon: <IconRefresh className="size-4" />, requiresSelection: true, action: (rows) => { setPendingAction({ type: 'restart', deployments: rows }); setConfirmDialogOpen(true); validateDeploymentsAction('restart', rows) } })
		if (isAllowed('deployments.delete')) actions.push({ id: 'delete-deployments', label: 'Delete Selected Deployments', icon: <IconTrash className="size-4" />, variant: 'destructive', requiresSelection: true, action: (rows) => { setPendingAction({ type: 'delete', deployments: rows }); setConfirmDialogOpen(true); validateDeploymentsAction('delete', rows) } })
		return actions
	}, [isAllowed, validateDeploymentsAction])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.deployments.map(d => ({ namespace: d.namespace, name: d.name }))
			const legacyAction = pendingAction.type === 'delete' ? 'delete-deployments' : pendingAction.type === 'restart' ? 'restart-deployments' : 'scale-deployments'
			const resp = await bulkActionsApi.executeBulkAction('deployments', { action: legacyAction, targets, force_confirm: pendingAction.type === 'delete' })
			const success = resp?.success
			const total = resp?.resources_total ?? 0
			const affected = resp?.resources_affected ?? 0
			setAlert({ variant: success ? 'success' : 'error', title: success ? `Success: ${affected}/${total} deployments processed` : `Errors: ${total - affected} failed`, description: resp?.message })
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
								searchPlaceholder="Search deployments by name, namespace, or image..."
								categoryFilter={statusFilter}
								onCategoryFilterChange={setStatusFilter}
								categoryLabel="Status"
								categoryOptions={statusOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon || undefined,
									variant: a.variant || 'default',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardDeployment))
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
				title={pendingAction?.type === 'restart' ? 'Restart Deployments' : pendingAction?.type === 'scale' ? 'Scale Deployments' : 'Delete Deployments'}
				description={pendingAction?.type === 'restart' ? 'Are you sure you want to restart the selected deployments? This will trigger a rolling update.' : pendingAction?.type === 'scale' ? 'Are you sure you want to scale the selected deployments?' : 'Are you sure you want to delete the selected deployments? This action cannot be undone.'}
				actionLabel={pendingAction?.type === 'restart' ? 'Restart Deployments' : pendingAction?.type === 'scale' ? 'Scale Deployments' : 'Delete Deployments'}
				variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.deployments || []).map(d => ({ name: d.name, namespace: d.namespace }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
                requireTextConfirm={requireTextConfirm}
                confirmPrompt={pendingAction?.deployments?.length === 1 ? 'Type the deployment name to confirm' : 'Type DELETE to confirm'}
                confirmValue={confirmValue}
			/>

			{selectedDeploymentForDetails && (
				<DeploymentDetailDrawer
					item={selectedDeploymentForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedDeploymentForDetails(null)
					}}
				/>
			)}
		</div>
	)
}

export function DeploymentsPageContainer() {
	return (
		<RouteGuard
			requiredCapabilities={['deployments.list']}
			requireAll={false}
		>
			<DeploymentsContent />
		</RouteGuard>
	)
}
