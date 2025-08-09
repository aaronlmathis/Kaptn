"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { NodesDataTable } from "@/components/data_tables/NodesDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useNodesWithWebSocket } from "@/hooks/useNodesWithWebSocket"
import {
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function NodesContent() {
	const { data: nodes, loading: isLoading, error, isConnected } = useNodesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when nodes change
	React.useEffect(() => {
		if (nodes.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [nodes])

	// Generate summary cards from node data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!nodes || nodes.length === 0) {
			return [
				{
					title: "Total Nodes",
					value: 0,
					subtitle: "No nodes found"
				},
				{
					title: "Ready Nodes",
					value: 0,
					subtitle: "0/0 ready"
				},
				{
					title: "Control Plane",
					value: 0,
					subtitle: "0 control plane nodes"
				},
				{
					title: "Worker Nodes",
					value: 0,
					subtitle: "0 worker nodes"
				}
			]
		}

		const totalNodes = nodes.length

		// Count nodes by status
		const readyNodes = nodes.filter(n => n.status === 'Ready').length
		const cordonedNodes = nodes.filter(n => n.status === 'SchedulingDisabled').length

		// Count nodes by role
		const controlPlaneNodes = nodes.filter(n =>
			n.roles.includes('control-plane') ||
			n.roles.includes('master')
		).length
		const workerNodes = totalNodes - controlPlaneNodes

		// Calculate health percentage
		const healthPercentage = totalNodes > 0 ? (readyNodes / totalNodes) * 100 : 0

		return [
			{
				title: "Total Nodes",
				value: totalNodes,
				subtitle: `${readyNodes}/${totalNodes} ready`,
				badge: getHealthTrendBadge(healthPercentage),
				icon: getResourceIcon("nodes"),
				footer: totalNodes > 0 ? "All cluster nodes" : "No nodes found"
			},
			{
				title: "Ready Nodes",
				value: readyNodes,
				subtitle: `${Math.round(healthPercentage)}% healthy`,
				badge: getHealthTrendBadge(healthPercentage),
				footer: readyNodes > 0 ? "Available for scheduling" : "No ready nodes"
			},
			{
				title: "Control Plane",
				value: controlPlaneNodes,
				subtitle: `${controlPlaneNodes} management nodes`,
				badge: getHealthTrendBadge(controlPlaneNodes > 0 ? 100 : 0),
				footer: controlPlaneNodes > 0 ? "Cluster management nodes" : "No control plane nodes"
			},
			{
				title: "Worker Nodes",
				value: workerNodes,
				subtitle: cordonedNodes > 0 ? `${cordonedNodes} cordoned` : "All available",
				badge: getHealthTrendBadge(workerNodes > 0 ? ((workerNodes - cordonedNodes) / workerNodes) * 100 : 0),
				footer: workerNodes > 0 ? "Application workload nodes" : "No worker nodes"
			}
		]
	}, [nodes])

	return (
		<>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h1 className="text-2xl font-bold tracking-tight">Nodes</h1>
						{isConnected && (
							<div className="flex items-center space-x-1 text-xs text-green-600">
								<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
								<span>Real-time updates enabled</span>
							</div>
						)}
					</div>
					<p className="text-muted-foreground">
						Manage and monitor cluster nodes
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<NodesDataTable />
		</>
	)
}

export function NodesPageContainer() {
	return (
		<SharedProviders>
			<NodesContent />
		</SharedProviders>
	)
}