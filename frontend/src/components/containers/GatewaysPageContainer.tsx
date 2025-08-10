"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useCapabilities } from "@/hooks/use-capabilities"
import { GatewaysDataTable } from "@/components/data_tables/GatewaysDataTable"
import { useGatewaysWithWebSocket } from "@/hooks/useGatewaysWithWebSocket"
import {
	getResourceIcon,
	getGatewayStatusBadge,
	getGatewayServerTypeBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function GatewaysContent() {
	const { capabilities } = useCapabilities()
	const { data: gateways, loading: isLoading, error, isConnected } = useGatewaysWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when gateways change
	React.useEffect(() => {
		if (gateways.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [gateways])

	// Generate summary cards from gateway data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!gateways || gateways.length === 0) {
			return [
				{
					title: "Total Gateways",
					value: 0,
					subtitle: "No gateways found"
				},
				{
					title: "HTTP Ports",
					value: 0,
					subtitle: "0 HTTP ports"
				},
				{
					title: "HTTPS Ports",
					value: 0,
					subtitle: "0 HTTPS ports"
				},
				{
					title: "TCP Ports",
					value: 0,
					subtitle: "0 TCP ports"
				}
			]
		}

		const totalGateways = gateways.length
		const httpPorts = gateways.reduce((sum, gw) =>
			sum + (gw.ports?.filter(p => p.protocol === 'HTTP').length || 0), 0)
		const httpsPorts = gateways.reduce((sum, gw) =>
			sum + (gw.ports?.filter(p => p.protocol === 'HTTPS').length || 0), 0)
		const tcpPorts = gateways.reduce((sum, gw) =>
			sum + (gw.ports?.filter(p => p.protocol === 'TCP').length || 0), 0)

		return [
			{
				title: "Total Gateways",
				value: totalGateways,
				subtitle: `${totalGateways} gateways configured`,
				badge: getGatewayStatusBadge(totalGateways),
				icon: getResourceIcon("ingresses"), // Use ingresses icon for now
				footer: totalGateways > 0 ? "Istio traffic entry points" : "No gateways found"
			},
			{
				title: "HTTP Ports",
				value: httpPorts,
				subtitle: `${httpPorts} HTTP port configurations`,
				badge: getGatewayServerTypeBadge(httpPorts, totalGateways, "HTTP"),
				footer: httpPorts > 0 ? "HTTP traffic entry points" : "No HTTP ports configured"
			},
			{
				title: "HTTPS Ports",
				value: httpsPorts,
				subtitle: `${httpsPorts} HTTPS port configurations`,
				badge: getGatewayServerTypeBadge(httpsPorts, totalGateways, "HTTPS"),
				footer: httpsPorts > 0 ? "Secure traffic entry points" : "No HTTPS ports configured"
			},
			{
				title: "TCP Ports",
				value: tcpPorts,
				subtitle: `${tcpPorts} TCP port configurations`,
				badge: getGatewayServerTypeBadge(tcpPorts, totalGateways, "TCP"),
				footer: tcpPorts > 0 ? "TCP traffic entry points" : "No TCP ports configured"
			}
		]
	}, [gateways])

	// Show message if Istio is not available
	if (!capabilities?.istio?.installed || !capabilities?.istio?.used) {
		return (
			<div className="space-y-6">
				<div className="px-4 lg:px-6">
					<div className="flex items-center justify-between">
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<h1 className="text-2xl font-bold tracking-tight">Gateways</h1>
								<p className="text-muted-foreground">
									Istio gateways are not available in this cluster
								</p>
							</div>
						</div>
						<div className="flex items-center justify-center p-8">
							<div className="text-center space-y-2">
								<h3 className="text-lg font-medium">Istio Not Available</h3>
								<p className="text-muted-foreground">
									{!capabilities?.istio?.installed
										? "Istio is not installed in this cluster"
										: "Istio is installed but no gateways are configured"
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
							<h1 className="text-2xl font-bold tracking-tight">Gateways</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage Istio gateways for ingress traffic management
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

			{/* Gateways Data Table */}

			<GatewaysDataTable />

		</div>
	)
}

export function GatewaysPageContainer() {
	return (
		<SharedProviders>
			<GatewaysContent />
		</SharedProviders>
	)
}
