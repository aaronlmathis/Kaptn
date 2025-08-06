"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { VolumeSnapshotsDataTable } from "@/components/pages/VolumeSnapshotsDataTable"

export function VolumeSnapshotsPageContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Volume Snapshots</h1>
					<p className="text-muted-foreground">
						Manage and monitor volume snapshot resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<VolumeSnapshotsDataTable />
		</SharedProviders>
	)
}
