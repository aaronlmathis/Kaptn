"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { DeploymentsDataTable } from "@/components/data_tables/DeploymentsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useDeploymentsWithWebSocket } from "@/hooks/useDeploymentsWithWebSocket"
import {
	getDeploymentStatusBadge,
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function DeploymentsContent() {
	const { data: deployments, loading: isLoading, error, isConnected } = useDeploymentsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)
	
	// Update lastUpdated when deployments change
	React.useEffect(() => {
		if (deployments.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [deployments])
	
	// Generate summary cards from deployment data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!deployments || deployments.length === 0) {
			return [
				{
					title: "Total Deployments",
					value: 0,
					subtitle: "No deployments found"
				},
				{
					title: "Ready",
					value: 0,
					subtitle: "0/0 ready"
				},
				{
					title: "Up-to-Date",
					value: 0,
					subtitle: "0 up-to-date"
				},
				{
					title: "Available",
					value: 0,
					subtitle: "0 available"
				}
			]
		}

		const totalDeployments = deployments.length
		
		// Calculate ready deployments (where ready fraction equals 1)
		const readyDeployments = deployments.filter(d => {
			const [ready, total] = d.ready.split('/').map(Number)
			return ready === total && total > 0
		}).length
		
		// Calculate total replicas stats
		const totalUpToDate = deployments.reduce((sum, d) => sum + d.upToDate, 0)
		const totalAvailable = deployments.reduce((sum, d) => sum + d.available, 0)
		const totalReplicas = deployments.reduce((sum, d) => {
			const [, total] = d.ready.split('/').map(Number)
			return sum + (total || 0)
		}, 0)
		const totalReadyReplicas = deployments.reduce((sum, d) => {
			const [ready] = d.ready.split('/').map(Number)
			return sum + (ready || 0)
		}, 0)

		return [
			{
				title: "Total Deployments",
				value: totalDeployments,
				subtitle: `${readyDeployments}/${totalDeployments} ready`,
				badge: getDeploymentStatusBadge(readyDeployments, totalDeployments),
				icon: getResourceIcon("deployments"),
				footer: totalDeployments > 0 ? "All deployment resources in cluster" : "No deployments found"
			},
			{
				title: "Ready Replicas",
				value: `${totalReadyReplicas}/${totalReplicas}`,
				subtitle: totalReplicas > 0 ? `${Math.round((totalReadyReplicas / totalReplicas) * 100)}% ready` : "No replicas",
				badge: getReplicaStatusBadge(totalReadyReplicas, totalReplicas),
				footer: totalReplicas > 0 ? "Pod instances across all deployments" : "No pod replicas"
			},
			{
				title: "Up-to-Date",
				value: totalUpToDate,
				subtitle: `${totalUpToDate} replicas up-to-date`,
				badge: getUpdateStatusBadge(totalUpToDate, totalReplicas),
				footer: totalReplicas > 0 ? "Running latest deployment version" : "No replicas to update"
			},
			{
				title: "Available",
				value: totalAvailable,
				subtitle: `${totalAvailable} replicas available`,
				badge: getHealthTrendBadge(totalReplicas > 0 ? (totalAvailable / totalReplicas) * 100 : 0),
				footer: totalAvailable > 0 ? "Ready to serve traffic" : "No available replicas"
			}
		]
	}, [deployments])

	return (
		<>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h1 className="text-2xl font-bold tracking-tight">Deployments</h1>
						{isConnected && (
							<div className="flex items-center space-x-1 text-xs text-green-600">
								<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
								<span>Real-time updates enabled</span>
							</div>
						)}
					</div>
					<p className="text-muted-foreground">
						Manage and monitor deployment resources in your Kubernetes cluster
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<DeploymentsDataTable />
		</>
	)
}

export function DeploymentsPageContainer() {
	return (
		<SharedProviders>
			<DeploymentsContent />
		</SharedProviders>
	)
}
