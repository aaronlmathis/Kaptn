"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { RolesDataTable } from "@/components/data_tables/RolesDataTable"
import { RoleBindingsDataTable } from "@/components/data_tables/RoleBindingsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useRolesWithWebSocket } from "@/hooks/useRolesWithWebSocket"
import { useRoleBindingsWithWebSocket } from "@/hooks/useRoleBindingsWithWebSocket"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { IconShield, IconUsers, IconLink } from "@tabler/icons-react"

// Inner component that can access the namespace context
function RolesContent() {
	const { data: roles, loading: rolesLoading, error: rolesError, isConnected: rolesConnected } = useRolesWithWebSocket(true)
	const { data: roleBindings, loading: roleBindingsLoading, error: roleBindingsError, isConnected: roleBindingsConnected } = useRoleBindingsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const [activeTab, setActiveTab] = React.useState("roles")

	const loading = rolesLoading || roleBindingsLoading
	const error = rolesError || roleBindingsError
	const isConnected = rolesConnected || roleBindingsConnected

	// Update lastUpdated when data changes
	React.useEffect(() => {
		if (roles.length > 0 || roleBindings.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [roles, roleBindings])

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
					<RolesDataTable />
				</TabsContent>

				<TabsContent value="rolebindings" className="space-y-0">
					<RoleBindingsDataTable />
				</TabsContent>
			</Tabs>
		</div>
	)
}

export function RolesPageContainer() {
	return (
		<SharedProviders>
			<RolesContent />
		</SharedProviders>
	)
}
