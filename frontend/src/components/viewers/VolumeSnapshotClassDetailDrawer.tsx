import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconLoader, IconTrash } from "@tabler/icons-react"
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
import { useVolumeSnapshotClassDetails } from "@/hooks/use-resource-details"
import { volumeSnapshotClassSchema } from "@/lib/schemas/volume-snapshot-class"

function getDeletionPolicyBadge(deletionPolicy: string) {
	switch (deletionPolicy) {
		case "Retain":
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					{deletionPolicy}
				</Badge>
			)
		case "Delete":
			return (
				<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
					{deletionPolicy}
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{deletionPolicy}
				</Badge>
			)
	}
}

interface VolumeSnapshotClassDetailDrawerProps {
	item: z.infer<typeof volumeSnapshotClassSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled VolumeSnapshotClassDetailDrawer that can be opened programmatically.
 * This shows full volume snapshot class details from the detailed API endpoint instead of the condensed version.
 */
export function VolumeSnapshotClassDetailDrawer({ item, open, onOpenChange }: VolumeSnapshotClassDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed volume snapshot class information
	const { data: volumeSnapshotClassDetails, loading, error } = useVolumeSnapshotClassDetails(item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Volume Snapshot Class Name", item.name],
		["Driver", <div className="font-mono text-sm break-all">{item.driver}</div>],
		["Deletion Policy", getDeletionPolicyBadge(item.deletionPolicy)],
		["Parameters Count", <div className="font-mono text-sm">{item.parametersCount}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!volumeSnapshotClassDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full volume snapshot class spec
		if (volumeSnapshotClassDetails.metadata?.labels) {
			const labelCount = Object.keys(volumeSnapshotClassDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (volumeSnapshotClassDetails.metadata?.annotations) {
			const annotationCount = Object.keys(volumeSnapshotClassDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (volumeSnapshotClassDetails.metadata?.creationTimestamp) {
			additionalRows.push(["Creation Timestamp", (
				<div className="font-mono text-sm">{new Date(volumeSnapshotClassDetails.metadata.creationTimestamp as string).toLocaleString()}</div>
			)])
		}

		if (volumeSnapshotClassDetails.spec?.parameters && Object.keys(volumeSnapshotClassDetails.spec.parameters as Record<string, unknown>).length > 0) {
			additionalRows.push(["Parameters", (
				<div className="space-y-1">
					{Object.entries(volumeSnapshotClassDetails.spec.parameters as Record<string, unknown>).map(([key, value], index) => (
						<div key={index} className="font-mono text-sm flex">
							<span className="text-muted-foreground mr-2">{key}:</span>
							<span className="break-all">{String(value)}</span>
						</div>
					))}
				</div>
			)])
		}

		return additionalRows
	}, [volumeSnapshotClassDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace=""
				resourceKind="VolumeSnapshotClass"
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
					// TODO: Implement volume snapshot class delete functionality
					console.log('Delete volume snapshot class:', item.name)
				}}
			>
				<IconTrash className="size-4 mr-2" />
				Delete Volume Snapshot Class
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
							{loading ? "Loading detailed volume snapshot class information..." : "Full volume snapshot class details and configuration"}
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
