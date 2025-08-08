"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { PersistentVolumesDataTable } from "@/components/data_tables/PersistentVolumesDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function PersistentVolumesPageContainer() {
	const { data: summaryData, isLoading, error, lastUpdated } = useResourceSummary('persistent-volumes')

	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Persistent Volumes</h1>
					<p className="text-muted-foreground">
						Manage and monitor persistent volumes in your Kubernetes cluster
					</p>
				</div>
			</div>
			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>
			<PersistentVolumesDataTable />
		</SharedProviders>
	)
}
