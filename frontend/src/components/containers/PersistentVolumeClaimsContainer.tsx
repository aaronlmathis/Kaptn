"use client"

import * as React from "react"
import { PersistentVolumeClaimsDataTable } from "@/components/data_tables/PersistentVolumeClaimsDataTable"

export function PersistentVolumeClaimsContainer() {
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
			<PersistentVolumeClaimsDataTable />
		</div>
	)
}
