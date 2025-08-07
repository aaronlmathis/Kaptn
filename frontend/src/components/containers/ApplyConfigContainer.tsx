"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { CodeEditor } from "@/components/CodeEditor"
export function ApplyConfigContainer() {
	return (
		<SharedProviders>
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Apply Configuration</h1>
					<p className="text-muted-foreground">
						Apply or update configurations for your kubernetes resources.
					</p>

					<CodeEditor />
				</div>
			</div>

		</SharedProviders>
	)
}
