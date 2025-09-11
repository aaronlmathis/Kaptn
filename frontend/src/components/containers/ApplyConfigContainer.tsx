"use client"

import * as React from "react"
import { CodeEditor } from "@/components/CodeEditor"

// Inner component that can access the context
function ApplyContent() {
	return (
		<div className="px-4 lg:px-6">
			<div className="space-y-3">


				<CodeEditor />
			</div>
		</div>
	)
}

export function ApplyConfigContainer() {
	return (
		/* Temporarily disabled RouteGuard for testing */
		<ApplyContent />
	)
}
