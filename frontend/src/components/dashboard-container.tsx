import * as React from "react"
import { KubernetesDashboard } from "@/components/kubernetes-dashboard"
import { SectionCards } from "@/components/section-cards"
import { SharedProviders } from "@/components/shared-providers"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"

export function DashboardContainer() {
	return (
		<SharedProviders>
			<SectionCards />
			<div className="px-4 lg:px-6">
				<ChartAreaInteractive />
			</div>
			<KubernetesDashboard />
		</SharedProviders>
	)
}
