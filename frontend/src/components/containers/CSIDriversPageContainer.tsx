"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { CSIDriversDataTable } from "@/components/data_tables/CSIDriversDataTable"

export function CSIDriversPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">CSI Drivers</h1>
					<p className="text-muted-foreground">
						Manage and configure CSI driver resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<CSIDriversDataTable />
		</SharedProviders>
	)
}
