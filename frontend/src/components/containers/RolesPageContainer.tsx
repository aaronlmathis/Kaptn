"use client"

import * as React from "react"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useRolesWithWebSocket } from "@/hooks/useRolesWithWebSocket"
import { useRoleBindingsWithWebSocket } from "@/hooks/useRoleBindingsWithWebSocket"
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
import type { DashboardRole, DashboardRoleBinding } from "@/lib/k8s-rbac"
import { RoleDetailDrawer } from "@/components/viewers/RoleDetailDrawer"
import { RoleBindingDetailDrawer } from "@/components/viewers/RoleBindingDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"

// Helper functions for badges
function getRoleRulesBadge(rulesCount: number) {
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

function getRoleBindingSubjectsBadge(subjectsCount: number) {
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
function RolesContent() {
	const { data: roles, loading: rolesLoading, error: rolesError, isConnected: rolesConnected } = useRolesWithWebSocket(true)
	const { data: roleBindings, loading: roleBindingsLoading, error: roleBindingsError, isConnected: roleBindingsConnected } = useRoleBindingsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const [activeTab, setActiveTab] = React.useState("roles")

	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const { isAllowed } = useAuthzCapabilitiesInContext(['roles.get', 'roles.update', 'roles.delete', 'rolebindings.get', 'rolebindings.update', 'rolebindings.delete'])

	// Detail drawer states
	const [selectedRoleForDetails, setSelectedRoleForDetails] = React.useState<DashboardRole | null>(null)
	const [isRoleDetailDrawerOpen, setIsRoleDetailDrawerOpen] = React.useState(false)
	const [selectedRoleBindingForDetails, setSelectedRoleBindingForDetails] = React.useState<DashboardRoleBinding | null>(null)
	const [isRoleBindingDetailDrawerOpen, setIsRoleBindingDetailDrawerOpen] = React.useState(false)

	React.useEffect(() => {
		fetchAdditional([
			'roles.get', 'roles.update', 'roles.delete',
			'rolebindings.get', 'rolebindings.update', 'rolebindings.delete',
			'rbac.roles.bind'
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const loading = rolesLoading || roleBindingsLoading
	const error = rolesError || roleBindingsError
	const isConnected = rolesConnected || roleBindingsConnected

	// Update lastUpdated when data changes
	React.useEffect(() => {
		if (roles.length > 0 || roleBindings.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [roles, roleBindings])

	// Filters for Roles
	const [rolesGlobalFilter, setRolesGlobalFilter] = React.useState("")
	const filteredRoles = React.useMemo(() => {
		const q = rolesGlobalFilter.trim().toLowerCase()
		return roles.filter(role => {
			return !q || role.name.toLowerCase().includes(q) || role.namespace.toLowerCase().includes(q) || role.rulesDisplay.toLowerCase().includes(q)
		})
	}, [roles, rolesGlobalFilter])

	// Filters for Role Bindings
	const [roleBindingsGlobalFilter, setRoleBindingsGlobalFilter] = React.useState("")
	const filteredRoleBindings = React.useMemo(() => {
		const q = roleBindingsGlobalFilter.trim().toLowerCase()
		return roleBindings.filter(binding => {
			return !q || binding.name.toLowerCase().includes(q) || binding.namespace.toLowerCase().includes(q) || binding.roleRef.toLowerCase().includes(q) || binding.subjectsDisplay.toLowerCase().includes(q)
		})
	}, [roleBindings, roleBindingsGlobalFilter])

	// Roles columns
	const rolesColumns: ColumnDef<DashboardRole>[] = React.useMemo(() => [
		{
			accessorKey: 'name',
			header: 'Role Name',
			cell: ({ row }: { row: { original: DashboardRole } }) => (
				<IfAllowed
					feature="roles.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedRoleForDetails(row.original); setIsRoleDetailDrawerOpen(true) }}
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
			cell: ({ row }: { row: { original: DashboardRole } }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: 'rules',
			header: 'Rules',
			cell: ({ row }: { row: { original: DashboardRole } }) => getRoleRulesBadge(row.original.rules),
		},
		{
			accessorKey: 'rulesDisplay',
			header: 'Rule Details',
			cell: ({ row }: { row: { original: DashboardRole } }) => (
				<div className="font-mono text-sm max-w-xs truncate" title={row.original.rulesDisplay}>
					{row.original.rulesDisplay}
				</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: DashboardRole } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardRole } }) => (
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
						<IfAllowed feature="roles.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedRoleForDetails(row.original); setIsRoleDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="roles.update"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace={row.original.namespace}
								resourceKind="Role"
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
							feature="roles.delete"
							cluster={clusterId}
							namespace={row.original.namespace}
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

	// Role Bindings columns
	const roleBindingsColumns: ColumnDef<DashboardRoleBinding>[] = React.useMemo(() => [
		{
			accessorKey: 'name',
			header: 'RoleBinding Name',
			cell: ({ row }: { row: { original: DashboardRoleBinding } }) => (
				<IfAllowed
					feature="rolebindings.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<span>{row.original.name}</span>}
				>
					<button
						onClick={() => { setSelectedRoleBindingForDetails(row.original); setIsRoleBindingDetailDrawerOpen(true) }}
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
			cell: ({ row }: { row: { original: DashboardRoleBinding } }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: 'roleRef',
			header: 'Role Reference',
			cell: ({ row }: { row: { original: DashboardRoleBinding } }) => (
				<div className="flex items-center gap-1.5">
					<IconLink className="size-3 text-muted-foreground" />
					<div className="font-mono text-sm">{row.original.roleRef}</div>
				</div>
			),
		},
		{
			accessorKey: 'subjects',
			header: 'Subjects',
			cell: ({ row }: { row: { original: DashboardRoleBinding } }) => getRoleBindingSubjectsBadge(row.original.subjects),
		},
		{
			accessorKey: 'subjectsDisplay',
			header: 'Subject Details',
			cell: ({ row }: { row: { original: DashboardRoleBinding } }) => (
				<div className="font-mono text-sm max-w-xs truncate" title={row.original.subjectsDisplay}>
					{row.original.subjectsDisplay}
				</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: DashboardRoleBinding } }) => (
				<div className="font-mono text-sm">{row.original.age}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: DashboardRoleBinding } }) => (
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
						<IfAllowed feature="rolebindings.get" cluster={clusterId} namespace={row.original.namespace} resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEye className="size-4 mr-2" />View Details</DropdownMenuItem>}
						>
							<DropdownMenuItem onClick={() => { setSelectedRoleBindingForDetails(row.original); setIsRoleBindingDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<IfAllowed
							feature="rolebindings.update"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={<DropdownMenuItem disabled className="text-muted-foreground"><IconEdit className="size-4 mr-2" />Edit YAML</DropdownMenuItem>}
						>
							<ResourceYamlEditor
								resourceName={row.original.name}
								namespace={row.original.namespace}
								resourceKind="RoleBinding"
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
							feature="rolebindings.delete"
							cluster={clusterId}
							namespace={row.original.namespace}
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

	// Bulk actions for Roles
	const rolesBulkActions = React.useMemo(() => {
		const actions: BulkAction[] = []
		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: () => {
				console.log('Export YAML for roles - TODO: Implement')
				// TODO: Implement bulk YAML export
			}
		})
		actions.push({
			id: 'copy-names',
			label: 'Copy Role Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: () => {
				console.log('Copy role names - TODO: Implement')
				// TODO: Get selected rows and copy names
			}
		})
		if (isAllowed('roles.delete')) {
			actions.push({
				id: 'delete-roles',
				label: 'Delete Selected Roles',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: () => {
					console.log('Delete roles - TODO: Implement')
					// TODO: Implement bulk role deletion with confirmation
				}
			})
		}
		return actions
	}, [isAllowed])

	// Bulk actions for Role Bindings
	const roleBindingsBulkActions = React.useMemo(() => {
		const actions: BulkAction[] = []
		actions.push({
			id: 'export-yaml',
			label: 'Export Selected as YAML',
			icon: <IconDownload className="size-4" />,
			requiresSelection: true,
			action: () => {
				console.log('Export YAML for role bindings - TODO: Implement')
				// TODO: Implement bulk YAML export
			}
		})
		actions.push({
			id: 'copy-names',
			label: 'Copy RoleBinding Names',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: () => {
				console.log('Copy role binding names - TODO: Implement')
				// TODO: Get selected rows and copy names
			}
		})
		if (isAllowed('rolebindings.delete')) {
			actions.push({
				id: 'delete-rolebindings',
				label: 'Delete Selected RoleBindings',
				icon: <IconTrash className="size-4" />,
				variant: 'destructive',
				requiresSelection: true,
				action: () => {
					console.log('Delete role bindings - TODO: Implement')
					// TODO: Implement bulk role binding deletion with confirmation
				}
			})
		}
		return actions
	}, [isAllowed])

	// Generate summary cards from roles and role bindings data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		const totalRoles = roles.length
		const totalRoleBindings = roleBindings.length
		const totalRules = roles.reduce((sum, role) => sum + role.rules, 0)
		const totalSubjects = roleBindings.reduce((sum, rb) => sum + rb.subjects, 0)

		return [
			{
				title: "Total Roles",
				value: totalRoles,
				subtitle: `${totalRoles} roles defined`,
				badge: totalRoles > 0 ? (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						Active
					</Badge>
				) : (
					<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
						None
					</Badge>
				),
				icon: <IconShield className="size-4" />,
				footer: totalRoles > 0 ? "RBAC permissions defined" : "No roles found"
			},
			{
				title: "Total RoleBindings",
				value: totalRoleBindings,
				subtitle: `${totalRoleBindings} role bindings configured`,
				badge: totalRoleBindings > 0 ? (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						Active
					</Badge>
				) : (
					<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
						None
					</Badge>
				),
				icon: <IconLink className="size-4" />,
				footer: totalRoleBindings > 0 ? "Users/groups bound to roles" : "No role bindings found"
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
				footer: totalRules > 0 ? "Individual permissions defined" : "No rules defined"
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
				footer: totalSubjects > 0 ? "Entities with permissions" : "No subjects bound"
			}
		]
	}, [roles, roleBindings])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Roles & Role Bindings</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage RBAC roles and role bindings in your Kubernetes cluster
						</p>
					</div>
					{lastUpdated && (
						<div className="text-sm text-muted-foreground">
							Last updated: {new Date(lastUpdated).toLocaleTimeString()}
						</div>
					)}
				</div>
			</div>

			{/* Summary Cards */}
			<SummaryCards
				cards={summaryData}
				loading={loading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			{/* Tabbed Content */}
			<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
				<div className="px-4 lg:px-6">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="roles" className="flex items-center gap-2">
							<IconShield className="size-4" />
							Roles
							{roles.length > 0 && (
								<span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
									{roles.length}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger value="rolebindings" className="flex items-center gap-2">
							<IconLink className="size-4" />
							Role Bindings
							{roleBindings.length > 0 && (
								<span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
									{roleBindings.length}
								</span>
							)}
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value="roles" className="space-y-0">
					<div className="px-4 lg:px-6">
						<UniversalDataTable
							data={filteredRoles}
							columns={rolesColumns}
							enableReorder={false}
							enableRowSelection={true}
							loading={rolesLoading}
							error={rolesError}
							className="px-0"
							renderFilters={({ table, selectedCount, totalCount }) => (
								<DataTableFilters
									globalFilter={rolesGlobalFilter}
									onGlobalFilterChange={setRolesGlobalFilter}
									searchPlaceholder="Search roles by name, namespace, or rule details..."
									selectedCount={selectedCount}
									totalCount={totalCount}
									bulkActions={rolesBulkActions.map(a => ({
										id: a.id,
										label: a.label,
										icon: a.icon,
										variant: a.variant,
										requiresSelection: a.requiresSelection,
										action: () => {
											const selected = table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardRole }) => r.original)
											if (a.id === 'copy-names') {
												navigator.clipboard.writeText(selected.map((role: DashboardRole) => role.name).join('\n'))
											} else {
												a.action()
											}
										}
									}))}
									table={table}
									showColumnToggle={true}
								/>
							)}
							renderEmptyState={() => "No roles found."}
						/>
					</div>
				</TabsContent>

				<TabsContent value="rolebindings" className="space-y-0">
					<div className="px-4 lg:px-6">
						<UniversalDataTable
							data={filteredRoleBindings}
							columns={roleBindingsColumns}
							enableReorder={false}
							enableRowSelection={true}
							loading={roleBindingsLoading}
							error={roleBindingsError}
							className="px-0"
							renderFilters={({ table, selectedCount, totalCount }) => (
								<DataTableFilters
									globalFilter={roleBindingsGlobalFilter}
									onGlobalFilterChange={setRoleBindingsGlobalFilter}
									searchPlaceholder="Search role bindings by name, namespace, role reference, or subjects..."
									selectedCount={selectedCount}
									totalCount={totalCount}
									bulkActions={roleBindingsBulkActions.map(a => ({
										id: a.id,
										label: a.label,
										icon: a.icon,
										variant: a.variant,
										requiresSelection: a.requiresSelection,
										action: () => {
											const selected = table.getFilteredSelectedRowModel().rows.map((r: { original: DashboardRoleBinding }) => r.original)
											if (a.id === 'copy-names') {
												navigator.clipboard.writeText(selected.map((roleBinding: DashboardRoleBinding) => roleBinding.name).join('\n'))
											} else {
												a.action()
											}
										}
									}))}
									table={table}
									showColumnToggle={true}
								/>
							)}
							renderEmptyState={() => "No role bindings found."}
						/>
					</div>
				</TabsContent>
			</Tabs>

			{/* Role Detail Drawer */}
			{selectedRoleForDetails && (
				<RoleDetailDrawer
					item={selectedRoleForDetails}
					open={isRoleDetailDrawerOpen}
					onOpenChange={setIsRoleDetailDrawerOpen}
				/>
			)}

			{/* Role Binding Detail Drawer */}
			{selectedRoleBindingForDetails && (
				<RoleBindingDetailDrawer
					item={selectedRoleBindingForDetails}
					open={isRoleBindingDetailDrawerOpen}
					onOpenChange={setIsRoleBindingDetailDrawerOpen}
				/>
			)}
		</div>
	)
}

export function RolesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["roles.list", "rolebindings.list"]} requireAll={false}>
			<RolesContent />
		</RouteGuard>
	)
}
