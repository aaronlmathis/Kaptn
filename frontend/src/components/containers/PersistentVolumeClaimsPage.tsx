"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { PersistentVolumeClaimsDataTable } from "@/components/data_tables/PersistentVolumeClaimsDataTable"

export function PersistentVolumeClaimsPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Persistent Volume Claims</h1>
					<p className="text-muted-foreground">
						Manage and monitor persistent volume claims in your Kubernetes cluster
					</p>
				</div>
			</div>
			<PersistentVolumeClaimsDataTable />
		</SharedProviders>
	)
}
