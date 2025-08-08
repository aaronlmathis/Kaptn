"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { NamespacesDataTable } from "@/components/data_tables/NamespacesDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"
export function NamespacesPageContainer() {
	const { data: summaryData, isLoading, error, lastUpdated } = useResourceSummary('namespaces')
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Namespaces</h1>
					<p className="text-muted-foreground">
						Manage and monitor namespace resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>
			<NamespacesDataTable />
		</SharedProviders>
	)
}
