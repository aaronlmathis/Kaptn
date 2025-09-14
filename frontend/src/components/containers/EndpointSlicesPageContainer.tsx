"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useEndpointSlicesWithWebSocket } from "@/hooks/useEndpointSlicesWithWebSocket"
import {
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconDownload, IconCopy, IconNetwork, IconCircleCheckFilled, IconLoader, IconAlertTriangle } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { type DashboardEndpointSlice } from "@/lib/k8s-services"
import { EndpointSliceDetailDrawer } from "@/components/viewers/EndpointSliceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Inner component that can access the namespace context
function EndpointSlicesContent() {
	const { data: endpointSlices, loading: isLoading, error, isConnected } = useEndpointSlicesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext([
		'endpointslices.get', 'endpointslices.patch', 'endpointslices.delete'
	])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedEndpointSliceForDetails, setSelectedEndpointSliceForDetails] = React.useState<DashboardEndpointSlice | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', endpointSlices: DashboardEndpointSlice[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	React.useEffect(() => {
		fetchAdditional([
			'endpointslices.get',
			'endpointslices.patch',
			'endpointslices.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when endpointSlices change
	React.useEffect(() => {
		if (endpointSlices && endpointSlices.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [endpointSlices])

	// Calculate summary data for cards (preserving original logic)
	const totalEndpointSlices = endpointSlices?.length || 0
	const totalEndpoints = endpointSlices?.reduce((sum, slice) => sum + slice.endpoints, 0) || 0
	const totalReady = endpointSlices?.reduce((sum, slice) => sum + slice.readyCount, 0) || 0
	const totalNotReady = endpointSlices?.reduce((sum, slice) => sum + slice.notReadyCount, 0) || 0

	// Health metrics
	const healthySlices = endpointSlices?.filter(slice => slice.readyCount > 0).length || 0
	const healthPercentage = totalEndpointSlices > 0 ? Math.round((healthySlices / totalEndpointSlices) * 100) : 0

	// Address type distribution
	const ipv4Slices = endpointSlices?.filter(slice => slice.addressType === 'IPv4').length || 0
	const ipv6Slices = endpointSlices?.filter(slice => slice.addressType === 'IPv6').length || 0
	const fqdnSlices = endpointSlices?.filter(slice => slice.addressType === 'FQDN').length || 0

	const summaryCards: SummaryCard[] = [
		{
			title: "Total EndpointSlices",
			value: totalEndpointSlices.toString(),
			subtitle: "Active endpoint slices",
			icon: getResourceIcon("endpointslices"),
			badge: getHealthTrendBadge(healthPercentage),
		},
		{
			title: "Total Endpoints",
			value: totalEndpoints.toString(),
			subtitle: `${totalReady} ready, ${totalNotReady} not ready`,
			icon: getResourceIcon("endpointslices"),
			badge: getHealthTrendBadge(totalEndpoints > 0 ? Math.round((totalReady / totalEndpoints) * 100) : 0),
		},
		{
			title: "Healthy Slices",
			value: `${healthySlices}/${totalEndpointSlices}`,
			subtitle: `${healthPercentage}% with ready endpoints`,
			icon: getResourceIcon("endpointslices"),
			badge: getHealthTrendBadge(healthPercentage),
		},
		{
			title: "Address Types",
			value: `IPv4: ${ipv4Slices}`,
			subtitle: `IPv6: ${ipv6Slices}, FQDN: ${fqdnSlices}`,
			icon: getResourceIcon("endpointslices"),
		},
	]

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	// Filter options based on address type (matching original EndpointSlicesDataTable)
	const statusOptions: FilterOption[] = React.useMemo(() => {
		const types = new Set(endpointSlices?.map(slice => slice.addressType).filter(type => type && type.trim() !== "") || [])
		return Array.from(types).sort().map(type => ({
			value: type,
			label: type,
			badge: (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					{type}
				</Badge>
			)
		}))
	}, [endpointSlices])

	// Filter data based on global filter and status filter
	const filtered = React.useMemo(() => {
		let filteredData = endpointSlices || []

		// Apply status filter (address type)
		if (statusFilter !== "all") {
			filteredData = filteredData.filter(slice => slice.addressType === statusFilter)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filteredData = filteredData.filter(slice =>
				slice.name.toLowerCase().includes(searchTerm) ||
				slice.namespace.toLowerCase().includes(searchTerm) ||
				(slice.addressType && slice.addressType.toLowerCase().includes(searchTerm)) ||
				slice.ready.toLowerCase().includes(searchTerm) ||
				(slice.addressesDisplay && slice.addressesDisplay.toLowerCase().includes(searchTerm)) ||
				slice.age.toLowerCase().includes(searchTerm)
			)
		}

		return filteredData
	}, [endpointSlices, statusFilter, globalFilter])

	// Status badge helper for ready status (matching original EndpointSlicesDataTable)
	function getReadyBadge(ready: string, readyCount: number, totalCount: number) {
		const isAllReady = readyCount === totalCount && totalCount > 0
		const hasReady = readyCount > 0

		if (isAllReady) {
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					{ready}
				</Badge>
			)
		} else if (hasReady) {
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-yellow-600 mr-1" />
					{ready}
				</Badge>
			)
		} else {
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					{ready}
				</Badge>
			)
		}
	}

	// Build table columns
	const columns: ColumnDef<DashboardEndpointSlice>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Name',
			cell: ({ row }) => (
				<IfAllowed
					feature="endpointslices.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedEndpointSliceForDetails(row.original); setDetailDrawerOpen(true) }}
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
			cell: ({ row }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: 'addressType',
			header: 'Address Type',
			cell: ({ row }) => (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					{row.original.addressType}
				</Badge>
			),
		},
		{
			accessorKey: 'ready',
			header: 'Ready',
			cell: ({ row }) => getReadyBadge(row.original.ready, row.original.readyCount, row.original.endpoints),
		},
		{
			accessorKey: 'endpoints',
			header: 'Endpoints',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.endpoints}</div>
			),
		},
		{
			accessorKey: 'ports',
			header: 'Ports',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.ports}</div>
			),
		},
		{
			accessorKey: 'addressesDisplay',
			header: 'Addresses',
			cell: ({ row }) => (
				<div className="font-mono text-sm truncate max-w-48" title={row.original.addresses?.join(", ") || "No addresses"}>
					{row.original.addressesDisplay}
				</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
						>
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed
							feature="endpointslices.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedEndpointSliceForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>

						<IfAllowed
							feature="endpointslices.patch"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace={row.original.namespace}
								resourceKind="EndpointSlice"
							>
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
								>
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							</ResourceYamlEditor>
						</IfAllowed>

						<DropdownMenuSeparator />

						<IfAllowed
							feature="endpointslices.delete"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem
								className="text-red-600"
								onClick={() => {
									setPendingAction({ type: 'delete', endpointSlices: [row.original] });
									setConfirmDialogOpen(true)
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
	]), [clusterId])

	// Bulk actions (preserving original EndpointSlicesDataTable actions)
	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardEndpointSlice[]) => void | Promise<void> }[] = []

		if (isAllowed('endpointslices.get')) {
			actions.push({
				id: "export-yaml",
				label: "Export Selected as YAML",
				icon: <IconDownload className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					console.log('Export YAML for endpoint slices:', rows.map(slice => slice.name))
				}
			})
		}

		actions.push({
			id: "copy-names",
			label: "Copy EndpointSlice Names",
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				const names = rows.map(slice => slice.name).join('\n')
				navigator.clipboard.writeText(names)
			}
		})

		actions.push({
			id: "monitor-endpoints",
			label: "Monitor Selected Endpoints",
			icon: <IconNetwork className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				console.log('Monitor endpoints for slices:', rows.map(slice => `${slice.name} in ${slice.namespace}`))
			}
		})

		if (isAllowed('endpointslices.delete')) {
			actions.push({
				id: "delete-endpointslices",
				label: "Delete Selected EndpointSlices",
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					setPendingAction({ type: 'delete', endpointSlices: rows })
					setConfirmDialogOpen(true)
				}
			})
		}

		return actions
	}, [isAllowed])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.endpointSlices.map(slice => ({
				kind: 'EndpointSlice',
				namespace: slice.namespace,
				name: slice.name
			}))

			const response = await fetch('/api/v1/resources', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': document.cookie.split('; ').find(row => row.startsWith('csrf-token='))?.split('=')[1] || ''
				},
				credentials: 'include',
				body: JSON.stringify(targets)
			})

			if (response.ok) {
				const data = await response.json()
				setAlert({
					variant: 'success',
					title: `Success: ${data.deleted || targets.length} endpoint slices deleted`,
					description: data.message
				})
			} else {
				const errorData = await response.json()
				setAlert({
					variant: 'error',
					title: 'Delete failed',
					description: errorData.message || 'Failed to delete endpoint slices'
				})
			}
		} catch (e: unknown) {
			setAlert({
				variant: 'error',
				title: 'Action failed',
				description: e instanceof Error ? e.message : String(e)
			})
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
				cards={summaryCards}
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
								searchPlaceholder="Search endpoint slices by name, namespace, address type, or addresses... (Press '/' to focus)"
								categoryFilter={statusFilter}
								onCategoryFilterChange={setStatusFilter}
								categoryLabel="Filter by address type"
								categoryOptions={statusOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon || undefined,
									variant: a.variant || 'default',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardEndpointSlice))
								}))}
								bulkActionsLabel="Actions"
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
				title="Delete Endpoint Slices"
				description="Are you sure you want to delete the selected endpoint slices? This action cannot be undone."
				actionLabel="Delete Endpoint Slices"
				variant="destructive"
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.endpointSlices || []).map(slice => ({ name: slice.name, namespace: slice.namespace }))}
				safetyViolations={[]}
				warnings={[]}
			/>

			{/* Controlled detail drawer for full endpoint slice details */}
			{selectedEndpointSliceForDetails && (
				<EndpointSliceDetailDrawer
					item={selectedEndpointSliceForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedEndpointSliceForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

export function EndpointSlicesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["endpointslices.list"]}>
			<EndpointSlicesContent />
		</RouteGuard>
	)
}
