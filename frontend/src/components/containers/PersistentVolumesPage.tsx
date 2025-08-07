"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { PersistentVolumesDataTable } from "@/components/data_tables/PersistentVolumesDataTable"

export function PersistentVolumesPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Persistent Volumes</h1>
					<p className="text-muted-foreground">
						Manage and monitor persistent volumes in your Kubernetes cluster
					</p>
				</div>
			</div>
			<PersistentVolumesDataTable />
		</SharedProviders>
	)
}
