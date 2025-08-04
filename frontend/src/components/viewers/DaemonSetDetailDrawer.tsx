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
import { useDaemonSetDetails } from "@/hooks/use-resource-details"
import { daemonSetSchema } from "@/lib/schemas/daemonset"

// Import the daemonset schema from the schema file

function getReadyBadge(ready: number, desired: number) {
	const isReady = ready === desired && desired > 0
	const isPartial = ready > 0 && ready < desired

	if (isReady) {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
				Ready
			</Badge>
		)
	} else if (isPartial) {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconLoader className="size-3 text-yellow-600 mr-1" />
				Partial
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
				<IconAlertTriangle className="size-3 text-red-600 mr-1" />
				Not Ready
			</Badge>
		)
	}
}

interface DaemonSetDetailDrawerProps {
	item: z.infer<typeof daemonSetSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled DaemonSetDetailDrawer that can be opened programmatically.
 * This shows full daemonset details from the detailed API endpoint instead of the condensed version.
 */
export function DaemonSetDetailDrawer({ item, open, onOpenChange }: DaemonSetDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed daemonset information
	const { data: daemonSetDetails, loading, error } = useDaemonSetDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["DaemonSet Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Ready Status", getReadyBadge(item.ready, item.desired)],
		["Desired", <div className="font-mono text-sm">{item.desired}</div>],
		["Current", <div className="font-mono text-sm">{item.current}</div>],
		["Ready", <div className="font-mono text-sm">{item.ready}</div>],
		["Available", <div className="font-mono text-sm">{item.available}</div>],
		["Unavailable", <div className="font-mono text-sm">{item.unavailable}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["Update Strategy", <div className="font-mono text-sm">{item.updateStrategy}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!daemonSetDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full daemonset spec and status
		if (daemonSetDetails.metadata?.labels) {
			const labelCount = Object.keys(daemonSetDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (daemonSetDetails.metadata?.annotations) {
			const annotationCount = Object.keys(daemonSetDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (daemonSetDetails.spec?.selector?.matchLabels) {
			const selectorCount = Object.keys(daemonSetDetails.spec.selector.matchLabels).length
			additionalRows.push(["Selector", <div className="text-sm">{selectorCount} label selector(s)</div>])
		}

		if (daemonSetDetails.spec?.template?.spec?.containers) {
			const containerCount = daemonSetDetails.spec.template.spec.containers.length
			const containerNames = daemonSetDetails.spec.template.spec.containers.map((c: any) => c.name).join(', ')
			additionalRows.push(["Containers", <div className="text-sm">{containerCount} container(s): {containerNames}</div>])
		}

		if (daemonSetDetails.spec?.template?.spec?.volumes) {
			const volumeCount = daemonSetDetails.spec.template.spec.volumes.length
			additionalRows.push(["Volumes", <div className="text-sm">{volumeCount} volume(s)</div>])
		}

		if (daemonSetDetails.spec?.updateStrategy?.rollingUpdate) {
			const maxUnavailable = daemonSetDetails.spec.updateStrategy.rollingUpdate.maxUnavailable || '1'
			additionalRows.push(["Max Unavailable", <div className="font-mono text-sm">{maxUnavailable}</div>])
		}

		if (daemonSetDetails.status?.conditions) {
			const readyCondition = daemonSetDetails.status.conditions.find((c: any) => c.type === 'Available')
			if (readyCondition) {
				additionalRows.push(["Available Condition", (
					<div className="flex items-center gap-2">
						<Badge
							variant="outline"
							className={`px-1.5 ${readyCondition.status === 'True'
								? 'text-green-600 border-border bg-transparent'
								: 'text-red-600 border-border bg-transparent'
								}`}
						>
							{readyCondition.status === 'True' ? 'Available' : 'Not Available'}
						</Badge>
						<span className="text-sm text-muted-foreground">{readyCondition.reason || 'N/A'}</span>
					</div>
				)])
			}
		}

		if (daemonSetDetails.status?.observedGeneration) {
			additionalRows.push(["Observed Generation", <div className="font-mono text-sm">{daemonSetDetails.status.observedGeneration}</div>])
		}

		return additionalRows
	}, [daemonSetDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="DaemonSet"
			>
				<Button variant="outline" size="sm" className="w-full">
					<IconEdit className="size-4 mr-2" />
					Edit YAML
				</Button>
			</ResourceYamlEditor>
			<Button size="sm" className="w-full" variant="destructive">
				<IconRefresh className="size-4 mr-2" />
				Restart DaemonSet
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
							{loading ? "Loading detailed daemonset information..." : "Full daemonset details and configuration"}
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
