"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { VolumeSnapshotClassesDataTable } from "@/components/pages/VolumeSnapshotClassesDataTable"

export function VolumeSnapshotClassesPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Volume Snapshot Classes</h1>
					<p className="text-muted-foreground">
						Manage and configure volume snapshot class resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<VolumeSnapshotClassesDataTable />
		</SharedProviders>
	)
}
