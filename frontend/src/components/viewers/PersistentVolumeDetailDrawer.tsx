import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle, IconRefresh, IconTrash } from "@tabler/icons-react"
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
import { usePersistentVolumeDetails } from "@/hooks/use-resource-details"
import { persistentVolumeSchema } from "@/lib/schemas/persistent-volume"

function getStatusBadge(status: string) {
	switch (status.toLowerCase()) {
		case 'available':
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					Available
				</Badge>
			)
		case 'bound':
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
					Bound
				</Badge>
			)
		case 'released':
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-yellow-600 mr-1" />
					Released
				</Badge>
			)
		case 'failed':
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					Failed
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground px-1.5">
					{status}
				</Badge>
			)
	}
}

interface PersistentVolumeDetailDrawerProps {
	item: z.infer<typeof persistentVolumeSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled PersistentVolumeDetailDrawer that can be opened programmatically.
 * This shows full persistent volume details from the detailed API endpoint instead of the condensed version.
 */
export function PersistentVolumeDetailDrawer({ item, open, onOpenChange }: PersistentVolumeDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed persistent volume information
	const { data: pvDetails, loading, error } = usePersistentVolumeDetails(item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Name", item.name],
		["Status", getStatusBadge(item.status)],
		["Capacity", <div className="font-mono text-sm">{item.capacity}</div>],
		["Access Modes", <div className="text-sm">{item.accessModesDisplay}</div>],
		["Reclaim Policy", <div className="text-sm">{item.reclaimPolicy}</div>],
		["Claim", <div className="text-sm">{item.claim || "<none>"}</div>],
		["Storage Class", <div className="text-sm">{item.storageClass}</div>],
		["Volume Source", <div className="text-sm">{item.volumeSource}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!pvDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full persistent volume spec and status
		if (pvDetails.metadata?.labels) {
			const labelCount = Object.keys(pvDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (pvDetails.metadata?.annotations) {
			const annotationCount = Object.keys(pvDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (pvDetails.spec?.nodeAffinity) {
			additionalRows.push(["Node Affinity", <div className="text-sm">Configured</div>])
		}

		if (pvDetails.spec?.mountOptions && Array.isArray(pvDetails.spec.mountOptions)) {
			const mountOptions = pvDetails.spec.mountOptions as string[]
			additionalRows.push(["Mount Options", <div className="text-sm">{mountOptions.join(', ')}</div>])
		}

		if (pvDetails.spec?.volumeMode) {
			additionalRows.push(["Volume Mode", <div className="text-sm">{pvDetails.spec.volumeMode as string}</div>])
		}

		return additionalRows
	}, [pvDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace=""
				resourceKind="PersistentVolume"
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
					// TODO: Implement persistent volume delete functionality
					console.log('Delete persistent volume:', item.name)
				}}
			>
				<IconTrash className="size-4 mr-2" />
				Delete
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
							{loading ? "Loading detailed persistent volume information..." : "Full persistent volume details and configuration"}
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
