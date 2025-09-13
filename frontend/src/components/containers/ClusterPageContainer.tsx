"use client"

import * as React from "react"
import { RouteGuard } from "@/components/authz"
import { useNavigation } from "@/contexts/navigation-context"
import ClusterDashboard from "@/components/dashboards/ClusterDashboard"
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

			<ClusterDashboard />
			{/* Content area - placeholder for future cluster-related components */}

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
