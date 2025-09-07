"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useLoadBalancersWithWebSocket } from "@/hooks/useLoadBalancersWithWebSocket"
import {
	getReplicaStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconCopy, IconDownload, IconCircleCheckFilled, IconLoader, IconAlertTriangle, IconNetwork } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { LoadBalancer } from "@/lib/schemas/loadbalancer"
import { LoadBalancerDetailDrawer } from "@/components/viewers/LoadBalancerDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"

// Inner component that can access the namespace context
function LoadBalancersContent() {
	const { data: loadBalancers, loading: isLoading, error, isConnected } = useLoadBalancersWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['services.get', 'services.patch', 'services.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedLoadBalancerForDetails, setSelectedLoadBalancerForDetails] = React.useState<LoadBalancer | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', loadBalancers: LoadBalancer[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	React.useEffect(() => {
		fetchAdditional([
			'services.get',
			'services.patch',
			'services.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when load balancers change
	React.useEffect(() => {
		if (loadBalancers.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [loadBalancers])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	// Status badge helper for LoadBalancer services
	function getLoadBalancerStatusBadge(externalIP: string) {
		if (externalIP && externalIP !== '<none>' && externalIP !== '<pending>') {
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					Active
				</Badge>
			)
		} else if (externalIP === '<pending>') {
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-yellow-600 mr-1" />
					Pending
				</Badge>
			)
		} else {
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					No External IP
				</Badge>
			)
		}
	}

	// LoadBalancer type badge
	function getLoadBalancerTypeBadge() {
		return (
			<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
				<IconNetwork className="size-3 mr-1" />
				LoadBalancer
			</Badge>
		)
	}

	const statusOptions: FilterOption[] = React.useMemo(() => {
		const statuses = new Set<string>()
		loadBalancers.forEach(lb => {
			if (lb.externalIP && lb.externalIP !== '<none>' && lb.externalIP !== '<pending>') {
				statuses.add("Active")
			} else if (lb.externalIP === '<pending>') {
				statuses.add("Pending")
			} else {
				statuses.add("No External IP")
			}
		})
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: (() => {
				if (status === "Active") {
					return getLoadBalancerStatusBadge("active-ip")
				} else if (status === "Pending") {
					return getLoadBalancerStatusBadge("<pending>")
				} else {
					return getLoadBalancerStatusBadge("<none>")
				}
			})()
		}))
	}, [loadBalancers])

	const filtered = React.useMemo(() => {
		let filtered = loadBalancers

		// Apply category filter (status based on externalIP)
		if (statusFilter !== "all") {
			filtered = filtered.filter(lb => {
				if (statusFilter === "Active") {
					return lb.externalIP && lb.externalIP !== '<none>' && lb.externalIP !== '<pending>'
				} else if (statusFilter === "Pending") {
					return lb.externalIP === '<pending>'
				} else if (statusFilter === "No External IP") {
					return !lb.externalIP || lb.externalIP === '<none>'
				}
				return true
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(lb =>
				lb.name.toLowerCase().includes(searchTerm) ||
				lb.namespace.toLowerCase().includes(searchTerm) ||
				(lb.clusterIP && lb.clusterIP.toLowerCase().includes(searchTerm)) ||
				(lb.externalIP && lb.externalIP !== '<none>' && lb.externalIP !== '<pending>' && lb.externalIP.toLowerCase().includes(searchTerm)) ||
				(lb.ports && lb.ports.toLowerCase().includes(searchTerm)) ||
				lb.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [loadBalancers, statusFilter, globalFilter])

	// Bulk actions: preflight validate to show warnings in confirmation dialog
	const validateLoadBalancersAction = React.useCallback(async (type: 'delete', rows: LoadBalancer[]) => {
		try {
			const targets = rows.map(r => ({ namespace: r.namespace, name: r.name }))
			const resp = await bulkActionsApi.validateAction('services', { action: 'delete-services', targets })
			const details: unknown = resp?.details

			// Type-safe extraction of warnings
			let warnings: string[] = []
			if (details && typeof details === 'object' && 'results' in details) {
				const results = (details as { results: unknown }).results
				if (Array.isArray(results)) {
					warnings = results.flatMap((r: unknown) => {
						if (r && typeof r === 'object' && 'warnings' in r) {
							const itemWarnings = (r as { warnings: unknown }).warnings
							return Array.isArray(itemWarnings) ? itemWarnings : []
						}
						return []
					})
				}
			}

			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Build table columns
	const columns: ColumnDef<LoadBalancer>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Load Balancer Name',
			cell: ({ row }: { row: { original: LoadBalancer } }) => (
				<IfAllowed
					feature="services.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedLoadBalancerForDetails(row.original); setDetailDrawerOpen(true) }}
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
			cell: ({ row }: { row: { original: LoadBalancer } }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: 'type',
			header: 'Type',
			cell: () => getLoadBalancerTypeBadge(),
		},
		{
			accessorKey: 'status',
			header: 'Status',
			cell: ({ row }: { row: { original: LoadBalancer } }) => getLoadBalancerStatusBadge(row.original.externalIP),
		},
		{
			accessorKey: 'clusterIP',
			header: 'Cluster IP',
			cell: ({ row }: { row: { original: LoadBalancer } }) => (
				<div className="font-mono text-sm">{row.original.clusterIP}</div>
			),
		},
		{
			accessorKey: 'externalIP',
			header: 'External IP',
			cell: ({ row }: { row: { original: LoadBalancer } }) => (
				<div className="font-mono text-sm">{row.original.externalIP}</div>
			),
		},
		{
			accessorKey: 'ports',
			header: 'Ports',
			cell: ({ row }: { row: { original: LoadBalancer } }) => (
				<div className="font-mono text-sm">{row.original.ports}</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: LoadBalancer } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: LoadBalancer } }) => (
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
						<IfAllowed feature="services.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedLoadBalancerForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="services.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace={row.original.namespace}
								resourceKind="Service"
							>
								<button
									className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer"
									style={{ background: 'transparent', border: 'none', textAlign: 'left' }}
								>
									<IconEdit className="size-4" />
									Edit YAML
								</button>
							</ResourceYamlEditor>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="services.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', loadBalancers: [row.original] }); setConfirmDialogOpen(true); validateLoadBalancersAction('delete', [row.original]) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, setSelectedLoadBalancerForDetails, setDetailDrawerOpen, setPendingAction, setConfirmDialogOpen, validateLoadBalancersAction])

	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: LoadBalancer[]) => void | Promise<void> }[] = []

		if (isAllowed('services.get')) {
			actions.push({
				id: 'export-yaml',
				label: 'Export Selected as YAML',
				icon: <IconDownload className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					console.log('Export YAML for load balancers:', rows.map(s => s.name))
				},
			})
		}

		actions.push({
			id: 'copy-names',
			label: 'Copy Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				const names = rows.map(s => s.name).join('\n')
				navigator.clipboard.writeText(names)
			},
		})

		if (isAllowed('services.delete')) {
			actions.push({
				id: 'delete-loadbalancers',
				label: 'Delete Selected LoadBalancers',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					setPendingAction({ type: 'delete', loadBalancers: rows })
					setConfirmDialogOpen(true)
					validateLoadBalancersAction('delete', rows)
				},
			})
		}

		return actions
	}, [isAllowed, validateLoadBalancersAction, setPendingAction, setConfirmDialogOpen])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.loadBalancers.map(lb => ({ namespace: lb.namespace, name: lb.name }))
			const resp = await bulkActionsApi.executeBulkAction('services', { action: 'delete-services', targets })
			const success = resp?.success
			const total = resp?.resources_total ?? 0
			const affected = resp?.resources_affected ?? 0
			setAlert({ variant: success ? 'success' : 'error', title: success ? `Success: ${affected}/${total} load balancers processed` : `Errors: ${total - affected} failed`, description: resp?.message })
		} catch (e: unknown) {
			setAlert({ variant: 'error', title: 'Action failed', description: (e as Error)?.message ?? String(e) })
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction, setIsConfirmExecuting, setAlert, setConfirmDialogOpen, setPendingAction])

	// Generate summary cards from load balancer data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!loadBalancers || loadBalancers.length === 0) {
			return [
				{
					title: "Total Load Balancers",
					value: 0,
					subtitle: "No load balancers found"
				},
				{
					title: "Active Load Balancers",
					value: 0,
					subtitle: "With external IPs assigned"
				},
				{
					title: "Pending",
					value: 0,
					subtitle: "Waiting for external IP"
				},
				{
					title: "Namespaces",
					value: 0,
					subtitle: "No load balancers deployed"
				}
			]
		}

		const totalLoadBalancers = loadBalancers.length
		const activeLoadBalancers = loadBalancers.filter(lb =>
			lb.externalIP && lb.externalIP !== '<none>' && lb.externalIP !== '<pending>'
		).length
		const pendingLoadBalancers = loadBalancers.filter(lb =>
			lb.externalIP === '<pending>'
		).length
		const uniqueNamespaces = new Set(loadBalancers.map(lb => lb.namespace)).size

		// Calculate metrics for badges
		const activePercentage = totalLoadBalancers > 0 ? (activeLoadBalancers / totalLoadBalancers) * 100 : 0
		const pendingPercentage = totalLoadBalancers > 0 ? (pendingLoadBalancers / totalLoadBalancers) * 100 : 0

		return [
			{
				title: "Total Load Balancers",
				value: totalLoadBalancers,
				subtitle: `${totalLoadBalancers} load ${totalLoadBalancers === 1 ? 'balancer' : 'balancers'}`,
				badge: getReplicaStatusBadge(totalLoadBalancers, totalLoadBalancers),
				icon: getResourceIcon("loadbalancers"),
				footer: totalLoadBalancers > 0 ? "LoadBalancer type services" : "No load balancers found"
			},
			{
				title: "Active Load Balancers",
				value: activeLoadBalancers,
				subtitle: `${activePercentage.toFixed(0)}% with external IPs`,
				badge: getHealthTrendBadge(activePercentage, true),
				icon: getResourceIcon("loadbalancers"),
				footer: `${activeLoadBalancers} ${activeLoadBalancers === 1 ? 'load balancer' : 'load balancers'} ready to serve traffic`
			},
			{
				title: "Pending",
				value: pendingLoadBalancers,
				subtitle: `${pendingPercentage.toFixed(0)}% waiting for IP`,
				badge: getHealthTrendBadge(100 - pendingPercentage, true),
				icon: getResourceIcon("loadbalancers"),
				footer: `${pendingLoadBalancers} ${pendingLoadBalancers === 1 ? 'load balancer' : 'load balancers'} waiting for external IP assignment`
			},
			{
				title: "Namespaces",
				value: uniqueNamespaces,
				subtitle: `${uniqueNamespaces} unique ${uniqueNamespaces === 1 ? 'namespace' : 'namespaces'}`,
				badge: getReplicaStatusBadge(uniqueNamespaces, uniqueNamespaces),
				icon: getResourceIcon("loadbalancers"),
				footer: uniqueNamespaces > 0 ? "Namespaces with load balancers" : "No load balancers deployed"
			}
		]
	}, [loadBalancers])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Load Balancers</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor load balancer resources in your Kubernetes cluster
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
								searchPlaceholder="Search load balancers by name, namespace, IP, or ports..."
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
									variant: a.variant || 'default',
									requiresSelection: a.requiresSelection,
									action: () => {
										const selectedRows = table.getFilteredSelectedRowModel().rows
										const loadBalancers = selectedRows.map((row: { original: LoadBalancer }) => row.original)
										return a.action(loadBalancers)
									}
								}))}
								table={table}
								showColumnToggle={true}
							/>
						</div>
					)}
				/>
			</div>

			{selectedLoadBalancerForDetails && (
				<LoadBalancerDetailDrawer
					item={selectedLoadBalancerForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedLoadBalancerForDetails(null)
					}}
				/>
			)}

			{/* Bulk action confirmation dialog */}
			<ActionConfirmationDialog
				open={confirmDialogOpen}
				onOpenChange={setConfirmDialogOpen}
				title="Delete Load Balancers"
				description="Are you sure you want to delete the selected load balancers? This action cannot be undone."
				actionLabel="Delete Load Balancers"
				variant="destructive"
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.loadBalancers || []).map(lb => ({ name: lb.name, namespace: lb.namespace }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
			/>
		</div>
	)
}

export function LoadBalancersPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["services.list"]}>
			<LoadBalancersContent />
		</RouteGuard>
	)
}
