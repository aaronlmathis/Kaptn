"use client"

import * as React from "react"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useClusterFeatures } from "@/contexts/cluster-features-context"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useVirtualServicesWithWebSocket } from "@/hooks/useVirtualServicesWithWebSocket"
import {
	getResourceIcon,
	getVirtualServiceStatusBadge,
	getVirtualServiceHostsBadge,
	getVirtualServiceGatewaysBadge,
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
import { virtualServiceSchema } from "@/types/virtual-service"
import { VirtualServiceDetailDrawer } from "@/components/viewers/VirtualServiceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"

// Inner component that can access the namespace context
function VirtualServicesContent() {
	const { istioInstalled, istio, loading: featuresLoading } = useClusterFeatures()
	const { data: virtualServices, loading: isLoading, error, isConnected } = useVirtualServicesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedVirtualServiceForDetails, setSelectedVirtualServiceForDetails] = React.useState<z.infer<typeof virtualServiceSchema> | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', virtualServices: z.infer<typeof virtualServiceSchema>[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [gatewayFilter, setGatewayFilter] = React.useState<string>("all")

	React.useEffect(() => {
		fetchAdditional([
			'pods.get',
			'pods.patch',
			'pods.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when virtual services change
	React.useEffect(() => {
		if ((virtualServices?.length ?? 0) > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [virtualServices])

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
			case "External":
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						External
					</Badge>
				)
			case "Internal":
				return (
					<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
						Internal
					</Badge>
				)
			case "Mesh":
				return (
					<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-purple-600 mr-1" />
						Mesh
					</Badge>
				)
			case "No Gateways":
				return (
					<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
						No Gateways
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

	// Create filter options for virtual services based on gateway types
	const gatewayTypes: FilterOption[] = React.useMemo(() => {
		const types = new Set<string>()
		virtualServices?.forEach(vs => {
			if (!vs.gateways || vs.gateways.length === 0) {
				types.add("No Gateways")
			} else {
				// Categorize based on gateway names
				const hasExternal = vs.gateways.some(gw => gw.includes("external") || gw.includes("ingress"))
				const hasInternal = vs.gateways.some(gw => gw.includes("internal"))
				const hasMesh = vs.gateways.some(gw => gw === "mesh")

				if (hasExternal) {
					types.add("External")
				} else if (hasInternal) {
					types.add("Internal")
				} else if (hasMesh) {
					types.add("Mesh")
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
	}, [virtualServices, getGatewayTypeBadge])

	// Filter data based on global filter and gateway filter
	const filteredData = React.useMemo(() => {
		let filtered = virtualServices || []

		// Apply category filter (gateway type)
		if (gatewayFilter !== "all") {
			filtered = filtered.filter(vs => {
				if (!vs.gateways || vs.gateways.length === 0) {
					return gatewayFilter === "No Gateways"
				}

				const hasExternal = vs.gateways.some(gw => gw.includes("external") || gw.includes("ingress"))
				const hasInternal = vs.gateways.some(gw => gw.includes("internal"))
				const hasMesh = vs.gateways.some(gw => gw === "mesh")

				let vsType = "Other"
				if (hasExternal) {
					vsType = "External"
				} else if (hasInternal) {
					vsType = "Internal"
				} else if (hasMesh) {
					vsType = "Mesh"
				}

				return vsType === gatewayFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(vs =>
				vs.name.toLowerCase().includes(searchTerm) ||
				vs.namespace.toLowerCase().includes(searchTerm) ||
				vs.hosts?.some(host => host.toLowerCase().includes(searchTerm)) ||
				vs.gateways?.some(gw => gw.toLowerCase().includes(searchTerm)) ||
				vs.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [virtualServices, gatewayFilter, globalFilter])

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((vs: z.infer<typeof virtualServiceSchema>) => {
		setSelectedVirtualServiceForDetails(vs)
		setDetailDrawerOpen(true)
	}, [])

	// Create columns with the onViewDetails callback
	const columns: ColumnDef<z.infer<typeof virtualServiceSchema>>[] = React.useMemo(() => [
		{
			accessorKey: "name",
			header: "Virtual Service Name",
			cell: ({ row }: { row: Row<z.infer<typeof virtualServiceSchema>> }) => {
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
			cell: ({ row }: { row: Row<z.infer<typeof virtualServiceSchema>> }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: "hosts",
			header: "Hosts",
			cell: ({ row }: { row: Row<z.infer<typeof virtualServiceSchema>> }) => {
				const hosts = row.original.hosts
				if (!hosts || hosts.length === 0) {
					return <span className="text-muted-foreground">None</span>
				}
				return (
					<div className="flex flex-wrap gap-1">
						{hosts.slice(0, 3).map((host: string, index: number) => (
							<Badge key={index} variant="secondary" className="text-xs">
								{host}
							</Badge>
						))}
						{hosts.length > 3 && (
							<Badge variant="outline" className="text-xs text-muted-foreground">
								+{hosts.length - 3} more
							</Badge>
						)}
					</div>
				)
			},
		},
		{
			accessorKey: "gateways",
			header: "Gateways",
			cell: ({ row }: { row: Row<z.infer<typeof virtualServiceSchema>> }) => {
				const gateways = row.original.gateways
				if (!gateways || gateways.length === 0) {
					return <span className="text-muted-foreground">None</span>
				}
				return (
					<div className="flex flex-wrap gap-1">
						{gateways.slice(0, 2).map((gateway: string, index: number) => (
							<Badge key={index} variant="secondary" className="text-xs">
								{gateway}
							</Badge>
						))}
						{gateways.length > 2 && (
							<Badge variant="outline" className="text-xs text-muted-foreground">
								+{gateways.length - 2} more
							</Badge>
						)}
					</div>
				)
			},
		},
		{
			accessorKey: "age",
			header: "Age",
			cell: ({ row }: { row: Row<z.infer<typeof virtualServiceSchema>> }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: "actions",
			cell: ({ row }: { row: Row<z.infer<typeof virtualServiceSchema>> }) => (
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
								resourceKind="VirtualService"
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
								Reload Configuration
							</DropdownMenuItem>
						}>
							<DropdownMenuItem onClick={() => {
								// TODO: Implement virtual service reload functionality
								console.log('Reload virtual service:', row.original.name, 'in namespace:', row.original.namespace)
							}}>
								<IconRefresh className="size-4 mr-2" />
								Reload Configuration
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
								setPendingAction({ type: 'delete', virtualServices: [row.original] })
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
	], [handleViewDetails, clusterId])

	// Bulk actions
	const bulkActions = React.useMemo(() => [
		{
			id: "copy-names",
			label: "Copy Virtual Service Names",
			icon: <IconCopy className="size-4" />,
			action: (virtualServices: z.infer<typeof virtualServiceSchema>[]) => {
				const names = virtualServices.map(vs => vs.name).join('\n')
				navigator.clipboard.writeText(names)
			},
			requiresSelection: true,
		},
		{
			id: "export-yaml",
			label: "Export Selected as YAML",
			icon: <IconDownload className="size-4" />,
			action: (virtualServices: z.infer<typeof virtualServiceSchema>[]) => {
				console.log('Export YAML for virtual services:', virtualServices.map(vs => vs.name))
				// TODO: Implement bulk YAML export
			},
			requiresSelection: true,
		},
		{
			id: "configure-routes",
			label: "Configure HTTP Routes",
			icon: <IconRoute className="size-4" />,
			action: (virtualServices: z.infer<typeof virtualServiceSchema>[]) => {
				console.log('Configure routes for virtual services:', virtualServices.map(vs => `${vs.name} in ${vs.namespace}`))
				// TODO: Implement route configuration
			},
			requiresSelection: true,
		},
		{
			id: "test-routing",
			label: "Test Traffic Routing",
			icon: <IconNetwork className="size-4" />,
			action: (virtualServices: z.infer<typeof virtualServiceSchema>[]) => {
				console.log('Test routing for virtual services:', virtualServices.map(vs => `${vs.name} in ${vs.namespace}`))
				// TODO: Implement routing testing
			},
			requiresSelection: true,
		},
		{
			id: "delete-virtualservices",
			label: "Delete Selected Virtual Services",
			icon: <IconTrash className="size-4" />,
			action: (virtualServices: z.infer<typeof virtualServiceSchema>[]) => {
				setPendingAction({ type: 'delete', virtualServices })
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
				const targets = pendingAction.virtualServices.map(vs => ({
					namespace: vs.namespace,
					name: vs.name,
				}))

				await bulkActionsApi.executeBulkAction('virtualservices', {
					action: 'delete',
					targets,
				})

				setAlert({
					variant: 'success',
					title: `Deleted ${pendingAction.virtualServices.length} virtual service(s)`,
					description: `Successfully deleted: ${pendingAction.virtualServices.map(vs => vs.name).join(', ')}`
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

	// Generate summary cards from virtual service data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!virtualServices || virtualServices.length === 0) {
			return [
				{
					title: "Total Virtual Services",
					value: 0,
					subtitle: "No virtual services found"
				},
				{
					title: "HTTP Routes",
					value: 0,
					subtitle: "0 HTTP routes"
				},
				{
					title: "Hosts",
					value: 0,
					subtitle: "0 hosts"
				},
				{
					title: "Gateways",
					value: 0,
					subtitle: "0 gateways"
				}
			]
		}

		const totalVirtualServices = virtualServices.length
		const totalHosts = virtualServices.reduce((sum, vs) => sum + vs.hosts.length, 0)
		const totalGateways = new Set(virtualServices.flatMap(vs => vs.gateways)).size
		const uniqueHosts = new Set(virtualServices.flatMap(vs => vs.hosts)).size

		return [
			{
				title: "Total Virtual Services",
				value: totalVirtualServices,
				subtitle: `${totalVirtualServices} virtual services configured`,
				icon: getResourceIcon("virtualservices"),
				badge: getVirtualServiceStatusBadge(totalVirtualServices),
				footer: totalVirtualServices > 0 ? "Istio traffic routing rules" : "No virtual services found"
			},
			{
				title: "Unique Hosts",
				value: uniqueHosts,
				subtitle: `${uniqueHosts} unique host configurations`,
				badge: getVirtualServiceHostsBadge(uniqueHosts, totalHosts),
				footer: uniqueHosts > 0 ? "Distinct routing destinations" : "No hosts configured"
			},
			{
				title: "Total Host Entries",
				value: totalHosts,
				subtitle: `${totalHosts} total host entries`,
				badge: totalHosts > 0 ? getVirtualServiceHostsBadge(uniqueHosts, totalHosts) : undefined,
				footer: totalHosts > 0 ? "All host routing rules" : "No host entries"
			},
			{
				title: "Connected Gateways",
				value: totalGateways,
				subtitle: `${totalGateways} unique gateways referenced`,
				badge: getVirtualServiceGatewaysBadge(totalGateways),
				footer: totalGateways > 0 ? "Gateway connections" : "No gateways referenced"
			}
		]
	}, [virtualServices])

	// Show message if Istio is not available (after features load)
	const vsCount = istio?.counts?.virtualservices ?? 0
	if (!featuresLoading && (!istioInstalled || vsCount === 0)) {
		return (
			<div className="space-y-6">
				<div className="px-4 lg:px-6">
					<div className="flex items-center justify-between">
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<h1 className="text-2xl font-bold tracking-tight">Virtual Services</h1>
								<p className="text-muted-foreground">Istio virtual services are not available in this cluster</p>
							</div>
						</div>
						<div className="flex items-center justify-center p-8">
							<div className="text-center space-y-2">
								<h3 className="text-lg font-medium">Istio Not Available</h3>
								<p className="text-muted-foreground">{!istioInstalled ? "Istio is not installed in this cluster" : "Istio is installed but no virtual services are configured"}</p>
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
				error={(virtualServices?.length ?? 0) === 0 ? null : error}
				lastUpdated={lastUpdated}
			/>

			{/* Virtual Services Data Table */}
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
							searchPlaceholder="Search virtual services by name, namespace, hosts, or gateways... (Press '/' to focus)"
							categoryFilter={gatewayFilter}
							onCategoryFilterChange={setGatewayFilter}
							categoryLabel="Filter by gateway type"
							categoryOptions={gatewayTypes}
							selectedCount={selectedCount}
							totalCount={totalCount}
							bulkActions={bulkActions.map(a => ({
								id: a.id,
								label: a.label,
								icon: a.icon,
								variant: a.variant,
								requiresSelection: a.requiresSelection,
								action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: z.infer<typeof virtualServiceSchema> }) => r.original))
							}))}
							bulkActionsLabel="Actions"
							table={table}
							showColumnToggle={true}
						>
							{/* Real-time updates indicator */}

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
					title={pendingAction.type === 'delete' ? 'Delete Virtual Services' : 'Confirm Action'}
					description={
						pendingAction.type === 'delete'
							? `Are you sure you want to delete ${pendingAction.virtualServices.length} virtual service(s)? This action cannot be undone.`
							: 'Are you sure you want to perform this action?'
					}
					actionLabel={pendingAction.type === 'delete' ? 'Delete Virtual Services' : 'Confirm'}
					resources={pendingAction.virtualServices.map(vs => ({
						kind: 'VirtualService',
						namespace: vs.namespace,
						name: vs.name,
					}))}
					warnings={confirmWarnings}
					safetyViolations={[]}
				/>
			)}

			{/* Detail drawer */}
			{selectedVirtualServiceForDetails && (
				<VirtualServiceDetailDrawer
					item={selectedVirtualServiceForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedVirtualServiceForDetails(null)
						}
					}}
				/>
			)}

		</div>
	)
}

export function VirtualServicesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["pods.list"]}>
			<VirtualServicesContent />
		</RouteGuard>
	)
}
