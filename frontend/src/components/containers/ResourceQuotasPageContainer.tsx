"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { ResourceQuotasDataTable } from "@/components/data_tables/ResourceQuotasDataTable"

export function ResourceQuotasPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Resource Quotas</h1>
					<p className="text-muted-foreground">
						Manage and monitor resource quota limits in your Kubernetes cluster
					</p>
				</div>
			</div>
			<ResourceQuotasDataTable />
		</SharedProviders>
	)
}
