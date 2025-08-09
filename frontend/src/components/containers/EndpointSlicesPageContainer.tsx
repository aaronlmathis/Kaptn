"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { EndpointSlicesDataTable } from "@/components/data_tables/EndpointSlicesDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useEndpointSlicesWithWebSocket } from "@/hooks/useEndpointSlicesWithWebSocket"
import {
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function EndpointSlicesContent() {
	const { data: endpointSlices, loading: isLoading, error, isConnected } = useEndpointSlicesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when endpointSlices change
	React.useEffect(() => {
		if (endpointSlices && endpointSlices.length > 0) {
			setLastUpdated(new Date().toLocaleTimeString())
		}
	}, [endpointSlices])

	// Calculate summary data for cards
	const totalEndpointSlices = endpointSlices?.length || 0
	const totalEndpoints = endpointSlices?.reduce((sum, slice) => sum + slice.endpoints, 0) || 0
	const totalReady = endpointSlices?.reduce((sum, slice) => sum + slice.readyCount, 0) || 0
	const totalNotReady = endpointSlices?.reduce((sum, slice) => sum + slice.notReadyCount, 0) || 0

	// Health metrics
	const healthySlices = endpointSlices?.filter(slice => slice.readyCount > 0).length || 0
	const healthPercentage = totalEndpointSlices > 0 ? Math.round((healthySlices / totalEndpointSlices) * 100) : 0

	// Address type distribution
	const ipv4Slices = endpointSlices?.filter(slice => slice.addressType === 'IPv4').length || 0
	const ipv6Slices = endpointSlices?.filter(slice => slice.addressType === 'IPv6').length || 0
	const fqdnSlices = endpointSlices?.filter(slice => slice.addressType === 'FQDN').length || 0

	const summaryCards: SummaryCard[] = [
		{
			title: "Total EndpointSlices",
			value: totalEndpointSlices.toString(),
			subtitle: "Active endpoint slices",
			icon: getResourceIcon("endpointslices"),
			badge: getHealthTrendBadge(healthPercentage),
		},
		{
			title: "Total Endpoints",
			value: totalEndpoints.toString(),
			subtitle: `${totalReady} ready, ${totalNotReady} not ready`,
			icon: getResourceIcon("endpointslices"),
			badge: getHealthTrendBadge(totalEndpoints > 0 ? Math.round((totalReady / totalEndpoints) * 100) : 0),
		},
		{
			title: "Healthy Slices",
			value: `${healthySlices}/${totalEndpointSlices}`,
			subtitle: `${healthPercentage}% with ready endpoints`,
			icon: getResourceIcon("endpointslices"),
			badge: getHealthTrendBadge(healthPercentage),
		},
		{
			title: "Address Types",
			value: `IPv4: ${ipv4Slices}`,
			subtitle: `IPv6: ${ipv6Slices}, FQDN: ${fqdnSlices}`,
			icon: getResourceIcon("endpointslices"),
		},
	]

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Endpoint Slices</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor endpoint slice resources in your Kubernetes cluster
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
				cards={summaryCards}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			{/* Data Table */}
			<EndpointSlicesDataTable />
		</div>
	)
}

export function EndpointSlicesPageContainer() {
	return (
		<SharedProviders>
			<EndpointSlicesContent />
		</SharedProviders>
	)
}
