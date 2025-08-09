"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { IngressesDataTable } from "@/components/data_tables/IngressesDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useIngressesWithWebSocket } from "@/hooks/useIngressesWithWebSocket"
import {
	getResourceIcon,
	getReplicaStatusBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function IngressesContent() {
	const { data: ingresses, loading: isLoading, error, isConnected } = useIngressesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when ingresses change
	React.useEffect(() => {
		if (ingresses.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [ingresses])

	// Generate summary cards from ingress data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!ingresses || ingresses.length === 0) {
			return [
				{
					title: "Total Ingresses",
					value: 0,
					subtitle: "No ingresses found"
				},
				{
					title: "Configured Hosts",
					value: 0,
					subtitle: "No hosts configured"
				},
				{
					title: "External IPs",
					value: 0,
					subtitle: "No external IPs"
				},
				{
					title: "Ingress Rules",
					value: 0,
					subtitle: "No rules configured"
				}
			]
		}

		const totalIngresses = ingresses.length

		// Calculate ingress-specific metrics
		const uniqueHosts = new Set()
		const uniqueExternalIPs = new Set()
		let totalRules = 0

		ingresses.forEach(ingress => {
			// Count unique hosts
			ingress.hosts.forEach(host => uniqueHosts.add(host))

			// Count unique external IPs
			ingress.externalIPs.forEach(ip => uniqueExternalIPs.add(ip))

			// Count rules (assuming this data is available)
			totalRules += ingress.hosts.length || 0
		})

		const configuredHosts = uniqueHosts.size
		const externalIPs = uniqueExternalIPs.size

		return [
			{
				title: "Total Ingresses",
				value: totalIngresses,
				subtitle: `${totalIngresses} ingress${totalIngresses !== 1 ? 'es' : ''}`,
				badge: getReplicaStatusBadge(totalIngresses, totalIngresses),
				icon: getResourceIcon("ingresses"),
				footer: totalIngresses > 0 ? "All ingress instances in cluster" : "No ingresses found"
			},
			{
				title: "Configured Hosts",
				value: configuredHosts,
				subtitle: `${configuredHosts} unique host${configuredHosts !== 1 ? 's' : ''}`,
				icon: getResourceIcon("services"),
				footer: configuredHosts > 0 ? "Hosts with ingress rules" : "No hosts configured"
			},
			{
				title: "External Access",
				value: externalIPs,
				subtitle: `${externalIPs} external endpoint${externalIPs !== 1 ? 's' : ''}`,
				icon: getResourceIcon("endpoints"),
				footer: externalIPs > 0 ? "External IP addresses/hostnames" : "No external access"
			},
			{
				title: "Ingress Rules",
				value: totalRules,
				subtitle: `${totalRules} routing rule${totalRules !== 1 ? 's' : ''}`,
				icon: getResourceIcon("configmaps"),
				footer: totalRules > 0 ? "Total routing rules configured" : "No rules configured"
			}
		]
	}, [ingresses])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Ingresses</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor Ingress resources in your Kubernetes cluster

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

			<IngressesDataTable />
		</div>
	)
}
export function IngressesPageContainer() {
	return (
		<SharedProviders>
			<IngressesContent />
		</SharedProviders>
	)
} 
