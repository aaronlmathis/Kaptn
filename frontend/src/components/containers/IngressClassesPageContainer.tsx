"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { IngressClassesDataTable } from "@/components/data_tables/IngressClassesDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useIngressClassesWithWebSocket } from "@/hooks/useIngressClassesWithWebSocket"
import {
	getResourceIcon,
	getReplicaStatusBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function IngressClassesContent() {
	const { data: ingressClasses, loading: isLoading, error, isConnected } = useIngressClassesWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Debug logging
	React.useEffect(() => {
		console.log('🏷️  IngressClassesContent state:', {
			ingressClasses,
			isLoading,
			error,
			isConnected,
			length: ingressClasses?.length
		});
	}, [ingressClasses, isLoading, error, isConnected]);

	// Update lastUpdated when ingress classes change
	React.useEffect(() => {
		if (ingressClasses.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [ingressClasses])

	// Generate summary cards from ingress class data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!ingressClasses || ingressClasses.length === 0) {
			return [
				{
					title: "Total Classes",
					value: 0,
					subtitle: "No ingress classes found"
				},
				{
					title: "In Use",
					value: 0,
					subtitle: "No classes in use"
				},
				{
					title: "Default Class",
					value: "None",
					subtitle: "No default class set"
				},
				{
					title: "Created Last 24h",
					value: 0,
					subtitle: "No recent classes"
				}
			]
		}

		const totalClasses = ingressClasses.length

		// Calculate ingress class-specific metrics
		const defaultClasses = ingressClasses.filter(ic => ic.isDefault)
		const hasDefaultClass = defaultClasses.length > 0
		const defaultClassName = hasDefaultClass ? defaultClasses[0].name : "None"

		// Count classes created in the last 24 hours
		const recentClasses = ingressClasses.filter(ic => {
			// This would need age parsing, for now we'll estimate based on age string
			return ic.age.includes('m') || ic.age.includes('h') || (ic.age.includes('d') && parseInt(ic.age) === 1)
		}).length

		// Note: "In Use" count would need additional data from ingresses to show actual usage
		// For now, we'll show total classes as a placeholder
		const inUseCount = totalClasses // This should be calculated from actual ingress usage

		return [
			{
				title: "Total Classes",
				value: totalClasses,
				subtitle: `${totalClasses} ingress class${totalClasses !== 1 ? 'es' : ''}`,
				badge: getReplicaStatusBadge(totalClasses, totalClasses),
				icon: getResourceIcon("ingressclasses"),
				footer: totalClasses > 0 ? "All ingress class instances in cluster" : "No ingress classes found"
			},
			{
				title: "In Use",
				value: inUseCount,
				subtitle: `${inUseCount} class${inUseCount !== 1 ? 'es' : ''} with ingresses`,
				icon: getResourceIcon("ingresses"),
				footer: inUseCount > 0 ? "Classes referenced by ingresses" : "No classes currently in use"
			},
			{
				title: "Default Class",
				value: hasDefaultClass ? "Set" : "None",
				subtitle: hasDefaultClass ? defaultClassName : "No default class configured",
				badge: hasDefaultClass ? getReplicaStatusBadge(1, 1) : undefined,
				icon: getResourceIcon("configmaps"),
				footer: hasDefaultClass ? "Default class for new ingresses" : "Configure a default class"
			},
			{
				title: "Created Last 24h",
				value: recentClasses,
				subtitle: `${recentClasses} class${recentClasses !== 1 ? 'es' : ''} created recently`,
				icon: getResourceIcon("services"),
				footer: recentClasses > 0 ? "Recently created classes" : "No recent activity"
			}
		]
	}, [ingressClasses])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Ingress Classes</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor IngressClass resources in your Kubernetes cluster
						</p>
					</div>
					{lastUpdated && (
						<div className="text-sm text-muted-foreground">
							Last updated: {new Date(lastUpdated).toLocaleTimeString()}
						</div>
					)}
				</div>
			</div>

			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<IngressClassesDataTable />
		</div>
	)
}

export function IngressClassesPageContainer() {
	return (
		<SharedProviders>
			<IngressClassesContent />
		</SharedProviders>
	)
}
