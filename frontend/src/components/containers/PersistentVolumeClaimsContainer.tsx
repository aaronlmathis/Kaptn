"use client"

import * as React from "react"
import { PersistentVolumeClaimsDataTable } from "@/components/data_tables/PersistentVolumeClaimsDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function PersistentVolumeClaimsContainer() {
	const { data: summaryData, isLoading, error, lastUpdated } = useResourceSummary('persistent-volume-claims')

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Persistent Volume Claims</h1>
					<p className="text-muted-foreground">
						Manage persistent volume claims in your namespace
					</p>
				</div>
			</div>
			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>
			<PersistentVolumeClaimsDataTable />
		</div>
	)
}
