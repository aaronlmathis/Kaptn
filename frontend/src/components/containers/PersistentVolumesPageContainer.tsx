"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"

import { PersistentVolumesDataTable } from "@/components/data_tables/PersistentVolumesDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { usePersistentVolumesWithWebSocket } from "@/hooks/usePersistentVolumesWithWebSocket"
import {
	getPersistentVolumeStatusBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"

function PersistentVolumesContent() {
	const { data: persistentVolumes, loading: isLoading, error, isConnected } = usePersistentVolumesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when persistent volumes change
	React.useEffect(() => {
		if (persistentVolumes.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [persistentVolumes])

	// Generate summary cards from persistent volume data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!persistentVolumes || persistentVolumes.length === 0) {
			return [
				{
					title: "Total Persistent Volumes",
					value: 0,
					subtitle: "No persistent volumes found"
				}
			]
		}

		const totalPVs = persistentVolumes.length
		const availablePVs = persistentVolumes.filter(pv => pv.status.toLowerCase() === 'available').length
		const boundPVs = persistentVolumes.filter(pv => pv.status.toLowerCase() === 'bound').length
		const releasedPVs = persistentVolumes.filter(pv => pv.status.toLowerCase() === 'released').length
		const failedPVs = persistentVolumes.filter(pv => pv.status.toLowerCase() === 'failed').length

		return [
			{
				title: "Total Persistent Volumes",
				value: totalPVs,
				subtitle: `${totalPVs} storage volumes`,
				badge: getPersistentVolumeStatusBadge(availablePVs, boundPVs, totalPVs),
				icon: getResourceIcon("persistentvolumes"),
				footer: totalPVs > 0 ? "All persistent volumes in cluster" : "No persistent volumes found"
			},
			{
				title: "Available",
				value: availablePVs,
				subtitle: "Ready for binding",
				footer: availablePVs > 0 ? "Volumes ready for claims" : "No available volumes"
			},
			{
				title: "Bound",
				value: boundPVs,
				subtitle: "Currently in use",
				footer: boundPVs > 0 ? "Volumes bound to claims" : "No bound volumes"
			},
			{
				title: "Released/Failed",
				value: releasedPVs + failedPVs,
				subtitle: "Needs attention",
				footer: (releasedPVs + failedPVs) > 0 ? "Volumes needing cleanup" : "All volumes healthy"
			}
		]
	}, [persistentVolumes])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Persistent Volumes</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor persistent volume resources in your Kubernetes cluster
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
			<PersistentVolumesDataTable />
		</div>
	)
}


export function PersistentVolumesPageContainer() {
	return (
		<SharedProviders>
			<PersistentVolumesContent />
		</SharedProviders>
	)
}
