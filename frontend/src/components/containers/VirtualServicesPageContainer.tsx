"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useCapabilities } from "@/hooks/use-capabilities"
import { VirtualServicesDataTable } from "@/components/data_tables/VirtualServicesDataTable"
import { useVirtualServicesWithWebSocket } from "@/hooks/useVirtualServicesWithWebSocket"
import {
	getResourceIcon,
	getVirtualServiceStatusBadge,
	getVirtualServiceHostsBadge,
	getVirtualServiceGatewaysBadge,
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function VirtualServicesContent() {
	const { capabilities } = useCapabilities()
	const { data: virtualServices, loading: isLoading, error, isConnected } = useVirtualServicesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when virtual services change
	React.useEffect(() => {
		if (virtualServices.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [virtualServices])

	// Generate summary cards from virtual service data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!virtualServices || virtualServices.length === 0) {
			return [
				{
					title: "Total Virtual Services",
					value: 0,
					subtitle: "No virtual services found"
				},
				{
					title: "HTTP Routes",
					value: 0,
					subtitle: "0 HTTP routes"
				},
				{
					title: "Hosts",
					value: 0,
					subtitle: "0 hosts"
				},
				{
					title: "Gateways",
					value: 0,
					subtitle: "0 gateways"
				}
			]
		}

		const totalVirtualServices = virtualServices.length
		const totalHosts = virtualServices.reduce((sum, vs) => sum + vs.hosts.length, 0)
		const totalGateways = new Set(virtualServices.flatMap(vs => vs.gateways)).size
		const uniqueHosts = new Set(virtualServices.flatMap(vs => vs.hosts)).size

		return [
			{
				title: "Total Virtual Services",
				value: totalVirtualServices,
				subtitle: `${totalVirtualServices} virtual services configured`,
				icon: getResourceIcon("virtualservices"),
				badge: getVirtualServiceStatusBadge(totalVirtualServices),
				footer: totalVirtualServices > 0 ? "Istio traffic routing rules" : "No virtual services found"
			},
			{
				title: "Unique Hosts",
				value: uniqueHosts,
				subtitle: `${uniqueHosts} unique host configurations`,
				badge: getVirtualServiceHostsBadge(uniqueHosts, totalHosts),
				footer: uniqueHosts > 0 ? "Distinct routing destinations" : "No hosts configured"
			},
			{
				title: "Total Host Entries",
				value: totalHosts,
				subtitle: `${totalHosts} total host entries`,
				badge: totalHosts > 0 ? getVirtualServiceHostsBadge(uniqueHosts, totalHosts) : undefined,
				footer: totalHosts > 0 ? "All host routing rules" : "No host entries"
			},
			{
				title: "Connected Gateways",
				value: totalGateways,
				subtitle: `${totalGateways} unique gateways referenced`,
				badge: getVirtualServiceGatewaysBadge(totalGateways),
				footer: totalGateways > 0 ? "Gateway connections" : "No gateways referenced"
			}
		]
	}, [virtualServices])

	// Show message if Istio is not available
	if (!capabilities?.istio?.installed || !capabilities?.istio?.used) {
		return (
			<div className="space-y-6">
				<div className="px-4 lg:px-6">
					<div className="flex items-center justify-between">
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<h1 className="text-2xl font-bold tracking-tight">Virtual Services</h1>
								<p className="text-muted-foreground">
									Istio virtual services are not available in this cluster
								</p>
							</div>
						</div>
						<div className="flex items-center justify-center p-8">
							<div className="text-center space-y-2">
								<h3 className="text-lg font-medium">Istio Not Available</h3>
								<p className="text-muted-foreground">
									{!capabilities?.istio?.installed
										? "Istio is not installed in this cluster"
										: "Istio is installed but no virtual services are configured"
									}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Virtual Services</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage Istio virtual services for traffic routing
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

			{/* Virtual Services Data Table */}
			<VirtualServicesDataTable />

		</div>
	)
}

export function VirtualServicesPageContainer() {
	return (
		<SharedProviders>
			<VirtualServicesContent />
		</SharedProviders>
	)
}
