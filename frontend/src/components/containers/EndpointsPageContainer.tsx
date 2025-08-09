"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { EndpointsDataTable } from "@/components/data_tables/EndpointsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useEndpointsWithWebSocket } from "@/hooks/useEndpointsWithWebSocket"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function EndpointsContent() {
	const { data: endpoints, loading: isLoading, error, isConnected } = useEndpointsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when endpoints change
	React.useEffect(() => {
		if (endpoints.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [endpoints])

	// Generate summary cards from endpoint data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!endpoints || endpoints.length === 0) {
			return [
				{
					title: "Total Endpoints",
					value: 0,
					subtitle: "No endpoints found"
				},
				{
					title: "Total Addresses",
					value: 0,
					subtitle: "0 addresses"
				},
				{
					title: "Total Ports",
					value: 0,
					subtitle: "0 ports"
				},
				{
					title: "Ready",
					value: "0/0",
					subtitle: "No ready addresses"
				}
			]
		}

		const totalEndpoints = endpoints.length

		// Calculate endpoint metrics
		const totalAddresses = endpoints.reduce((sum, ep) => sum + ep.totalAddresses, 0)
		const totalPorts = endpoints.reduce((sum, ep) => sum + ep.totalPorts, 0)
		const endpointsWithAddresses = endpoints.filter(ep => ep.totalAddresses > 0).length

		// Calculate ready percentage for display
		const readyPercentage = totalEndpoints > 0 ? (endpointsWithAddresses / totalEndpoints) * 100 : 0

		return [
			{
				title: "Total Endpoints",
				value: totalEndpoints,
				subtitle: `${endpointsWithAddresses}/${totalEndpoints} with addresses`,
				badge: getReplicaStatusBadge(endpointsWithAddresses, totalEndpoints),
				icon: getResourceIcon("endpoints"),
				footer: totalEndpoints > 0 ? "All endpoint resources in cluster" : "No endpoints found"
			},
			{
				title: "Total Addresses",
				value: totalAddresses,
				subtitle: `${totalAddresses} endpoint addresses`,
				badge: getHealthTrendBadge(totalAddresses > 0 ? 100 : 0),
				footer: totalAddresses > 0 ? "All endpoint addresses across cluster" : "No endpoint addresses"
			},
			{
				title: "Total Ports",
				value: totalPorts,
				subtitle: `${totalPorts} exposed ports`,
				badge: getUpdateStatusBadge(totalPorts, Math.max(totalPorts, 1)),
				footer: totalPorts > 0 ? "Ports exposed by endpoints" : "No ports exposed"
			},
			{
				title: "Coverage",
				value: `${Math.round(readyPercentage)}%`,
				subtitle: `${endpointsWithAddresses} endpoints have addresses`,
				badge: getReplicaStatusBadge(endpointsWithAddresses, totalEndpoints),
				footer: readyPercentage > 80 ? "Good endpoint coverage" : "Some endpoints missing addresses"
			}
		]
	}, [endpoints])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Endpoints</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor endpoint resources in your Kubernetes cluster
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

			<EndpointsDataTable />
		</div>
	)
}

export function EndpointsPageContainer() {
	return (
		<SharedProviders>
			<EndpointsContent />
		</SharedProviders>
	)
}
