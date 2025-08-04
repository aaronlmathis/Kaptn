"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { EndpointsDataTable } from "./EndpointsDataTable"

export function EndpointsPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Endpoints</h1>
					<p className="text-muted-foreground">
						Manage and monitor endpoint resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<EndpointsDataTable />
		</SharedProviders>
	)
}
