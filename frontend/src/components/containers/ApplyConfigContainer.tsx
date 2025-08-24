"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { CodeEditor } from "@/components/CodeEditor"

// Inner component that can access the context
function ApplyContent() {
	return (
		<div className="px-4 lg:px-6">
			<div className="space-y-2">
				<h1 className="text-2xl font-bold tracking-tight">Apply Configuration</h1>
				<p className="text-muted-foreground">
					Apply or update configurations for your kubernetes resources.
				</p>

				<CodeEditor />
			</div>
		</div>
	)
}

export function ApplyConfigContainer() {
	return (
		<SharedProviders>
			{/* Temporarily disabled RouteGuard for testing */}
			<ApplyContent />
		</SharedProviders>
	)
}
