import * as React from "react"
import { KubernetesDashboard } from "@/components/kubernetes-dashboard"
import { SectionCards } from "@/components/section-cards"
import { SharedProviders } from "@/components/shared-providers"
import { RouteGuard } from "@/components/authz"

export function DashboardContainer() {
	return (
		<SharedProviders>
			<RouteGuard
				requiredCapabilities={['pods.list']}
				requireAll={false}
			>
				<SectionCards />
				<div className="px-4 lg:px-6 space-y-6">
					<div className="grid gap-6 md:grid-cols-2">
						{/* <ClusterCPUChart />
						<ClusterNetworkChart /> */}
					</div>
				</div>
				<KubernetesDashboard />
			</RouteGuard>
		</SharedProviders>
	)
}
