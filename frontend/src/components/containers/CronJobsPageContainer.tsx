"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { CronJobsDataTable } from "@/components/data_tables/CronJobsDataTable"

export function CronJobsPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">CronJobs</h1>
					<p className="text-muted-foreground">
						Manage and monitor CronJob resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<CronJobsDataTable />
		</SharedProviders>
	)
}
