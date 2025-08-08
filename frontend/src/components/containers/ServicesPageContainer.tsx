"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { ServicesDataTable } from "@/components/data_tables/ServicesDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function ServicesPageContainer() {
	const { data: summaryData, isLoading, error } = useResourceSummary('services')

	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Services</h1>
					<p className="text-muted-foreground">
						Manage and monitor service resources in your Kubernetes cluster
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
			/>

			<ServicesDataTable />
		</SharedProviders>
	)
}
