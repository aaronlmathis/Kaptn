"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { NetworkPoliciesDataTable } from "@/components/data_tables/NetworkPoliciesDataTable"

export function NetworkPoliciesPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Network Policies</h1>
					<p className="text-muted-foreground">
						Manage network policies that control traffic flow between pods in your Kubernetes cluster
					</p>
				</div>
			</div>
			<NetworkPoliciesDataTable />
		</SharedProviders>
	)
}
