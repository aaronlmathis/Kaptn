"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { JobsDataTable } from "@/components/data_tables/JobsDataTable"

export function JobsPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
					<p className="text-muted-foreground">
						Manage and monitor job resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<JobsDataTable />
		</SharedProviders>
	)
}
