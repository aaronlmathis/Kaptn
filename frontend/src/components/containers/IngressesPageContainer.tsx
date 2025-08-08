"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { IngressesDataTable } from "@/components/data_tables/IngressesDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function IngressesPageContainer() {
	const { data: summaryData, isLoading, error, lastUpdated } = useResourceSummary('ingresses')

	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Ingresses</h1>
					<p className="text-muted-foreground">
						Manage and monitor ingress resources in your Kubernetes cluster
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<IngressesDataTable />
		</SharedProviders>
	)
} 
