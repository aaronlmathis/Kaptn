"use client"

import * as React from "react"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useClusterRolesWithWebSocket } from "@/hooks/useClusterRolesWithWebSocket"
import { useClusterRoleBindingsWithWebSocket } from "@/hooks/useClusterRoleBindingsWithWebSocket"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { IconShield, IconUsers, IconLink, IconDotsVertical, IconEye, IconEdit, IconTrash, IconDownload, IconCopy, IconCircleCheckFilled } from "@tabler/icons-react"
import { RouteGuard } from "@/components/authz"
import { useCapabilities } from "@/hooks/use-capabilities"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type BulkAction } from "@/components/ui/data-table-filters"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useAuthzCapabilitiesInContext } from "@/hooks/useAuthzCapabilitiesSimple"
import { useCluster } from "@/hooks/useCluster"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { type ColumnDef } from "@/lib/table"
import type { DashboardClusterRole, DashboardClusterRoleBinding } from "@/lib/k8s-cluster-rbac"
import { ClusterRoleDetailDrawer } from "@/components/viewers/ClusterRoleDetailDrawer"
import { ClusterRoleBindingDetailDrawer } from "@/components/viewers/ClusterRoleBindingDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"

// Helper functions for badges
function getClusterRoleRulesBadge(rulesCount: number) {
	if (rulesCount === 0) {
		return (
			<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-gray-600 mr-1" />
				No rules
			</Badge>
		)
	} else if (rulesCount === 1) {
		return (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				<IconShield className="size-3 mr-1" />
				1 rule
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconShield className="size-3 mr-1" />
				{rulesCount} rules
			</Badge>
		)
	}
}

function getClusterRoleBindingSubjectsBadge(subjectsCount: number) {
	if (subjectsCount === 0) {
		return (
			<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-gray-600 mr-1" />
				No subjects
			</Badge>
		)
	} else if (subjectsCount === 1) {
		return (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				<IconUsers className="size-3 mr-1" />
				1 subject
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconUsers className="size-3 mr-1" />
				{subjectsCount} subjects
			</Badge>
		)
	}
}

