"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { PersistentVolumeClaimsDataTable } from "@/components/data_tables/PersistentVolumeClaimsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { usePersistentVolumeClaimsWithWebSocket } from "@/hooks/usePersistentVolumeClaimsWithWebSocket"
import {
	getPersistentVolumeClaimStatusBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"

function PersistentVolumeClaimsContent() {
	const { data: persistentVolumeClaims, loading: isLoading, error, isConnected } = usePersistentVolumeClaimsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when persistent volume claims change
	React.useEffect(() => {
		if (persistentVolumeClaims.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [persistentVolumeClaims])

	// Generate summary cards from persistent volume claim data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!persistentVolumeClaims || persistentVolumeClaims.length === 0) {
			return [
				{
					title: "Total Persistent Volume Claims",
					value: 0,
					subtitle: "No persistent volume claims found"
				}
			]
		}

		const totalPVCs = persistentVolumeClaims.length
		const boundPVCs = persistentVolumeClaims.filter(pvc => pvc.status.toLowerCase() === 'bound').length
		const pendingPVCs = persistentVolumeClaims.filter(pvc => pvc.status.toLowerCase() === 'pending').length
		const lostPVCs = persistentVolumeClaims.filter(pvc => pvc.status.toLowerCase() === 'lost').length
		const availablePVCs = persistentVolumeClaims.filter(pvc => pvc.status.toLowerCase() === 'available').length

		return [
			{
				title: "Total Persistent Volume Claims",
				value: totalPVCs,
				subtitle: `${totalPVCs} volume claims`,
				badge: getPersistentVolumeClaimStatusBadge(boundPVCs, pendingPVCs, lostPVCs, totalPVCs),
				icon: getResourceIcon("persistentvolumeclaims"),
				footer: totalPVCs > 0 ? "All volume claims in cluster" : "No volume claims found"
			},
			{
				title: "Bound",
				value: boundPVCs,
				subtitle: "Claims bound to volumes",
				footer: boundPVCs > 0 ? "Claims actively in use" : "No bound claims"
			},
			{
				title: "Pending",
				value: pendingPVCs,
				subtitle: "Awaiting volume binding",
				footer: pendingPVCs > 0 ? "Claims waiting for volumes" : "No pending claims"
			},
			{
				title: "Available/Lost",
				value: availablePVCs + lostPVCs,
				subtitle: "Needs attention",
				footer: (availablePVCs + lostPVCs) > 0 ? "Claims needing review" : "All claims healthy"
			}
		]
	}, [persistentVolumeClaims])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Persistent Volume Claims</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor persistent volume claim resources in your Kubernetes cluster
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
			<PersistentVolumeClaimsDataTable />
		</div>
	)
}

export function PersistentVolumeClaimsPageContainer() {
	return (
		<SharedProviders>
			<PersistentVolumeClaimsContent />
		</SharedProviders>
	)
}
