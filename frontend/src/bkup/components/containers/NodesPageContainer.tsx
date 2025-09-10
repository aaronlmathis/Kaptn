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
import {
	IconDotsVertical,
	IconEye,
	IconTrash,
	IconEdit,
	IconPlayerPause,
	IconDroplets,
	IconDownload,
	IconCopy,
	IconCircleCheckFilled,
	IconAlertTriangle
} from "@tabler/icons-react"
import { type ColumnDef, type Row } from "@/lib/table"
import type { NodeTableRow } from "@/lib/k8s-cluster"
import { NodeDetailDrawer } from "@/components/viewers/NodeDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useNodesWithWebSocket } from "@/hooks/useNodesWithWebSocket"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import {
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"
import { LiveDataStatusBadge } from "@/components/badges/LiveDataStatus"
import { k8sService } from "@/lib/k8s-service"

// Inner component that can access the namespace context
function NodesContent() {
	const { data: nodes, loading: isLoading, error, isConnected } = useNodesWithWebSocket(true)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['nodes.get', 'nodes.patch', 'nodes.update'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedNodeForDetails, setSelectedNodeForDetails] = React.useState<NodeTableRow | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete' | 'cordon' | 'drain', nodes: NodeTableRow[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Ensure node-specific action capabilities are requested (cluster-scoped)
	React.useEffect(() => {
		fetchAdditional([
			'nodes.get',
			'nodes.patch',
			'nodes.update',
			'nodes.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Generate summary cards from node data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!nodes || nodes.length === 0) {
			return [
				{
					title: "Total Nodes",
					value: 0,
					subtitle: "No nodes found"
				},
				{
					title: "Ready Nodes",
					value: 0,
					subtitle: "0/0 ready"
				},
				{
					title: "Control Plane",
					value: 0,
					subtitle: "0 control plane nodes"
				},
				{
					title: "Worker Nodes",
					value: 0,
					subtitle: "0 worker nodes"
				}
			]
		}

		const totalNodes = nodes.length

		// Count nodes by status
		const readyNodes = nodes.filter(n => n.status === 'Ready').length
		const cordonedNodes = nodes.filter(n => n.status === 'SchedulingDisabled').length

		// Count nodes by role
		const controlPlaneNodes = nodes.filter(n =>
			n.roles.includes('control-plane') ||
			n.roles.includes('master')
		).length
		const workerNodes = totalNodes - controlPlaneNodes

		// Calculate health percentage
		const healthPercentage = totalNodes > 0 ? (readyNodes / totalNodes) * 100 : 0

		return [
			{
				title: "Total Nodes",
				value: totalNodes,
				subtitle: `${readyNodes}/${totalNodes} ready`,
				badge: getHealthTrendBadge(healthPercentage),
				icon: getResourceIcon("nodes"),
				footer: totalNodes > 0 ? "All cluster nodes" : "No nodes found"
			},
			{
				title: "Ready Nodes",
				value: readyNodes,
				subtitle: `${Math.round(healthPercentage)}% healthy`,
				badge: getHealthTrendBadge(healthPercentage),
				footer: readyNodes > 0 ? "Available for scheduling" : "No ready nodes"
			},
			{
				title: "Control Plane",
				value: controlPlaneNodes,
				subtitle: `${controlPlaneNodes} management nodes`,
				badge: getHealthTrendBadge(controlPlaneNodes > 0 ? 100 : 0),
				footer: controlPlaneNodes > 0 ? "Cluster management nodes" : "No control plane nodes"
			},
			{
				title: "Worker Nodes",
				value: workerNodes,
				subtitle: cordonedNodes > 0 ? `${cordonedNodes} cordoned` : "All available",
				badge: getHealthTrendBadge(workerNodes > 0 ? ((workerNodes - cordonedNodes) / workerNodes) * 100 : 0),
				footer: workerNodes > 0 ? "Application workload nodes" : "No worker nodes"
			}
		]
	}, [nodes])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	// Status badge helper
	function getNodeStatusBadge(status: string) {
		switch (status.toLowerCase()) {
			case "ready":
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						Ready
					</Badge>
				)
			case "notready":
			case "not ready":
				return (
					<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
						<IconAlertTriangle className="size-3 text-red-600 mr-1" />
						Not Ready
					</Badge>
				)
			case "schedulingdisabled":
			case "scheduling disabled":
				return (
					<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
						<IconPlayerPause className="size-3 text-yellow-600 mr-1" />
						Cordoned
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

	const statusOptions: FilterOption[] = React.useMemo(() => {
		const statuses = Array.from(new Set(nodes.map(n => n.status))).filter(Boolean).sort()
		return statuses.map(status => ({ value: status, label: status, badge: getNodeStatusBadge(status) }))
	}, [nodes])

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return nodes.filter(n => {
			const matchesQuery = !q || n.name.toLowerCase().includes(q) || n.status.toLowerCase().includes(q) || (n.roles && n.roles.toLowerCase().includes(q)) || (n.version && n.version.toLowerCase().includes(q)) || n.age.toLowerCase().includes(q)
			const matchesStatus = statusFilter === 'all' || n.status === statusFilter
			return matchesQuery && matchesStatus
		})
	}, [nodes, globalFilter, statusFilter])

	// Build table columns
	const columns: ColumnDef<NodeTableRow>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Node Name',
			cell: ({ row }: { row: Row<NodeTableRow> }) => (
				<IfAllowed
					feature="nodes.get"
					cluster={clusterId}
					namespace=""
					resourceName={row.original.name}
					fallback={<span className="font-medium">{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedNodeForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none font-medium"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
		},
		{ accessorKey: 'status', header: 'Status', cell: ({ row }: { row: Row<NodeTableRow> }) => getNodeStatusBadge(row.original.status) },
		{ accessorKey: 'roles', header: 'Roles', cell: ({ row }: { row: Row<NodeTableRow> }) => (<div className="text-sm">{row.original.roles || "worker"}</div>) },
		{ accessorKey: 'age', header: 'Age', cell: ({ row }: { row: Row<NodeTableRow> }) => (<div className="font-mono text-sm">{row.original.age}</div>) },
		{ accessorKey: 'version', header: 'Kubernetes Version', cell: ({ row }: { row: Row<NodeTableRow> }) => (<div className="font-mono text-sm">{row.original.version}</div>) },
		{
			id: 'actions',
			cell: ({ row }: { row: Row<NodeTableRow> }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="data-[state=open]:bg-muted text-muted-foreground flex size-8">
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed feature="nodes.get" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedNodeForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="nodes.patch" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace="" resourceKind="Node">
								<button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer" style={{ background: 'transparent', border: 'none', textAlign: 'left' }}>
									<IconEdit className="size-4" />
									Edit YAML
								</button>
							</ResourceYamlEditor>
						</IfAllowed>
						<IfAllowed feature="nodes.update" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconPlayerPause className="size-4 mr-2" />Cordon</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setPendingAction({ type: 'cordon', nodes: [row.original] }); setConfirmDialogOpen(true); setConfirmWarnings([]) }}>
								<IconPlayerPause className="size-4 mr-2" />
								Cordon
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="nodes.update" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconDroplets className="size-4 mr-2" />Drain</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setPendingAction({ type: 'drain', nodes: [row.original] }); setConfirmDialogOpen(true); setConfirmWarnings([]) }}>
								<IconDroplets className="size-4 mr-2" />
								Drain
							</DropdownMenuItem>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="nodes.update" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', nodes: [row.original] }); setConfirmDialogOpen(true); setConfirmWarnings([]) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId])

	// Bulk actions
	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: NodeTableRow[]) => void | Promise<void> }[] = []
		actions.push({ id: 'copy-names', label: 'Copy Node Names', icon: <IconCopy className="size-4" />, requiresSelection: true, action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n')) })
		actions.push({ id: 'export-yaml', label: 'Export Selected as YAML', icon: <IconDownload className="size-4" />, requiresSelection: true, action: (rows) => console.log('Export YAML for nodes:', rows.map(n => n.name)) })
		if (isAllowed('nodes.update')) actions.push({ id: 'cordon-nodes', label: 'Cordon Selected Nodes', icon: <IconPlayerPause className="size-4" />, requiresSelection: true, action: (rows) => { setPendingAction({ type: 'cordon', nodes: rows }); setConfirmDialogOpen(true); setConfirmWarnings([]) } })
		if (isAllowed('nodes.update')) actions.push({ id: 'drain-nodes', label: 'Drain Selected Nodes', icon: <IconDroplets className="size-4" />, variant: 'destructive', requiresSelection: true, action: (rows) => { setPendingAction({ type: 'drain', nodes: rows }); setConfirmDialogOpen(true); setConfirmWarnings([]) } })
		return actions
	}, [isAllowed])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			let success = false
			let affected = 0
			const total = pendingAction.nodes.length

			if (pendingAction.type === 'cordon') {
				for (const node of pendingAction.nodes) {
					try {
						const result = await k8sService.cordonNode(node.name)
						if (result.success) affected++
					} catch (e) {
						console.error('Failed to cordon node:', node.name, e)
					}
				}
				success = affected > 0
			} else if (pendingAction.type === 'drain') {
				for (const node of pendingAction.nodes) {
					try {
						await k8sService.drainNode(node.name)
						affected++
					} catch (e) {
						console.error('Failed to drain node:', node.name, e)
					}
				}
				success = affected > 0
			} else if (pendingAction.type === 'delete') {
				// Note: Node deletion is typically handled via bulk API
				const targets = pendingAction.nodes.map(n => ({ namespace: '', name: n.name }))
				const resp = await bulkActionsApi.executeBulkAction('nodes', { action: 'delete-nodes', targets })
				success = resp?.success
				affected = resp?.resources_affected ?? 0
			}

			setAlert({
				variant: success ? 'success' : 'error',
				title: success ? `Success: ${affected}/${total} nodes processed` : `Errors: ${total - affected} failed`
			})
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
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Nodes</h1>
						</div>
						<p className="text-muted-foreground">
							Manage and monitor nodes in your Kubernetes cluster
						</p>
					</div>
					<LiveDataStatusBadge isConnected={isConnected} />
				</div>
			</div>

			{/* Summary Cards */}
			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
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
								searchPlaceholder="Search nodes by name, status, role, or version..."
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
									variant: a.variant,
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: Row<NodeTableRow>) => r.original))
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
				title={pendingAction?.type === 'cordon' ? 'Cordon Nodes' : pendingAction?.type === 'drain' ? 'Drain Nodes' : 'Delete Nodes'}
				description={pendingAction?.type === 'cordon' ? 'Are you sure you want to cordon the selected nodes? This will prevent new pods from being scheduled on them.' : pendingAction?.type === 'drain' ? 'Are you sure you want to drain the selected nodes? This will evict all pods and cordon the nodes.' : 'Are you sure you want to delete the selected nodes? This action cannot be undone.'}
				actionLabel={pendingAction?.type === 'cordon' ? 'Cordon Nodes' : pendingAction?.type === 'drain' ? 'Drain Nodes' : 'Delete Nodes'}
				variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.nodes || []).map(n => ({ name: n.name, namespace: '' }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
			/>

			{selectedNodeForDetails && (
				<NodeDetailDrawer
					item={selectedNodeForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedNodeForDetails(null)
					}}
				/>
			)}
		</div>
	)
}

export function NodesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["nodes.list"]} requireAll={false}>
			<NodesContent />
		</RouteGuard>
	)
}
