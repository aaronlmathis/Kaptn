"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { StorageClassesDataTable } from "@/components/data_tables/StorageClassesDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function StorageClassesPageContainer() {
	const { data: summaryData, isLoading, error } = useResourceSummary('storageclasses')

	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Storage Classes</h1>
					<p className="text-muted-foreground">
						Manage and configure storage class resources in your Kubernetes cluster
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
			/>

			<StorageClassesDataTable />
		</SharedProviders>
	)
}
