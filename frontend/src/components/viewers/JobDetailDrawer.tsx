import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle, IconRefresh } from "@tabler/icons-react"
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
import { useJobDetails } from "@/hooks/use-resource-details"
import { jobSchema } from "@/lib/schemas/job"

function getStatusBadge(status: string) {
	switch (status) {
		case "Complete":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					{status}
				</Badge>
			)
		case "Running":
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-blue-600 mr-1" />
					{status}
				</Badge>
			)
		case "Failed":
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					{status}
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{status}
				</Badge>
			)
	}
}

interface JobDetailDrawerProps {
	item: z.infer<typeof jobSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled JobDetailDrawer that can be opened programmatically.
 * This shows full job details from the detailed API endpoint instead of the condensed version.
 */
export function JobDetailDrawer({ item, open, onOpenChange }: JobDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed job information
	const { data: jobDetails, loading, error } = useJobDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Job Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Status", getStatusBadge(item.status)],
		["Completions", <div className="font-mono text-sm">{item.completions}</div>],
		["Duration", <div className="font-mono text-sm">{item.duration}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["Container Image", <div className="font-mono text-sm break-all">{item.image || "Unknown"}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!jobDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full job spec and status
		if (jobDetails.metadata?.labels) {
			const labelCount = Object.keys(jobDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (jobDetails.metadata?.annotations) {
			const annotationCount = Object.keys(jobDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (jobDetails.summary?.parallelism) {
			additionalRows.push(["Parallelism", <div className="font-mono text-sm">{jobDetails.summary.parallelism}</div>])
		}

		if (jobDetails.summary?.backoffLimit) {
			additionalRows.push(["Backoff Limit", <div className="font-mono text-sm">{jobDetails.summary.backoffLimit}</div>])
		}

		if (jobDetails.summary?.activeDeadlineSeconds) {
			additionalRows.push(["Active Deadline", <div className="font-mono text-sm">{jobDetails.summary.activeDeadlineSeconds}s</div>])
		}

		if (jobDetails.spec?.template?.spec?.restartPolicy) {
			additionalRows.push(["Restart Policy", <div className="font-mono text-sm">{jobDetails.spec.template.spec.restartPolicy}</div>])
		}

		if (jobDetails.summary?.conditions && jobDetails.summary.conditions.length > 0) {
			const latestCondition = jobDetails.summary.conditions[jobDetails.summary.conditions.length - 1]
			additionalRows.push(["Latest Condition", (
				<div className="flex items-center gap-2">
					<Badge
						variant="outline"
						className={`px-1.5 ${latestCondition.status === 'True'
							? 'text-green-600 border-border bg-transparent'
							: 'text-red-600 border-border bg-transparent'
							}`}
					>
						{latestCondition.type}
					</Badge>
					<span className="text-sm text-muted-foreground">{latestCondition.reason || 'N/A'}</span>
				</div>
			)])
		}

		return additionalRows
	}, [jobDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="Job"
			>
				<Button variant="outline" size="sm" className="w-full">
					<IconEdit className="size-4 mr-2" />
					Edit YAML
				</Button>
			</ResourceYamlEditor>
			<Button
				variant="destructive"
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement job restart functionality
					console.log('Restart job:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconRefresh className="size-4 mr-2" />
				Restart Job
			</Button>
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
							{loading ? "Loading detailed job information..." : "Full job details and configuration"}
						</DrawerDescription>
					</div>
				</DrawerHeader>

				{/* Content area with styled scrolling */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 text-sm">
						{error ? (
							<div className="text-red-600 p-4 text-sm">
								⚠️ Failed to load detailed information: {error}
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