// Inner component that can access the namespace context
function ClusterRolesContent() {
	const { data: clusterRoles = [], loading: rolesLoading, error: rolesError, isConnected: rolesConnected } = useClusterRolesWithWebSocket()
	const { data: clusterRoleBindings = [], loading: bindingsLoading, error: bindingsError, isConnected: bindingsConnected } = useClusterRoleBindingsWithWebSocket()
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const [activeTab, setActiveTab] = React.useState("cluster-roles")
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['clusterroles.get', 'clusterroles.update', 'clusterroles.delete', 'clusterrolebindings.get', 'clusterrolebindings.update', 'clusterrolebindings.delete'])

	// Fetch additional capabilities for cluster resources
	React.useEffect(() => {
		if (clusterId) {
			fetchAdditional([
				'clusterroles.get',
				'clusterroles.list',
				'clusterroles.update',
				'clusterroles.delete',
				'clusterrolebindings.get',
				'clusterrolebindings.list',
				'clusterrolebindings.update',
				'clusterrolebindings.delete'
			])
		}
	}, [clusterId, fetchAdditional])

	// Detail drawer states
	const [selectedClusterRoleForDetails, setSelectedClusterRoleForDetails] = React.useState<DashboardClusterRole | null>(null)
	const [isClusterRoleDetailDrawerOpen, setIsClusterRoleDetailDrawerOpen] = React.useState(false)
	const [selectedClusterRoleBindingForDetails, setSelectedClusterRoleBindingForDetails] = React.useState<DashboardClusterRoleBinding | null>(null)
	const [isClusterRoleBindingDetailDrawerOpen, setIsClusterRoleBindingDetailDrawerOpen] = React.useState(false)

	React.useEffect(() => {
		fetchAdditional([
			'clusterroles.get', 'clusterroles.update', 'clusterroles.delete',
			'clusterrolebindings.get', 'clusterrolebindings.update', 'clusterrolebindings.delete',
			'rbac.clusterroles.bind'
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const loading = rolesLoading || bindingsLoading
	const error = rolesError || bindingsError
	const isConnected = rolesConnected || bindingsConnected

	// Update lastUpdated when data changes
	React.useEffect(() => {
		if (clusterRoles.length > 0 || clusterRoleBindings.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [clusterRoles, clusterRoleBindings])

	// Generate summary cards from cluster roles and cluster role bindings data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		const totalClusterRoles = clusterRoles.length
		const totalClusterRoleBindings = clusterRoleBindings.length
		const totalRules = clusterRoles.reduce((sum, role) => sum + role.rules, 0)
		const totalSubjects = clusterRoleBindings.reduce((sum, rb) => sum + rb.subjects, 0)

		return [
			{
				title: "Total Cluster Roles",
				value: totalClusterRoles,
				subtitle: `${totalClusterRoles} cluster roles defined`,
				badge: totalClusterRoles > 0 ? (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						Active
					</Badge>
				) : (
					<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
						None
					</Badge>
				),
				icon: <IconShield className="size-4" />,
				footer: totalClusterRoles > 0 ? "Cluster-wide RBAC permissions defined" : "No cluster roles found"
			},
			{
				title: "Total Cluster Role Bindings",
				value: totalClusterRoleBindings,
				subtitle: `${totalClusterRoleBindings} cluster role bindings configured`,
				badge: totalClusterRoleBindings > 0 ? (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						Active
					</Badge>
				) : (
					<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
						None
					</Badge>
				),
				icon: <IconLink className="size-4" />,
				footer: totalClusterRoleBindings > 0 ? "Users/groups bound to cluster roles" : "No cluster role bindings found"
			},
			{
				title: "Permission Rules",
				value: totalRules,
				subtitle: `${totalRules} total permission rules`,
				badge: totalRules > 0 ? (
					<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
						Configured
					</Badge>
				) : (
					<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
						None
					</Badge>
				),
				icon: <IconShield className="size-4" />,
				footer: totalRules > 0 ? "Cluster-wide permissions defined" : "No rules defined"
			},
			{
				title: "Bound Subjects",
				value: totalSubjects,
				subtitle: `${totalSubjects} users/groups/service accounts`,
				badge: totalSubjects > 0 ? (
					<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
						Bound
					</Badge>
				) : (
					<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
						None
					</Badge>
				),
				icon: <IconUsers className="size-4" />,
				footer: totalSubjects > 0 ? "Entities with cluster permissions" : "No subjects bound"
			}
		]
	}, [clusterRoles, clusterRoleBindings])

	// Filters for Cluster Roles
	const [clusterRolesGlobalFilter, setClusterRolesGlobalFilter] = React.useState("")
	const filteredClusterRoles = React.useMemo(() => {
		const q = clusterRolesGlobalFilter.trim().toLowerCase()
		return clusterRoles.filter(role => {
			return !q || role.name.toLowerCase().includes(q) || role.rulesDisplay.toLowerCase().includes(q)
		})
	}, [clusterRoles, clusterRolesGlobalFilter])

	// Filters for Cluster Role Bindings
	const [clusterRoleBindingsGlobalFilter, setClusterRoleBindingsGlobalFilter] = React.useState("")
	const filteredClusterRoleBindings = React.useMemo(() => {
		const q = clusterRoleBindingsGlobalFilter.trim().toLowerCase()
		return clusterRoleBindings.filter(binding => {
			return !q || binding.name.toLowerCase().includes(q) || binding.roleRef.toLowerCase().includes(q) || binding.subjectsDisplay.toLowerCase().includes(q)
		})
	}, [clusterRoleBindings, clusterRoleBindingsGlobalFilter])

	// Cluster Roles columns
	const clusterRolesColumns: ColumnDef<DashboardClusterRole>[] = React.useMemo(() => [
		{
			accessorKey: 'name',
			header: 'ClusterRole Name',
			cell: ({ row }: { row: { original: DashboardClusterRole } }) => (
				<IfAllowed
					feature="clusterroles.get"
					cluster={clusterId}
					namespace=""
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedClusterRoleForDetails(row.original); setIsClusterRoleDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
		},
		{
			accessorKey: 'rules',
			header: 'Rules',
			cell: ({ row }: { row: { original: DashboardClusterRole } }) => getClusterRoleRulesBadge(row.original.rules),
		},
		{
			accessorKey: 'rulesDisplay',
			header: 'Rule Details',
			cell: ({ row }: { row: { original: DashboardClusterRole } }) => (
				<div className="font-mono text-sm max-w-xs truncate" title={row.original.rulesDisplay}>
					{row.original.rulesDisplay}
				</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: DashboardClusterRole } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardClusterRole } }) => (
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
						<IfAllowed feature="clusterroles.get" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedClusterRoleForDetails(row.original); setIsClusterRoleDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="clusterroles.update"
							cluster={clusterId}
							namespace=""
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace=""
								resourceKind="ClusterRole"
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
							feature="clusterroles.delete"
							cluster={clusterId}
							namespace=""
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600">
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	], [clusterId])

	// Cluster Role Bindings columns
	const clusterRoleBindingsColumns: ColumnDef<DashboardClusterRoleBinding>[] = React.useMemo(() => [
		{
			accessorKey: 'name',
			header: 'ClusterRoleBinding Name',
			cell: ({ row }: { row: { original: DashboardClusterRoleBinding } }) => (
				<IfAllowed
					feature="clusterrolebindings.get"
					cluster={clusterId}
					namespace=""
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedClusterRoleBindingForDetails(row.original); setIsClusterRoleBindingDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						{row.original.name}
					</button>
				</IfAllowed>
			),
		},
		{
			accessorKey: 'roleRef',
			header: 'Role Reference',
			cell: ({ row }: { row: { original: DashboardClusterRoleBinding } }) => (
				<div className="flex items-center gap-1.5">
					<IconLink className="size-3 text-muted-foreground" />
					<div className="font-mono text-sm">{row.original.roleRef}</div>
				</div>
			),
		},
		{
			accessorKey: 'subjects',
			header: 'Subjects',
			cell: ({ row }: { row: { original: DashboardClusterRoleBinding } }) => getClusterRoleBindingSubjectsBadge(row.original.subjects),
		},
		{
			accessorKey: 'subjectsDisplay',
			header: 'Subject Details',
			cell: ({ row }: { row: { original: DashboardClusterRoleBinding } }) => (
				<div className="font-mono text-sm max-w-xs truncate" title={row.original.subjectsDisplay}>
					{row.original.subjectsDisplay}
				</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: DashboardClusterRoleBinding } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardClusterRoleBinding } }) => (
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
						<IfAllowed feature="clusterrolebindings.get" cluster={clusterId} namespace="" resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedClusterRoleBindingForDetails(row.original); setIsClusterRoleBindingDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="clusterrolebindings.update"
							cluster={clusterId}
							namespace=""
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace=""
								resourceKind="ClusterRoleBinding"
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
							feature="clusterrolebindings.delete"
							cluster={clusterId}
							namespace=""
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconTrash className="size-4 mr-2" />Delete</DropdownMenuItem>}
						>
							<DropdownMenuItem className="text-red-600">
								<IconTrash className="size-4 mr-2" />
								Delete
							</DropdownMenuItem>
						</IfAllowed>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	], [clusterId])

	// Bulk actions for Cluster Roles
	const clusterRolesBulkActions = React.useMemo(() => {
		const actions: BulkAction[] = []
		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: () => {
				console.log('Export YAML for cluster roles - TODO: Implement')
				// TODO: Implement bulk YAML export
			}
		})
		actions.push({
			id: 'copy-names',
			label: 'Copy ClusterRole Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: () => {
				console.log('Copy cluster role names - TODO: Implement')
				// TODO: Get selected rows and copy names
			}
		})
		if (isAllowed('clusterroles.delete')) {
			actions.push({
				id: 'delete-cluster-roles',
				label: 'Delete Selected ClusterRoles',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: () => {
					console.log('Delete cluster roles - TODO: Implement')
					// TODO: Implement bulk cluster role deletion with confirmation
				}
			})
		}
		return actions
	}, [isAllowed])

	// Bulk actions for Cluster Role Bindings
	const clusterRoleBindingsBulkActions = React.useMemo(() => {
		const actions: BulkAction[] = []
		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: () => {
				console.log('Export YAML for cluster role bindings - TODO: Implement')
				// TODO: Implement bulk YAML export
			}
		})
		actions.push({
			id: 'copy-names',
			label: 'Copy ClusterRoleBinding Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: () => {
				console.log('Copy cluster role binding names - TODO: Implement')
				// TODO: Get selected rows and copy names
			}
		})
		if (isAllowed('clusterrolebindings.delete')) {
			actions.push({
				id: 'delete-cluster-role-bindings',
				label: 'Delete Selected ClusterRoleBindings',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: () => {
					console.log('Delete cluster role bindings - TODO: Implement')
					// TODO: Implement bulk cluster role binding deletion with confirmation
				}
			})
		}
		return actions
	}, [isAllowed])

	return (
		<div className="space-y-6">


			{/* Summary Cards */}
			<SummaryCards
				cards={summaryData}
				loading={loading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			{/* Tabbed Content */}
			<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
				<div className="px-4 lg:px-6 ">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="cluster-roles" className="flex items-center gap-2">
							<IconShield className="size-4" />
							Cluster Roles
							{clusterRoles.length > 0 && (
								<span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
									{clusterRoles.length}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger value="cluster-role-bindings" className="flex items-center gap-2">
							<IconLink className="size-4" />
							Cluster Role Bindings
							{clusterRoleBindings.length > 0 && (
								<span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
									{clusterRoleBindings.length}
								</span>
							)}
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value="cluster-roles" className="space-y-0">
					<div className="px-4 lg:px-6">
						<UniversalDataTable
							data={filteredClusterRoles}
							columns={clusterRolesColumns}
							enableReorder={false}
							enableRowSelection={true}
							loading={rolesLoading}
							error={rolesError}
							className="px-0"
							renderFilters={({ table, selectedCount, totalCount }) => (
								<DataTableFilters
									globalFilter={clusterRolesGlobalFilter}
									onGlobalFilterChange={setClusterRolesGlobalFilter}
									searchPlaceholder="Search cluster roles by name or rule details..."
									selectedCount={selectedCount}
									totalCount={totalCount}
									bulkActions={clusterRolesBulkActions.map(a => ({
										id: a.id,
										label: a.label,
										icon: a.icon,
										variant: a.variant,
										requiresSelection: a.requiresSelection,
										action: () => {
											const selected = table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardClusterRole }) => r.original)
											if (a.id === 'copy-names') {
												navigator.clipboard.writeText(selected.map((cr: DashboardClusterRole) => cr.name).join('\n'))
											} else {
												a.action()
											}
										}
									}))}
									table={table}
									showColumnToggle={true}
								/>
							)}
							renderEmptyState={() => "No cluster roles found."}
						/>
					</div>
				</TabsContent>

				<TabsContent value="cluster-role-bindings" className="space-y-0">
					<div className="px-4 lg:px-6">
						<UniversalDataTable
							data={filteredClusterRoleBindings}
							columns={clusterRoleBindingsColumns}
							enableReorder={false}
							enableRowSelection={true}
							loading={bindingsLoading}
							error={bindingsError}
							className="px-0"
							renderFilters={({ table, selectedCount, totalCount }) => (
								<DataTableFilters
									globalFilter={clusterRoleBindingsGlobalFilter}
									onGlobalFilterChange={setClusterRoleBindingsGlobalFilter}
									searchPlaceholder="Search cluster role bindings by name, role reference, or subjects..."
									selectedCount={selectedCount}
									totalCount={totalCount}
									bulkActions={clusterRoleBindingsBulkActions.map(a => ({
										id: a.id,
										label: a.label,
										icon: a.icon,
										variant: a.variant,
										requiresSelection: a.requiresSelection,
										action: () => {
											const selected = table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardClusterRoleBinding }) => r.original)
											if (a.id === 'copy-names') {
												navigator.clipboard.writeText(selected.map((crb: DashboardClusterRoleBinding) => crb.name).join('\n'))
											} else {
												a.action()
											}
										}
									}))}
									table={table}
									showColumnToggle={true}
								/>
							)}
							renderEmptyState={() => "No cluster role bindings found."}
						/>
					</div>
				</TabsContent>
			</Tabs>

			{/* Cluster Role Detail Drawer */}
			{selectedClusterRoleForDetails && (
				<ClusterRoleDetailDrawer
					item={selectedClusterRoleForDetails}
					open={isClusterRoleDetailDrawerOpen}
					onOpenChange={setIsClusterRoleDetailDrawerOpen}
				/>
			)}

			{/* Cluster Role Binding Detail Drawer */}
			{selectedClusterRoleBindingForDetails && (
				<ClusterRoleBindingDetailDrawer
					item={selectedClusterRoleBindingForDetails}
					open={isClusterRoleBindingDetailDrawerOpen}
					onOpenChange={setIsClusterRoleBindingDetailDrawerOpen}
				/>
			)}
		</div>
	)
}

export function ClusterRolesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["clusterroles.list", "clusterrolebindings.list"]} requireAll={false}>
			<ClusterRolesContent />
		</RouteGuard>
	)
}
