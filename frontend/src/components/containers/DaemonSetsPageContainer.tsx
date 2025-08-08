"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { DaemonSetsDataTable } from "@/components/data_tables/DaemonSetsDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function DaemonSetsPageContainer() {
	const { data: summaryData, isLoading, error } = useResourceSummary('daemonsets')

	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">DaemonSets</h1>
					<p className="text-muted-foreground">
						Manage and monitor daemonset resources in your Kubernetes cluster
					</p>
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
			/>

			<DaemonSetsDataTable />
		</SharedProviders>
	)
}
