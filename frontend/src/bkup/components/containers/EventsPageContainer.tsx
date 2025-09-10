"use client"

import * as React from "react"
import { UniversalDataTable } from "@/components/data_tables/UniversalDataTable"
import { DataTableFilters, type FilterOption } from "@/components/ui/data-table-filters"
import { SummaryCards, type SummaryCard } from "@/components/SummaryCards"
import { useEventsWithWebSocket } from "@/hooks/useEventsWithWebSocket"
import {
	getServiceStatusBadge,
	getResourceIcon
} from "@/lib/summary-card-utils"
import { RouteGuard } from "@/components/authz"
import { IfAllowed } from "@/components/authz/IfAllowed"
import { useCapabilities } from "@/hooks/use-capabilities"
import { useCluster } from "@/hooks/useCluster"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	IconDotsVertical,
	IconEye,
	IconCopy,
	IconAlertTriangle,
	IconInfoCircle,
	IconAlertCircle,
} from "@tabler/icons-react"
import { type ColumnDef } from "@/lib/table"
import { EventDetailDrawer } from "@/components/viewers/EventDetailDrawer"
import type { EventTableRow } from "@/lib/k8s-events"
import { LiveDataStatusBadge } from "@/components/badges/LiveDataStatus"

// Inner component that can access the namespace context
function EventsContent() {
	const { data: events, loading: isLoading, error, isConnected } = useEventsWithWebSocket(true)
	const { fetchAdditional } = useCapabilities()
	const { clusterId } = useCluster()
	const [selectedEventForDetails, setSelectedEventForDetails] = React.useState<EventTableRow | null>(null)
	const [detailDrawerOpen, setDetailDrawerOpen] = React.useState(false)

	React.useEffect(() => {
		fetchAdditional([
			'events.get',
		]).catch(() => { /* noop */ })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Filters
	const [globalFilter, setGlobalFilter] = React.useState("")
	const [typeFilter, setTypeFilter] = React.useState<string>("all")

	const typeOptions: FilterOption[] = React.useMemo(() => {
		const types = Array.from(new Set(events.map(e => e.type || e.level))).filter(Boolean).sort()
		return types.map(type => ({
			value: type,
			label: type,
			badge: getEventLevelBadge(type, type)
		}))
	}, [events])

	const filtered = React.useMemo(() => {
		const q = globalFilter.trim().toLowerCase()
		return events.filter(e => {
			const matchesQuery = !q ||
				e.name.toLowerCase().includes(q) ||
				e.namespace.toLowerCase().includes(q) ||
				e.reason.toLowerCase().includes(q) ||
				e.message.toLowerCase().includes(q) ||
				e.involvedObject.toLowerCase().includes(q) ||
				e.source.toLowerCase().includes(q)
			const matchesType = typeFilter === 'all' || e.type === typeFilter || e.level === typeFilter
			return matchesQuery && matchesType
		})
	}, [events, globalFilter, typeFilter])

	// Helper function to get event level badge
	function getEventLevelBadge(level: string, type: string) {
		switch (level) {
			case "Warning":
				return (
					<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
						<IconAlertTriangle className="size-3 fill-orange-600 mr-1" />
						{type}
					</Badge>
				)
			case "Error":
				return (
					<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
						<IconAlertCircle className="size-3 fill-red-600 mr-1" />
						{type}
					</Badge>
				)
			case "Info":
			case "Normal":
			default:
				return (
					<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
						<IconInfoCircle className="size-3 fill-blue-600 mr-1" />
						{type}
					</Badge>
				)
		}
	}

	// Helper function to format age display
	function formatAge(age: string): string {
		if (!age) return '-'

		// Handle detailed timestamps like "1m27.707488044s"
		const match = age.match(/^(\d+)([dhms])(\d+\.?\d*)?([dhms])?/)
		if (match) {
			const [, mainValue, mainUnit, subValue, subUnit] = match

			// For durations with subseconds, round to the nearest second
			if (mainUnit === 'm' && subUnit === 's') {
				const seconds = Math.round(parseFloat(subValue || '0'))
				if (seconds >= 60) {
					return `${parseInt(mainValue) + 1}m`
				}
				return seconds > 0 ? `${mainValue}m${seconds}s` : `${mainValue}m`
			}

			// For other cases, just show the main unit
			return `${mainValue}${mainUnit}`
		}

		// Fallback for other formats - try to extract meaningful parts
		const simplified = age
			.replace(/\.?\d{6,}s/, 's') // Remove microseconds from seconds
			.replace(/(\d+)m(\d+)\.?\d*s/, '$1m$2s') // Simplify minutes+seconds
			.replace(/(\d+)h(\d+)m\d+s/, '$1h$2m') // Simplify hours+minutes, drop seconds
			.replace(/(\d+)d(\d+)h\d+m\d*s?/, '$1d$2h') // Simplify days+hours, drop smaller units

		return simplified
	}

	// Columns for UniversalDataTable
	const columns: ColumnDef<EventTableRow>[] = React.useMemo(() => ([
		{
			accessorKey: 'name',
			header: 'Event Name',
			cell: ({ row }: { row: { original: EventTableRow } }) => (
				<IfAllowed
					feature="events.get"
					cluster={clusterId}
					namespace={row.original.namespace}
					resourceName={row.original.name}
					fallback={<div className="max-w-[200px] truncate">{row.original.name}</div>}
				>
					<button
						onClick={() => { setSelectedEventForDetails(row.original); setDetailDrawerOpen(true) }}
						className="text-left hover:underline focus:underline focus:outline-none"
					>
						<div className="max-w-[200px] truncate">{row.original.name}</div>
					</button>
				</IfAllowed>
			),
		},
		{
			accessorKey: 'namespace',
			header: 'Namespace',
			cell: ({ row }: { row: { original: EventTableRow } }) => (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{row.original.namespace}
				</Badge>
			),
		},
		{
			accessorKey: 'type',
			header: 'Type',
			cell: ({ row }: { row: { original: EventTableRow } }) => getEventLevelBadge(row.original.level, row.original.type),
		},
		{
			accessorKey: 'reason',
			header: 'Reason',
			cell: ({ row }: { row: { original: EventTableRow } }) => (
				<div className="font-medium text-sm max-w-[120px] truncate" title={row.original.reason}>
					{row.original.reason}
				</div>
			),
		},
		{
			accessorKey: 'message',
			header: 'Message',
			cell: ({ row }: { row: { original: EventTableRow } }) => (
				<div className="text-sm max-w-[200px] truncate" title={row.original.message}>
					{row.original.message}
				</div>
			),
		},
		{
			accessorKey: 'involvedObject',
			header: 'Object',
			cell: ({ row }: { row: { original: EventTableRow } }) => (
				<div className="text-sm max-w-[150px] truncate" title={row.original.involvedObject}>
					{row.original.involvedObject}
				</div>
			),
		},
		{
			accessorKey: 'source',
			header: 'Source',
			cell: ({ row }: { row: { original: EventTableRow } }) => (
				<div className="text-sm max-w-[120px] truncate" title={row.original.source}>
					{row.original.source}
				</div>
			),
		},
		{
			accessorKey: 'count',
			header: 'Count',
			cell: ({ row }: { row: { original: EventTableRow } }) => (
				<div className="font-mono text-sm text-center">
					{row.original.count > 1 ? (
						<Badge variant="outline" className="text-orange-600 border-orange-600">
							{row.original.count}
						</Badge>
					) : (
						<span>{row.original.count}</span>
					)}
				</div>
			),
		},
		{
			accessorKey: 'age',
			header: 'Age',
			cell: ({ row }: { row: { original: EventTableRow } }) => (
				<div className="font-mono text-sm">{formatAge(row.original.age)}</div>
			),
		},
		{
			id: 'actions',
			cell: ({ row }: { row: { original: EventTableRow } }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
							size="icon"
						>
							<IconDotsVertical />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-52">
						<IfAllowed
							feature="events.get"
							cluster={clusterId}
							namespace={row.original.namespace}
							resourceName={row.original.name}
							fallback={
								<DropdownMenuItem disabled className="text-muted-foreground">
									<IconEye className="size-4 mr-2" />
									View Details
								</DropdownMenuItem>
							}
						>
							<DropdownMenuItem onClick={() => { setSelectedEventForDetails(row.original); setDetailDrawerOpen(true) }}>
								<IconEye className="size-4 mr-2" />
								View Details
							</DropdownMenuItem>
						</IfAllowed>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => {
							const eventData = `Event: ${row.original.name}\nNamespace: ${row.original.namespace}\nType: ${row.original.type}\nReason: ${row.original.reason}\nMessage: ${row.original.message}\nObject: ${row.original.involvedObject}\nSource: ${row.original.source}\nCount: ${row.original.count}\nAge: ${row.original.age}`;
							navigator.clipboard.writeText(eventData);
						}}>
							<IconCopy className="size-4 mr-2" />
							Copy Details
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)
		}
	]), [clusterId])

	// Bulk actions
	const bulkActions = React.useMemo(() => {
		const actions: { id: string, label: string, icon?: React.ReactNode, variant?: 'default' | 'destructive', requiresSelection?: boolean, action: (rows: EventTableRow[]) => void | Promise<void> }[] = []

		actions.push({
			id: 'copy-selected',
			label: 'Copy Selected',
			icon: <IconCopy className="size-4" />,
			requiresSelection: true,
			action: (rows: EventTableRow[]) => {
				const eventDetails = rows.map((row) =>
					`Event: ${row.name}\nNamespace: ${row.namespace}\nType: ${row.type}\nReason: ${row.reason}\nMessage: ${row.message}`
				).join('\n\n---\n\n');
				navigator.clipboard.writeText(eventDetails);
			}
		})

		return actions
	}, [])

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

		// Helper function to get event level badge for summary
		const getEventLevelBadgeForSummary = (count: number, total: number, level: string) => {
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
				badge: getEventLevelBadgeForSummary(warningEvents, totalEvents, "Warning"),
				footer: warningEvents > 0 ? "Potential issues requiring attention" : "No warning events"
			},
			{
				title: "Error Events",
				value: errorEvents,
				subtitle: `${errorEvents} error level events`,
				badge: getEventLevelBadgeForSummary(errorEvents, totalEvents, "Error"),
				footer: errorEvents > 0 ? "Critical issues requiring immediate attention" : "No error events"
			},
			{
				title: "Normal Events",
				value: normalEvents,
				subtitle: `${normalEvents} normal level events`,
				badge: getEventLevelBadgeForSummary(normalEvents, totalEvents, "Normal"),
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
						</div>
						<p className="text-muted-foreground">
							Monitor and track event resources in your Kubernetes cluster
						</p>
					</div>
					<LiveDataStatusBadge isConnected={isConnected} />
				</div>
			</div>

			{/* Summary Cards */}
			<SummaryCards
				cards={summaryData}
				loading={isLoading}
				error={error}
			/>

			<div className="px-4 lg:px-6">
				<UniversalDataTable
					data={filtered}
					columns={columns}
					enableReorder={false}
					enableRowSelection={true}
					loading={isLoading}
					error={error}
					renderFilters={({ table, selectedCount, totalCount }) => (
						<DataTableFilters
							globalFilter={globalFilter}
							onGlobalFilterChange={setGlobalFilter}
							searchPlaceholder="Search events by name, namespace, reason, message..."
							categoryFilter={typeFilter}
							onCategoryFilterChange={setTypeFilter}
							categoryLabel="Filter by type"
							categoryOptions={typeOptions}
							selectedCount={selectedCount}
							totalCount={totalCount}
							bulkActions={bulkActions.map(a => ({
								id: a.id,
								label: a.label,
								icon: a.icon || null,
								variant: a.variant || 'default',
								requiresSelection: a.requiresSelection,
								action: () => a.action(table.getFilteredSelectedRowModel().rows.map((r: { original: EventTableRow }) => r.original))
							}))}
							table={table}
							showColumnToggle={true}
						/>
					)}
				/>
			</div>

			{selectedEventForDetails && (
				<EventDetailDrawer
					event={selectedEventForDetails}
					open={detailDrawerOpen}
					onOpenChange={(open) => {
						setDetailDrawerOpen(open)
						if (!open) setSelectedEventForDetails(null)
					}}
				/>
			)}
		</div>
	)
}

export function EventsPageContainer() {
	return (
		<RouteGuard requiredCapabilities={["events.list"]} requireAll={false}>
			<EventsContent />
		</RouteGuard>
	)
}
