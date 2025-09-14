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
import { IconDotsVertical, IconEye, IconTrash, IconEdit, IconCopy, IconDownload, IconDatabase, IconCircleCheckFilled } from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import type { DashboardAPIResource } from "@/lib/k8s-cluster"
import { ApiResourceDetailDrawer } from "@/components/viewers/ApiResourceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useCapabilities } from "@/hooks/use-capabilities"
import { Badge } from "@/components/ui/badge"
import { useAPIResources } from "@/hooks/use-k8s-data"

// Helper function to get namespaced badge
function getNamespacedBadge(namespaced: string) {
	if (namespaced === "Yes") {
		return (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
				{namespaced}
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
				{namespaced}
			</Badge>
		)
	}
}

// Inner component that can access the capabilities context
function ApiResourcesContent() {
	const { data: apiResources, loading: isLoading, error } = useAPIResources()
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	useAuthzCapabilitiesInContext(['apiservices.get', 'apiservices.patch', 'apiservices.delete'])
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)
	const [selectedAPIResourceForDetails, setSelectedAPIResourceForDetails] = React.useState<DashboardAPIResource | null>(null)

	// Ensure API service-specific action capabilities are requested
	React.useEffect(() => {
		fetchAdditional([
			'apiservices.get',
			'apiservices.patch',
			'apiservices.delete',
		]).catch(() => { /* noop */ })
		// run once on mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [scopeFilter, setScopeFilter] = React.useState<string>("all")

	const scopeOptions: FilterOption[] = React.useMemo(() => {
		const scopes = Array.from(new Set(apiResources.map(resource => resource.namespaced))).filter(Boolean).sort()
		return scopes.map(scope => ({
			value: scope,
			label: scope === "Yes" ? "Namespaced" : "Cluster-scoped",
			badge: getNamespacedBadge(scope)
		}))
	}, [apiResources])

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return apiResources.filter(resource => {
			const matchesQuery = !q ||
				resource.name.toLowerCase().includes(q) ||
				resource.singularName.toLowerCase().includes(q) ||
				resource.kind.toLowerCase().includes(q) ||
				resource.group.toLowerCase().includes(q) ||
				resource.version.toLowerCase().includes(q) ||
				resource.apiVersion.toLowerCase().includes(q) ||
				resource.categories.toLowerCase().includes(q) ||
				(resource.shortNames && resource.shortNames.toLowerCase().includes(q))
			const matchesScope = scopeFilter === 'all' || resource.namespaced === scopeFilter
			return matchesQuery && matchesScope
		})
	}, [apiResources, globalFilter, scopeFilter])

	// Build table columns
	const columns: ColumnDef<DashboardAPIResource>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Name',
			cell: ({ row }: { row: { original: DashboardAPIResource } }) => (
				<IfAllowed
					feature="apiservices.get"
					cluster={clusterId}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedAPIResourceForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
			enableHiding: false,
		},
		{
			accessorKey: 'shortNames',
			header: 'Short Names',
			cell: ({ row }: { row: { original: DashboardAPIResource } }) => (
				<div className="font-mono text-sm">
					{row.original.shortNames || '<none>'}
				</div>
			),
		},
		{
			accessorKey: 'kind',
			header: 'Kind',
			cell: ({ row }: { row: { original: DashboardAPIResource } }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.kind}
				</Badge>
			),
		},
		{
			accessorKey: 'group',
			header: 'Group',
			cell: ({ row }: { row: { original: DashboardAPIResource } }) => (
				<div className="text-sm">{row.original.group}</div>
			),
		},
		{
			accessorKey: 'version',
			header: 'Version',
			cell: ({ row }: { row: { original: DashboardAPIResource } }) => (
				<div className="font-mono text-sm">{row.original.version}</div>
			),
		},
		{
			accessorKey: 'apiVersion',
			header: 'API Version',
			cell: ({ row }: { row: { original: DashboardAPIResource } }) => (
				<div className="font-mono text-sm">{row.original.apiVersion}</div>
			),
		},
		{
			accessorKey: 'namespaced',
			header: 'Namespaced',
			cell: ({ row }: { row: { original: DashboardAPIResource } }) => getNamespacedBadge(row.original.namespaced),
		},
		{
			accessorKey: 'categories',
			header: 'Categories',
			cell: ({ row }: { row: { original: DashboardAPIResource } }) => (
				<div className="text-sm">
					{row.original.categories || '<none>'}
				</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardAPIResource } }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="data-[state=open]:bg-muted text-muted-foreground flex size-8">
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed feature="apiservices.get" cluster={clusterId}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedAPIResourceForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed feature="apiservices.patch" cluster={clusterId}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor resourceName={row.original.name} namespace="" resourceKind="APIResource">
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
								>
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</DropdownMenuItem>
							</ResourceYamlEditor>
						</IfAllowed>
						<DropdownMenuSeparator />
						<IfAllowed feature="apiservices.delete" cluster={clusterId}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600" onClick={() => console.log('Delete API resource:', row.original.name)}>
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId])

	// Bulk actions for API resources
	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: DashboardAPIResource[]) => void | Promise<void> }[] = []

		actions.push({
			id: 'copy-names',
			label: 'Copy Resource Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				const names = rows.map(r => r.name).join('\n')
				navigator.clipboard.writeText(names)
			}
		})

		actions.push({
			id: 'copy-kinds',
			label: 'Copy Resource Kinds',
			icon: <IconDatabase className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				const kinds = rows.map(r => r.kind).join('\n')
				navigator.clipboard.writeText(kinds)
			}
		})

		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: (rows) => {
				console.log('Export YAML for API resources:', rows.map(r => r.name))
				// TODO: Implement bulk YAML export
			}
		})

		return actions
	}, [])

	return (
		<div className="space-y-6">
			{/* Header */}


			<div className="px-4 lg:px-6">
				<UniversalDataTable
					data={filtered}
					columns={columns}
					enableReorder={false}
					enableRowSelection={true}
					loading={isLoading}
					error={error}
					renderFilters={({ table, selectedCount, totalCount }) => (
						<div className="space-y-4">
							<DataTableFilters
								globalFilter={globalFilter}
								onGlobalFilterChange={setGlobalFilter}
								searchPlaceholder="Search API resources by name, kind, group, version, or categories... (Press '/' to focus)"
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
									variant: (a.variant || 'default') as 'default' | 'destructive',
									requiresSelection: a.requiresSelection,
									action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardAPIResource }) => r.original as DashboardAPIResource))
								}))}
								table={table}
								showColumnToggle={true}
							/>
						</div>
					)}
				/>
			</div>

			{selectedAPIResourceForDetails && (
				<ApiResourceDetailDrawer
					item={selectedAPIResourceForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedAPIResourceForDetails(null)
					}}
				/>
			)}
		</div>
	)
}

export function ApiResourcesPageContainer() {
	return (
		<RouteGuard
			requiredCapabilities={["apiservices.list"]}
			requireAll={false}
		>
			<ApiResourcesContent />
		</RouteGuard>
	)
}
