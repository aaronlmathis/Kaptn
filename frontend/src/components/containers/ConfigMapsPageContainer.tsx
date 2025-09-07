"use client"

import * as React from "react"
import { UniversalDataTable, type BulkAction } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useConfigMapsWithWebSocket } from "@/hooks/useConfigMapsWithWebSocket"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
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
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconCopy, IconDownload } from "@tabler/icons-react"
import { type ColumnDef, type Row } from "@/lib/table"
import type { DashboardConfigMap } from "@/lib/k8s-storage"
import { ConfigMapDetailDrawer } from "@/components/viewers/ConfigMapDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"

// Inner component that can access the namespace context
function ConfigMapsContent() {
	const { data: configMaps, loading: isLoading, error, isConnected } = useConfigMapsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['configmaps.get', 'configmaps.patch', 'configmaps.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedConfigMapForDetails, setSelectedConfigMapForDetails] = React.useState<DashboardConfigMap | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', configMaps: DashboardConfigMap[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	React.useEffect(() => {
		fetchAdditional([
			'configmaps.get',
			'configmaps.patch',
			'configmaps.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when configMaps change
	React.useEffect(() => {
		if (configMaps.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [configMaps])

	// Handle opening detail drawer
	const handleViewDetails = React.useCallback((configMap: DashboardConfigMap) => {
		setSelectedConfigMapForDetails(configMap)
		setDetailDrawerOpen(true)
	}, [])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [sizeFilter, setSizeFilter] = React.useState<string>("all")

	const sizeOptions: FilterOption[] = React.useMemo(() => {
		const sizes = new Set<string>()
		configMaps.forEach(configMap => {
			// Create size categories based on data keys count
			if (configMap.dataKeysCount === 0) {
				sizes.add("Empty")
			} else if (configMap.dataKeysCount <= 5) {
				sizes.add("Small (1-5 keys)")
			} else if (configMap.dataKeysCount <= 20) {
				sizes.add("Medium (6-20 keys)")
			} else {
				sizes.add("Large (20+ keys)")
			}
		})
		return Array.from(sizes).sort().map(size => ({
			value: size,
			label: size,
			badge: (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{size}
				</Badge>
			)
		}))
	}, [configMaps])

	// Filter data based on global filter and size filter
	const filteredData = React.useMemo(() => {
		let filtered = configMaps

		// Apply category filter (size categories)
		if (sizeFilter !== "all") {
			filtered = filtered.filter(configMap => {
				// Determine size category for this config map
				let sizeCategory = ""
				if (configMap.dataKeysCount === 0) {
					sizeCategory = "Empty"
				} else if (configMap.dataKeysCount <= 5) {
					sizeCategory = "Small (1-5 keys)"
				} else if (configMap.dataKeysCount <= 20) {
					sizeCategory = "Medium (6-20 keys)"
				} else {
					sizeCategory = "Large (20+ keys)"
				}
				return sizeCategory === sizeFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(configMap =>
				configMap.name.toLowerCase().includes(searchTerm) ||
				configMap.namespace.toLowerCase().includes(searchTerm) ||
				configMap.dataSize.toLowerCase().includes(searchTerm) ||
				configMap.age.toLowerCase().includes(searchTerm)
			)
		}

		return filtered
	}, [configMaps, sizeFilter, globalFilter])

	// Create columns for the UniversalDataTable
	const columns: ColumnDef<DashboardConfigMap>[] = React.useMemo(() => [
		{
			accessorKey: "name",
			header: "Name",
			cell: ({ row }: { row: Row<DashboardConfigMap> }) => {
				return (
					<IfAllowed
						feature="configmaps.get"
						cluster={clusterId}
						namespace={row.original.namespace}
						resourceName={row.original.name}
						fallback={<span>{row.original.name}</span>}
					>
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
			cell: ({ row }: { row: Row<DashboardConfigMap> }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: "dataKeysCount",
			header: "Data Keys",
			cell: ({ row }: { row: Row<DashboardConfigMap> }) => (
				<div className="font-mono text-sm">{row.original.dataKeysCount}</div>
			),
		},
		{
			accessorKey: "dataSize",
			header: "Data Size",
			cell: ({ row }: { row: Row<DashboardConfigMap> }) => (
				<div className="font-mono text-sm">{row.original.dataSize}</div>
			),
		},
		{
			accessorKey: "labelsCount",
			header: "Labels",
			cell: ({ row }: { row: Row<DashboardConfigMap> }) => (
				<div className="font-mono text-sm">{row.original.labelsCount}</div>
			),
		},
		{
			accessorKey: "annotationsCount",
			header: "Annotations",
			cell: ({ row }: { row: Row<DashboardConfigMap> }) => (
				<div className="font-mono text-sm">{row.original.annotationsCount}</div>
			),
		},
		{
			accessorKey: "age",
			header: "Age",
			cell: ({ row }: { row: Row<DashboardConfigMap> }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: "actions",
			cell: ({ row }: { row: Row<DashboardConfigMap> }) => (

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
							feature="configmaps.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconEye className="size-4 mr-2" />
									View Details
								</DropdownMenuItem>
							}
						>
							<DropdownMenuItem onClick={() => handleViewDetails(row.original)}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>

						<IfAllowed
							feature="configmaps.patch"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace={row.original.namespace}
								resourceKind="ConfigMap"
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
							feature="configmaps.delete"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconTrash className="size-4 mr-2" />
									Delete
								</DropdownMenuItem>
							}
						>
							<DropdownMenuItem
								className="text-red-600"
								onClick={() => {
									setPendingAction({ type: 'delete', configMaps: [row.original] })
									setConfirmDialogOpen(true)
								}}
							>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	], [handleViewDetails, clusterId, setPendingAction, setConfirmDialogOpen])

	// Bulk actions for ConfigMaps
	const bulkActions: BulkAction<DashboardConfigMap>[] = React.useMemo(() => {
		const actions: BulkAction<DashboardConfigMap>[] = []

		// Copy Names (always available)
		actions.push({
			id: "copy-names",
			label: "Copy ConfigMap Names",
			icon: <IconCopy className="size-4" />,
			action: (selectedConfigMaps: DashboardConfigMap[]) => {
				const names = selectedConfigMaps.map(cm => cm.name).join('\n')
				navigator.clipboard.writeText(names)
			},
			requiresSelection: true,
		})

		// Export YAML (requires configmaps.get)
		if (isAllowed('configmaps.get')) {
			actions.push({
				id: "export-yaml",
				label: "Export Selected as YAML",
				icon: <IconDownload className="size-4" />,
				action: (selectedConfigMaps: DashboardConfigMap[]) => {
					console.log('Export YAML for config maps:', selectedConfigMaps.map(cm => cm.name))
					// TODO: Implement YAML export functionality
				},
				requiresSelection: true,
			})
		}

		// Delete (requires configmaps.delete)
		if (isAllowed('configmaps.delete')) {
			actions.push({
				id: "delete-configmaps",
				label: "Delete Selected ConfigMaps",
				icon: <IconTrash className="size-4" />,
				variant: "destructive" as const,
				action: (selectedConfigMaps: DashboardConfigMap[]) => {
					setPendingAction({ type: 'delete', configMaps: selectedConfigMaps })
					setConfirmDialogOpen(true)
				},
				requiresSelection: true,
			})
		}

		return actions
	}, [isAllowed, setPendingAction, setConfirmDialogOpen])

	// Remove the getBulkActionWithData function as it's no longer needed

	// Handle confirmed delete action
	const handleConfirmAction = async () => {
		if (!pendingAction) return

		setIsConfirmExecuting(true)
		try {
			if (pendingAction.type === 'delete') {
				const targets = pendingAction.configMaps.map(cm => ({
					namespace: cm.namespace,
					name: cm.name,
				}))

				await bulkActionsApi.executeBulkAction('configmaps', {
					action: 'delete',
					targets,
					force_confirm: true,
				})

				setAlert({
					variant: 'success',
					title: 'ConfigMaps deleted successfully',
					description: `${pendingAction.configMaps.length} ConfigMap(s) deleted.`
				})
			}
		} catch (error) {
			setAlert({
				variant: 'error',
				title: 'Delete failed',
				description: error instanceof Error ? error.message : 'Unknown error occurred'
			})
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}

	// Generate summary cards from configMap data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!configMaps || configMaps.length === 0) {
			return [
				{
					title: "Total ConfigMaps",
					value: 0,
					subtitle: "No configmaps found"
				},
				{
					title: "Data Keys",
					value: 0,
					subtitle: "0 data keys"
				},
				{
					title: "Data Size",
					value: "0 B",
					subtitle: "0 bytes total"
				},
				{
					title: "Labels",
					value: 0,
					subtitle: "0 labels total"
				}
			]
		}

		const totalConfigMaps = configMaps.length

		// Calculate ConfigMap-specific metrics
		const totalDataKeys = configMaps.reduce((sum, cm) => sum + cm.dataKeysCount, 0)
		const totalDataSizeBytes = configMaps.reduce((sum, cm) => sum + cm.dataSizeBytes, 0)
		const totalLabels = configMaps.reduce((sum, cm) => sum + cm.labelsCount, 0)

		// Format total data size
		let totalDataSizeStr = "0 B"
		if (totalDataSizeBytes > 0) {
			if (totalDataSizeBytes < 1024) {
				totalDataSizeStr = `${totalDataSizeBytes} B`
			} else if (totalDataSizeBytes < 1024 * 1024) {
				totalDataSizeStr = `${(totalDataSizeBytes / 1024).toFixed(1)} KB`
			} else {
				totalDataSizeStr = `${(totalDataSizeBytes / (1024 * 1024)).toFixed(1)} MB`
			}
		}

		// Calculate percentage metrics for badges
		const configMapsWithData = configMaps.filter(cm => cm.dataKeysCount > 0).length

		return [
			{
				title: "Total ConfigMaps",
				value: totalConfigMaps,
				subtitle: `${configMapsWithData}/${totalConfigMaps} with data`,
				badge: getReplicaStatusBadge(configMapsWithData, totalConfigMaps),
				icon: getResourceIcon("configmaps"),
				footer: totalConfigMaps > 0 ? "All ConfigMap resources in cluster" : "No ConfigMaps found"
			},
			{
				title: "Data Keys",
				value: totalDataKeys,
				subtitle: `${totalDataKeys} data keys total`,
				badge: getHealthTrendBadge(totalDataKeys > 0 ? 100 : 0),
				footer: totalDataKeys > 0 ? "Configuration data entries" : "No data keys"
			},
			{
				title: "Data Size",
				value: totalDataSizeStr,
				subtitle: `${totalDataSizeBytes} bytes`,
				badge: getUpdateStatusBadge(totalDataSizeBytes, Math.max(totalDataSizeBytes, 1)),
				footer: totalDataSizeBytes > 0 ? "Total configuration data size" : "No data stored"
			},
			{
				title: "Labels",
				value: totalLabels,
				subtitle: `${totalLabels} labels total`,
				badge: getHealthTrendBadge(totalLabels > 0 ? 100 : 0),
				footer: totalLabels > 0 ? "Metadata labels across all ConfigMaps" : "No labels"
			}
		]
	}, [configMaps])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">ConfigMaps</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor ConfigMap resources in your Kubernetes cluster
						</p>
					</div>
					{lastUpdated && (
						<div className="text-sm text-muted-foreground">
							Last updated: {new Date(lastUpdated).toLocaleTimeString()}
						</div>
					)}
				</div>
			</div>

			{/* Alert for action results */}
			{alert && (
				<div className="px-4 lg:px-6">
					<Alert variant={alert.variant === 'error' ? 'destructive' : 'default'}>
						<AlertTitle>{alert.title}</AlertTitle>
						{alert.description && <AlertDescription>{alert.description}</AlertDescription>}
					</Alert>
				</div>
			)}

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<div className="px-4 lg:px-6">
				<UniversalDataTable
					data={filteredData}
					columns={columns}
					enableReorder={false}
					enableRowSelection={true}
					loading={isLoading}
					error={error}
					bulkActions={bulkActions}
					renderFilters={({ table, selectedCount, totalCount }) => (
						<DataTableFilters
							globalFilter={globalFilter}
							onGlobalFilterChange={setGlobalFilter}
							searchPlaceholder="Search config maps by name, namespace, data size, or age... (Press '/' to focus)"
							categoryFilter={sizeFilter}
							onCategoryFilterChange={setSizeFilter}
							categoryLabel="Filter by size"
							categoryOptions={sizeOptions}
							selectedCount={selectedCount}
							totalCount={totalCount}
							bulkActions={bulkActions.map(a => ({
								id: a.id,
								label: a.label,
								icon: a.icon || undefined,
								variant: (a.variant || 'default') as "default" | "destructive",
								requiresSelection: a.requiresSelection,
								action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardConfigMap }) => r.original))
							}))}
							bulkActionsLabel="Actions"
							table={table}
							showColumnToggle={true}
						>
							{/* Real-time updates indicator */}
							{isConnected && (
								<div className="flex items-center space-x-1 text-xs text-green-600">
									<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
									<span>Live updates</span>
								</div>
							)}
						</DataTableFilters>
					)}
				/>
			</div>

			{/* Controlled detail drawer for full config map details */}
			{selectedConfigMapForDetails && (
				<ConfigMapDetailDrawer
					item={selectedConfigMapForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedConfigMapForDetails(null)
						}
					}}
				/>
			)}

			{/* Confirmation dialog for destructive actions */}
			<ActionConfirmationDialog
				open={confirmDialogOpen}
				onOpenChange={setConfirmDialogOpen}
				title="Delete ConfigMaps"
				description={`Are you sure you want to delete ${pendingAction?.configMaps.length || 0} ConfigMap(s)? This action cannot be undone.`}
				actionLabel="Delete ConfigMaps"
				variant="destructive"
				resources={pendingAction?.configMaps.map(cm => ({
					name: cm.name,
					namespace: cm.namespace,
				})) || []}
				warnings={[]}
				safetyViolations={[]}
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
			/>
		</div>
	)
}

export function ConfigMapsPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["configmaps.list"]}>
			<ConfigMapsContent />
		</RouteGuard>
	)
}
