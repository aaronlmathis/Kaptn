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
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconDownload, IconCopy, IconDatabase, IconCircleCheckFilled } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { DashboardCSIDriver } from "@/lib/k8s-storage"
import { CSIDriverDetailDrawer } from "@/components/viewers/CSIDriverDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useCSIDriversWithWebSocket } from "@/hooks/useCSIDriversWithWebSocket"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { bulkActionsApi } from "@/lib/api/bulk-actions"

// Badge helper functions (preserved from original)
function getAttachRequiredBadge(attachRequired: boolean) {
	return attachRequired ? (
		<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
			Required
		</Badge>
	) : (
		<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
			Not Required
		</Badge>
	)
}

function getPodInfoOnMountBadge(podInfoOnMount: boolean) {
	return podInfoOnMount ? (
		<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
			Enabled
		</Badge>
	) : (
		<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
			Disabled
		</Badge>
	)
}

function getStorageCapacityBadge(storageCapacity: boolean) {
	return storageCapacity ? (
		<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
			<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
			Supported
		</Badge>
	) : (
		<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
			Not Supported
		</Badge>
	)
}

function getFSGroupPolicyBadge(fsGroupPolicy: string) {
	switch (fsGroupPolicy) {
		case "File":
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					File
				</Badge>
			)
		case "ReadWriteOnceWithFSType":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					RWO+FSType
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{fsGroupPolicy || "None"}
				</Badge>
			)
	}
}

