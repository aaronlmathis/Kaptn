"use client"

import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle, IconTrash } from "@tabler/icons-react"
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
import { usePersistentVolumeClaimDetails } from "@/hooks/use-resource-details"
import { persistentVolumeClaimSchema } from "@/lib/schemas/persistent-volume-claim"

function getStatusBadge(status: string) {
	switch (status.toLowerCase()) {
		case 'bound':
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					Bound
				</Badge>
			)
		case 'pending':
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-yellow-600 mr-1" />
					Pending
				</Badge>
			)
		case 'lost':
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					Lost
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

interface PersistentVolumeClaimDetailDrawerProps {
	item: z.infer<typeof persistentVolumeClaimSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled PersistentVolumeClaimDetailDrawer that can be opened programmatically.
 * This shows full PVC details from the detailed API endpoint instead of the condensed version.
 */
export function PersistentVolumeClaimDetailDrawer({ item, open, onOpenChange }: PersistentVolumeClaimDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed PVC information
	const { data: pvcDetails, loading, error } = usePersistentVolumeClaimDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Status", getStatusBadge(item.status)],
		["Volume", <div className="font-mono text-sm">{item.volume || "<none>"}</div>],
		["Capacity", <div className="font-mono text-sm">{item.capacity}</div>],
		["Access Modes", <div className="text-sm">{item.accessModesDisplay}</div>],
		["Storage Class", <div className="text-sm">{item.storageClass}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!pvcDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full PVC spec and status
		if (pvcDetails.metadata?.labels) {
			const labelCount = Object.keys(pvcDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (pvcDetails.metadata?.annotations) {
			const annotationCount = Object.keys(pvcDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (pvcDetails.summary?.creationTimestamp) {
			additionalRows.push(["Created", <div className="font-mono text-sm">{new Date(pvcDetails.summary.creationTimestamp).toLocaleString()}</div>])
		}

		if (pvcDetails.metadata?.uid) {
			additionalRows.push(["UID", <div className="font-mono text-xs break-all">{pvcDetails.metadata.uid as string}</div>])
		}

		if (pvcDetails.metadata?.resourceVersion) {
			additionalRows.push(["Resource Version", <div className="font-mono text-xs">{pvcDetails.metadata.resourceVersion as string}</div>])
		}

		if (pvcDetails.metadata?.finalizers && Array.isArray(pvcDetails.metadata.finalizers) && pvcDetails.metadata.finalizers.length > 0) {
			additionalRows.push(["Finalizers", (
				<div className="space-y-1">
					{(pvcDetails.metadata.finalizers as string[]).map((finalizer, index) => (
						<Badge key={index} variant="outline" className="text-xs mr-1">
							{finalizer}
						</Badge>
					))}
				</div>
			)])
		}

		return additionalRows
	}, [pvcDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="PersistentVolumeClaim"
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
					// TODO: Implement PVC delete functionality
					console.log('Delete PVC:', item.name, 'in namespace:', item.namespace)
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
							{loading ? "Loading detailed PVC information..." : "Full persistent volume claim details and configuration"}
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
