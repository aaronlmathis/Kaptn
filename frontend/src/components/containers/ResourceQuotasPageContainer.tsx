"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { ResourceQuotasDataTable } from "@/components/data_tables/ResourceQuotasDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function ResourceQuotasPageContainer() {
	const { data: summaryData, isLoading, error, lastUpdated } = useResourceSummary('resourcequotas')
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Resource Quotas</h1>
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
		</SharedProviders>
	)
}
