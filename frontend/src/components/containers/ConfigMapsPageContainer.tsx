"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { ConfigMapsDataTable } from "@/components/data_tables/ConfigMapsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useConfigMapsWithWebSocket } from "@/hooks/useConfigMapsWithWebSocket"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function ConfigMapsContent() {
	const { data: configMaps, loading: isLoading, error, isConnected } = useConfigMapsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when configMaps change
	React.useEffect(() => {
		if (configMaps.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [configMaps])

	// Generate summary cards from configMap data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!configMaps || configMaps.length === 0) {
			return [
				{
					title: "Total ConfigMaps",
					value: 0,
					subtitle: "No configmaps found"
				},
				{
					title: "Data Keys",
					value: 0,
					subtitle: "0 data keys"
				},
				{
					title: "Data Size",
					value: "0 B",
					subtitle: "0 bytes total"
				},
				{
					title: "Labels",
					value: 0,
					subtitle: "0 labels total"
				}
			]
		}

		const totalConfigMaps = configMaps.length

		// Calculate ConfigMap-specific metrics
		const totalDataKeys = configMaps.reduce((sum, cm) => sum + cm.dataKeysCount, 0)
		const totalDataSizeBytes = configMaps.reduce((sum, cm) => sum + cm.dataSizeBytes, 0)
		const totalLabels = configMaps.reduce((sum, cm) => sum + cm.labelsCount, 0)

		// Format total data size
		let totalDataSizeStr = "0 B"
		if (totalDataSizeBytes > 0) {
			if (totalDataSizeBytes < 1024) {
				totalDataSizeStr = `${totalDataSizeBytes} B`
			} else if (totalDataSizeBytes < 1024 * 1024) {
				totalDataSizeStr = `${(totalDataSizeBytes / 1024).toFixed(1)} KB`
			} else {
				totalDataSizeStr = `${(totalDataSizeBytes / (1024 * 1024)).toFixed(1)} MB`
			}
		}

		// Calculate percentage metrics for badges
		const configMapsWithData = configMaps.filter(cm => cm.dataKeysCount > 0).length

		return [
			{
				title: "Total ConfigMaps",
				value: totalConfigMaps,
				subtitle: `${configMapsWithData}/${totalConfigMaps} with data`,
				badge: getReplicaStatusBadge(configMapsWithData, totalConfigMaps),
				icon: getResourceIcon("configmaps"),
				footer: totalConfigMaps > 0 ? "All ConfigMap resources in cluster" : "No ConfigMaps found"
			},
			{
				title: "Data Keys",
				value: totalDataKeys,
				subtitle: `${totalDataKeys} data keys total`,
				badge: getHealthTrendBadge(totalDataKeys > 0 ? 100 : 0),
				footer: totalDataKeys > 0 ? "Configuration data entries" : "No data keys"
			},
			{
				title: "Data Size",
				value: totalDataSizeStr,
				subtitle: `${totalDataSizeBytes} bytes`,
				badge: getUpdateStatusBadge(totalDataSizeBytes, Math.max(totalDataSizeBytes, 1)),
				footer: totalDataSizeBytes > 0 ? "Total configuration data size" : "No data stored"
			},
			{
				title: "Labels",
				value: totalLabels,
				subtitle: `${totalLabels} labels total`,
				badge: getHealthTrendBadge(totalLabels > 0 ? 100 : 0),
				footer: totalLabels > 0 ? "Metadata labels across all ConfigMaps" : "No labels"
			}
		]
	}, [configMaps])

	return (
		<>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h1 className="text-2xl font-bold tracking-tight">ConfigMaps</h1>
						{isConnected && (
							<div className="flex items-center space-x-1 text-xs text-green-600">
								<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
								<span>Real-time updates enabled</span>
							</div>
						)}
					</div>
					<p className="text-muted-foreground">
						Manage and monitor ConfigMap resources in your Kubernetes cluster
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<ConfigMapsDataTable />
		</>
	)
}

export function ConfigMapsPageContainer() {
	return (
		<SharedProviders>
			<ConfigMapsContent />
		</SharedProviders>
	)
}
