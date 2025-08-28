"use client"

import * as React from "react"
import { ApiResourcesDataTable } from "@/components/data_tables/ApiResourcesDataTable"
import { RouteGuard } from "@/components/authz"
export function ApiResourcesPageContainer() {
	return (
		<RouteGuard
			requiredCapabilities={['.list']}
			requireAll={false}
		>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">API Resources</h1>
					<p className="text-muted-foreground">
						View available Kubernetes API resources and their details
					</p>
				</div>
			</div>
			<ApiResourcesDataTable />
		</RouteGuard>
	)
}
