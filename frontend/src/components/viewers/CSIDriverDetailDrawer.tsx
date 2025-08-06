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
import { useCSIDriverDetails } from "@/hooks/use-resource-details"
import { csiDriverSchema } from "@/lib/schemas/csi-driver"

function getAttachRequiredBadge(attachRequired: boolean) {
	return attachRequired ? (
		<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
			Required
		</Badge>
	) : (
		<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
			Not Required
		</Badge>
	)
}

function getPodInfoOnMountBadge(podInfoOnMount: boolean) {
	return podInfoOnMount ? (
		<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
			Enabled
		</Badge>
	) : (
		<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
			Disabled
		</Badge>
	)
}

function getStorageCapacityBadge(storageCapacity: boolean) {
	return storageCapacity ? (
		<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
			Supported
		</Badge>
	) : (
		<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
			Not Supported
		</Badge>
	)
}

function getFSGroupPolicyBadge(fsGroupPolicy: string) {
	switch (fsGroupPolicy) {
		case "File":
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					File
				</Badge>
			)
		case "ReadWriteOnceWithFSType":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					RWO+FSType
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{fsGroupPolicy || "None"}
				</Badge>
			)
	}
}

interface CSIDriverDetailDrawerProps {
	item: z.infer<typeof csiDriverSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled CSIDriverDetailDrawer that can be opened programmatically.
 * This shows full CSI driver details from the detailed API endpoint instead of the condensed version.
 */
export function CSIDriverDetailDrawer({ item, open, onOpenChange }: CSIDriverDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed CSI driver information
	const { data: csiDriverDetails, loading, error } = useCSIDriverDetails(item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["CSI Driver Name", <div className="font-mono text-sm break-all">{item.name}</div>],
		["Attach Required", getAttachRequiredBadge(item.attachRequired)],
		["Pod Info on Mount", getPodInfoOnMountBadge(item.podInfoOnMount)],
		["Storage Capacity", getStorageCapacityBadge(item.storageCapacity)],
		["FS Group Policy", getFSGroupPolicyBadge(item.fsGroupPolicy)],
		["Volume Lifecycle Modes", <div className="font-mono text-sm">{item.volumeLifecycleModes}</div>],
		["Token Requests", <div className="font-mono text-sm">{item.tokenRequests}</div>],
		["Requires Republish", (
			<Badge variant="outline" className={`px-1.5 ${item.requiresRepublish
				? 'text-blue-600 border-border bg-transparent'
				: 'text-muted-foreground border-border bg-transparent'
				}`}>
				{item.requiresRepublish ? 'Yes' : 'No'}
			</Badge>
		)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!csiDriverDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full CSI driver spec
		if (csiDriverDetails.summary.labels) {
			const labelCount = Object.keys(csiDriverDetails.summary.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (csiDriverDetails.summary.annotations) {
			const annotationCount = Object.keys(csiDriverDetails.summary.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (csiDriverDetails.summary.creationTimestamp) {
			additionalRows.push(["Creation Timestamp", (
				<div className="font-mono text-sm">{new Date(csiDriverDetails.summary.creationTimestamp).toLocaleString()}</div>
			)])
		}

		return additionalRows
	}, [csiDriverDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace=""
				resourceKind="CSIDriver"
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
					// TODO: Implement CSI driver delete functionality
					console.log('Delete CSI driver:', item.name)
				}}
			>
				<IconTrash className="size-4 mr-2" />
				Delete CSI Driver
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
							{loading ? "Loading detailed CSI driver information..." : "Full CSI driver details and configuration"}
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
