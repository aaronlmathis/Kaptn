"use client"

import * as React from "react"
import { RouteGuard } from "@/components/authz"
import { useNavigation } from "@/contexts/navigation-context"

// Inner component that handles the actual cluster page content
function ClusterContent() {
	const { setPageTitle, isHydrated } = useNavigation()

	// Set page title only after hydration to prevent SSR mismatch
	React.useEffect(() => {
		if (isHydrated) {
			setPageTitle("Cluster Overview")
		}
	}, [setPageTitle, isHydrated])

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="px-4 lg:px-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight">Cluster Overview</h1>
					<p className="text-muted-foreground">
						Manage and monitor your Kubernetes cluster resources
					</p>
				</div>
			</div>

			{/* Content area - placeholder for future cluster-related components */}
			<div className="px-4 lg:px-6">
				<div className="rounded-lg border border-dashed border-muted-foreground/25 p-8 text-center">
					<h3 className="text-lg font-medium">Cluster Management</h3>
					<p className="text-muted-foreground mt-2">
						This page will contain cluster-wide resources and management tools.
					</p>
				</div>
			</div>
		</div>
	)
}

export function ClusterPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["pods.list"]} requireAll={false}>
			<ClusterContent />
		</RouteGuard>
	)
}
