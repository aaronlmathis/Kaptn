"use client"

import * as React from "react"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useServicesWithWebSocket } from "@/hooks/useServicesWithWebSocket"
import { RouteGuard } from "@/components/authz"
import { useCapabilities } from "@/hooks/use-capabilities"
import {
	getServiceStatusBadge,
	getServiceTypeBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
	IconDotsVertical,
	IconEye,
	IconTrash,
	IconEdit,
	IconDownload,
	IconCopy,
	IconCircleCheckFilled,
} from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { ServiceDetailDrawer } from "@/components/viewers/ServiceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { serviceSchema } from "@/components/kubernetes-dashboard"
import { z } from "zod"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import { MetricLineChart, type ChartSeries } from "@/components/opsview/charts"
import { useLiveSeriesSubscription } from "@/hooks/useLiveSeries"
import { formatBytesIEC, getChartColor } from "@/lib/metric-utils"

// Inner component that can access the namespace context
function ServicesContent() {
	const { data: services, loading: isLoading, error, isConnected } = useServicesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['services.get', 'services.patch', 'services.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedServiceForDetails, setSelectedServiceForDetails] = React.useState<z.infer<typeof serviceSchema> | null>(null)

	// Confirmation dialog state for destructive actions
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])

	type Item = { name: string; namespace?: string }
	const [pendingAction, setPendingAction] = React.useState<null | { scope: 'services', items: Item[] }>(null)

	const requireTextConfirm = React.useMemo(() => !!pendingAction && pendingAction.items.length > 0, [pendingAction])
	const confirmValue = React.useMemo(() => {
		if (!pendingAction || pendingAction.items.length === 0) return ''
		const count = pendingAction.items.length
		return count === 1 ? pendingAction.items[0].name : 'DELETE'
	}, [pendingAction])

	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Ensure service-specific capabilities are requested
	React.useEffect(() => {
		fetchAdditional([
			'services.get',
			'services.patch',
			'services.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Validate function for destructive actions
	const validateDelete = React.useCallback(async (items: Item[]) => {
		try {
			const targets = items.map(i => ({ namespace: i.namespace ?? '', name: i.name }))
			const resp = await bulkActionsApi.validateAction('services', { action: 'delete', targets })
			const details: any = resp?.details
			const warnings: string[] = Array.isArray(details?.results)
				? details.results.flatMap((r: any) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Update lastUpdated when services change
	React.useEffect(() => {
		if (services.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [services])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [typeFilter, setTypeFilter] = React.useState<string>("all")

	// Service type badge helper
	function getServiceTypeDisplayBadge(type: string) {
		switch (type) {
			case "ClusterIP":
				return (
					<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
						{type}
					</Badge>
				)
			case "NodePort":
				return (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						{type}
					</Badge>
				)
			case "LoadBalancer":
				return (
					<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-purple-600 mr-1" />
						{type}
					</Badge>
				)
			case "ExternalName":
				return (
					<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-orange-600 mr-1" />
						{type}
					</Badge>
				)
			default:
				return (
					<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
						{type}
					</Badge>
				)
		}
	}

	// Type filter options
	const typeOptions: FilterOption[] = React.useMemo(() => {
		const types = new Set<string>()
		services.forEach(service => {
			types.add(service.type)
		})
		return Array.from(types).sort().map(type => ({
			value: type,
			label: type,
			badge: getServiceTypeDisplayBadge(type)
		}))
	}, [services])

	const filtered = React.useMemo(() => {
		let result = services

		// Apply category filter (type)
		if (typeFilter !== "all") {
			result = result.filter(service => service.type === typeFilter)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			result = result.filter(service =>
				service.name.toLowerCase().includes(searchTerm) ||
				service.namespace.toLowerCase().includes(searchTerm) ||
				service.type.toLowerCase().includes(searchTerm) ||
				service.clusterIP.toLowerCase().includes(searchTerm) ||
				service.externalIP.toLowerCase().includes(searchTerm) ||
				service.ports.toLowerCase().includes(searchTerm) ||
				service.age.toLowerCase().includes(searchTerm)
			)
		}

		return result
	}, [services, typeFilter, globalFilter])

	// Build table columns
	const columns: ColumnDef<z.infer<typeof serviceSchema>>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Service Name',
			cell: ({ row }) => (
				<IfAllowed
					feature="services.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedServiceForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
		},
		{
			accessorKey: 'namespace',
			header: 'Namespace',
			cell: ({ row }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			)
		},
		{
			accessorKey: 'type',
			header: 'Type',
			cell: ({ row }) => getServiceTypeDisplayBadge(row.original.type)
		},
		{
			accessorKey: 'clusterIP',
			header: 'Cluster IP',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.clusterIP}</div>
			)
		},
		{
			accessorKey: 'externalIP',
			header: 'External IP',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.externalIP}</div>
			)
		},
		{
			accessorKey: 'ports',
			header: 'Ports',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.ports}</div>
			)
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			)
		},
		{
			id: 'actions',
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
							feature="services.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedServiceForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="services.patch"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace={row.original.namespace} resourceKind="Service">
								<button className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm cursor-pointer" style={{ background: 'transparent', border: 'none', textAlign: 'left' }}>
									<IconEdit className="size-4" />
									Edit YAML
								</button>
							</ResourceYamlEditor>
						</IfAllowed>
						<IfAllowed
							feature="services.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconDownload className="size-4 mr-2" />Export YAML</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { const svc = row.original; console.log('Export YAML for Service:', `${svc.name} in ${svc.namespace}`) }}>
								<IconDownload className="size-4 mr-2" />
								Export YAML
							</DropdownMenuItem>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed
							feature="services.delete"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => {
								const item = row.original
								setPendingAction({ scope: 'services', items: [{ name: item.name, namespace: item.namespace }] })
								setConfirmDialogOpen(true)
								validateDelete([{ name: item.name, namespace: item.namespace }])
							}}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, validateDelete])

	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: z.infer<typeof serviceSchema>[]) => void | Promise<void> }[] = []

		// Copy names action - always available
		actions.push({
			id: 'copy-names',
			label: 'Copy Service Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => navigator.clipboard.writeText(rows.map(r => r.name).join('\n'))
		})

		// Export YAML - available if has services.get
		if (isAllowed('services.get')) {
			actions.push({
				id: 'export-yaml',
				label: 'Export Selected as YAML',
				icon: <IconDownload className="size-4" />,
				requiresSelection: true,
				action: (rows) => {
					console.log('Export YAML for Services:', rows.map(svc => svc.name))
				}
			})
		}

		// Delete action - available if has services.delete
		if (isAllowed('services.delete')) {
			actions.push({
				id: 'delete-services',
				label: 'Delete Selected Services',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					setPendingAction({ scope: 'services', items: rows.map(r => ({ name: r.name, namespace: r.namespace })) })
					setConfirmDialogOpen(true)
					validateDelete(rows.map(r => ({ name: r.name, namespace: r.namespace })))
				}
			})
		}

		return actions
	}, [isAllowed, validateDelete])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.items.map(i => ({ namespace: i.namespace ?? '', name: i.name }))
			await bulkActionsApi.executeBulkAction('services', { action: 'delete', targets, force_confirm: true })
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction])

	// Generate summary cards from service data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!services || services.length === 0) {
			return [
				{
					title: "Total Services",
					value: 0,
					subtitle: "No services found"
				},
				{
					title: "ClusterIP Services",
					value: 0,
					subtitle: "0 ClusterIP services"
				},
				{
					title: "LoadBalancer Services",
					value: 0,
					subtitle: "0 LoadBalancer services"
				},
				{
					title: "NodePort Services",
					value: 0,
					subtitle: "0 NodePort services"
				}
			]
		}

		const totalServices = services.length
		const clusterIPServices = services.filter(s => s.type === 'ClusterIP').length
		const loadBalancerServices = services.filter(s => s.type === 'LoadBalancer').length
		const nodePortServices = services.filter(s => s.type === 'NodePort').length

		return [
			{
				title: "Total Services",
				value: totalServices,
				subtitle: `${services.length} services across all types`,
				badge: getServiceStatusBadge(totalServices),
				icon: getResourceIcon("services"),
				footer: totalServices > 0 ? "All service resources in cluster" : "No services found"
			},
			{
				title: "ClusterIP",
				value: clusterIPServices,
				subtitle: `${clusterIPServices} internal cluster services`,
				badge: getServiceTypeBadge(clusterIPServices, totalServices, "ClusterIP"),
				footer: clusterIPServices > 0 ? "Internal communication services" : "No internal services"
			},
			{
				title: "LoadBalancer",
				value: loadBalancerServices,
				subtitle: `${loadBalancerServices} external load balancer services`,
				badge: getServiceTypeBadge(loadBalancerServices, totalServices, "LoadBalancer"),
				footer: loadBalancerServices > 0 ? "External traffic entry points" : "No external load balancers"
			},
			{
				title: "NodePort",
				value: nodePortServices,
				subtitle: `${nodePortServices} node port services`,
				badge: getServiceTypeBadge(nodePortServices, totalServices, "NodePort"),
				footer: nodePortServices > 0 ? "Direct node access services" : "No node port services"
			}
		]
	}, [services])

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
								searchPlaceholder="Search services by name, namespace, type, cluster IP, external IP, or ports... (Press '/' to focus)"
								categoryFilter={typeFilter}
								onCategoryFilterChange={setTypeFilter}
								categoryLabel="Filter by type"
								categoryOptions={typeOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon || undefined,
									variant: (a.variant === 'destructive' ? 'destructive' : 'default') as 'default' | 'destructive',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as z.infer<typeof serviceSchema>))
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
				title={'Delete ' + (pendingAction?.scope ?? 'Resources')}
				description={'Are you sure you want to delete the selected items? This action cannot be undone.'}
				actionLabel={pendingAction?.items && pendingAction.items.length > 1 ? 'Delete Selected' : 'Delete'}
				variant={'destructive'}
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.items || []).map(i => ({ name: i.name, namespace: i.namespace }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
				requireTextConfirm={requireTextConfirm}
				confirmPrompt={pendingAction?.items && pendingAction.items.length === 1 ? 'Type the resource name to confirm' : 'Type DELETE to confirm'}
				confirmValue={confirmValue}
			/>

			{selectedServiceForDetails && (
				<ServiceDetailDrawer
					item={selectedServiceForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedServiceForDetails(null)
						}
					}}
				/>
			)}
		</div>
	)
}

export function ServicesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["services.list"]}>
			<ServicesContent />
		</RouteGuard>
	)
}
