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
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconRefresh, IconScale, IconCircleCheckFilled, IconLoader, IconCopy, IconDownload } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { DashboardStatefulSet } from "@/lib/k8s-workloads"
import { StatefulSetDetailDrawer } from "@/components/viewers/StatefulSetDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useStatefulSetsWithWebSocket } from "@/hooks/useStatefulSetsWithWebSocket"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import {
    getReplicaStatusBadge,
    getUpdateStatusBadge,
    getResourceIcon,
    getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function StatefulSetsContent() {
    const { data: statefulSets, loading: isLoading, error, isConnected } = useStatefulSetsWithWebSocket(true)
    const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
    const { fetchAdditional } = useCapabilities()
    const { clusterId } = useCluster()
    const { isAllowed } = useAuthzCapabilitiesInContext(['statefulsets.get', 'statefulsets.patch', 'statefulsets.delete', 'statefulsets.scale.update'])
    const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
    const [selectedStatefulSetForDetails, setSelectedStatefulSetForDetails] = React.useState<DashboardStatefulSet | null>(null)
    const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
    const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
    const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
    const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete'|'restart'|'scale', statefulSets: DashboardStatefulSet[] }>(null)
    const [alert, setAlert] = React.useState<null | { variant: 'success'|'error', title: string, description?: string }>(null)

    React.useEffect(() => {
        fetchAdditional([
            'statefulsets.get',
            'statefulsets.patch',
            'statefulsets.delete',
            'statefulsets.scale.update',
        ]).catch(() => { /* noop */ })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

	// Update lastUpdated when statefulSets change
	React.useEffect(() => {
		if (statefulSets.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [statefulSets])

	// Generate summary cards from statefulset data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!statefulSets || statefulSets.length === 0) {
			return [
				{
					title: "Total StatefulSets",
					value: 0,
					subtitle: "No statefulsets found"
				},
				{
					title: "Ready",
					value: 0,
					subtitle: "0/0 ready"
				},
				{
					title: "Current",
					value: 0,
					subtitle: "0 current replicas"
				},
				{
					title: "Updated",
					value: 0,
					subtitle: "0 updated replicas"
				}
			]
		}

		const totalStatefulSets = statefulSets.length

		// Calculate ready statefulsets (where ready fraction equals expected)
		const readyStatefulSets = statefulSets.filter(ss => {
			const [ready, total] = ss.ready.split('/').map(Number)
			return ready === total && total > 0
		}).length

		// Calculate total replica stats
		const totalCurrent = statefulSets.reduce((sum, ss) => sum + ss.current, 0)
		const totalUpdated = statefulSets.reduce((sum, ss) => sum + ss.updated, 0)
		const totalReady = statefulSets.reduce((sum, ss) => {
			const [ready] = ss.ready.split('/').map(Number)
			return sum + (ready || 0)
		}, 0)
		const totalDesired = statefulSets.reduce((sum, ss) => {
			const [, total] = ss.ready.split('/').map(Number)
			return sum + (total || 0)
		}, 0)

		return [
			{
				title: "Total StatefulSets",
				value: totalStatefulSets,
				subtitle: `${readyStatefulSets}/${totalStatefulSets} ready`,
				badge: getReplicaStatusBadge(readyStatefulSets, totalStatefulSets),
				icon: getResourceIcon("statefulsets"),
				footer: totalStatefulSets > 0 ? "All statefulset resources in cluster" : "No statefulsets found"
			},
			{
				title: "Ready Replicas",
				value: `${totalReady}/${totalDesired}`,
				subtitle: totalDesired > 0 ? `${Math.round((totalReady / totalDesired) * 100)}% ready` : "No replicas",
				badge: getReplicaStatusBadge(totalReady, totalDesired),
				footer: totalDesired > 0 ? "Pod instances across all statefulsets" : "No pod replicas"
			},
			{
				title: "Current",
				value: totalCurrent,
				subtitle: `${totalCurrent} current replicas`,
				badge: getHealthTrendBadge(totalDesired > 0 ? (totalCurrent / totalDesired) * 100 : 0),
				footer: totalCurrent > 0 ? "Currently running replicas" : "No current replicas"
			},
			{
				title: "Updated",
				value: totalUpdated,
				subtitle: `${totalUpdated} updated replicas`,
				badge: getUpdateStatusBadge(totalUpdated, totalDesired),
				footer: totalUpdated > 0 ? "Replicas with latest configuration" : "No updated replicas"
			}
		]
	}, [statefulSets])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	const statusOptions: FilterOption[] = React.useMemo(() => {
		const statuses = Array.from(new Set(statefulSets.map(ss => {
			const [ready, total] = ss.ready.split('/').map(Number)
			return ready === total && total > 0 ? "Ready" : "Not Ready"
		}))).sort()
		return statuses.map(status => ({ 
			value: status, 
			label: status, 
			badge: getStatusBadge(status) 
		}))
	}, [statefulSets])

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return statefulSets.filter(ss => {
			const matchesQuery = !q || ss.name.toLowerCase().includes(q) || ss.namespace.toLowerCase().includes(q) || ss.serviceName.toLowerCase().includes(q) || ss.updateStrategy.toLowerCase().includes(q)
			if (statusFilter === 'all') return matchesQuery
			const [ready, total] = ss.ready.split('/').map(Number)
			const isReady = ready === total && total > 0
			const ssStatus = isReady ? "Ready" : "Not Ready"
			return matchesQuery && ssStatus === statusFilter
		})
	}, [statefulSets, globalFilter, statusFilter])

    // Status badge helper functions
    function getStatusBadge(status: string) {
        switch (status) {
            case 'Ready':
                return (
                    <Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
                        <IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
                        {status}
                    </Badge>
                )
            case 'Not Ready':
                return (
                    <Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
                        <IconLoader className="size-3 text-yellow-600 mr-1" />
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
        
        if (isReady) {
            return (
                <Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
                    <IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
                    {ready}
                </Badge>
            )
        } else {
            return (
                <Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
                    <IconLoader className="size-3 text-yellow-600 mr-1" />
                    {ready}
                </Badge>
            )
        }
    }

    // Bulk actions: preflight validate to show warnings in confirmation dialog
    const validateStatefulSetsAction = React.useCallback(async (type: 'delete'|'restart'|'scale', rows: DashboardStatefulSet[]) => {
        try {
            const targets = rows.map(r => ({ namespace: r.namespace, name: r.name }))
            const legacyAction = type === 'delete' ? 'delete-statefulsets' : type === 'restart' ? 'restart-statefulsets' : 'scale-statefulsets'
            const resp = await bulkActionsApi.validateAction('statefulsets', { action: legacyAction, targets })
            const details: unknown = resp?.details
            const warnings: string[] = Array.isArray((details as Record<string, unknown>)?.results)
                ? ((details as Record<string, unknown>).results as unknown[]).flatMap((r: unknown) => {
                    const warnings = (r as Record<string, unknown>)?.warnings
                    return Array.isArray(warnings) ? warnings.filter((w): w is string => typeof w === 'string') : []
                  })
                : []
            setConfirmWarnings(warnings)
        } catch {
            setConfirmWarnings([])
        }
    }, [])

    // Build table columns
    const columns: ColumnDef<DashboardStatefulSet>[] = React.useMemo(() => ([
        {
            accessorKey: 'name',
            header: 'StatefulSet Name',
            cell: ({ row }) => (
                <IfAllowed
                    feature="statefulsets.get"
                    cluster={clusterId}
                    namespace={row.original.namespace}
                    resourceName={row.original.name}
                    fallback={<span>{row.original.name}</span>}
                >
                    <button
                        onClick={() => { setSelectedStatefulSetForDetails(row.original); setDetailDrawerOpen(true) }}
                        className="text-left hover:underline focus:underline focus:outline-none"
                    >
                        {row.original.name}
                    </button>
                </IfAllowed>
            ),
        },
        { accessorKey: 'namespace', header: 'Namespace', cell: ({ row }) => (<Badge variant="outline" className="text-muted-foreground px-1.5">{row.original.namespace}</Badge>) },
        { accessorKey: 'ready', header: 'Ready', cell: ({ row }) => getReadyBadge(row.original.ready) },
        { accessorKey: 'current', header: 'Current', cell: ({ row }) => (<div className="font-mono text-sm">{row.original.current}</div>) },
        { accessorKey: 'updated', header: 'Updated', cell: ({ row }) => (<div className="font-mono text-sm">{row.original.updated}</div>) },
        { accessorKey: 'serviceName', header: 'Service Name' },
        { accessorKey: 'updateStrategy', header: 'Update Strategy', cell: ({ row }) => (<Badge variant="outline" className="text-muted-foreground px-1.5">{row.original.updateStrategy}</Badge>) },
        { accessorKey: 'age', header: 'Age', cell: ({ row }) => (<div className="font-mono text-sm">{row.original.age}</div>) },
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
                        <IfAllowed feature="statefulsets.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
                            fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
                        >
                            <DropdownMenuItem onClick={() => { setSelectedStatefulSetForDetails(row.original); setDetailDrawerOpen(true) }}>
                                <IconEye className="size-4 mr-2" />
                                View Details
                            </DropdownMenuItem>
                        </IfAllowed>
                        <IfAllowed feature="statefulsets.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
                            fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
                        >
                            <ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="StatefulSet">
                                <button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer" style={{ background: 'transparent', border: 'none', textAlign: 'left' }}>
                                    <IconEdit className="size-4" />
                                    Edit YAML
                                </button>
                            </ResourceYamlEditor>
                        </IfAllowed>
                        <IfAllowed feature="statefulsets.scale.update" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
                            fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconScale className="size-4 mr-2" />Scale</DropdownMenuItem>}
                        >
                            <DropdownMenuItem onClick={() => console.log('Scale', row.original.name)}>
                                <IconScale className="size-4 mr-2" />
                                Scale
                            </DropdownMenuItem>
                        </IfAllowed>
                        <IfAllowed feature="statefulsets.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
                            fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconRefresh className="size-4 mr-2" />Restart</DropdownMenuItem>}
                        >
                            <DropdownMenuItem onClick={() => { setPendingAction({ type: 'restart', statefulSets: [row.original] }); setConfirmDialogOpen(true); validateStatefulSetsAction('restart', [row.original]) }}>
                                <IconRefresh className="size-4 mr-2" />
                                Restart
                            </DropdownMenuItem>
                        </IfAllowed>
                        <DropdownMenuSeparator />
                        <IfAllowed feature="statefulsets.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
                            fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
                        >
                            <DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', statefulSets: [row.original] }); setConfirmDialogOpen(true); validateStatefulSetsAction('delete', [row.original]) }}>
                                <IconTrash className="size-4 mr-2" />
                                Delete
                            </DropdownMenuItem>
                        </IfAllowed>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        }
    ]), [clusterId, validateStatefulSetsAction])

    const bulkActions = React.useMemo(() => {
        const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardStatefulSet[]) => void | Promise<void> }[] = []
        actions.push({ id: 'copy-names', label: 'Copy StatefulSet Names', icon: <IconCopy className="size-4" />, requiresSelection: true, action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n')) })
        if (isAllowed('statefulsets.get')) actions.push({ id: 'export-yaml', label: 'Export Selected as YAML', icon: <IconDownload className="size-4" />, requiresSelection: true, action: (rows) => console.log('Export YAML for StatefulSets:', rows.map(ss => ss.name)) })
        if (isAllowed('statefulsets.scale.update')) actions.push({ id: 'scale-statefulsets', label: 'Scale Selected StatefulSets', icon: <IconScale className="size-4" />, requiresSelection: true, action: (rows) => { setPendingAction({ type: 'scale', statefulSets: rows }); setConfirmDialogOpen(true); validateStatefulSetsAction('scale', rows) } })
        if (isAllowed('statefulsets.patch')) actions.push({ id: 'restart-statefulsets', label: 'Restart Selected StatefulSets', icon: <IconRefresh className="size-4" />, requiresSelection: true, action: (rows) => { setPendingAction({ type: 'restart', statefulSets: rows }); setConfirmDialogOpen(true); validateStatefulSetsAction('restart', rows) } })
        if (isAllowed('statefulsets.delete')) actions.push({ id: 'delete-statefulsets', label: 'Delete Selected StatefulSets', icon: <IconTrash className="size-4" />, variant: 'destructive', requiresSelection: true, action: (rows) => { setPendingAction({ type: 'delete', statefulSets: rows }); setConfirmDialogOpen(true); validateStatefulSetsAction('delete', rows) } })
        return actions
    }, [isAllowed, validateStatefulSetsAction])

    const handleConfirmAction = React.useCallback(async () => {
        if (!pendingAction) return
        setIsConfirmExecuting(true)
        try {
            const targets = pendingAction.statefulSets.map(ss => ({ namespace: ss.namespace, name: ss.name }))
            const legacyAction = pendingAction.type === 'delete' ? 'delete-statefulsets' : pendingAction.type === 'restart' ? 'restart-statefulsets' : 'scale-statefulsets'
            const resp = await bulkActionsApi.executeBulkAction('statefulsets', { action: legacyAction, targets })
            const success = resp?.success
            const total = resp?.resources_total ?? 0
            const affected = resp?.resources_affected ?? 0
            setAlert({ variant: success ? 'success' : 'error', title: success ? `Success: ${affected}/${total} statefulsets processed` : `Errors: ${total - affected} failed`, description: resp?.message })
        } catch (e: unknown) {
            setAlert({ variant: 'error', title: 'Action failed', description: (e as Error)?.message ?? String(e) })
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
							<h1 className="text-2xl font-bold tracking-tight">Stateful Sets</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor stateful sets resources in your Kubernetes cluster
						</p>
					</div>
					{lastUpdated && (
						<div className="text-sm text-muted-foreground">
							<span suppressHydrationWarning>Last updated: {new Date(lastUpdated).toLocaleTimeString()}</span>
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
								searchPlaceholder="Search StatefulSets by name, namespace, service name, or update strategy..."
								categoryFilter={statusFilter}
								onCategoryFilterChange={setStatusFilter}
								categoryLabel="Filter by status"
								categoryOptions={statusOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({ id: a.id, label: a.label, icon: a.icon || undefined, variant: a.variant || 'default', requiresSelection: a.requiresSelection, action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardStatefulSet)) }))}
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
				title={pendingAction?.type === 'restart' ? 'Restart StatefulSets' : pendingAction?.type === 'scale' ? 'Scale StatefulSets' : 'Delete StatefulSets'}
				description={pendingAction?.type === 'restart' ? 'Are you sure you want to restart the selected statefulsets? This will terminate and recreate them.' : pendingAction?.type === 'scale' ? 'Are you sure you want to scale the selected statefulsets?' : 'Are you sure you want to delete the selected statefulsets? This action cannot be undone.'}
				actionLabel={pendingAction?.type === 'restart' ? 'Restart StatefulSets' : pendingAction?.type === 'scale' ? 'Scale StatefulSets' : 'Delete StatefulSets'}
				variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.statefulSets || []).map(ss => ({ name: ss.name, namespace: ss.namespace }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
			/>

			{selectedStatefulSetForDetails && (
				<StatefulSetDetailDrawer
					statefulSet={selectedStatefulSetForDetails}
					open={detailDrawerOpen}
					onClose={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedStatefulSetForDetails(null)
					}}
				/>
			)}
		</div>
	)
}

export function StatefulSetsPageContainer() {
    return (
        <RouteGuard requiredCapabilities={["statefulsets.list"]}>
            <StatefulSetsContent />
        </RouteGuard>
    )
}
