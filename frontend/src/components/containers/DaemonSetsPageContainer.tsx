"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { DaemonSetsDataTable } from "@/components/data_tables/DaemonSetsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useDaemonSetsWithWebSocket } from "@/hooks/useDaemonSetsWithWebSocket"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function DaemonSetsContent() {
	const { data: daemonSets, loading: isLoading, error, isConnected } = useDaemonSetsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when daemonSets change
	React.useEffect(() => {
		if (daemonSets.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [daemonSets])

	// Generate summary cards from daemonset data.
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!daemonSets || daemonSets.length === 0) {
			return [
				{
					title: "Total DaemonSets",
					value: 0,
					subtitle: "No DaemonSets found"
				},
				{
					title: "Ready Replicas",
					value: 0,
					subtitle: "0 ready"
				},
				{
					title: "Desired Replicas",
					value: 0,
					subtitle: "0 desired"
				},
				{
					title: "Health",
					value: "0%",
					subtitle: "No data"
				}
			]
		}

		const totalDaemonSets = daemonSets.length

		// Calculate daemonset metrics
		const totalDesired = daemonSets.reduce((sum, ds) => sum + ds.desired, 0)
		const totalReady = daemonSets.reduce((sum, ds) => sum + ds.ready, 0)
		const totalCurrent = daemonSets.reduce((sum, ds) => sum + ds.current, 0)
		const totalAvailable = daemonSets.reduce((sum, ds) => sum + ds.available, 0)

		// Calculate health metrics
		const healthyDaemonSets = daemonSets.filter(ds => ds.ready === ds.desired && ds.desired > 0).length
		const healthPercentage = totalDaemonSets > 0 ? (healthyDaemonSets / totalDaemonSets) * 100 : 0

		// Calculate readiness percentage
		const readyPercentage = totalDesired > 0 ? (totalReady / totalDesired) * 100 : 0

		return [
			{
				title: "Total DaemonSets",
				value: totalDaemonSets,
				subtitle: `${healthyDaemonSets}/${totalDaemonSets} healthy`,
				badge: getReplicaStatusBadge(healthyDaemonSets, totalDaemonSets),
				icon: getResourceIcon("daemonsets"),
				footer: totalDaemonSets > 0 ? "All DaemonSet resources in cluster" : "No DaemonSets found"
			},
			{
				title: "Ready Replicas",
				value: totalReady,
				subtitle: `${totalReady}/${totalDesired} ready`,
				badge: getHealthTrendBadge(readyPercentage),
				footer: totalReady > 0 ? "Ready pods across all DaemonSets" : "No ready pods"
			},
			{
				title: "Desired Replicas",
				value: totalDesired,
				subtitle: `${totalCurrent} current replicas`,
				badge: getUpdateStatusBadge(totalCurrent, totalDesired),
				footer: totalDesired > 0 ? "Target replica count" : "No desired replicas"
			},
			{
				title: "Health Coverage",
				value: `${Math.round(healthPercentage)}%`,
				subtitle: `${totalAvailable} available replicas`,
				badge: getReplicaStatusBadge(healthyDaemonSets, totalDaemonSets),
				footer: healthPercentage > 80 ? "Good DaemonSet health" : "Some DaemonSets need attention"
			}
		]
	}, [daemonSets])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">DaemonSets</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor DaemonSet resources in your Kubernetes cluster
						</p>
					</div>
					{lastUpdated && (
						<div className="text-sm text-muted-foreground">
							Last updated: {new Date(lastUpdated).toLocaleTimeString()}
						</div>
					)}
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<DaemonSetsDataTable />
		</div>
	)
}

export function DaemonSetsPageContainer() {
	return (
		<SharedProviders>
			<DaemonSetsContent />
		</SharedProviders>
	)
}
