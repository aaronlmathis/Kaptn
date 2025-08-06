"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { NodesDataTable } from "@/components/pages/NodesDataTable"

export function NodesPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Nodes</h1>
					<p className="text-muted-foreground">
						Manage and monitor cluster nodes
					</p>
				</div>
			</div>
			<NodesDataTable />
		</SharedProviders>
	)
}
