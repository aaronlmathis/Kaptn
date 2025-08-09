"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { StorageClassesContainer } from "@/components/containers/StorageClassesContainer"

export function StorageClassesPageContainer() {
	return (
		<SharedProviders>

			<StorageClassesContainer />

		</SharedProviders>
	)
}
