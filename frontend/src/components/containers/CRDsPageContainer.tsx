"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { CRDsDataTable } from "@/components/data_tables/CRDsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useCRDsWithWebSocket } from "@/hooks/useCRDsWithWebSocket"
import {
	getResourceIcon,
	getCRDStatusBadge,
	getCRDScopeBadge,
	getCRDEstablishedBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function CRDsContent() {
	const { data: crds, loading: isLoading, error, isConnected } = useCRDsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

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

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Custom Resource Definitions</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor Custom Resource Definitions in your Kubernetes cluster
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
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<CRDsDataTable />
		</div>
	)
}

export function CRDsPageContainer() {
	return (
		<SharedProviders>
			<CRDsContent />
		</SharedProviders>
	)
}
