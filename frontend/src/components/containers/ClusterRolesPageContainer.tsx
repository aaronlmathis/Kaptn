"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useClusterRolesWithWebSocket } from "@/hooks/useClusterRolesWithWebSocket"
import { useClusterRoleBindingsWithWebSocket } from "@/hooks/useClusterRoleBindingsWithWebSocket"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { IconShield, IconUsers, IconLink } from "@tabler/icons-react"
import { ClusterRolesDataTable } from "@/components/data_tables/ClusterRolesDataTable"
import { ClusterRoleBindingsDataTable } from "@/components/data_tables/ClusterRoleBindingsDataTable"

// Inner component that can access the namespace context
function ClusterRolesContent() {
	const { data: clusterRoles = [], loading: rolesLoading, error: rolesError, isConnected: rolesConnected } = useClusterRolesWithWebSocket()
	const { data: clusterRoleBindings = [], loading: bindingsLoading, error: bindingsError, isConnected: bindingsConnected } = useClusterRoleBindingsWithWebSocket()
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	const [activeTab, setActiveTab] = React.useState("cluster-roles")

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

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Cluster Roles & Cluster Role Bindings</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage cluster-wide RBAC roles and role bindings in your Kubernetes cluster
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
					<ClusterRolesDataTable />
				</TabsContent>

				<TabsContent value="cluster-role-bindings" className="space-y-0">
					<ClusterRoleBindingsDataTable />
				</TabsContent>
			</Tabs>
		</div>
	)
}

export function ClusterRolesPageContainer() {
	return (
		<SharedProviders>
			<ClusterRolesContent />
		</SharedProviders>
	)
}
