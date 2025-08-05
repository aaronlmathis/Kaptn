"use client"

import * as React from "react"
import { PersistentVolumesDataTable } from "@/components/pages/PersistentVolumesDataTable"

export function PersistentVolumesContainer() {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Persistent Volumes</h1>
					<p className="text-muted-foreground">
						Manage persistent volumes in your cluster
					</p>
				</div>
			</div>
			<PersistentVolumesDataTable />
		</div>
	)
}
