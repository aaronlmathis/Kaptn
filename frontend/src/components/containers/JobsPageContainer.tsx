"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { JobsDataTable } from "@/components/data_tables/JobsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useJobsWithWebSocket } from "@/hooks/useJobsWithWebSocket"
import {
	getReplicaStatusBadge,
	getUpdateStatusBadge,
	getResourceIcon,
	getHealthTrendBadge
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function JobsContent() {
	const { data: jobs, loading: isLoading, error, isConnected } = useJobsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when jobs change
	React.useEffect(() => {
		if (jobs.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [jobs])

	// Generate summary cards from jobs data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!jobs || jobs.length === 0) {
			return [
				{
					title: "Total Jobs",
					value: 0,
					subtitle: "No jobs found"
				},
				{
					title: "Complete",
					value: 0,
					subtitle: "0/0 complete"
				},
				{
					title: "Running",
					value: 0,
					subtitle: "0 running"
				},
				{
					title: "Failed",
					value: 0,
					subtitle: "0 failed"
				}
			]
		}

		const totalJobs = jobs.length

		// Calculate job statuses
		const completeJobs = jobs.filter(job => job.status === "Complete").length
		const runningJobs = jobs.filter(job => job.status === "Running").length
		const failedJobs = jobs.filter(job => job.status === "Failed").length

		return [
			{
				title: "Total Jobs",
				value: totalJobs,
				subtitle: `${completeJobs} complete, ${runningJobs} running`,
				badge: getReplicaStatusBadge(completeJobs, totalJobs),
				icon: getResourceIcon("jobs"),
				footer: totalJobs > 0 ? "All job resources in cluster" : "No jobs found"
			},
			{
				title: "Complete",
				value: completeJobs,
				subtitle: `${completeJobs}/${totalJobs} jobs completed`,
				badge: getUpdateStatusBadge(completeJobs, totalJobs),
				footer: completeJobs > 0 ? "Successfully finished jobs" : "No completed jobs"
			},
			{
				title: "Running",
				value: runningJobs,
				subtitle: `${runningJobs} jobs running`,
				badge: runningJobs > 0 ? getHealthTrendBadge(100) : getHealthTrendBadge(0),
				footer: runningJobs > 0 ? "Currently executing jobs" : "No running jobs"
			},
			{
				title: "Failed",
				value: failedJobs,
				subtitle: failedJobs > 0 ? `${failedJobs} jobs failed` : "No failures",
				badge: getReplicaStatusBadge(totalJobs - failedJobs, totalJobs),
				footer: failedJobs > 0 ? "Jobs that encountered errors" : "All jobs healthy"
			}
		]
	}, [jobs])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Manage and monitor job resources in your Kubernetes cluster
						</p>
					</div>
					{lastUpdated && (
						<div className="text-sm text-muted-foreground">
							Last updated: {new Date(lastUpdated).toLocaleTimeString()}
						</div>
					)}
				</div>
			</div>

			{/* Summary Cards */}
			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
			/>

			<JobsDataTable />
		</div>
	)
}

export function JobsPageContainer() {
	return (
		<SharedProviders>
			<JobsContent />
		</SharedProviders>
	)
}
