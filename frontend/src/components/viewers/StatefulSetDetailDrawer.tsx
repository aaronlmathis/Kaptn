import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconRefresh, IconLoader, IconCircleCheckFilled } from "@tabler/icons-react"
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
import { type StatefulSetTableRow } from "@/lib/schemas/statefulset"
import { useStatefulSetDetails } from "@/hooks/use-resource-details"

// Status badge helper for StatefulSets
function getReadyBadge(ready: string) {
	const [current, desired] = ready.split("/").map(Number)
	const isReady = current === desired && desired > 0

	if (isReady) {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
				{ready}
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconLoader className="size-3 text-yellow-600 mr-1" />
				{ready}
			</Badge>
		)
	}
}

interface StatefulSetDetailDrawerProps {
	statefulSet: StatefulSetTableRow | null
	open: boolean
	onClose: (open: boolean) => void
}

/**
 * Controlled StatefulSetDetailDrawer that can be opened programmatically.
 * This shows full StatefulSet details from the detailed API endpoint instead of the condensed version.
 */
export function StatefulSetDetailDrawer({ statefulSet, open, onClose }: StatefulSetDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed StatefulSet information - always call hooks at top level
	const { data: statefulSetDetails, loading, error } = useStatefulSetDetails(
		statefulSet?.namespace || "",
		statefulSet?.name || "",
		open && !!statefulSet
	)

	// Additional detailed rows from API (when available) - moved to top to avoid conditional hook calls
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!statefulSetDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full StatefulSet spec and status
		if (statefulSetDetails.metadata?.labels) {
			const labelCount = Object.keys(statefulSetDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (statefulSetDetails.metadata?.annotations) {
			const annotationCount = Object.keys(statefulSetDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (statefulSetDetails.spec?.replicas) {
			additionalRows.push(["Desired Replicas", <div className="font-mono text-sm">{statefulSetDetails.spec.replicas}</div>])
		}

		if (statefulSetDetails.spec?.selector?.matchLabels) {
			const selectorCount = Object.keys(statefulSetDetails.spec.selector.matchLabels).length
			additionalRows.push(["Selector", <div className="text-sm">{selectorCount} label(s)</div>])
		}

		if (statefulSetDetails.spec?.volumeClaimTemplates) {
			const vctCount = statefulSetDetails.spec.volumeClaimTemplates.length
			additionalRows.push(["Volume Claim Templates", <div className="text-sm">{vctCount} template(s)</div>])
		}

		if (statefulSetDetails.spec?.podManagementPolicy) {
			additionalRows.push(["Pod Management Policy", <div className="font-mono text-sm">{statefulSetDetails.spec.podManagementPolicy}</div>])
		}

		if (statefulSetDetails.status?.currentRevision) {
			additionalRows.push(["Current Revision", <div className="font-mono text-sm break-all">{statefulSetDetails.status.currentRevision}</div>])
		}

		if (statefulSetDetails.status?.updateRevision) {
			additionalRows.push(["Update Revision", <div className="font-mono text-sm break-all">{statefulSetDetails.status.updateRevision}</div>])
		}

		if (statefulSetDetails.status?.observedGeneration) {
			additionalRows.push(["Observed Generation", <div className="font-mono text-sm">{statefulSetDetails.status.observedGeneration}</div>])
		}

		return additionalRows
	}, [statefulSetDetails])

	if (!statefulSet) return null

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["StatefulSet Name", statefulSet.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{statefulSet.namespace}
			</Badge>
		)],
		["Ready Replicas", getReadyBadge(statefulSet.ready)],
		["Current Replicas", <div className="font-mono text-sm">{statefulSet.current}</div>],
		["Updated Replicas", <div className="font-mono text-sm">{statefulSet.updated}</div>],
		["Service Name", <div className="font-mono text-sm">{statefulSet.serviceName}</div>],
		["Update Strategy", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{statefulSet.updateStrategy}
			</Badge>
		)],
		["Age", <div className="font-mono text-sm">{statefulSet.age}</div>],
	]

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button size="sm" className="w-full">
				<IconRefresh className="size-4 mr-2" />
				Scale StatefulSet
			</Button>
			<Button variant="outline" size="sm" className="w-full">
				<IconRefresh className="size-4 mr-2" />
				Restart StatefulSet
			</Button>
			<ResourceYamlEditor
				resourceName={statefulSet.name}
				namespace={statefulSet.namespace}
				resourceKind="StatefulSet"
			>
				<Button variant="outline" size="sm" className="w-full">
					<IconEdit className="size-4 mr-2" />
					Edit YAML
				</Button>
			</ResourceYamlEditor>
		</>
	)

	return (
		<Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onClose}>
			<DrawerContent className="flex flex-col h-full">
				{/* Header with title/description */}
				<DrawerHeader className="flex justify-between items-start flex-shrink-0">
					<div className="space-y-1">
						<DrawerTitle>{statefulSet.name}</DrawerTitle>
						<DrawerDescription>
							{loading ? "Loading detailed StatefulSet information..." : "Full StatefulSet details and configuration"}
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
