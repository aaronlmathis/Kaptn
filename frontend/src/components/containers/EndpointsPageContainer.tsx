"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { EndpointsDataTable } from "@/components/data_tables/EndpointsDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function EndpointsPageContainer() {
	const { data: summaryData, isLoading, error } = useResourceSummary('endpoints')

	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Endpoints</h1>
					<p className="text-muted-foreground">
						Manage and monitor endpoint resources in your Kubernetes cluster
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
			/>

			<EndpointsDataTable />
		</SharedProviders>
	)
}
