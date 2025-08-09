"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { VolumeSnapshotsDataTable } from "@/components/data_tables/VolumeSnapshotsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useVolumeSnapshotsWithWebSocket } from "@/hooks/useVolumeSnapshotsWithWebSocket"
import {
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function VolumeSnapshotsContent() {
	const { data: volumeSnapshots, loading: isLoading, error, isConnected } = useVolumeSnapshotsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when volumeSnapshots change
	React.useEffect(() => {
		if (volumeSnapshots && volumeSnapshots.length > 0) {
			setLastUpdated(new Date().toLocaleTimeString())
		}
	}, [volumeSnapshots])

	// Calculate summary data for cards
	const totalSnapshots = volumeSnapshots?.length || 0
	const readySnapshots = volumeSnapshots?.filter(snapshot => snapshot.readyToUse).length || 0
	const notReadySnapshots = totalSnapshots - readySnapshots

	// Health metrics
	const healthPercentage = totalSnapshots > 0 ? Math.round((readySnapshots / totalSnapshots) * 100) : 0

	// Group by source PVC
	const uniquePVCs = new Set(volumeSnapshots?.map(snapshot => snapshot.sourcePVC) || []).size

	// Group by snapshot class
	const snapshotClasses = new Set(volumeSnapshots?.map(snapshot => snapshot.volumeSnapshotClassName) || []).size

	const summaryCards: SummaryCard[] = [
		{
			title: "Total Volume Snapshots",
			value: totalSnapshots.toString(),
			subtitle: "Active volume snapshots",
			icon: getResourceIcon("volumesnapshots"),
			badge: getHealthTrendBadge(healthPercentage),
		},
		{
			title: "Ready Snapshots",
			value: `${readySnapshots}/${totalSnapshots}`,
			subtitle: `${healthPercentage}% ready to use`,
			icon: getResourceIcon("volumesnapshots"),
			badge: getHealthTrendBadge(healthPercentage),
		},
		{
			title: "Not Ready",
			value: notReadySnapshots.toString(),
			subtitle: "Snapshots not ready",
			icon: getResourceIcon("volumesnapshots"),
			badge: notReadySnapshots > 0 ? getHealthTrendBadge(0) : undefined,
		},
		{
			title: "Source PVCs",
			value: uniquePVCs.toString(),
			subtitle: `Snapshots from ${snapshotClasses} classes`,
			icon: getResourceIcon("volumesnapshots"),
		},
	]

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Volume Snapshots</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor volume snapshot resources in your Kubernetes cluster
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
				cards={summaryCards}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			{/* Data Table */}
			<VolumeSnapshotsDataTable />
		</div>
	)
}

export function VolumeSnapshotsPageContainer() {
	return (
		<SharedProviders>
			<VolumeSnapshotsContent />
		</SharedProviders>
	)
}
