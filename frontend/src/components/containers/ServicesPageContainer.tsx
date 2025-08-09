"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { ServicesDataTable } from "@/components/data_tables/ServicesDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useServicesWithWebSocket } from "@/hooks/useServicesWithWebSocket"
import {
	getServiceStatusBadge,
	getServiceTypeBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function ServicesContent() {
	const { data: services, loading: isLoading, error, isConnected } = useServicesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when services change
	React.useEffect(() => {
		if (services.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [services])

	// Generate summary cards from service data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!services || services.length === 0) {
			return [
				{
					title: "Total Services",
					value: 0,
					subtitle: "No services found"
				},
				{
					title: "ClusterIP Services",
					value: 0,
					subtitle: "0 ClusterIP services"
				},
				{
					title: "LoadBalancer Services",
					value: 0,
					subtitle: "0 LoadBalancer services"
				},
				{
					title: "NodePort Services",
					value: 0,
					subtitle: "0 NodePort services"
				}
			]
		}

		const totalServices = services.length
		const clusterIPServices = services.filter(s => s.type === 'ClusterIP').length
		const loadBalancerServices = services.filter(s => s.type === 'LoadBalancer').length
		const nodePortServices = services.filter(s => s.type === 'NodePort').length
		const externalNameServices = services.filter(s => s.type === 'ExternalName').length
		const otherServices = totalServices - clusterIPServices - loadBalancerServices - nodePortServices - externalNameServices

		return [
			{
				title: "Total Services",
				value: totalServices,
				subtitle: `${services.length} services across all types`,
				badge: getServiceStatusBadge(totalServices),
				icon: getResourceIcon("services"),
				footer: totalServices > 0 ? "All service resources in cluster" : "No services found"
			},
			{
				title: "ClusterIP",
				value: clusterIPServices,
				subtitle: `${clusterIPServices} internal cluster services`,
				badge: getServiceTypeBadge(clusterIPServices, totalServices, "ClusterIP"),
				footer: clusterIPServices > 0 ? "Internal communication services" : "No internal services"
			},
			{
				title: "LoadBalancer",
				value: loadBalancerServices,
				subtitle: `${loadBalancerServices} external load balancer services`,
				badge: getServiceTypeBadge(loadBalancerServices, totalServices, "LoadBalancer"),
				footer: loadBalancerServices > 0 ? "External traffic entry points" : "No external load balancers"
			},
			{
				title: "NodePort",
				value: nodePortServices,
				subtitle: `${nodePortServices} node port services`,
				badge: getServiceTypeBadge(nodePortServices, totalServices, "NodePort"),
				footer: nodePortServices > 0 ? "Direct node access services" : "No node port services"
			}
		]
	}, [services])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Services</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor service resources in your Kubernetes cluster
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

			<ServicesDataTable />
		</div>
	)
}

export function ServicesPageContainer() {
	return (
		<SharedProviders>
			<ServicesContent />
		</SharedProviders>
	)
}
