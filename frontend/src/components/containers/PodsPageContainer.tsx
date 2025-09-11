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
import { IconDotsVertical, IconEye, IconTrash, IconFileText, IconTerminal, IconCopy, IconEdit, IconRefresh, IconCircleCheckFilled, IconLoader, IconAlertTriangle } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { DashboardPod } from "@/lib/k8s-workloads"
import { PodDetailDrawer } from "@/components/viewers/PodDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useShell } from "@/hooks/use-shell"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { usePodsWithWebSocket } from "@/hooks/usePodsWithWebSocket"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import {
	getPodStatusBadge,
	getPodPhaseBadge,
	getPodReadinessBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function PodsContent() {
	const { data: pods, loading: isLoading, error, isConnected } = usePodsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['pods.get', 'pods.logs', 'pods.exec', 'pods.delete', 'pods.patch'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedPodForDetails, setSelectedPodForDetails] = React.useState<DashboardPod | null>(null)
	const { openShell } = useShell()
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete' | 'restart', pods: DashboardPod[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Ensure pod-specific action capabilities are requested (default is conservative)
	React.useEffect(() => {
		fetchAdditional([
			'pods.get',
			'pods.patch', // restart
			'pods.delete',
			'pods.logs',
			'pods.exec',
		]).catch(() => { /* noop */ })
		// run once on mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when pods change
	React.useEffect(() => {
		if (pods.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [pods])

	// Generate summary cards from pod data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!pods || pods.length === 0) {
			return [
				{
					title: "Total Pods",
					value: 0,
					subtitle: "No pods found"
				},
				{
					title: "Running",
					value: 0,
					subtitle: "0 running pods"
				},
				{
					title: "Ready",
					value: "0/0",
					subtitle: "0% ready"
				},
				{
					title: "Failed",
					value: 0,
					subtitle: "0 failed pods"
				}
			]
		}

		const totalPods = pods.length

		// Count pods by status/phase
		const runningPods = pods.filter(p => p.status === 'Running').length
		const failedPods = pods.filter(p => p.status === 'Failed').length

		// Count ready pods by parsing the ready field (e.g., "1/1", "0/1")
		const readyStats = pods.reduce((acc, pod) => {
			const [ready, total] = pod.ready.split('/').map(Number)
			return {
				ready: acc.ready + (ready || 0),
				total: acc.total + (total || 0)
			}
		}, { ready: 0, total: 0 })

		// Count restarts
		const totalRestarts = pods.reduce((sum, p) => sum + p.restarts, 0)

		return [
			{
				title: "Total Pods",
				value: totalPods,
				subtitle: `${runningPods}/${totalPods} running`,
				badge: getPodStatusBadge(runningPods, totalPods),
				icon: getResourceIcon("pods"),
				footer: totalPods > 0 ? "All pod resources in cluster" : "No pods found"
			},
			{
				title: "Running Pods",
				value: runningPods,
				subtitle: `${Math.round((runningPods / totalPods) * 100)}% running`,
				badge: getPodPhaseBadge(runningPods, totalPods, "Running"),
				footer: runningPods > 0 ? "Active and executing workloads" : "No running pods"
			},
			{
				title: "Ready Containers",
				value: `${readyStats.ready}/${readyStats.total}`,
				subtitle: readyStats.total > 0 ? `${Math.round((readyStats.ready / readyStats.total) * 100)}% ready` : "No containers",
				badge: getPodReadinessBadge(readyStats.ready, readyStats.total),
				footer: readyStats.ready > 0 ? "Containers accepting traffic" : "No ready containers"
			},
			{
				title: "Failed Pods",
				value: failedPods,
				subtitle: totalRestarts > 0 ? `${totalRestarts} total restarts` : "No restarts",
				badge: getPodPhaseBadge(failedPods, totalPods, "Failed"),
				footer: failedPods === 0 ? "All pods healthy" : "Some pods need attention"
			}
		]
	}, [pods])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [phaseFilter, setPhaseFilter] = React.useState<string>("all")

	const phaseOptions: FilterOption[] = React.useMemo(() => {
		const phases = Array.from(new Set(pods.map(p => p.status))).filter(Boolean).sort()
		return phases.map(ph => ({ value: ph, label: ph, badge: getStatusBadge(ph) }))
	}, [pods])

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return pods.filter(p => {
			const matchesQuery = !q || p.name.toLowerCase().includes(q) || p.namespace.toLowerCase().includes(q) || p.node.toLowerCase().includes(q)
			const matchesPhase = phaseFilter === 'all' || p.status === phaseFilter
			return matchesQuery && matchesPhase
		})
	}, [pods, globalFilter, phaseFilter])

	// Build table columns
	// IMPORTANT: use a function declaration (hoisted) so it's safe to reference above
	function getStatusBadge(status: string) {
		switch (status) {
			case 'Running':
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						{status}
					</Badge>
				)
			case 'Pending':
				return (
					<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
						<IconLoader className="size-3 text-yellow-600 mr-1" />
						{status}
					</Badge>
				)
			case 'CrashLoopBackOff':
			case 'Failed':
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

	const columns: ColumnDef<DashboardPod>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Pod',
			cell: ({ row }) => (
				<IfAllowed
					feature="pods.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedPodForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
		},
		{ accessorKey: 'namespace', header: 'Namespace', cell: ({ row }) => (<Badge variant="outline" className="text-muted-foreground px-1.5">{row.original.namespace}</Badge>) },
		{ accessorKey: 'node', header: 'Node' },
		{ accessorKey: 'status', header: 'Status', cell: ({ row }) => getStatusBadge(row.original.status) },
		{ accessorKey: 'ready', header: 'Ready', cell: ({ row }) => getReadyBadge(row.original.ready) },
		{ accessorKey: 'restarts', header: 'Restarts', cell: ({ row }) => (<div className="font-mono text-sm">{row.original.restarts}</div>) },
		{ accessorKey: 'age', header: 'Age', cell: ({ row }) => (<div className="font-mono text-sm">{row.original.age}</div>) },
		{ accessorKey: 'cpu', header: 'CPU', cell: ({ row }) => (<div className="font-mono text-sm">{row.original.cpu}</div>) },
		{ accessorKey: 'memory', header: 'Memory', cell: ({ row }) => (<div className="font-mono text-sm">{row.original.memory}</div>) },
		{ accessorKey: 'image', header: 'Image' },
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
						<IfAllowed feature="pods.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedPodForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="pods.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="Pod">
								<button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer" style={{ background: 'transparent', border: 'none', textAlign: 'left' }}>
									<IconEdit className="size-4" />
									Edit YAML
								</button>
							</ResourceYamlEditor>
						</IfAllowed>

						<IfAllowed feature="pods.logs" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconFileText className="size-4 mr-2" />Get Logs</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => {
								const ns = row.original.namespace
								const pod = row.original.name
								window.location.href = `/logs?namespace=${encodeURIComponent(ns)}&pod=${encodeURIComponent(pod)}&since=15m`
							}}>
								<IconFileText className="size-4 mr-2" />
								Get Logs
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="pods.exec" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTerminal className="size-4 mr-2" />Exec Shell</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => openShell(row.original.name, row.original.namespace)}>
								<IconTerminal className="size-4 mr-2" />
								Exec Shell
							</DropdownMenuItem>
						</IfAllowed>

						<IfAllowed feature="pods.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconRefresh className="size-4 mr-2" />Restart</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setPendingAction({ type: 'restart', pods: [row.original] }); setConfirmDialogOpen(true); validatePodsAction('restart', [row.original]) }}>
								<IconRefresh className="size-4 mr-2" />
								Restart
							</DropdownMenuItem>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="pods.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', pods: [row.original] }); setConfirmDialogOpen(true); validatePodsAction('delete', [row.original]) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId])

	// Bulk actions: preflight validate to show warnings in confirmation dialog
	const validatePodsAction = React.useCallback(async (type: 'delete' | 'restart', rows: DashboardPod[]) => {
		try {
			const targets = rows.map(r => ({ namespace: r.namespace, name: r.name }))
			const legacyAction = type === 'delete' ? 'delete-pods' : 'restart-pods'
			const resp = await bulkActionsApi.validateAction('pods', { action: legacyAction, targets })
			const details: any = resp?.details
			const warnings: string[] = Array.isArray(details?.results)
				? details.results.flatMap((r: any) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardPod[]) => void | Promise<void> }[] = []
		actions.push({ id: 'copy-names', label: 'Copy Pod Names', icon: <IconCopy className="size-4" />, requiresSelection: true, action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n')) })
		if (isAllowed('pods.logs')) actions.push({
			id: 'get-logs', label: 'Get Logs', icon: <IconFileText className="size-4" />, requiresSelection: true, action: (rows) => {
				const first = rows[0]
				if (!first) return
				const sameNS = rows.every(r => r.namespace === first.namespace)
				// If single selection, deep link to specific pod; else link by namespace
				if (rows.length === 1) {
					window.location.href = `/logs?namespace=${encodeURIComponent(first.namespace)}&pod=${encodeURIComponent(first.name)}&since=15m`
				} else if (sameNS) {
					window.location.href = `/logs?namespace=${encodeURIComponent(first.namespace)}&since=15m`
				} else {
					window.location.href = `/logs?since=15m`
				}
			}
		})
		if (isAllowed('pods.patch')) actions.push({ id: 'restart-pods', label: 'Restart Selected Pods', icon: <IconRefresh className="size-4" />, requiresSelection: true, action: (rows) => { setPendingAction({ type: 'restart', pods: rows }); setConfirmDialogOpen(true); validatePodsAction('restart', rows) } })
		if (isAllowed('pods.delete')) actions.push({ id: 'delete-pods', label: 'Delete Selected Pods', icon: <IconTrash className="size-4" />, variant: 'destructive', requiresSelection: true, action: (rows) => { setPendingAction({ type: 'delete', pods: rows }); setConfirmDialogOpen(true); validatePodsAction('delete', rows) } })
		return actions
	}, [isAllowed, validatePodsAction])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.pods.map(p => ({ namespace: p.namespace, name: p.name }))
			const legacyAction = pendingAction.type === 'delete' ? 'delete-pods' : 'restart-pods'
			const resp = await bulkActionsApi.executeBulkAction('pods', { action: legacyAction, targets })
			const success = resp?.success
			const total = resp?.resources_total ?? 0
			const affected = resp?.resources_affected ?? 0
			setAlert({ variant: success ? 'success' : 'error', title: success ? `Success: ${affected}/${total} pods processed` : `Errors: ${total - affected} failed`, description: resp?.message })
		} catch (e: any) {
			setAlert({ variant: 'error', title: 'Action failed', description: e?.message ?? String(e) })
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
								searchPlaceholder="Search pods by name, namespace, or node..."
								categoryFilter={phaseFilter}
								onCategoryFilterChange={setPhaseFilter}
								categoryLabel="Phase"
								categoryOptions={phaseOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({ id: a.id, label: a.label, icon: a.icon!, variant: a.variant as any, requiresSelection: a.requiresSelection, action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardPod)) }))}
								table={table as any}
								showColumnToggle={true}
							/>
						</div>
					)}
				/>
			</div>

			{selectedPodForDetails && (
				<PodDetailDrawer
					item={selectedPodForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedPodForDetails(null)
					}}
				/>
			)}

			{/* Bulk action confirmation dialog */}
			<ActionConfirmationDialog
				open={confirmDialogOpen}
				onOpenChange={setConfirmDialogOpen}
				title={pendingAction?.type === 'restart' ? 'Restart Pods' : 'Delete Pods'}
				description={pendingAction?.type === 'restart' ? 'Are you sure you want to restart the selected pods? This will terminate and recreate them.' : 'Are you sure you want to delete the selected pods? This action cannot be undone.'}
				actionLabel={pendingAction?.type === 'restart' ? 'Restart Pods' : 'Delete Pods'}
				variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.pods || []).map(p => ({ name: p.name, namespace: p.namespace }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
			/>
		</div>
	)
}

export function PodsPageContainer() {
	return (
		<RouteGuard
			requiredCapabilities={['pods.list']}
			requireAll={false}
		>
			<PodsContent />
		</RouteGuard>
	)
}
