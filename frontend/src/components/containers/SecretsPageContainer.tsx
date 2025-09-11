"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useSecretsWithWebSocket } from "@/hooks/useSecretsWithWebSocket"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
	IconShieldLock,
	IconKey,
	IconDatabase,
	IconExclamationCircle,
	IconDotsVertical,
	IconEye,
	IconEdit,
	IconTrash,
	IconCopy,
	IconDownload,
	IconPlus
} from "@tabler/icons-react"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { type ColumnDef } from "@/lib/table"
import type { DashboardSecret } from "@/lib/k8s-storage"
import { SecretDetailDrawer } from "@/components/secrets/SecretDetailDrawer"
import { SecretFormDrawer } from "@/components/secrets/SecretFormDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"
import { bulkActionsApi } from "@/lib/api/bulk-actions"
import { toast } from "sonner"

// Inner component that can access the namespace context
function SecretsContent() {
	const { data: secrets, loading: isLoading, error, isConnected, refetch } = useSecretsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['secrets.read', 'secrets.update', 'secrets.patch', 'secrets.delete', 'secrets.create'])

	// State for detail drawer
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedSecretForDetails, setSelectedSecretForDetails] = React.useState<DashboardSecret | null>(null)

	// State for form drawer
	const [formDrawerOpen, setFormDrawerOpen] = React.useState(false)
	const [selectedSecretForEdit, setSelectedSecretForEdit] = React.useState<DashboardSecret | null>(null)

	// Filters state
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [typeFilter, setTypeFilter] = React.useState<string>("all")

	// Confirmation dialog state
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [isConfirmExecuting, setIsConfirmExecuting] = React.useState(false)
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', secrets: DashboardSecret[] }>(null)

	React.useEffect(() => {
		fetchAdditional([
			'secrets.read',
			'secrets.update',
			'secrets.patch',
			'secrets.delete',
			'secrets.create',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when secrets change
	React.useEffect(() => {
		if (secrets.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [secrets])

	// Helper function to get secret type badge
	const getSecretTypeBadge = React.useCallback((type: string) => {
		switch (type.toLowerCase()) {
			case 'opaque':
				return <Badge variant="secondary" className="text-xs">Opaque</Badge>
			case 'kubernetes.io/tls':
				return <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">TLS</Badge>
			case 'kubernetes.io/dockerconfigjson':
				return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Docker</Badge>
			case 'kubernetes.io/service-account-token':
				return <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">ServiceAccount</Badge>
			case 'kubernetes.io/basic-auth':
				return <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">BasicAuth</Badge>
			case 'kubernetes.io/ssh-auth':
				return <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">SSH</Badge>
			default:
				return <Badge variant="outline" className="text-xs">{type}</Badge>
		}
	}, [])

	// Event handlers
	const handleViewDetails = React.useCallback((secret: DashboardSecret) => {
		setSelectedSecretForDetails(secret)
		setDetailDrawerOpen(true)
	}, [])

	const handleNewSecret = React.useCallback(() => {
		setSelectedSecretForEdit(null)
		setFormDrawerOpen(true)
	}, [])

	const handleEditSecret = React.useCallback((secret: DashboardSecret) => {
		setSelectedSecretForEdit(secret)
		setFormDrawerOpen(true)
	}, [])

	const handleDeleteSecret = React.useCallback(async (secret: DashboardSecret) => {
		try {
			await bulkActionsApi.deleteSecrets([{
				namespace: secret.namespace,
				name: secret.name
			}])
			toast.success("Secret deleted", {
				description: `Secret "${secret.name}" has been deleted successfully`,
				duration: 3000,
			})
			refetch()
		} catch (error) {
			toast.error("Failed to delete secret", {
				description: error instanceof Error ? error.message : "An unexpected error occurred",
				duration: 4000,
			})
		}
	}, [refetch])

	const handleFormSave = React.useCallback(() => {
		refetch()
	}, [refetch])

	// Filtered data based on global filter and type filter
	const filteredData = React.useMemo(() => {
		let filtered = secrets

		// Apply type filter
		if (typeFilter !== "all") {
			filtered = filtered.filter(secret => secret.type === typeFilter)
		}

		// Apply global filter (search)
		if (globalFilter) {
			const searchTerm = globalFilter.toLowerCase()
			filtered = filtered.filter(secret =>
				secret.name.toLowerCase().includes(searchTerm) ||
				secret.namespace.toLowerCase().includes(searchTerm) ||
				secret.type.toLowerCase().includes(searchTerm) ||
				secret.keys.some(key => key.toLowerCase().includes(searchTerm))
			)
		}

		return filtered
	}, [secrets, typeFilter, globalFilter])

	// Filter options for secret types
	const secretTypes: FilterOption[] = React.useMemo(() => {
		const types = new Set(secrets.map(secret => secret.type))
		return Array.from(types).sort().map(type => ({
			value: type,
			label: type,
			badge: getSecretTypeBadge(type)
		}))
	}, [secrets, getSecretTypeBadge])

	// Columns definition
	const columns: ColumnDef<DashboardSecret>[] = React.useMemo(() => [
		{
			accessorKey: 'name',
			header: 'Name',
			cell: ({ row }) => (
				<IfAllowed
					feature="secrets.read"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span className="font-mono text-sm">{row.original.name}</span>}
				>
					<button
						onClick={() => handleViewDetails(row.original)}
						className="text-left hover:underline focus:underline focus:outline-none font-mono text-sm"
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
			),
		},
		{
			accessorKey: 'type',
			header: 'Type',
			cell: ({ row }) => getSecretTypeBadge(row.original.type),
		},
		{
			accessorKey: 'keysCount',
			header: 'Keys',
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<div className="font-mono text-sm">{row.original.keysCount}</div>
					{row.original.keys.length > 0 && (
						<div className="flex gap-1 max-w-32 overflow-hidden">
							{row.original.keys.slice(0, 2).map((key: string, index: number) => (
								<Badge key={index} variant="outline" className="text-xs text-muted-foreground">
									{key.length > 10 ? `${key.slice(0, 10)}...` : key}
								</Badge>
							))}
							{row.original.keys.length > 2 && (
								<Badge variant="outline" className="text-xs text-muted-foreground">
									+{row.original.keys.length - 2}
								</Badge>
							)}
						</div>
					)}
				</div>
			),
		},
		{
			accessorKey: 'dataSize',
			header: 'Size',
			cell: ({ row }) => (
				<div className="font-mono text-sm">{row.original.dataSize}</div>
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
			accessorKey: 'labelsCount',
			header: 'Labels',
			cell: ({ row }) => (
				<div className="flex items-center gap-1">
					<div className="font-mono text-sm">{row.original.labelsCount}</div>
					{row.original.labelsCount > 0 && (
						<Badge variant="outline" className="text-xs text-blue-600">
							{row.original.labelsCount}
						</Badge>
					)}
				</div>
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
						<IfAllowed
							feature="secrets.read"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => handleViewDetails(row.original)}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="secrets.update"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit Secret</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => handleEditSecret(row.original)}>
								<IconEdit className="size-4 mr-2" />
								Edit Secret
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="secrets.patch"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace={row.original.namespace}
								resourceKind="Secret"
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
							feature="secrets.delete"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem
								className="text-red-600"
								onClick={() => handleDeleteSecret(row.original)}
							>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	], [clusterId, getSecretTypeBadge, handleViewDetails, handleEditSecret, handleDeleteSecret])

	// Bulk actions
	const bulkActions = React.useMemo(() => {
		const actions = []

		// Copy names action
		actions.push({
			id: "copy-names",
			label: "Copy Secret Names",
			icon: <IconCopy className="size-4" />,
			action: (selectedSecrets: DashboardSecret[]) => {
				const names = selectedSecrets.map(s => s.name).join('\n')
				navigator.clipboard.writeText(names)
				toast.success(`Copied ${selectedSecrets.length} secret names to clipboard`)
			},
			requiresSelection: true,
		})

		// Copy keys action
		actions.push({
			id: "copy-keys",
			label: "Copy Secret Keys",
			icon: <IconCopy className="size-4" />,
			action: (selectedSecrets: DashboardSecret[]) => {
				const allKeys = selectedSecrets.flatMap(s => s.keys).join('\n')
				navigator.clipboard.writeText(allKeys)
				toast.success(`Copied keys from ${selectedSecrets.length} secrets to clipboard`)
			},
			requiresSelection: true,
		})

		// Export YAML action (if read permission)
		if (isAllowed('secrets.read')) {
			actions.push({
				id: "export-yaml",
				label: "Export Selected as YAML",
				icon: <IconDownload className="size-4" />,
				action: (selectedSecrets: DashboardSecret[]) => {
					console.log('Export YAML for secrets:', selectedSecrets.map(s => s.name))
					toast.info(`Exporting ${selectedSecrets.length} secrets as YAML (placeholder)`)
				},
				requiresSelection: true,
			})
		}

		// Delete action (if delete permission)
		if (isAllowed('secrets.delete')) {
			actions.push({
				id: "delete-secrets",
				label: "Delete Selected Secrets",
				icon: <IconTrash className="size-4" />,
				action: (selectedSecrets: DashboardSecret[]) => {
					setPendingAction({ type: 'delete', secrets: selectedSecrets })
					setConfirmDialogOpen(true)
				},
				variant: "destructive" as const,
				requiresSelection: true,
			})
		}

		return actions
	}, [isAllowed, setPendingAction, setConfirmDialogOpen])

	// Confirmation action execution
	const executeConfirmation = React.useCallback(async () => {
		if (!pendingAction) return

		setIsConfirmExecuting(true)
		try {
			if (pendingAction.type === 'delete') {
				await bulkActionsApi.deleteSecrets(
					pendingAction.secrets.map(s => ({ namespace: s.namespace, name: s.name }))
				)
				toast.success(`Deleted ${pendingAction.secrets.length} secrets successfully`)
				refetch()
			}
		} catch (error) {
			toast.error("Operation failed", {
				description: error instanceof Error ? error.message : "An unexpected error occurred",
			})
		} finally {
			setIsConfirmExecuting(false)
			setConfirmDialogOpen(false)
			setPendingAction(null)
		}
	}, [pendingAction, refetch])

	// Update lastUpdated when secrets change
	React.useEffect(() => {
		if (secrets.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [secrets])

	// Generate summary cards from secret data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!secrets || secrets.length === 0) {
			return [
				{
					title: "Total Secrets",
					value: 0,
					subtitle: "No secrets found",
					icon: <IconShieldLock className="size-4 text-muted-foreground" />
				},
				{
					title: "Secret Types",
					value: 0,
					subtitle: "No types",
					icon: <IconKey className="size-4 text-muted-foreground" />
				},
				{
					title: "Total Keys",
					value: 0,
					subtitle: "No data keys",
					icon: <IconDatabase className="size-4 text-muted-foreground" />
				},
				{
					title: "Storage Used",
					value: "0 B",
					subtitle: "No data",
					icon: <IconDatabase className="size-4 text-muted-foreground" />
				}
			]
		}

		const totalSecrets = secrets.length

		// Count secrets by type
		const typeCount = new Set(secrets.map(s => s.type)).size
		const opaqueSecrets = secrets.filter(s => s.type === 'Opaque').length
		const tlsSecrets = secrets.filter(s => s.type === 'kubernetes.io/tls').length
		const dockerSecrets = secrets.filter(s => s.type === 'kubernetes.io/dockerconfigjson').length

		// Calculate total data
		const totalKeys = secrets.reduce((sum, s) => sum + s.keysCount, 0)
		const totalDataBytes = secrets.reduce((sum, s) => sum + s.dataSizeBytes, 0)

		// Format total data size
		let totalDataSize: string
		if (totalDataBytes < 1024) {
			totalDataSize = `${totalDataBytes} B`
		} else if (totalDataBytes < 1024 * 1024) {
			totalDataSize = `${(totalDataBytes / 1024).toFixed(1)} KB`
		} else {
			totalDataSize = `${(totalDataBytes / (1024 * 1024)).toFixed(1)} MB`
		}

		// Determine the most common secret type for subtitle
		let mostCommonType = "Mixed types"
		if (opaqueSecrets > 0 && opaqueSecrets === totalSecrets) {
			mostCommonType = "All Opaque"
		} else if (tlsSecrets > 0 && tlsSecrets === totalSecrets) {
			mostCommonType = "All TLS"
		} else if (opaqueSecrets > tlsSecrets && opaqueSecrets > dockerSecrets) {
			mostCommonType = `${opaqueSecrets} Opaque`
		} else if (tlsSecrets > 0) {
			mostCommonType = `${tlsSecrets} TLS`
		}

		return [
			{
				title: "Total Secrets",
				value: totalSecrets,
				subtitle: mostCommonType,
				badge: totalSecrets > 0 ? <Badge variant="secondary" className="text-xs">{totalSecrets}</Badge> : undefined,
				icon: <IconShieldLock className="size-4 text-green-600" />,
				footer: totalSecrets > 0 ? "Secure credential storage" : "No secrets found"
			},
			{
				title: "Secret Types",
				value: typeCount,
				subtitle: typeCount > 1 ? "Multiple types used" : typeCount === 1 ? "Single type" : "No types",
				badge: typeCount > 0 ? getSecretTypeBadge(secrets[0]?.type || 'Opaque') : undefined,
				footer: typeCount > 0 ? "Different credential formats" : "No secret types"
			},
			{
				title: "Total Keys",
				value: totalKeys,
				subtitle: totalKeys > 0 ? `${(totalKeys / totalSecrets).toFixed(1)} avg per secret` : "No data keys",
				badge: totalKeys > 10 ? <Badge variant="outline" className="text-xs text-blue-600">High</Badge> :
					totalKeys > 5 ? <Badge variant="outline" className="text-xs text-green-600">Medium</Badge> :
						totalKeys > 0 ? <Badge variant="outline" className="text-xs text-gray-600">Low</Badge> : undefined,
				icon: <IconKey className="size-4 text-blue-600" />,
				footer: totalKeys > 0 ? "Individual data entries" : "No data keys"
			},
			{
				title: "Storage Used",
				value: totalDataSize,
				subtitle: totalSecrets > 0 ? `${(totalDataBytes / totalSecrets / 1024).toFixed(1)} KB avg` : "No data",
				badge: totalDataBytes > 1024 * 1024 ? <Badge variant="outline" className="text-xs text-red-600">Large</Badge> :
					totalDataBytes > 1024 * 10 ? <Badge variant="outline" className="text-xs text-yellow-600">Medium</Badge> :
						totalDataBytes > 0 ? <Badge variant="outline" className="text-xs text-green-600">Small</Badge> : undefined,
				icon: <IconDatabase className="size-4 text-purple-600" />,
				footer: totalDataBytes > 0 ? "Encrypted at rest" : "No data stored"
			}
		]
	}, [secrets, getSecretTypeBadge])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">

				{/* Security reminder */}
				<div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-300 bg-transparent px-4 py-3 rounded-lg border-2 border-orange-400 dark:border-orange-600">
					<IconExclamationCircle className="size-4 text-orange-600 dark:text-orange-400" />
					<span>Secret values are hidden by default for security. Click to reveal individual values.</span>
				</div>
			</div>


			{/* Summary Cards */}
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
					onRefresh={refetch}
					isRefreshing={isLoading}
					renderFilters={({ table }) => (
						<DataTableFilters
							globalFilter={globalFilter}
							onGlobalFilterChange={setGlobalFilter}
							searchPlaceholder="Search secrets by name, namespace, type, or keys..."
							categoryFilter={typeFilter}
							onCategoryFilterChange={setTypeFilter}
							categoryLabel="Filter by type"
							categoryOptions={secretTypes}
							selectedCount={table.getFilteredSelectedRowModel().rows.length}
							totalCount={table.getFilteredRowModel().rows.length}
							bulkActions={bulkActions.map(a => ({
								id: a.id,
								label: a.label,
								icon: a.icon,
								variant: a.variant || "default",
								requiresSelection: a.requiresSelection,
								action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardSecret }) => r.original))
							}))}
							bulkActionsLabel="Actions"
							onCreateNew={isAllowed('secrets.create') ? handleNewSecret : undefined}
							createLabel={isAllowed('secrets.create') ? "New Secret" : undefined}
							createIcon={isAllowed('secrets.create') ? <IconPlus className="size-4" /> : undefined}
							table={table}
							showColumnToggle={true}
						>
						</DataTableFilters>
					)}
				/>
			</div>

			{/* Controlled detail drawer for full secret details */}
			{selectedSecretForDetails && (
				<SecretDetailDrawer
					item={selectedSecretForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open: boolean) => {
						setDetailDrawerOpen(open)
						if (!open) {
							setSelectedSecretForDetails(null)
						}
					}}
				/>
			)}

			{/* Controlled form drawer for creating/editing secrets */}
			<SecretFormDrawer
				secret={selectedSecretForEdit}
				open={formDrawerOpen}
				onOpenChange={(open: boolean) => {
					setFormDrawerOpen(open)
					if (!open) {
						setSelectedSecretForEdit(null)
					}
				}}
				onSave={handleFormSave}
			/>

			{/* Confirmation dialog for destructive actions */}
			<ActionConfirmationDialog
				open={confirmDialogOpen}
				onOpenChange={(open) => {
					setConfirmDialogOpen(open)
					if (!open) {
						setPendingAction(null)
					}
				}}
				title={pendingAction?.type === 'delete' ? 'Delete Secrets' : 'Confirm Action'}
				description={
					pendingAction?.type === 'delete'
						? `Are you sure you want to delete ${pendingAction.secrets.length} secret(s)? This action cannot be undone and will permanently remove the secrets and all their data.`
						: 'Are you sure you want to perform this action?'
				}
				variant={pendingAction?.type === 'delete' ? 'destructive' : 'default'}
				actionLabel={pendingAction?.type === 'delete' ? 'Delete Secrets' : 'Confirm'}
				resources={pendingAction?.secrets?.map(s => ({ name: s.name, namespace: s.namespace })) || []}
				warnings={[]}
				safetyViolations={[]}
				onConfirm={executeConfirmation}
				isExecuting={isConfirmExecuting}
			/>
		</div>
	)
}

export function SecretsPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["secrets.list"]}>
			<SecretsContent />
		</RouteGuard>
	)
}
