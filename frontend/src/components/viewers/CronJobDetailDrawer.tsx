import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconPlayerPlay, IconPlayerPause, IconRefresh, IconAlertTriangle, IconLoader } from "@tabler/icons-react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer"
import { DetailRows } from "@/components/ResourceDetailDrawer"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { useCronJobDetails } from "@/hooks/use-resource-details"
import { cronJobSchema } from "@/lib/schemas/cronjob"

function getSuspendBadge(suspend: boolean) {
	if (suspend) {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconPlayerPause className="size-3 text-yellow-600 mr-1" />
				Suspended
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconPlayerPlay className="size-3 text-green-600 mr-1" />
				Active
			</Badge>
		)
	}
}

interface CronJobDetailDrawerProps {
	item: z.infer<typeof cronJobSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled CronJobDetailDrawer that can be opened programmatically.
 * This shows full cronjob details from the detailed API endpoint instead of the condensed version.
 */
export function CronJobDetailDrawer({ item, open, onOpenChange }: CronJobDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed cronjob information
	const { data: cronJobDetails, loading, error } = useCronJobDetails(item.namespace, item.name, open)

	const handleSuspendResume = () => {
		// TODO: Implement cronjob suspend/resume functionality
		console.log('Suspend/Resume cronjob:', item.name, 'in namespace:', item.namespace)
	}

	const handleTriggerJob = () => {
		// TODO: Implement manual job trigger functionality
		console.log('Trigger job for cronjob:', item.name, 'in namespace:', item.namespace)
	}

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["CronJob Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Schedule", <div className="font-mono text-sm">{item.schedule}</div>],
		["Status", getSuspendBadge(item.suspend)],
		["Active Jobs", <div className="font-mono text-sm">{item.active}</div>],
		["Last Schedule Time", <div className="text-sm">{item.lastSchedule}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["Container Image", <div className="font-mono text-sm break-all">{item.image || "Unknown"}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!cronJobDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full cronjob spec and status
		if (cronJobDetails.metadata?.labels) {
			const labelCount = Object.keys(cronJobDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (cronJobDetails.metadata?.annotations) {
			const annotationCount = Object.keys(cronJobDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (cronJobDetails.summary?.concurrencyPolicy) {
			additionalRows.push(["Concurrency Policy", <div className="text-sm">{cronJobDetails.summary.concurrencyPolicy}</div>])
		}

		if (cronJobDetails.summary?.startingDeadlineSeconds) {
			additionalRows.push(["Starting Deadline", <div className="text-sm">{cronJobDetails.summary.startingDeadlineSeconds}s</div>])
		}

		if (cronJobDetails.summary?.successfulJobsHistoryLimit !== undefined) {
			additionalRows.push(["Successful Jobs History Limit", <div className="text-sm">{cronJobDetails.summary.successfulJobsHistoryLimit}</div>])
		}

		if (cronJobDetails.summary?.failedJobsHistoryLimit !== undefined) {
			additionalRows.push(["Failed Jobs History Limit", <div className="text-sm">{cronJobDetails.summary.failedJobsHistoryLimit}</div>])
		}

		// Show active jobs if any
		if (cronJobDetails.status?.active && cronJobDetails.status.active.length > 0) {
			const activeJobNames = cronJobDetails.status.active.map((job: { name: string }) => job.name).join(", ")
			additionalRows.push(["Active Job Names", <div className="font-mono text-sm break-all">{activeJobNames}</div>])
		}

		if (cronJobDetails.status?.lastSuccessfulTime) {
			const lastSuccessTime = new Date(cronJobDetails.status.lastSuccessfulTime).toLocaleString()
			additionalRows.push(["Last Successful Time", <div className="text-sm">{lastSuccessTime}</div>])
		}

		return additionalRows
	}, [cronJobDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={handleSuspendResume}
				variant={item.suspend ? "default" : "outline"}
			>
				{item.suspend ? (
					<>
						<IconPlayerPlay className="size-4 mr-2" />
						Resume CronJob
					</>
				) : (
					<>
						<IconPlayerPause className="size-4 mr-2" />
						Suspend CronJob
					</>
				)}
			</Button>
			<Button size="sm" variant="outline" className="w-full" onClick={handleTriggerJob}>
				<IconRefresh className="size-4 mr-2" />
				Trigger Job Now
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="CronJob"
			>
				<Button variant="outline" size="sm" className="w-full">
					<IconEdit className="size-4 mr-2" />
					Edit YAML
				</Button>
			</ResourceYamlEditor>
		</>
	)

	return (
		<Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="flex flex-col h-full">
				{/* Header with title/description */}
				<DrawerHeader className="flex justify-between items-start flex-shrink-0">
					<div className="space-y-1">
						<DrawerTitle>{item.name}</DrawerTitle>
						<DrawerDescription>
							{loading ? "Loading detailed cronjob information..." : "Full cronjob details and configuration"}
						</DrawerDescription>
					</div>
				</DrawerHeader>

				{/* Content area with styled scrolling */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 text-sm">
						{error ? (
							<div className="text-red-600 p-4 text-sm">
								<IconAlertTriangle className="size-4 inline mr-2" />
								Failed to load detailed information: {error}
								<div className="mt-2 text-muted-foreground">
									Showing basic information from summary data.
								</div>
							</div>
						) : null}

						<DetailRows rows={allRows} />

						{loading && (
							<div className="flex items-center justify-center py-4 text-muted-foreground">
								<IconLoader className="size-4 animate-spin mr-2" />
								Loading detailed information...
							</div>
						)}
					</div>
					<ScrollBar orientation="vertical" />
				</ScrollArea>

				{/* Footer with actions */}
				<DrawerFooter className="flex flex-col gap-2 px-6 pb-6 pt-4 flex-shrink-0">
					{actions}
					<DrawerClose asChild>
						<Button variant="outline" size="sm" className="w-full">
							Close
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	)
}
