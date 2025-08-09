"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { VolumeSnapshotClassesDataTable } from "@/components/data_tables/VolumeSnapshotClassesDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useVolumeSnapshotClassesWithWebSocket } from "@/hooks/useVolumeSnapshotClassesWithWebSocket"
import {
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the WebSocket data
function VolumeSnapshotClassesContent() {
	const { data: volumeSnapshotClasses, loading: isLoading, error, isConnected } = useVolumeSnapshotClassesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when volumeSnapshotClasses change
	React.useEffect(() => {
		if (volumeSnapshotClasses && volumeSnapshotClasses.length > 0) {
			setLastUpdated(new Date().toLocaleTimeString())
		}
	}, [volumeSnapshotClasses])

	// Calculate summary data for cards
	const totalClasses = volumeSnapshotClasses?.length || 0

	// Group by driver
	const uniqueDrivers = new Set(volumeSnapshotClasses?.map(vsc => vsc.driver) || []).size

	// Group by deletion policy
	const retainPolicyClasses = volumeSnapshotClasses?.filter(vsc => vsc.deletionPolicy === 'Retain').length || 0
	const deletePolicyClasses = volumeSnapshotClasses?.filter(vsc => vsc.deletionPolicy === 'Delete').length || 0

	// Calculate total parameters across all classes
	const totalParameters = volumeSnapshotClasses?.reduce((sum, vsc) => sum + vsc.parametersCount, 0) || 0

	const summaryCards: SummaryCard[] = [
		{
			title: "Total Snapshot Classes",
			value: totalClasses.toString(),
			subtitle: "Available volume snapshot classes",
			icon: getResourceIcon("volumesnapshotclasses"),
			badge: getHealthTrendBadge(100), // All classes are considered healthy if they exist
		},
		{
			title: "CSI Drivers",
			value: uniqueDrivers.toString(),
			subtitle: "Different storage drivers",
			icon: getResourceIcon("volumesnapshotclasses"),
		},
		{
			title: "Deletion Policies",
			value: `Retain: ${retainPolicyClasses}`,
			subtitle: `Delete: ${deletePolicyClasses}`,
			icon: getResourceIcon("volumesnapshotclasses"),
		},
		{
			title: "Total Parameters",
			value: totalParameters.toString(),
			subtitle: "Configuration parameters",
			icon: getResourceIcon("volumesnapshotclasses"),
		},
	]

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Volume Snapshot Classes</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and configure volume snapshot class resources in your Kubernetes cluster
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
			<VolumeSnapshotClassesDataTable />
		</div>
	)
}

export function VolumeSnapshotClassesPageContainer() {
	return (
		<SharedProviders>
			<VolumeSnapshotClassesContent />
		</SharedProviders>
	)
} 
