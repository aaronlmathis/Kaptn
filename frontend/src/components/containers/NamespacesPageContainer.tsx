"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { NamespacesDataTable } from "@/components/data_tables/NamespacesDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useNamespacesWithWebSocket } from "@/hooks/useNamespacesWithWebSocket"
import {
	getNamespaceStatusBadge,
	getNamespaceResourceBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function NamespacesContent() {
	const { data: namespaces, loading: isLoading, error, isConnected } = useNamespacesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when namespaces change
	React.useEffect(() => {
		if (namespaces && namespaces.length > 0) {
			setLastUpdated(new Date().toLocaleTimeString())
		}
	}, [namespaces])

	// Calculate summary data for cards
	const totalNamespaces = namespaces?.length || 0
	const activeNamespaces = namespaces?.filter(ns => ns.status === 'Active').length || 0
	const terminatingNamespaces = namespaces?.filter(ns => ns.status === 'Terminating').length || 0
	const failedNamespaces = namespaces?.filter(ns => ns.status === 'Failed').length || 0

	// Label and annotation statistics
	const totalLabels = namespaces?.reduce((sum, ns) => sum + ns.labelsCount, 0) || 0
	const totalAnnotations = namespaces?.reduce((sum, ns) => sum + ns.annotationsCount, 0) || 0

	// Health metrics
	const healthPercentage = totalNamespaces > 0 ? Math.round((activeNamespaces / totalNamespaces) * 100) : 0

	// Resource activity (labels + annotations as a proxy for activity)
	const avgResourcesPerNamespace = totalNamespaces > 0 ? Math.round((totalLabels + totalAnnotations) / totalNamespaces) : 0

	const summaryCards: SummaryCard[] = [
		{
			title: "Total Namespaces",
			value: totalNamespaces.toString(),
			subtitle: "Cluster namespaces",
			icon: getResourceIcon("namespaces"),
			badge: getHealthTrendBadge(healthPercentage),
		},
		{
			title: "Active Namespaces",
			value: `${activeNamespaces}/${totalNamespaces}`,
			subtitle: `${healthPercentage}% operational`,
			icon: getResourceIcon("namespaces"),
			badge: getNamespaceStatusBadge(activeNamespaces, terminatingNamespaces, failedNamespaces, totalNamespaces),
		},
		{
			title: "Resource Activity",
			value: avgResourcesPerNamespace.toString(),
			subtitle: `Avg labels/annotations per namespace`,
			icon: getResourceIcon("namespaces"),
			badge: getNamespaceResourceBadge(avgResourcesPerNamespace),
		},
		{
			title: "Status Distribution",
			value: `${terminatingNamespaces} terminating`,
			subtitle: failedNamespaces > 0 ? `${failedNamespaces} failed` : "No failures",
			icon: getResourceIcon("namespaces"),
			badge: failedNamespaces > 0 ? getHealthTrendBadge(0) : getHealthTrendBadge(100),
		},
	]

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Namespaces</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor namespace resources in your Kubernetes cluster
						</p>
					</div>
					{lastUpdated && (
						<div className="text-sm text-muted-foreground">
							Last updated: {lastUpdated}
						</div>
					)}
				</div>
			</div>

			{/* Summary Cards */}
			<SummaryCards
				cards={summaryCards}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			{/* Data Table */}
			<NamespacesDataTable />
		</div>
	)
}

export function NamespacesPageContainer() {
	return (
		<SharedProviders>
			<NamespacesContent />
		</SharedProviders>
	)
}
