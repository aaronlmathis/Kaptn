"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { CronJobsDataTable } from "@/components/data_tables/CronJobsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useCronJobsWithWebSocket } from "@/hooks/useCronJobsWithWebSocket"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function CronJobsContent() {
	const { data: cronJobs, loading: isLoading, error, isConnected } = useCronJobsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when cronJobs change
	React.useEffect(() => {
		if (cronJobs.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [cronJobs])

	// Generate summary cards from cronjob data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!cronJobs || cronJobs.length === 0) {
			return [
				{
					title: "Total CronJobs",
					value: 0,
					subtitle: "No CronJobs found"
				},
				{
					title: "Active Jobs",
					value: 0,
					subtitle: "0 running"
				},
				{
					title: "Suspended",
					value: 0,
					subtitle: "0 suspended"
				},
				{
					title: "Health",
					value: "0%",
					subtitle: "No data"
				}
			]
		}

		const totalCronJobs = cronJobs.length

		// Calculate cronjob metrics
		const totalActiveJobs = cronJobs.reduce((sum, cj) => sum + cj.active, 0)
		const suspendedJobs = cronJobs.filter(cj => cj.suspend).length
		const runningJobs = cronJobs.filter(cj => !cj.suspend).length
		const activeCronJobs = cronJobs.filter(cj => cj.active > 0).length

		// Calculate health metrics
		const healthPercentage = totalCronJobs > 0 ? (runningJobs / totalCronJobs) * 100 : 0

		// Calculate activity percentage
		const activityPercentage = totalCronJobs > 0 ? (activeCronJobs / totalCronJobs) * 100 : 0

		return [
			{
				title: "Total CronJobs",
				value: totalCronJobs,
				subtitle: `${runningJobs}/${totalCronJobs} active`,
				badge: getReplicaStatusBadge(runningJobs, totalCronJobs),
				icon: getResourceIcon("cronjobs"),
				footer: totalCronJobs > 0 ? "All CronJob resources in cluster" : "No CronJobs found"
			},
			{
				title: "Active Jobs",
				value: totalActiveJobs,
				subtitle: `${activeCronJobs} CronJobs with active jobs`,
				badge: getHealthTrendBadge(activityPercentage),
				footer: totalActiveJobs > 0 ? "Currently running jobs" : "No active jobs"
			},
			{
				title: "Suspended",
				value: suspendedJobs,
				subtitle: `${suspendedJobs}/${totalCronJobs} suspended`,
				badge: suspendedJobs > 0 ? getUpdateStatusBadge(suspendedJobs, totalCronJobs) : getHealthTrendBadge(100),
				footer: suspendedJobs > 0 ? "CronJobs are paused" : "All CronJobs are active"
			},
			{
				title: "Health Status",
				value: `${Math.round(healthPercentage)}%`,
				subtitle: `${runningJobs} operational CronJobs`,
				badge: getReplicaStatusBadge(runningJobs, totalCronJobs),
				footer: healthPercentage > 80 ? "Good CronJob health" : "Some CronJobs suspended"
			}
		]
	}, [cronJobs])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">CronJobs</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor CronJob resources in your Kubernetes cluster
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

			<CronJobsDataTable />
		</div>
	)
}

export function CronJobsPageContainer() {
	return (
		<SharedProviders>
			<CronJobsContent />
		</SharedProviders>
	)
}
