"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { LoadBalancersDataTable } from "@/components/data_tables/LoadBalancersDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useLoadBalancersWithWebSocket } from "@/hooks/useLoadBalancersWithWebSocket"
import {
	getReplicaStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function LoadBalancersContent() {
	const { data: loadBalancers, loading: isLoading, error, isConnected } = useLoadBalancersWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when load balancers change
	React.useEffect(() => {
		if (loadBalancers.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [loadBalancers])

	// Generate summary cards from load balancer data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!loadBalancers || loadBalancers.length === 0) {
			return [
				{
					title: "Total Load Balancers",
					value: 0,
					subtitle: "No load balancers found"
				},
				{
					title: "Active Load Balancers",
					value: 0,
					subtitle: "With external IPs assigned"
				},
				{
					title: "Pending",
					value: 0,
					subtitle: "Waiting for external IP"
				},
				{
					title: "Namespaces",
					value: 0,
					subtitle: "No load balancers deployed"
				}
			]
		}

		const totalLoadBalancers = loadBalancers.length
		const activeLoadBalancers = loadBalancers.filter(lb =>
			lb.externalIP && lb.externalIP !== '<none>' && lb.externalIP !== '<pending>'
		).length
		const pendingLoadBalancers = loadBalancers.filter(lb =>
			lb.externalIP === '<pending>'
		).length
		const uniqueNamespaces = new Set(loadBalancers.map(lb => lb.namespace)).size

		// Calculate metrics for badges
		const activePercentage = totalLoadBalancers > 0 ? (activeLoadBalancers / totalLoadBalancers) * 100 : 0
		const pendingPercentage = totalLoadBalancers > 0 ? (pendingLoadBalancers / totalLoadBalancers) * 100 : 0

		return [
			{
				title: "Total Load Balancers",
				value: totalLoadBalancers,
				subtitle: `${totalLoadBalancers} load ${totalLoadBalancers === 1 ? 'balancer' : 'balancers'}`,
				badge: getReplicaStatusBadge(totalLoadBalancers, totalLoadBalancers),
				icon: getResourceIcon("loadbalancers"),
				footer: totalLoadBalancers > 0 ? "LoadBalancer type services" : "No load balancers found"
			},
			{
				title: "Active Load Balancers",
				value: activeLoadBalancers,
				subtitle: `${activePercentage.toFixed(0)}% with external IPs`,
				badge: getHealthTrendBadge(activePercentage, true),
				icon: getResourceIcon("loadbalancers"),
				footer: `${activeLoadBalancers} ${activeLoadBalancers === 1 ? 'load balancer' : 'load balancers'} ready to serve traffic`
			},
			{
				title: "Pending",
				value: pendingLoadBalancers,
				subtitle: `${pendingPercentage.toFixed(0)}% waiting for IP`,
				badge: getHealthTrendBadge(100 - pendingPercentage, true),
				icon: getResourceIcon("loadbalancers"),
				footer: `${pendingLoadBalancers} ${pendingLoadBalancers === 1 ? 'load balancer' : 'load balancers'} waiting for external IP assignment`
			},
			{
				title: "Namespaces",
				value: uniqueNamespaces,
				subtitle: `${uniqueNamespaces} unique ${uniqueNamespaces === 1 ? 'namespace' : 'namespaces'}`,
				badge: getReplicaStatusBadge(uniqueNamespaces, uniqueNamespaces),
				icon: getResourceIcon("loadbalancers"),
				footer: uniqueNamespaces > 0 ? "Namespaces with load balancers" : "No load balancers deployed"
			}
		]
	}, [loadBalancers])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Load Balancers</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor load balancer resources in your Kubernetes cluster
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

			<LoadBalancersDataTable />
		</div>
	)
}

export function LoadBalancersPageContainer() {
	return (
		<SharedProviders>
			<LoadBalancersContent />
		</SharedProviders>
	)
}
