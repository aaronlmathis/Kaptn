"use client"

import * as React from "react"
import { StorageClassesContainer } from "@/components/containers/StorageClassesContainer"
import { RouteGuard } from "@/components/authz"

export function StorageClassesPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["storageclasses.list"]} requireAll={false}>
			<StorageClassesContainer />
		</RouteGuard>
	)
}
