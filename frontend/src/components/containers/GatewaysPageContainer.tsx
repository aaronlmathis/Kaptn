"use client"

import * as React from "react"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useClusterFeatures } from "@/contexts/cluster-features-context"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useGatewaysWithWebSocket } from "@/hooks/useGatewaysWithWebSocket"
import {
	getResourceIcon,
	getGatewayStatusBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { useCluster } from "@/hooks/useCluster"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
	IconDotsVertical,
	IconEye,
	IconTrash,
	IconEdit,
	IconRefresh,
	IconDownload,
	IconCopy,
	IconRoute,
	IconNetwork,
	IconCircleCheckFilled
} from "@tabler/icons-react"
import { type ColumnDef, type Row } from "@/lib/table"
import { z } from "zod"
import { gatewaySchema } from "@/types/gateway"
import { GatewayDetailDrawer } from "@/components/viewers/GatewayDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"

// Inner component that can access the namespace context
function GatewaysContent() {
	const { istioInstalled, istio, loading: featuresLoading } = useClusterFeatures()
	const { data: gateways, loading: isLoading, error, isConnected } = useGatewaysWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedGatewayForDetails, setSelectedGatewayForDetails] = React.useState<z.infer<typeof gatewaySchema> | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', gateways: z.infer<typeof gatewaySchema>[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [protocolFilter, setProtocolFilter] = React.useState<string>("all")

	React.useEffect(() => {
		fetchAdditional([
			'gateways.get',
			'gateways.patch',
			'gateways.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when gateways change
	React.useEffect(() => {
		if ((gateways?.length ?? 0) > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [gateways])

	// Auto-hide alert after 5 seconds
	React.useEffect(() => {
		if (alert) {
			const timer = setTimeout(() => {
				setAlert(null)
			}, 5000)
			return () => clearTimeout(timer)
		}
	}, [alert])

	// Helper function to get badge for gateway type in filter options
	const getGatewayTypeBadge = React.useCallback((type: string) => {
		switch (type) {
			case "HTTPS":
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						HTTPS
					</Badge>
				)
			case "HTTP":
				return (
					<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
						HTTP
					</Badge>
				)
			case "TCP":
				return (
					<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-purple-600 mr-1" />
						TCP
					</Badge>
				)
			default:
				return (
					<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
						{type}
					</Badge>
				)
		}
	}, [])

	// Create filter options for gateways based on protocol types
	const protocolTypes: FilterOption[] = React.useMemo(() => {
		const types = new Set<string>()
		gateways?.forEach(gateway => {
			// Determine the primary protocol type for this gateway
			if (!gateway.ports || gateway.ports.length === 0) {
				types.add("No Ports")
			} else {
				const hasHTTPS = gateway.ports.some(p => p.protocol === "HTTPS")
				const hasHTTP = gateway.ports.some(p => p.protocol === "HTTP")
				const hasTCP = gateway.ports.some(p => p.protocol === "TCP")

				if (hasHTTPS) {
					types.add("HTTPS")
				} else if (hasHTTP) {
					types.add("HTTP")
				} else if (hasTCP) {
					types.add("TCP")
				} else {
					types.add("Other")
				}
			}
		})
		return Array.from(types).sort().map(type => ({
			value: type,
			label: type,
			badge: getGatewayTypeBadge(type)
		}))
	}, [gateways, getGatewayTypeBadge])

	// Filter data based on global filter and protocol filter
	const filteredData = React.useMemo(() => {
		let filtered = gateways || []

		// Apply category filter (gateway type)
		if (protocolFilter !== "all") {
			filtered = filtered.filter(gateway => {
				// Determine the primary protocol type for this gateway
				if (!gateway.ports || gateway.ports.length === 0) {
					return protocolFilter === "No Ports"
				}

				const hasHTTPS = gateway.ports.some(p => p.protocol === "HTTPS")
				const hasHTTP = gateway.ports.some(p => p.protocol === "HTTP")
				const hasTCP = gateway.ports.some(p => p.protocol === "TCP")

				let gatewayType = "Other"
				if (hasHTTPS) {
					gatewayType = "HTTPS"
				} else if (hasHTTP) {
					gatewayType = "HTTP"
				} else if (hasTCP) {
					gatewayType = "TCP"
				}

				return gatewayType === protocolFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(gateway =>
				gateway.name.toLowerCase().includes(searchTerm) ||
				gateway.namespace.toLowerCase().includes(searchTerm) ||
				gateway.addresses?.some(addr => addr.toLowerCase().includes(searchTerm)) ||
				gateway.ports?.some(port =>
					port.protocol.toLowerCase().includes(searchTerm) ||
					port.name?.toLowerCase().includes(searchTerm)
				) ||
				gateway.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [gateways, protocolFilter, globalFilter])

	// Helper function to get gateway protocol type badge
	const getGatewayServerTypeBadge = React.useCallback((ports: Array<{ name?: string; protocol: string }>) => {
		if (!ports || ports.length === 0) {
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					No Ports
				</Badge>
			)
		}

		const hasHTTPS = ports.some(p => p.protocol === "HTTPS")
		const hasHTTP = ports.some(p => p.protocol === "HTTP")
		const hasTCP = ports.some(p => p.protocol === "TCP")

		if (hasHTTPS) {
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					HTTPS
				</Badge>
			)
		}
		if (hasHTTP) {
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
					HTTP
				</Badge>
			)
		}
		if (hasTCP) {
			return (
				<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-purple-600 mr-1" />
					TCP
				</Badge>
			)
		}

		return (
			<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
				{ports[0]?.protocol || "Unknown"}
			</Badge>
		)
	}, [])

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((gateway: z.infer<typeof gatewaySchema>) => {
		setSelectedGatewayForDetails(gateway)
		setDetailDrawerOpen(true)
	}, [])

	// Create columns with the onViewDetails callback
	const columns: ColumnDef<z.infer<typeof gatewaySchema>>[] = React.useMemo(() => [
		{
			accessorKey: "name",
			header: "Gateway Name",
			cell: ({ row }: { row: Row<z.infer<typeof gatewaySchema>> }) => {
				return (
					<IfAllowed feature="pods.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name} fallback={
						<span className="text-muted-foreground">{row.original.name}</span>
					}>
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
			cell: ({ row }: { row: Row<z.infer<typeof gatewaySchema>> }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			id: "protocol-type",
			accessorKey: "ports",
			header: "Type",
			cell: ({ row }: { row: Row<z.infer<typeof gatewaySchema>> }) => getGatewayServerTypeBadge(row.original.ports),
		},
		{
			id: "ports-list",
			accessorKey: "ports",
			header: "Ports",
			cell: ({ row }: { row: Row<z.infer<typeof gatewaySchema>> }) => {
				const ports = row.original.ports
				if (!ports || ports.length === 0) {
					return <span className="text-muted-foreground">None</span>
				}
				return (
					<div className="flex flex-wrap gap-1">
						{ports.map((port: { name?: string; protocol: string }, index: number) => (
							<Badge key={index} variant="secondary" className="text-xs">
								{port.name ? `${port.name}:${port.protocol}` : port.protocol}
							</Badge>
						))}
					</div>
				)
			},
		},
		{
			accessorKey: "addresses",
			header: "Addresses",
			cell: ({ row }: { row: Row<z.infer<typeof gatewaySchema>> }) => {
				const addresses = row.original.addresses
				if (!addresses || addresses.length === 0) {
					return <span className="text-muted-foreground">None</span>
				}
				return (
					<div className="font-mono text-sm">{addresses.join(", ")}</div>
				)
			},
		},
		{
			accessorKey: "age",
			header: "Age",
			cell: ({ row }: { row: Row<z.infer<typeof gatewaySchema>> }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: "actions",
			cell: ({ row }: { row: Row<z.infer<typeof gatewaySchema>> }) => (
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
						<IfAllowed feature="pods.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name} fallback={
							<DropdownMenuItem disabled className="text-muted-foreground">
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						}>
							<DropdownMenuItem onClick={() => handleViewDetails(row.original)}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="pods.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name} fallback={
							<DropdownMenuItem disabled className="text-muted-foreground">
								<IconEdit className="size-4 mr-2" />
								Edit YAML
							</DropdownMenuItem>
						}>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace={row.original.namespace}
								resourceKind="Gateway"
							>
								<button
									className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer"
									style={{
										background: 'transparent',
										border: 'none',
										textAlign: 'left'
									}}
								>
									<IconEdit className="size-4" />
									Edit YAML
								</button>
							</ResourceYamlEditor>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="pods.patch" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name} fallback={
							<DropdownMenuItem disabled className="text-muted-foreground">
								<IconRefresh className="size-4 mr-2" />
								Restart Gateway
							</DropdownMenuItem>
						}>
							<DropdownMenuItem onClick={() => {
								// TODO: Implement gateway restart functionality
								console.log('Restart gateway:', row.original.name, 'in namespace:', row.original.namespace)
							}}>
								<IconRefresh className="size-4 mr-2" />
								Restart Gateway
							</DropdownMenuItem>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="pods.delete" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name} fallback={
							<DropdownMenuItem disabled className="text-muted-foreground">
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						}>
							<DropdownMenuItem className="text-red-600" onClick={() => {
								setPendingAction({ type: 'delete', gateways: [row.original] })
								setConfirmDialogOpen(true)
							}}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	], [handleViewDetails, getGatewayServerTypeBadge, clusterId])

	// Bulk actions
	const bulkActions = React.useMemo(() => [
		{
			id: "copy-names",
			label: "Copy Gateway Names",
			icon: <IconCopy className="size-4" />,
			action: (gateways: z.infer<typeof gatewaySchema>[]) => {
				const names = gateways.map(gw => gw.name).join('\n')
				navigator.clipboard.writeText(names)
			},
			requiresSelection: true,
		},
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: (gateways: z.infer<typeof gatewaySchema>[]) => {
				console.log('Export YAML for gateways:', gateways.map(gw => gw.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "configure-routes",
			label: "Configure Routes",
			icon: <IconRoute className="size-4" />,
			action: (gateways: z.infer<typeof gatewaySchema>[]) => {
				console.log('Configure routes for gateways:', gateways.map(gw => `${gw.name} in ${gw.namespace}`))
				// TODO: Implement route configuration
			},
			requiresSelection: true,
		},
		{
			id: "test-connectivity",
			label: "Test Gateway Connectivity",
			icon: <IconNetwork className="size-4" />,
			action: (gateways: z.infer<typeof gatewaySchema>[]) => {
				console.log('Test connectivity for gateways:', gateways.map(gw => `${gw.name} in ${gw.namespace}`))
				// TODO: Implement connectivity testing
			},
			requiresSelection: true,
		},
		{
			id: "delete-gateways",
			label: "Delete Selected Gateways",
			icon: <IconTrash className="size-4" />,
			action: (gateways: z.infer<typeof gatewaySchema>[]) => {
				setPendingAction({ type: 'delete', gateways })
				setConfirmDialogOpen(true)
			},
			variant: "destructive" as const,
			requiresSelection: true,
		},
	], [])

	// Handle confirmation of destructive actions
	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return

		setIsConfirmExecuting(true)
		setConfirmWarnings([])

		try {
			if (pendingAction.type === 'delete') {
				const targets = pendingAction.gateways.map(gateway => ({
					namespace: gateway.namespace,
					name: gateway.name,
				}))

				await bulkActionsApi.executeBulkAction('gateways', {
					action: 'delete',
					targets,
				})

				setAlert({
					variant: 'success',
					title: `Deleted ${pendingAction.gateways.length} gateway(s)`,
					description: `Successfully deleted: ${pendingAction.gateways.map(g => g.name).join(', ')}`
				})
			}
		} catch (err) {
			setAlert({
				variant: 'error',
				title: 'Action failed',
				description: err instanceof Error ? err.message : 'Unknown error occurred'
			})
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction])

	// Generate summary cards from gateway data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!gateways || gateways.length === 0) {
			return [
				{
					title: "Total Gateways",
					value: 0,
					subtitle: "No gateways found"
				},
				{
					title: "HTTP Ports",
					value: 0,
					subtitle: "0 HTTP ports"
				},
				{
					title: "HTTPS Ports",
					value: 0,
					subtitle: "0 HTTPS ports"
				},
				{
					title: "TCP Ports",
					value: 0,
					subtitle: "0 TCP ports"
				}
			]
		}

		const totalGateways = gateways.length
		const httpPorts = gateways.reduce((sum, gw) =>
			sum + (gw.ports?.filter(p => p.protocol === 'HTTP').length || 0), 0)
		const httpsPorts = gateways.reduce((sum, gw) =>
			sum + (gw.ports?.filter(p => p.protocol === 'HTTPS').length || 0), 0)
		const tcpPorts = gateways.reduce((sum, gw) =>
			sum + (gw.ports?.filter(p => p.protocol === 'TCP').length || 0), 0)

		return [
			{
				title: "Total Gateways",
				value: totalGateways,
				subtitle: `${totalGateways} gateways configured`,
				badge: getGatewayStatusBadge(totalGateways),
				icon: getResourceIcon("ingresses"), // Use ingresses icon for now
				footer: totalGateways > 0 ? "Istio traffic entry points" : "No gateways found"
			},
			{
				title: "HTTP Ports",
				value: httpPorts,
				subtitle: `${httpPorts} HTTP port configurations`,
				footer: httpPorts > 0 ? "HTTP traffic entry points" : "No HTTP ports configured"
			},
			{
				title: "HTTPS Ports",
				value: httpsPorts,
				subtitle: `${httpsPorts} HTTPS port configurations`,
				footer: httpsPorts > 0 ? "Secure traffic entry points" : "No HTTPS ports configured"
			},
			{
				title: "TCP Ports",
				value: tcpPorts,
				subtitle: `${tcpPorts} TCP port configurations`,
				footer: tcpPorts > 0 ? "TCP traffic entry points" : "No TCP ports configured"
			}
		]
	}, [gateways])

	// Show message if Istio is not available (after features load)
	const gwCount = istio?.counts?.gateways ?? 0
	if (!featuresLoading && (!istioInstalled || gwCount === 0)) {
		return (
			<div className="space-y-6">
				<div className="px-4 lg:px-6">
					<div className="flex items-center justify-between">
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<h1 className="text-2xl font-bold tracking-tight">Gateways</h1>
								<p className="text-muted-foreground">Istio gateways are not available in this cluster</p>
							</div>
						</div>
						<div className="flex items-center justify-center p-8">
							<div className="text-center space-y-2">
								<h3 className="text-lg font-medium">Istio Not Available</h3>
								<p className="text-muted-foreground">{!istioInstalled ? "Istio is not installed in this cluster" : "Istio is installed but no gateways are configured"}</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-6">


			{/* Summary Cards */}
			<SummaryCards
				cards={summaryData || []}
				loading={isLoading}
				error={(gateways?.length ?? 0) > 0 ? null : error}
				lastUpdated={lastUpdated}
			/>

			{/* Gateways Data Table */}
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
					data={filteredData}
					columns={columns}
					enableReorder={false}
					enableRowSelection={true}
					loading={isLoading}
					error={error}
					onRowClick={handleViewDetails}
					renderFilters={({ table, selectedCount, totalCount }) => (
						<DataTableFilters
							globalFilter={globalFilter}
							onGlobalFilterChange={setGlobalFilter}
							searchPlaceholder="Search gateways by name, namespace, addresses, or port protocols... (Press '/' to focus)"
							categoryFilter={protocolFilter}
							onCategoryFilterChange={setProtocolFilter}
							categoryLabel="Filter by protocol type"
							categoryOptions={protocolTypes}
							selectedCount={selectedCount}
							totalCount={totalCount}
							bulkActions={bulkActions.map(a => ({
								id: a.id,
								label: a.label,
								icon: a.icon,
								variant: a.variant,
								requiresSelection: a.requiresSelection,
								action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: z.infer<typeof gatewaySchema> }) => r.original))
							}))}
							bulkActionsLabel="Actions"
							table={table}
							showColumnToggle={true}
						>

						</DataTableFilters>
					)}
				/>
			</div>

			{/* Confirmation dialog for destructive actions */}
			{pendingAction && (
				<ActionConfirmationDialog
					open={confirmDialogOpen}
					onOpenChange={setConfirmDialogOpen}
					onConfirm={handleConfirmAction}
					isExecuting={isConfirmExecuting}
					variant={pendingAction.type === 'delete' ? 'destructive' : 'default'}
					title={pendingAction.type === 'delete' ? 'Delete Gateways' : 'Confirm Action'}
					description={
						pendingAction.type === 'delete'
							? `Are you sure you want to delete ${pendingAction.gateways.length} gateway(s)? This action cannot be undone.`
							: 'Are you sure you want to perform this action?'
					}
					actionLabel={pendingAction.type === 'delete' ? 'Delete Gateways' : 'Confirm'}
					resources={pendingAction.gateways.map(g => ({
						kind: 'Gateway',
						namespace: g.namespace,
						name: g.name,
					}))}
					warnings={confirmWarnings}
					safetyViolations={[]}
				/>
			)}

			{/* Detail drawer */}
			{selectedGatewayForDetails && (
				<GatewayDetailDrawer
					item={selectedGatewayForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedGatewayForDetails(null)
						}
					}}
				/>
			)}

		</div>
	)
}

export function GatewaysPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["pods.list"]}>
			<GatewaysContent />
		</RouteGuard>
	)
}
