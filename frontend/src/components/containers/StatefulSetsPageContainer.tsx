"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { StatefulSetsDataTable } from "@/components/data_tables/StatefulSetsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useStatefulSetsWithWebSocket } from "@/hooks/useStatefulSetsWithWebSocket"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function StatefulSetsContent() {
	const { data: statefulSets, loading: isLoading, error, isConnected } = useStatefulSetsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when statefulSets change
	React.useEffect(() => {
		if (statefulSets.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [statefulSets])

	// Generate summary cards from statefulset data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!statefulSets || statefulSets.length === 0) {
			return [
				{
					title: "Total StatefulSets",
					value: 0,
					subtitle: "No statefulsets found"
				},
				{
					title: "Ready",
					value: 0,
					subtitle: "0/0 ready"
				},
				{
					title: "Current",
					value: 0,
					subtitle: "0 current replicas"
				},
				{
					title: "Updated",
					value: 0,
					subtitle: "0 updated replicas"
				}
			]
		}

		const totalStatefulSets = statefulSets.length

		// Calculate ready statefulsets (where ready fraction equals expected)
		const readyStatefulSets = statefulSets.filter(ss => {
			const [ready, total] = ss.ready.split('/').map(Number)
			return ready === total && total > 0
		}).length

		// Calculate total replica stats
		const totalCurrent = statefulSets.reduce((sum, ss) => sum + ss.current, 0)
		const totalUpdated = statefulSets.reduce((sum, ss) => sum + ss.updated, 0)
		const totalReady = statefulSets.reduce((sum, ss) => {
			const [ready] = ss.ready.split('/').map(Number)
			return sum + (ready || 0)
		}, 0)
		const totalDesired = statefulSets.reduce((sum, ss) => {
			const [, total] = ss.ready.split('/').map(Number)
			return sum + (total || 0)
		}, 0)

		return [
			{
				title: "Total StatefulSets",
				value: totalStatefulSets,
				subtitle: `${readyStatefulSets}/${totalStatefulSets} ready`,
				badge: getReplicaStatusBadge(readyStatefulSets, totalStatefulSets),
				icon: getResourceIcon("statefulsets"),
				footer: totalStatefulSets > 0 ? "All statefulset resources in cluster" : "No statefulsets found"
			},
			{
				title: "Ready Replicas",
				value: `${totalReady}/${totalDesired}`,
				subtitle: totalDesired > 0 ? `${Math.round((totalReady / totalDesired) * 100)}% ready` : "No replicas",
				badge: getReplicaStatusBadge(totalReady, totalDesired),
				footer: totalDesired > 0 ? "Pod instances across all statefulsets" : "No pod replicas"
			},
			{
				title: "Current",
				value: totalCurrent,
				subtitle: `${totalCurrent} current replicas`,
				badge: getHealthTrendBadge(totalDesired > 0 ? (totalCurrent / totalDesired) * 100 : 0),
				footer: totalCurrent > 0 ? "Currently running replicas" : "No current replicas"
			},
			{
				title: "Updated",
				value: totalUpdated,
				subtitle: `${totalUpdated} updated replicas`,
				badge: getUpdateStatusBadge(totalUpdated, totalDesired),
				footer: totalUpdated > 0 ? "Replicas with latest configuration" : "No updated replicas"
			}
		]
	}, [statefulSets])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Stateful Sets</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor stateful sets resources in your Kubernetes cluster
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

			<StatefulSetsDataTable />
		</div>
	)
}

export function StatefulSetsPageContainer() {
	return (
		<SharedProviders>
			<StatefulSetsContent />
		</SharedProviders>
	)
}
