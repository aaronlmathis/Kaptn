import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconTrash } from "@tabler/icons-react"
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
import { useVolumeSnapshotDetails } from "@/hooks/use-resource-details"
import type { DashboardVolumeSnapshot } from "@/lib/k8s-storage"

function getReadyStatusBadge(readyToUse: boolean) {
	if (readyToUse) {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
				Ready
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconLoader className="size-3 text-yellow-600 mr-1" />
				Not Ready
			</Badge>
		)
	}
}

interface VolumeSnapshotDetailDrawerProps {
	item: DashboardVolumeSnapshot
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled VolumeSnapshotDetailDrawer that can be opened programmatically.
 * This shows full volume snapshot details from the detailed API endpoint instead of the condensed version.
 */
export function VolumeSnapshotDetailDrawer({ item, open, onOpenChange }: VolumeSnapshotDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed volume snapshot information
	const { data: volumeSnapshotDetails, loading, error } = useVolumeSnapshotDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Volume Snapshot Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Status", getReadyStatusBadge(item.readyToUse)],
		["Source PVC", item.sourcePVC],
		["Snapshot Class", item.volumeSnapshotClassName],
		["Restore Size", <div className="font-mono text-sm">{item.restoreSize}</div>],
		["Creation Time", <div className="font-mono text-sm">{item.creationTime}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["Snapshot Handle", <div className="font-mono text-sm break-all">{item.snapshotHandle || "N/A"}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!volumeSnapshotDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full volume snapshot spec and status
		if (volumeSnapshotDetails.metadata && typeof volumeSnapshotDetails.metadata === 'object') {
			const metadata = volumeSnapshotDetails.metadata as Record<string, unknown>
			if (metadata.labels && typeof metadata.labels === 'object') {
				const labelCount = Object.keys(metadata.labels as Record<string, unknown>).length
				additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
			}

			if (metadata.annotations && typeof metadata.annotations === 'object') {
				const annotationCount = Object.keys(metadata.annotations as Record<string, unknown>).length
				additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
			}

			if (metadata.uid && typeof metadata.uid === 'string') {
				additionalRows.push(["UID", <div className="font-mono text-xs break-all">{metadata.uid}</div>])
			}
		}

		if (volumeSnapshotDetails.spec && typeof volumeSnapshotDetails.spec === 'object') {
			const spec = volumeSnapshotDetails.spec as Record<string, unknown>
			if (spec.volumeSnapshotClassName && typeof spec.volumeSnapshotClassName === 'string') {
				additionalRows.push(["Volume Snapshot Class", <div className="font-mono text-sm">{spec.volumeSnapshotClassName}</div>])
			}
		}

		if (volumeSnapshotDetails.status && typeof volumeSnapshotDetails.status === 'object') {
			const status = volumeSnapshotDetails.status as Record<string, unknown>
			if (status.boundVolumeSnapshotContentName && typeof status.boundVolumeSnapshotContentName === 'string') {
				additionalRows.push(["Bound Snapshot Content", <div className="font-mono text-sm break-all">{status.boundVolumeSnapshotContentName}</div>])
			}

			if (status.creationTime && typeof status.creationTime === 'string') {
				additionalRows.push(["Creation Timestamp", <div className="font-mono text-sm">{status.creationTime}</div>])
			}

			if (status.restoreSize && typeof status.restoreSize === 'string') {
				additionalRows.push(["Restore Size (Status)", <div className="font-mono text-sm">{status.restoreSize}</div>])
			}

			if (status.error && typeof status.error === 'object') {
				const error = status.error as Record<string, unknown>
				additionalRows.push(["Error", (
					<div className="text-red-600 text-sm">
						{(error.message as string) || "Unknown error"}
					</div>
				)])
			}
		}

		return additionalRows
	}, [volumeSnapshotDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="VolumeSnapshot"
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
					// TODO: Implement volume snapshot restart functionality
					console.log('Delete volume snapshot:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconTrash className="size-4 mr-2" />
				Delete Volume Snapshot
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
							{loading ? "Loading detailed volume snapshot information..." : "Full volume snapshot details and configuration"}
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
