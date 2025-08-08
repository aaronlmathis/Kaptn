"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { NetworkPoliciesDataTable } from "@/components/data_tables/NetworkPoliciesDataTable"
import { SummaryCards } from "@/components/SummaryCards"
import { useResourceSummary } from "@/hooks/useResourceSummary"

export function NetworkPoliciesPageContainer() {
	const { data: summaryData, isLoading, error } = useResourceSummary('networkpolicies')

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

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
			/>

			<NetworkPoliciesDataTable />
		</SharedProviders>
	)
}
