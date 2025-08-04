"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { DeploymentsDataTable } from "@/components/pages/DeploymentsDataTable"

export function DeploymentsPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Deployments</h1>
					<p className="text-muted-foreground">
						Manage and monitor deployment resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<DeploymentsDataTable />
		</SharedProviders>
	)
}
