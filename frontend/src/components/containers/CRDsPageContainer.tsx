"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useCRDsWithWebSocket } from "@/hooks/useCRDsWithWebSocket"
import {
	getResourceIcon,
	getCRDStatusBadge,
	getCRDScopeBadge,
	getCRDEstablishedBadge
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	IconDotsVertical,
	IconEye,
	IconEdit,
	IconTrash,
	IconDownload,
	IconCopy,
	IconCircleCheckFilled,
	IconCheck,
	IconCircleX,
	IconClock,
} from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { type CRDTableRow } from "@/types/crd"
import { CRDDetailDrawer } from "@/components/viewers/CRDDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { ActionConfirmationDialog } from "@/components/ui/action-confirmation-dialog"

// CRD status badge helpers
function getCRDStatusBadgeLocal(status: string) {
	switch (status) {
		case "Established":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCheck className="size-3 mr-1" />
					{status}
				</Badge>
			)
		case "Not Ready":
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconCircleX className="size-3 mr-1" />
					{status}
				</Badge>
			)
		case "Terminating":
			return (
				<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
					<IconClock className="size-3 mr-1" />
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

function getCRDScopeBadgeLocal(scope: string) {
	switch (scope) {
		case "Namespaced":
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
					{scope}
				</Badge>
			)
		case "Cluster":
			return (
				<Badge variant="outline" className="text-purple-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-purple-600 mr-1" />
					{scope}
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{scope}
				</Badge>
			)
	}
}

