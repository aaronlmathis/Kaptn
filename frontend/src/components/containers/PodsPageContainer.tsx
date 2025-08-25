"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { RouteGuard } from "@/components/authz"
import { PodsDataTable } from "@/components/data_tables/PodsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { usePodsWithWebSocket } from "@/hooks/usePodsWithWebSocket"
import {
	getPodStatusBadge,
	getPodPhaseBadge,
	getPodReadinessBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function PodsContent() {
	const { data: pods, loading: isLoading, error, isConnected } = usePodsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when pods change
	React.useEffect(() => {
		if (pods.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [pods])

	// Generate summary cards from pod data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!pods || pods.length === 0) {
			return [
				{
					title: "Total Pods",
					value: 0,
					subtitle: "No pods found"
				},
				{
					title: "Running",
					value: 0,
					subtitle: "0 running pods"
				},
				{
					title: "Ready",
					value: "0/0",
					subtitle: "0% ready"
				},
				{
					title: "Failed",
					value: 0,
					subtitle: "0 failed pods"
				}
			]
		}

		const totalPods = pods.length

		// Count pods by status/phase
		const runningPods = pods.filter(p => p.status === 'Running').length
		const failedPods = pods.filter(p => p.status === 'Failed').length

		// Count ready pods by parsing the ready field (e.g., "1/1", "0/1")
		const readyStats = pods.reduce((acc, pod) => {
			const [ready, total] = pod.ready.split('/').map(Number)
			return {
				ready: acc.ready + (ready || 0),
				total: acc.total + (total || 0)
			}
		}, { ready: 0, total: 0 })

		// Count restarts
		const totalRestarts = pods.reduce((sum, p) => sum + p.restarts, 0)

		return [
			{
				title: "Total Pods",
				value: totalPods,
				subtitle: `${runningPods}/${totalPods} running`,
				badge: getPodStatusBadge(runningPods, totalPods),
				icon: getResourceIcon("pods"),
				footer: totalPods > 0 ? "All pod resources in cluster" : "No pods found"
			},
			{
				title: "Running Pods",
				value: runningPods,
				subtitle: `${Math.round((runningPods / totalPods) * 100)}% running`,
				badge: getPodPhaseBadge(runningPods, totalPods, "Running"),
				footer: runningPods > 0 ? "Active and executing workloads" : "No running pods"
			},
			{
				title: "Ready Containers",
				value: `${readyStats.ready}/${readyStats.total}`,
				subtitle: readyStats.total > 0 ? `${Math.round((readyStats.ready / readyStats.total) * 100)}% ready` : "No containers",
				badge: getPodReadinessBadge(readyStats.ready, readyStats.total),
				footer: readyStats.ready > 0 ? "Containers accepting traffic" : "No ready containers"
			},
			{
				title: "Failed Pods",
				value: failedPods,
				subtitle: totalRestarts > 0 ? `${totalRestarts} total restarts` : "No restarts",
				badge: getPodPhaseBadge(failedPods, totalPods, "Failed"),
				footer: failedPods === 0 ? "All pods healthy" : "Some pods need attention"
			}
		]
	}, [pods])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Pods</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor pod resources in your Kubernetes cluster
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

			<PodsDataTable />
		</div>
	)
}

export function PodsPageContainer() {
	return (
		<SharedProviders>
			<RouteGuard
				requiredCapabilities={['pods.list']}
				requireAll={false}
			>
				<PodsContent />
			</RouteGuard>
		</SharedProviders>
	)
}
