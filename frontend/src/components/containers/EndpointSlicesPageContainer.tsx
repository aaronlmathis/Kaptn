"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { EndpointSlicesDataTable } from "@/components/data_tables/EndpointSlicesDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function EndpointSlicesPageContainer() {
	const { data: summaryData, isLoading, error } = useResourceSummary('endpointslices')

	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Endpoint Slices</h1>
					<p className="text-muted-foreground">
						Manage and monitor endpoint slice resources in your Kubernetes cluster
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
			/>

			<EndpointSlicesDataTable />
		</SharedProviders>
	)
}
