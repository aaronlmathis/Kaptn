"use client"

import * as React from "react"
import { StorageClassesDataTable } from "@/components/data_tables/StorageClassesDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useStorageClassesWithWebSocket } from "@/hooks/useStorageClassesWithWebSocket"
import {
	getStorageClassStatusBadge,
	getStorageClassProvisionerBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"

export function StorageClassesContainer() {
	const { data: storageClasses, loading: isLoading, error, isConnected } = useStorageClassesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when storage classes change
	React.useEffect(() => {
		if (storageClasses.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [storageClasses])

	// Generate summary cards from storage class data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!storageClasses || storageClasses.length === 0) {
			return [
				{
					title: "Total Storage Classes",
					value: 0,
					subtitle: "No storage classes found"
				}
			]
		}

		const totalSCs = storageClasses.length
		const defaultSCs = storageClasses.filter(sc => sc.isDefault).length
		const allowExpansionSCs = storageClasses.filter(sc => sc.allowVolumeExpansion).length
		const uniqueProvisioners = new Set(storageClasses.map(sc => sc.provisioner)).size

		return [
			{
				title: "Total Storage Classes",
				value: totalSCs,
				subtitle: `${totalSCs} storage options`,
				badge: getStorageClassStatusBadge(totalSCs, defaultSCs),
				icon: getResourceIcon("storageclasses"),
				footer: totalSCs > 0 ? "All storage classes in cluster" : "No storage classes found"
			},
			{
				title: "Default Classes",
				value: defaultSCs,
				subtitle: "Auto-selection enabled",
				footer: defaultSCs === 1 ? "Properly configured" : defaultSCs === 0 ? "No default set" : "Multiple defaults found"
			},
			{
				title: "Expansion Enabled",
				value: allowExpansionSCs,
				subtitle: "Volume growth allowed",
				footer: allowExpansionSCs > 0 ? "Storage can be expanded" : "No expandable storage"
			},
			{
				title: "Unique Provisioners",
				value: uniqueProvisioners,
				subtitle: "Storage backends",
				badge: getStorageClassProvisionerBadge(uniqueProvisioners),
				footer: uniqueProvisioners > 1 ? "Diverse storage options" : "Single storage backend"
			}
		]
	}, [storageClasses])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Storage Classes</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor storage class resources in your Kubernetes cluster
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
			<StorageClassesDataTable />
		</div>
	)
}