// Inner component that can access the namespace context
function CRDsContent() {
	const { data: crds, loading: isLoading, error, isConnected } = useCRDsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext([
		'customresourcedefinitions.get',
		'customresourcedefinitions.patch',
		'customresourcedefinitions.delete'
	])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedCRDForDetails, setSelectedCRDForDetails] = React.useState<CRDTableRow | null>(null)
	const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false)
	const [pendingAction, setPendingAction] = React.useState<null | { type: 'delete', crds: CRDTableRow[] }>(null)

	React.useEffect(() => {
		fetchAdditional([
			'customresourcedefinitions.get',
			'customresourcedefinitions.patch',
			'customresourcedefinitions.delete',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Update lastUpdated when CRDs change
	React.useEffect(() => {
		if (crds.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [crds])

	// Generate summary cards from CRD data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!crds || crds.length === 0) {
			return [
				{
					title: "Total CRDs",
					value: 0,
					subtitle: "No Custom Resource Definitions found"
				},
				{
					title: "Namespaced CRDs",
					value: 0,
					subtitle: "0 namespaced CRDs"
				},
				{
					title: "Cluster-scoped CRDs",
					value: 0,
					subtitle: "0 cluster-scoped CRDs"
				},
				{
					title: "Established CRDs",
					value: 0,
					subtitle: "0 established CRDs"
				}
			]
		}

		const totalCRDs = crds.length
		const namespacedCRDs = crds.filter(c => c.scope === 'Namespaced').length
		const clusterCRDs = crds.filter(c => c.scope === 'Cluster').length
		const establishedCRDs = crds.filter(c => c.status === 'Established').length
		const notReadyCRDs = crds.filter(c => c.status === 'Not Ready').length

		return [
			{
				title: "Total CRDs",
				value: totalCRDs,
				subtitle: `${totalCRDs} Custom Resource Definitions in cluster`,
				badge: getCRDStatusBadge(totalCRDs),
				icon: getResourceIcon("crds"),
				footer: totalCRDs > 0 ? "All CRD resources in cluster" : "No CRDs found"
			},
			{
				title: "Namespaced",
				value: namespacedCRDs,
				subtitle: `${namespacedCRDs} namespace-scoped CRDs`,
				badge: getCRDScopeBadge(namespacedCRDs, totalCRDs, "Namespaced"),
				footer: namespacedCRDs > 0 ? "Namespace-scoped custom resources" : "No namespaced CRDs"
			},
			{
				title: "Cluster-scoped",
				value: clusterCRDs,
				subtitle: `${clusterCRDs} cluster-scoped CRDs`,
				badge: getCRDScopeBadge(clusterCRDs, totalCRDs, "Cluster"),
				footer: clusterCRDs > 0 ? "Cluster-wide custom resources" : "No cluster-scoped CRDs"
			},
			{
				title: "Established",
				value: establishedCRDs,
				subtitle: `${establishedCRDs} ready and established CRDs`,
				badge: getCRDEstablishedBadge(establishedCRDs, totalCRDs),
				footer: notReadyCRDs > 0 ? `${notReadyCRDs} CRDs not ready` : "All CRDs are established"
			}
		]
	}, [crds])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [scopeFilter, setScopeFilter] = React.useState<string>("all")

	const scopeOptions: FilterOption[] = React.useMemo(() => {
		const scopes = Array.from(new Set(crds.map(crd => crd.scope))).filter(Boolean).sort()
		return scopes.map(scope => ({
			value: scope,
			label: scope,
			badge: getCRDScopeBadgeLocal(scope)
		}))
	}, [crds])

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return crds.filter(c => {
			const matchesQuery = !q ||
				c.name.toLowerCase().includes(q) ||
				c.group.toLowerCase().includes(q) ||
				c.kind.toLowerCase().includes(q) ||
				c.plural.toLowerCase().includes(q) ||
				c.singular.toLowerCase().includes(q) ||
				c.scope.toLowerCase().includes(q) ||
				c.status.toLowerCase().includes(q) ||
				c.versions.some(version => version.toLowerCase().includes(q))
			const matchesScope = scopeFilter === 'all' || c.scope === scopeFilter
			return matchesQuery && matchesScope
		})
	}, [crds, globalFilter, scopeFilter])

	// Table columns
	const columns: ColumnDef<CRDTableRow>[] = React.useMemo(() => [
		{
			accessorKey: 'name',
			header: 'Name',
			cell: ({ row }: { row: { original: CRDTableRow } }) => (
				<IfAllowed
					feature="customresourcedefinitions.get"
					cluster={clusterId}
					namespace=""
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedCRDForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
			enableHiding: false,
		},
		{
			accessorKey: 'group',
			header: 'API Group',
			cell: ({ row }: { row: { original: CRDTableRow } }) => (
				<div className="font-mono text-sm">{row.original.group}</div>
			),
		},
		{
			accessorKey: 'kind',
			header: 'Kind',
			cell: ({ row }: { row: { original: CRDTableRow } }) => (
				<Badge variant="secondary" className="px-1.5">
					{row.original.kind}
				</Badge>
			),
		},
		{
			accessorKey: 'scope',
			header: 'Scope',
			cell: ({ row }: { row: { original: CRDTableRow } }) => getCRDScopeBadgeLocal(row.original.scope),
		},
		{
			accessorKey: 'versions',
			header: 'Versions',
			cell: ({ row }: { row: { original: CRDTableRow } }) => (
				<div className="font-mono text-sm">
					{row.original.versions.length > 0 ? row.original.versions.join(", ") : "None"}
				</div>
			),
		},
		{
			accessorKey: 'status',
			header: 'Status',
			cell: ({ row }: { row: { original: CRDTableRow } }) => getCRDStatusBadgeLocal(row.original.status),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: CRDTableRow } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: CRDTableRow } }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="data-[state=open]:bg-muted text-muted-foreground flex size-8">
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed
							feature="customresourcedefinitions.get"
							cluster={clusterId}
							namespace=""
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedCRDForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>

						<IfAllowed
							feature="customresourcedefinitions.patch"
							cluster={clusterId}
							namespace=""
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace=""
								resourceKind="CustomResourceDefinition"
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
							feature="customresourcedefinitions.delete"
							cluster={clusterId}
							namespace=""
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem
								className="text-red-600"
								onClick={() => { setPendingAction({ type: 'delete', crds: [row.original] }); setConfirmDialogOpen(true) }}
							>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		},
	], [clusterId])

	// Bulk actions
	const bulkActions = React.useMemo(() => {
		const actions: Array<{
			id: string
			label: string
			icon?: React.ReactNode
			variant?: 'default' | 'destructive'
			requiresSelection?: boolean
			action: (rows: CRDTableRow[]) => void | Promise<void>
		}> = []

		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				console.log('Export YAML for CRDs:', rows.map(c => c.name))
				// TODO: Implement bulk YAML export
			},
		})

		actions.push({
			id: 'copy-names',
			label: 'Copy CRD Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				const names = rows.map(c => c.name).join('\n')
				navigator.clipboard.writeText(names)
			},
		})

		if (isAllowed('customresourcedefinitions.delete')) {
			actions.push({
				id: 'delete-crds',
				label: 'Delete Selected CRDs',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: (rows) => {
					setPendingAction({ type: 'delete', crds: rows })
					setConfirmDialogOpen(true)
				},
			})
		}

		return actions
	}, [isAllowed])

	const handleConfirmAction = React.useCallback(async () => {
		if (!pendingAction) return

		try {
			// TODO: Implement actual deletion API call
			const names = pendingAction.crds.map(c => c.name)
			console.log('Deleting CRDs:', names)
			// Add actual API call here when backend supports it
		} catch (error) {
			console.error('Failed to delete CRDs:', error)
		} finally {
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

			<div className="px-4 lg:px-6 space-y-6">
				<UniversalDataTable
					data={filtered}
					columns={columns}
					enableReorder={false}
					enableRowSelection={true}
					loading={isLoading}
					error={error}
					className="px-0"
					renderFilters={({ table, selectedCount, totalCount }) => (
						<DataTableFilters
							globalFilter={globalFilter}
							onGlobalFilterChange={setGlobalFilter}
							searchPlaceholder="Search CRDs by name, group, kind, scope, status, or versions... (Press '/' to focus)"
							categoryFilter={scopeFilter}
							onCategoryFilterChange={setScopeFilter}
							categoryLabel="Filter by scope"
							categoryOptions={scopeOptions}
							selectedCount={selectedCount}
							totalCount={totalCount}
							bulkActions={bulkActions.map(a => ({
								id: a.id,
								label: a.label,
								icon: a.icon || undefined,
								variant: a.variant || 'default',
								requiresSelection: a.requiresSelection,
								action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: CRDTableRow }) => r.original))
							}))}
							table={table}
							showColumnToggle={true}
						/>
					)}
				/>
			</div>

			{/* Detail drawer */}
			{selectedCRDForDetails && (
				<CRDDetailDrawer
					item={selectedCRDForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedCRDForDetails(null)
					}}
				/>
			)}

			{/* Confirmation dialog */}
			<ActionConfirmationDialog
				open={confirmDialogOpen}
				onOpenChange={setConfirmDialogOpen}
				title="Delete CRDs"
				description="Are you sure you want to delete the selected Custom Resource Definitions? This action cannot be undone."
				actionLabel="Delete CRDs"
				variant="destructive"
				isExecuting={false}
				onConfirm={handleConfirmAction}
				resources={(pendingAction?.crds || []).map(c => ({ name: c.name, namespace: '' }))}
				safetyViolations={[]}
				warnings={[]}
			/>
		</div>
	)
}

export function CRDsPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["customresourcedefinitions.list"]} requireAll={false}>
			<CRDsContent />
		</RouteGuard>
	)
}
