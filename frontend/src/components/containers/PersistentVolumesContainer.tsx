"use client"

import * as React from "react"
import { PersistentVolumesDataTable } from "@/components/data_tables/PersistentVolumesDataTable"
import { SummaryCards } from "@/components/SummaryCards"
export function PersistentVolumesContainer() {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Persistent Volumes</h1>
					<p className="text-muted-foreground">
						Manage persistent volumes in your cluster
					</p>
				</div>
			</div>
			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>
			<PersistentVolumesDataTable />
		</div>
	)
}
