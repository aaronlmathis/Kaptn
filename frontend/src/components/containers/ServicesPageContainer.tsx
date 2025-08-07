"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { ServicesDataTable } from "@/components/data_tables/ServicesDataTable"

export function ServicesPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Services</h1>
					<p className="text-muted-foreground">
						Manage and monitor service resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<ServicesDataTable />
		</SharedProviders>
	)
}
