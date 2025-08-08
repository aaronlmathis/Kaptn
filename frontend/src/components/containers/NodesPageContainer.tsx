"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { NodesDataTable } from "@/components/data_tables/NodesDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function NodesPageContainer() {
	const { data: summaryData, isLoading, error } = useResourceSummary('nodes')

	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Nodes</h1>
					<p className="text-muted-foreground">
						Manage and monitor cluster nodes
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
			/>

			<NodesDataTable />
		</SharedProviders>
	)
}
