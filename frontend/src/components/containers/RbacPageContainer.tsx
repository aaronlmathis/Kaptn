"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { RBACBuilder } from "@/components/rbac/RBACBuilder"


function RBACContent() {
	return (
		<div className="space-y-6">
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Role-Based Access Control</h1>
						</div>
						<p className="text-muted-foreground">
							Create and manage role-based access control for identities and service accounts within your Kubernetes cluster.
						</p>
					</div>
				</div>
			</div>

			<RBACBuilder />
		</div>
	)
}

export function RBACPageContainer() {
	return (
		<SharedProviders>
			<RBACContent />
		</SharedProviders>
	)
}
