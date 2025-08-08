"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { ConfigMapsDataTable } from "@/components/data_tables/ConfigMapsDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function ConfigMapsPageContainer() {
	const { data: summaryData, isLoading, error, lastUpdated } = useResourceSummary('configmaps')

	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">ConfigMaps</h1>
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
		</SharedProviders>
	)
}
