"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { ResourceQuotasDataTable } from "@/components/data_tables/ResourceQuotasDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceQuotasWithWebSocket } from "@/hooks/useResourceQuotasWithWebSocket"
import {
	getConnectionStatusBadge,
	getHealthTrendBadge,
	getReplicaStatusBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function ResourceQuotasContent() {
	const { data: resourceQuotas, loading: isLoading, error, isConnected } = useResourceQuotasWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when resource quotas change
	React.useEffect(() => {
		if (resourceQuotas.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [resourceQuotas])

	// Generate summary cards from resource quota data
	const summaryData = React.useMemo(() => {
		if (!resourceQuotas || resourceQuotas.length === 0) {
			return [
				{
					title: "Total Resource Quotas",
					value: 0,
					subtitle: "No resource quotas found"
				},
				{
					title: "Active Quotas",
					value: 0,
					subtitle: "Quotas with limits"
				},
				{
					title: "Resource Types",
					value: 0,
					subtitle: "Limited resource types"
				},
				{
					title: "Total Hard Limits",
					value: 0,
					subtitle: "Individual limit rules"
				}
			]
		}

		const totalQuotas = resourceQuotas.length
		const activeQuotas = resourceQuotas.filter(q => q.hardLimits.length > 0).length
		const totalResourceTypes = new Set(
			resourceQuotas.flatMap(q => q.hardLimits.map(l => l.name))
		).size

		return [
			{
				title: "Total Resource Quotas",
				value: totalQuotas,
				subtitle: `${totalQuotas} quota${totalQuotas !== 1 ? 's' : ''}`,
				footer: totalQuotas > 0 ? "Resource quotas across all namespaces" : "No resource quotas found",
				badge: getConnectionStatusBadge(isConnected)
			},
			{
				title: "Active Quotas",
				value: activeQuotas,
				subtitle: `${activeQuotas} with hard limits`,
				footer: "Quotas defining resource limits",
				badge: getReplicaStatusBadge(activeQuotas, totalQuotas)
			},
			{
				title: "Resource Types",
				value: totalResourceTypes,
				subtitle: "Types under quota control",
				footer: "CPU, memory, storage, etc.",
				badge: getHealthTrendBadge(totalResourceTypes > 0 ? 100 : 0)
			},
			{
				title: "Total Hard Limits",
				value: resourceQuotas.reduce((sum, q) => sum + q.hardLimits.length, 0),
				subtitle: "Individual limit rules",
				footer: "Sum of all hard limit entries",
				badge: getHealthTrendBadge(resourceQuotas.reduce((sum, q) => sum + q.hardLimits.length, 0) > 0 ? 100 : 0)
			}
		]
	}, [resourceQuotas, isConnected])

	return (
		<>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h1 className="text-2xl font-bold tracking-tight">Resource Quotas</h1>
						{isConnected && (
							<div className="flex items-center space-x-1 text-xs text-green-600">
								<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
								<span>Real-time updates enabled</span>
							</div>
						)}
					</div>
					<p className="text-muted-foreground">
						Manage and monitor resource quota limits in your Kubernetes cluster
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<ResourceQuotasDataTable />
		</>
	)
}

export function ResourceQuotasPageContainer() {
	return (
		<SharedProviders>
			<ResourceQuotasContent />
		</SharedProviders>
	)
}
