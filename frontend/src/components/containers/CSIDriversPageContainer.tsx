"use client"

import * as React from "react"
import { CSIDriversDataTable } from "@/components/data_tables/CSIDriversDataTable"
import { useCapabilities } from "@/hooks/use-capabilities"

export function CSIDriversPageContainer() {
	const { fetchAdditional } = useCapabilities()

	React.useEffect(() => {
		// Request CSI-related capabilities on demand (cluster-scoped)
		fetchAdditional(['csidrivers.*']).catch(() => { /* noop */ })
		// Run once on mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return (
		<>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">CSI Drivers</h1>
					<p className="text-muted-foreground">
						Manage and configure CSI driver resources in your Kubernetes cluster
					</p>
				</div>
			</div>
			<CSIDriversDataTable />
		</>
	)
}
