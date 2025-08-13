"use client"

import * as React from "react"
import { SharedProviders } from "@/components/shared-providers"
import { EventsDataTable } from "@/components/data_tables/EventsDataTable"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useEventsWithWebSocket } from "@/hooks/useEventsWithWebSocket"
import {
	getServiceStatusBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"

// Inner component that can access the namespace context
function EventsContent() {
	const { data: events, loading: isLoading, error, isConnected } = useEventsWithWebSocket(true)
	const [lastUpdated, setLastUpdated] = React.useState<string | null>(null)

	// Update lastUpdated when events change
	React.useEffect(() => {
		if (events.length > 0) {
			setLastUpdated(new Date().toISOString())
		}
	}, [events])

	// Generate summary cards from event data
	const summaryData: SummaryCard[] = React.useMemo(() => {
		if (!events || events.length === 0) {
			return [
				{
					title: "Total Events",
					value: 0,
					subtitle: "No events found"
				},
				{
					title: "Warning Events",
					value: 0,
					subtitle: "0 warning events"
				},
				{
					title: "Error Events",
					value: 0,
					subtitle: "0 error events"
				},
				{
					title: "Normal Events",
					value: 0,
					subtitle: "0 normal events"
				}
			]
		}

		const totalEvents = events.length
		const warningEvents = events.filter(e => e.level === 'Warning' || e.type === 'Warning').length
		const errorEvents = events.filter(e => e.level === 'Error' || e.type === 'Error').length
		const normalEvents = events.filter(e => e.level === 'Info' || e.type === 'Normal' || (!e.level && !e.type)).length

		// Helper function to get event level badge
		const getEventLevelBadge = (count: number, total: number, level: string) => {
			if (count === 0) return null
			const percentage = Math.round((count / total) * 100)
			switch (level) {
				case 'Warning':
					return <span className="text-orange-600">{percentage}%</span>
				case 'Error':
					return <span className="text-red-600">{percentage}%</span>
				default:
					return <span className="text-blue-600">{percentage}%</span>
			}
		}

		return [
			{
				title: "Total Events",
				value: totalEvents,
				subtitle: `${events.length} events across all types`,
				badge: getServiceStatusBadge(totalEvents),
				icon: getResourceIcon("services"), // Using services icon as placeholder for events
				footer: totalEvents > 0 ? "All event resources in cluster" : "No events found"
			},
			{
				title: "Warning Events",
				value: warningEvents,
				subtitle: `${warningEvents} warning level events`,
				badge: getEventLevelBadge(warningEvents, totalEvents, "Warning"),
				footer: warningEvents > 0 ? "Potential issues requiring attention" : "No warning events"
			},
			{
				title: "Error Events",
				value: errorEvents,
				subtitle: `${errorEvents} error level events`,
				badge: getEventLevelBadge(errorEvents, totalEvents, "Error"),
				footer: errorEvents > 0 ? "Critical issues requiring immediate attention" : "No error events"
			},
			{
				title: "Normal Events",
				value: normalEvents,
				subtitle: `${normalEvents} normal level events`,
				badge: getEventLevelBadge(normalEvents, totalEvents, "Normal"),
				footer: normalEvents > 0 ? "Standard operational events" : "No normal events"
			}
		]
	}, [events])

	return (
		<div className="space-y-6">
			{/* Header with connection status */}
			<div className="px-4 lg:px-6">
				<div className="flex items-center justify-between">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">Events</h1>
							{isConnected && (
								<div className="flex items-center gap-1.5 text-xs text-green-600">
									<div className="size-2 bg-green-500 rounded-full animate-pulse" />
									Live
								</div>
							)}
						</div>
						<p className="text-muted-foreground">
							Monitor and track event resources in your Kubernetes cluster
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

			<EventsDataTable />
		</div>
	)
}

export function EventsPageContainer() {
	return (
		<SharedProviders>
			<EventsContent />
		</SharedProviders>
	)
}