// Inner component that can access context
function CSIDriversContent() {
	const { data: csiDrivers, loading: isLoading, error, isConnected } = useCSIDriversWithWebSocket(true)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['csidrivers.*'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedCSIDriverForDetails, setSelectedCSIDriverForDetails] = React.useState<DashboardCSIDriver | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [confirmWarnings, setConfirmWarnings] = React.useState<string[]>([])
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', csiDrivers: DashboardCSIDriver[] }>(null)
	const [alert, setAlert] = React.useState<null | { variant: 'success' | 'error', title: string, description?: string }>(null)

	// Request CSI-related capabilities on demand (cluster-scoped)
	React.useEffect(() => {
		fetchAdditional(['csidrivers.*']).catch(() => { /* noop */ })
		// Run once on mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [capabilityFilter, setCapabilityFilter] = React.useState<string>("all")

	// Create filter options for CSI drivers based on storage capacity support
	const capabilityOptions: FilterOption[] = React.useMemo(() => {
		const capabilities = new Set<string>()
		csiDrivers.forEach(driver => {
			// Create capability categories based on storage capacity
			if (driver.storageCapacity) {
				capabilities.add("Storage Capacity Supported")
			} else {
				capabilities.add("Storage Capacity Not Supported")
			}
		})
		return Array.from(capabilities).sort().map(capability => ({
			value: capability,
			label: capability,
			badge: getStorageCapacityBadge(capability.includes("Supported"))
		}))
	}, [csiDrivers])

	// Filter data based on global filter and capability filter
	const filtered = React.useMemo(() => {
		let filteredData = csiDrivers

		// Apply category filter (storage capacity capabilities)
		if (capabilityFilter !== "all") {
			filteredData = filteredData.filter(driver => {
				// Determine capability for this driver
				const capability = driver.storageCapacity
					? "Storage Capacity Supported"
					: "Storage Capacity Not Supported"
				return capability === capabilityFilter
			})
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filteredData = filteredData.filter(driver =>
				driver.name.toLowerCase().includes(searchTerm) ||
				driver.fsGroupPolicy.toLowerCase().includes(searchTerm) ||
				driver.volumeLifecycleModes.toString().includes(searchTerm) ||
				driver.tokenRequests.toString().includes(searchTerm) ||
				driver.age.toLowerCase().includes(searchTerm)
			)
		}

		return filteredData
	}, [csiDrivers, capabilityFilter, globalFilter])

	// Bulk actions: preflight validate to show warnings in confirmation dialog
	const validateCSIDriversAction = React.useCallback(async (type: 'delete', rows: DashboardCSIDriver[]) => {
		try {
			const targets = rows.map(r => ({ name: r.name }))
			const resp = await bulkActionsApi.validateAction('csidrivers', { action: 'delete-csidrivers', targets })
			const details = resp?.details as Record<string, unknown>
			const warnings: string[] = Array.isArray(details?.results)
				? details.results.flatMap((r: Record<string, unknown>) => Array.isArray(r.warnings) ? r.warnings : [])
				: []
			setConfirmWarnings(warnings)
		} catch {
			setConfirmWarnings([])
		}
	}, [])

	// Build table columns
	const columns: ColumnDef<DashboardCSIDriver>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'CSI Driver Name',
			cell: ({ row }) => (
				<IfAllowed
					feature="csidrivers.*"
					cluster={clusterId}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedCSIDriverForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
			enableHiding: false,
		},
		{
			accessorKey: 'attachRequired',
			header: 'Attach Required',
			cell: ({ row }) => getAttachRequiredBadge(row.original.attachRequired),
		},
		{
			accessorKey: 'podInfoOnMount',
			header: 'Pod Info on Mount',
			cell: ({ row }) => getPodInfoOnMountBadge(row.original.podInfoOnMount),
		},
		{
			accessorKey: 'storageCapacity',
			header: 'Storage Capacity',
			cell: ({ row }) => getStorageCapacityBadge(row.original.storageCapacity),
		},
		{
			accessorKey: 'fsGroupPolicy',
			header: 'FS Group Policy',
			cell: ({ row }) => getFSGroupPolicyBadge(row.original.fsGroupPolicy),
		},
		{
			accessorKey: 'volumeLifecycleModes',
			header: 'Lifecycle Modes',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.volumeLifecycleModes}</div>
			),
		},
		{
			accessorKey: 'tokenRequests',
			header: 'Token Requests',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.tokenRequests}</div>
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
						<Button variant="ghost" size="icon" className="data-[state=open]:bg-muted text-muted-foreground flex size-8">
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed feature="csidrivers.*" cluster={clusterId} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedCSIDriverForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="csidrivers.*" cluster={clusterId} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace="" resourceKind="CSIDriver">
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
								>
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							</ResourceYamlEditor>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="csidrivers.*" cluster={clusterId} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => { setPendingAction({ type: 'delete', csiDrivers: [row.original] }); setConfirmDialogOpen(true); validateCSIDriversAction('delete', [row.original]) }}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId, validateCSIDriversAction])

	// Create bulk actions (preserved from original)
	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardCSIDriver[]) => void | Promise<void> }[] = []

		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				console.log('Export YAML for CSI drivers:', rows.map(d => d.name))
				// TODO: Implement bulk YAML export
			}
		})

		actions.push({
			id: 'copy-names',
			label: 'Copy Driver Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				const names = rows.map(d => d.name).join('\n')
				navigator.clipboard.writeText(names)
				console.log('Copied CSI driver names:', names)
			}
		})

		actions.push({
			id: 'show-capabilities',
			label: 'Show Driver Capabilities',
			icon: <IconDatabase className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				console.log('Show capabilities for CSI drivers:', rows.map(d => d.name))
				// TODO: Implement capabilities overview
			}
		})

		if (isAllowed('csidrivers.*')) {
			actions.push({
				id: 'delete-drivers',
				label: 'Delete Selected Drivers',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					setPendingAction({ type: 'delete', csiDrivers: rows });
					setConfirmDialogOpen(true);
					validateCSIDriversAction('delete', rows)
				}
			})
		}

		return actions
	}, [isAllowed, validateCSIDriversAction])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return
		setIsConfirmExecuting(true)
		try {
			const targets = pendingAction.csiDrivers.map(csi => ({ name: csi.name }))
			const resp = await bulkActionsApi.executeBulkAction('csidrivers', { action: 'delete-csidrivers', targets })
			const success = resp?.success
			const total = resp?.resources_total ?? 0
			const affected = resp?.resources_affected ?? 0
			setAlert({ variant: success ? 'success' : 'error', title: success ? `Success: ${affected}/${total} CSI drivers processed` : `Errors: ${total - affected} failed`, description: resp?.message })
		} catch (e: unknown) {
			setAlert({ variant: 'error', title: 'Action failed', description: e instanceof Error ? e.message : String(e) })
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction])

	return (
		<>


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
								searchPlaceholder="Search CSI drivers by name, FS group policy, lifecycle modes, or age... (Press '/' to focus)"
								categoryFilter={capabilityFilter}
								onCategoryFilterChange={setCapabilityFilter}
								categoryLabel="Filter by capability"
								categoryOptions={capabilityOptions}
								selectedCount={selectedCount}
								totalCount={totalCount}
								bulkActions={bulkActions.map(a => ({
									id: a.id,
									label: a.label,
									icon: a.icon,
									variant: a.variant,
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map(r => r.original as DashboardCSIDriver))
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
				title="Delete CSI Drivers"
				description="Are you sure you want to delete the selected CSI drivers? This action cannot be undone."
				actionLabel="Delete Drivers"
				variant="destructive"
				isExecuting={isConfirmExecuting}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.csiDrivers || []).map(csi => ({ name: csi.name }))}
				safetyViolations={[]}
				warnings={confirmWarnings}
			/>

			{/* Controlled detail drawer for full CSI driver details */}
			{selectedCSIDriverForDetails && (
				<CSIDriverDetailDrawer
					item={selectedCSIDriverForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedCSIDriverForDetails(null)
						}
					}}
				/>
			)}
		</>
	)
}

export function CSIDriversPageContainer() {
	return (
		<RouteGuard
			requiredCapabilities={['csidrivers.*']}
			requireAll={false}
		>
			<CSIDriversContent />
		</RouteGuard>
	)
}
