"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { LoadBalancersDataTable } from "@/components/pages/LoadBalancersDataTable"

export function LoadBalancersPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Load Balancers</h1>
					<p className="text-muted-foreground">
						Manage and monitor LoadBalancer service resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<LoadBalancersDataTable />
		</SharedProviders>
	)
}
