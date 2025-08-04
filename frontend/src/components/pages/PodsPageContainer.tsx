"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { PodsDataTable } from "@/components/pages/PodsDataTable"

export function PodsPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Pods</h1>
					<p className="text-muted-foreground">
						Manage and monitor pod resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<PodsDataTable />
		</SharedProviders>
	)
}
