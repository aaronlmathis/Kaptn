"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { StatefulSetsDataTable } from "@/components/pages/StatefulSetsDataTable"

export function StatefulSetsPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">StatefulSets</h1>
					<p className="text-muted-foreground">
						Manage and monitor StatefulSet resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<StatefulSetsDataTable />
		</SharedProviders>
	)
}
