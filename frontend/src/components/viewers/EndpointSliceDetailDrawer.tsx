import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle, IconRefresh, IconEye } from "@tabler/icons-react"
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
import { useEndpointSliceDetails } from "@/hooks/use-resource-details"
import { endpointSliceSchema } from "@/lib/schemas/endpointslice"

function getEndpointSliceStatusBadge(ready: string, readyCount: number, totalCount: number) {
	const isAllReady = readyCount === totalCount && totalCount > 0
	const hasReady = readyCount > 0

	if (isAllReady) {
		return (
			<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
				All Ready
			</Badge>
		)
	} else if (hasReady) {
		return (
			<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
				<IconLoader className="size-3 text-yellow-600 mr-1" />
				Partially Ready
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

interface EndpointSliceDetailDrawerProps {
	item: z.infer<typeof endpointSliceSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled EndpointSliceDetailDrawer that can be opened programmatically.
 * This shows full EndpointSlice details from the detailed API endpoint.
 */
export function EndpointSliceDetailDrawer({ item, open, onOpenChange }: EndpointSliceDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed endpoint slice information
	const { data: endpointSliceDetails, loading, error } = useEndpointSliceDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["EndpointSlice Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Address Type", (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				{item.addressType}
			</Badge>
		)],
		["Status", getEndpointSliceStatusBadge(item.ready, item.readyCount, item.endpoints)],
		["Endpoints", <div className="font-mono text-sm">{item.endpoints}</div>],
		["Ready", <div className="font-mono text-sm">{item.ready}</div>],
		["Ports", <div className="font-mono text-sm">{item.ports}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!endpointSliceDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full endpoint slice metadata
		if (endpointSliceDetails.metadata && typeof endpointSliceDetails.metadata === 'object') {
			const metadata = endpointSliceDetails.metadata as Record<string, unknown>

			if (metadata.labels) {
				const labelCount = Object.keys(metadata.labels as Record<string, unknown>).length
				additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
			}

			if (metadata.annotations) {
				const annotationCount = Object.keys(metadata.annotations as Record<string, unknown>).length
				additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
			}

			if (metadata.uid) {
				additionalRows.push(["UID", <div className="font-mono text-xs">{String(metadata.uid)}</div>])
			}

			if (metadata.resourceVersion) {
				additionalRows.push(["Resource Version", <div className="font-mono text-xs">{String(metadata.resourceVersion)}</div>])
			}
		}

		// Add details from the summary data
		if (endpointSliceDetails.summary && typeof endpointSliceDetails.summary === 'object') {
			const summary = endpointSliceDetails.summary as Record<string, unknown>

			if (summary.addresses && Array.isArray(summary.addresses)) {
				const addresses = summary.addresses as string[]
				if (addresses.length > 0) {
					additionalRows.push(["Address Count", <div className="text-sm">{addresses.length} address(es)</div>])
					addresses.forEach((address, index) => {
						additionalRows.push([`Address ${index + 1}`, <div className="font-mono text-sm">{address}</div>])
					})
				}
			}

			if (summary.portStrings && Array.isArray(summary.portStrings)) {
				const portStrings = summary.portStrings as string[]
				if (portStrings.length > 0) {
					additionalRows.push(["Port Details", <div className="text-sm">{portStrings.length} port(s)</div>])
					portStrings.forEach((port, index) => {
						additionalRows.push([`Port ${index + 1}`, <div className="font-mono text-sm">{port}</div>])
					})
				}
			}
		}

		return additionalRows
	}, [endpointSliceDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement EndpointSlice details functionality
					console.log('Show EndpointSlice details:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconEye className="size-4 mr-2" />
				View Details
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="EndpointSlice"
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
					// TODO: Implement EndpointSlice restart functionality
					console.log('Restart EndpointSlice:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconRefresh className="size-4 mr-2" />
				Restart EndpointSlice
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
							{loading ? "Loading detailed EndpointSlice information..." : "Full EndpointSlice details and configuration"}
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
