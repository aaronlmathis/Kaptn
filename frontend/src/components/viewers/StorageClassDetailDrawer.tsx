import * as React from "react"
import { z } from "zod"
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
import { useStorageClassDetails } from "@/hooks/use-resource-details"
import { storageClassSchema } from "@/lib/schemas/storage-class"

function getReclaimPolicyBadge(reclaimPolicy: string) {
	switch (reclaimPolicy) {
		case "Retain":
			return (
				<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
					{reclaimPolicy}
				</Badge>
			)
		case "Delete":
			return (
				<Badge variant="outline" className="text-orange-600 border-border bg-transparent px-1.5">
					{reclaimPolicy}
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{reclaimPolicy}
				</Badge>
			)
	}
}

function getVolumeBindingModeBadge(volumeBindingMode: string) {
	switch (volumeBindingMode) {
		case "Immediate":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					{volumeBindingMode}
				</Badge>
			)
		case "WaitForFirstConsumer":
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					WaitForConsumer
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{volumeBindingMode}
				</Badge>
			)
	}
}

interface StorageClassDetailDrawerProps {
	item: z.infer<typeof storageClassSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled StorageClassDetailDrawer that can be opened programmatically.
 * This shows full storage class details from the detailed API endpoint instead of the condensed version.
 */
export function StorageClassDetailDrawer({ item, open, onOpenChange }: StorageClassDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed storage class information
	const { data: storageClassDetails, loading, error } = useStorageClassDetails(item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Storage Class Name", (
			<div className="flex items-center gap-2">
				{item.name}
				{item.isDefault && (
					<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
						<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
						Default
					</Badge>
				)}
			</div>
		)],
		["Provisioner", <div className="font-mono text-sm break-all">{item.provisioner}</div>],
		["Reclaim Policy", getReclaimPolicyBadge(item.reclaimPolicy)],
		["Volume Binding Mode", getVolumeBindingModeBadge(item.volumeBindingMode)],
		["Allow Volume Expansion", (
			<Badge variant="outline" className={`px-1.5 ${item.allowVolumeExpansion
				? 'text-green-600 border-border bg-transparent'
				: 'text-red-600 border-border bg-transparent'
				}`}>
				{item.allowVolumeExpansion ? 'Yes' : 'No'}
			</Badge>
		)],
		["Parameters Count", <div className="font-mono text-sm">{item.parametersCount}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!storageClassDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full storage class spec
		if (storageClassDetails.metadata?.labels) {
			const labelCount = Object.keys(storageClassDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (storageClassDetails.metadata?.annotations) {
			const annotationCount = Object.keys(storageClassDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (storageClassDetails.metadata?.creationTimestamp) {
			additionalRows.push(["Creation Timestamp", (
				<div className="font-mono text-sm">{new Date(storageClassDetails.metadata.creationTimestamp as string).toLocaleString()}</div>
			)])
		}

		if (storageClassDetails.spec?.parameters && Object.keys(storageClassDetails.spec.parameters as Record<string, unknown>).length > 0) {
			additionalRows.push(["Parameters", (
				<div className="space-y-1">
					{Object.entries(storageClassDetails.spec.parameters as Record<string, unknown>).map(([key, value], index) => (
						<div key={index} className="font-mono text-sm flex">
							<span className="text-muted-foreground mr-2">{key}:</span>
							<span className="break-all">{String(value)}</span>
						</div>
					))}
				</div>
			)])
		}

		if (storageClassDetails.spec?.mountOptions && Array.isArray(storageClassDetails.spec.mountOptions) && (storageClassDetails.spec.mountOptions as string[]).length > 0) {
			additionalRows.push(["Mount Options", (
				<div className="space-y-1">
					{(storageClassDetails.spec.mountOptions as string[]).map((option: string, index: number) => (
						<div key={index} className="font-mono text-sm">{option}</div>
					))}
				</div>
			)])
		}

		return additionalRows
	}, [storageClassDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace=""
				resourceKind="StorageClass"
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
					// TODO: Implement storage class delete functionality
					console.log('Delete storage class:', item.name)
				}}
			>
				<IconTrash className="size-4 mr-2" />
				Delete Storage Class
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
							{loading ? "Loading detailed storage class information..." : "Full storage class details and configuration"}
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
