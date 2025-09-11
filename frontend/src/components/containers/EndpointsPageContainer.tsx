"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useEndpointsWithWebSocket } from "@/hooks/useEndpointsWithWebSocket"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
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
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconDownload, IconCopy, IconNetwork, IconInfoCircle } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { type DashboardEndpoints } from "@/lib/k8s-services"
import { EndpointDetailDrawer } from "@/components/viewers/EndpointDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Inner component that can access the namespace context
function EndpointsContent() {
	const { data: endpoints, loading: isLoading, error, isConnected } = useEndpointsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext([
		'endpoints.get', 'endpoints.patch', 'endpoints.delete'
	])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedEndpointForDetails, setSelectedEndpointForDetails] = React.useState<DashboardEndpoints | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', endpoints: DashboardEndpoints[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	React.useEffect(() => {
		fetchAdditional([
			'endpoints.get',
			'endpoints.patch',
			'endpoints.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when endpoints change
	React.useEffect(() => {
		if (endpoints.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [endpoints])

	// Generate summary cards from endpoint data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!endpoints || endpoints.length === 0) {
			return [
				{
					title: "Total Endpoints",
					value: 0,
					subtitle: "No endpoints found"
				},
				{
					title: "Total Addresses",
					value: 0,
					subtitle: "0 addresses"
				},
				{
					title: "Total Ports",
					value: 0,
					subtitle: "0 ports"
				},
				{
					title: "Ready",
					value: "0/0",
					subtitle: "No ready addresses"
				}
			]
		}

		const totalEndpoints = endpoints.length

		// Calculate endpoint metrics
		const totalAddresses = endpoints.reduce((sum, ep) => sum + ep.totalAddresses, 0)
		const totalPorts = endpoints.reduce((sum, ep) => sum + ep.totalPorts, 0)
		const endpointsWithAddresses = endpoints.filter(ep => ep.totalAddresses > 0).length

		// Calculate ready percentage for display
		const readyPercentage = totalEndpoints > 0 ? (endpointsWithAddresses / totalEndpoints) * 100 : 0

		return [
			{
				title: "Total Endpoints",
				value: totalEndpoints,
				subtitle: `${endpointsWithAddresses}/${totalEndpoints} with addresses`,
				badge: getReplicaStatusBadge(endpointsWithAddresses, totalEndpoints),
				icon: getResourceIcon("endpoints"),
				footer: totalEndpoints > 0 ? "All endpoint resources in cluster" : "No endpoints found"
			},
			{
				title: "Total Addresses",
				value: totalAddresses,
				subtitle: `${totalAddresses} endpoint addresses`,
				badge: getHealthTrendBadge(totalAddresses > 0 ? 100 : 0),
				footer: totalAddresses > 0 ? "All endpoint addresses across cluster" : "No endpoint addresses"
			},
			{
				title: "Total Ports",
				value: totalPorts,
				subtitle: `${totalPorts} exposed ports`,
				badge: getUpdateStatusBadge(totalPorts, Math.max(totalPorts, 1)),
				footer: totalPorts > 0 ? "Ports exposed by endpoints" : "No ports exposed"
			},
			{
				title: "Coverage",
				value: `${Math.round(readyPercentage)}%`,
				subtitle: `${endpointsWithAddresses} endpoints have addresses`,
				badge: getReplicaStatusBadge(endpointsWithAddresses, totalEndpoints),
				footer: readyPercentage > 80 ? "Good endpoint coverage" : "Some endpoints missing addresses"
			}
		]
	}, [endpoints])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [statusFilter, setStatusFilter] = React.useState<string>("all")

	// Filter options based on subset count (matching original EndpointsDataTable)
	const statusOptions: FilterOption[] = React.useMemo(() => {
		const statuses = new Set<string>()
		endpoints.forEach(endpoint => {
			if (endpoint.subsets === 0) {
				statuses.add("No Endpoints")
			} else if (endpoint.subsets === 1) {
				statuses.add("Single Subset")
			} else {
				statuses.add("Multiple Subsets")
			}
		})
		return Array.from(statuses).sort().map(status => ({
			value: status,
			label: status,
			badge: (
				<Badge variant="outline" className={
					status === "No Endpoints" ? "text-red-600 border-border bg-transparent px-1.5" :
						status === "Single Subset" ? "text-blue-600 border-border bg-transparent px-1.5" :
							"text-green-600 border-border bg-transparent px-1.5"
				}>
					{status}
				</Badge>
			)
		}))
	}, [endpoints])

	// Filter data based on global filter and status filter
	const filtered = React.useMemo(() => {
		let filteredData = endpoints

		// Apply status filter
		if (statusFilter !== "all") {
			filteredData = filteredData.filter(endpoint => {
				let statusCategory = ""
				if (endpoint.subsets === 0) {
					statusCategory = "No Endpoints"
				} else if (endpoint.subsets === 1) {
					statusCategory = "Single Subset"
				} else {
					statusCategory = "Multiple Subsets"
				}
				return statusCategory === statusFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filteredData = filteredData.filter(endpoint =>
				endpoint.name.toLowerCase().includes(searchTerm) ||
				endpoint.namespace.toLowerCase().includes(searchTerm) ||
				endpoint.addressesDisplay.toLowerCase().includes(searchTerm) ||
				endpoint.portsDisplay.toLowerCase().includes(searchTerm) ||
				endpoint.age.toLowerCase().includes(searchTerm)
			)
		}

		return filteredData
	}, [endpoints, statusFilter, globalFilter])

	// Build table columns
	const columns: ColumnDef<DashboardEndpoints>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Endpoint Name',
			cell: ({ row }) => (
				<IfAllowed
					feature="endpoints.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedEndpointForDetails(row.original); setDetailDrawerOpen(true) }}
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
			accessorKey: 'subsets',
			header: 'Subsets',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.subsets}</div>
			),
		},
		{
			accessorKey: 'addressesDisplay',
			header: 'Addresses',
			cell: ({ row }) => (
				<div className="text-sm">{row.original.addressesDisplay}</div>
			),
		},
		{
			accessorKey: 'portsDisplay',
			header: 'Ports',
			cell: ({ row }) => (
				<div className="text-sm">{row.original.portsDisplay}</div>
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
							feature="endpoints.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedEndpointForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>

						<IfAllowed
							feature="endpoints.patch"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace={row.original.namespace}
								resourceKind="Endpoints"
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

						<IfAllowed
							feature="endpoints.delete"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem
								className="text-red-600"
								onClick={() => {
									setPendingAction({ type: 'delete', endpoints: [row.original] });
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

	// Bulk actions (preserving original EndpointsDataTable actions)
	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardEndpoints[]) => void | Promise<void> }[] = []

		if (isAllowed('endpoints.get')) {
			actions.push({
				id: "export-yaml",
				label: "Export Selected as YAML",
				icon: <IconDownload className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					console.log('Export YAML for endpoints:', rows.map(ep => ep.name))
				}
			})
		}

		actions.push({
			id: "copy-names",
			label: "Copy Endpoint Names",
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				const names = rows.map(ep => ep.name).join('\n')
				navigator.clipboard.writeText(names)
			}
		})

		actions.push({
			id: "show-network-info",
			label: "Show Network Information",
			icon: <IconNetwork className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				console.log('Show network info for endpoints:', rows.map(ep => `${ep.name}: ${ep.addressesDisplay}`))
			}
		})

		actions.push({
			id: "describe-endpoints",
			label: "Describe Selected Endpoints",
			icon: <IconInfoCircle className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				console.log('Describe endpoints:', rows.map(ep => `${ep.name} in ${ep.namespace}`))
			}
		})

		if (isAllowed('endpoints.delete')) {
			actions.push({
				id: "delete-endpoints",
				label: "Delete Selected Endpoints",
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					setPendingAction({ type: 'delete', endpoints: rows })
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
			const targets = pendingAction.endpoints.map(ep => ({
				kind: 'Endpoints',
				namespace: ep.namespace,
				name: ep.name
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
					title: `Success: ${data.deleted || targets.length} endpoints deleted`,
					description: data.message
				})
			} else {
				const errorData = await response.json()
				setAlert({
					variant: 'error',
					title: 'Delete failed',
					description: errorData.message || 'Failed to delete endpoints'
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
								searchPlaceholder="Search endpoints by name, namespace, addresses, ports, or age... (Press '/' to focus)"
								categoryFilter={statusFilter}
								onCategoryFilterChange={setStatusFilter}
								categoryLabel="Filter by subset count"
								categoryOptions={statusOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon || undefined,
									variant: a.variant || 'default',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardEndpoints))
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
				title="Delete Endpoints"
				description="Are you sure you want to delete the selected endpoints? This action cannot be undone."
				actionLabel="Delete Endpoints"
				variant="destructive"
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.endpoints || []).map(ep => ({ name: ep.name, namespace: ep.namespace }))}
				safetyViolations={[]}
				warnings={[]}
			/>

			{/* Controlled detail drawer for full endpoint details */}
			{selectedEndpointForDetails && (
				<EndpointDetailDrawer
					item={selectedEndpointForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedEndpointForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

export function EndpointsPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["endpoints.list"]}>
			<EndpointsContent />
		</RouteGuard>
	)
}
