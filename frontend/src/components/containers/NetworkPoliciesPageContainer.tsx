"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { NetworkPoliciesDataTable } from "@/components/data_tables/NetworkPoliciesDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useNetworkPoliciesWithWebSocket } from "@/hooks/useNetworkPoliciesWithWebSocket"
import {
	getReplicaStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function NetworkPoliciesContent() {
	const { data: networkPolicies, loading: isLoading, error, isConnected } = useNetworkPoliciesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when network policies change
	React.useEffect(() => {
		if (networkPolicies.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [networkPolicies])

	// Generate summary cards from network policy data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!networkPolicies || networkPolicies.length === 0) {
			return [
				{
					title: "Total Policies",
					value: 0,
					subtitle: "No network policies found"
				},
				{
					title: "With Ingress Rules",
					value: 0,
					subtitle: "No policies with ingress rules"
				},
				{
					title: "With Egress Rules",
					value: 0,
					subtitle: "No policies with egress rules"
				},
				{
					title: "Namespaces Protected",
					value: 0,
					subtitle: "No protected namespaces"
				}
			]
		}

		const totalPolicies = networkPolicies.length
		const policiesWithIngress = networkPolicies.filter(np => np.ingressRules > 0).length
		const policiesWithEgress = networkPolicies.filter(np => np.egressRules > 0).length
		const uniqueNamespaces = new Set(networkPolicies.map(np => np.namespace)).size

		// Calculate metrics for badges
		const ingressPercentage = totalPolicies > 0 ? (policiesWithIngress / totalPolicies) * 100 : 0
		const egressPercentage = totalPolicies > 0 ? (policiesWithEgress / totalPolicies) * 100 : 0

		return [
			{
				title: "Total Policies",
				value: totalPolicies,
				subtitle: `${totalPolicies} network ${totalPolicies === 1 ? 'policy' : 'policies'}`,
				badge: getReplicaStatusBadge(totalPolicies, totalPolicies),
				icon: getResourceIcon("networkpolicies"),
				footer: totalPolicies > 0 ? "Network traffic control policies" : "No network policies found"
			},
			{
				title: "With Ingress Rules",
				value: policiesWithIngress,
				subtitle: `${ingressPercentage.toFixed(0)}% of policies`,
				badge: getHealthTrendBadge(ingressPercentage, true),
				icon: getResourceIcon("networkpolicies"),
				footer: `Controlling incoming traffic to ${policiesWithIngress} ${policiesWithIngress === 1 ? 'policy' : 'policies'}`
			},
			{
				title: "With Egress Rules",
				value: policiesWithEgress,
				subtitle: `${egressPercentage.toFixed(0)}% of policies`,
				badge: getHealthTrendBadge(egressPercentage, true),
				icon: getResourceIcon("networkpolicies"),
				footer: `Controlling outgoing traffic from ${policiesWithEgress} ${policiesWithEgress === 1 ? 'policy' : 'policies'}`
			},
			{
				title: "Namespaces Protected",
				value: uniqueNamespaces,
				subtitle: `${uniqueNamespaces} unique ${uniqueNamespaces === 1 ? 'namespace' : 'namespaces'}`,
				badge: getReplicaStatusBadge(uniqueNamespaces, uniqueNamespaces),
				icon: getResourceIcon("networkpolicies"),
				footer: uniqueNamespaces > 0 ? "Namespaces with active network policies" : "No protected namespaces"
			}
		]
	}, [networkPolicies])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Network Policies</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage network policies that control traffic flow between pods in your Kubernetes cluster
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

			<NetworkPoliciesDataTable />
		</div>
	)
}

export function NetworkPoliciesPageContainer() {
	return (
		<SharedProviders>
			<NetworkPoliciesContent />
		</SharedProviders>
	)
}
