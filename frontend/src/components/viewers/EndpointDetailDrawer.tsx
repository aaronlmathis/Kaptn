import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconRefresh } from "@tabler/icons-react"
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
import { useEndpointsDetails } from "@/hooks/use-resource-details"
import { type DashboardEndpoints } from "@/lib/k8s-api"

interface EndpointDetailDrawerProps {
	item: DashboardEndpoints
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled EndpointDetailDrawer that can be opened programmatically.
 * This shows full endpoint details from the detailed API endpoint instead of the condensed version.
 */
export function EndpointDetailDrawer({ item, open, onOpenChange }: EndpointDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed endpoint information
	const { data: endpointDetails, loading, error } = useEndpointsDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Endpoint Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["Subsets", <div className="font-mono text-sm">{item.subsets}</div>],
		["Total Addresses", <div className="font-mono text-sm">{item.totalAddresses}</div>],
		["Total Ports", <div className="font-mono text-sm">{item.totalPorts}</div>],
		["Addresses", <div className="text-sm">{item.addressesDisplay}</div>],
		["Ports", <div className="text-sm">{item.portsDisplay}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!endpointDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full endpoint spec and metadata
		if (endpointDetails.metadata?.labels) {
			const labelCount = Object.keys(endpointDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (endpointDetails.metadata?.annotations) {
			const annotationCount = Object.keys(endpointDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		// Show detailed subnet information if available
		if (endpointDetails.subsets && Array.isArray(endpointDetails.subsets)) {
			endpointDetails.subsets.forEach((subset: Record<string, unknown>, index: number) => {
				if (subset.addresses && Array.isArray(subset.addresses)) {
					additionalRows.push([
						`Subset ${index + 1} Ready Addresses`,
						<div className="text-sm">{subset.addresses.length} address(es)</div>
					])
				}
				if (subset.notReadyAddresses && Array.isArray(subset.notReadyAddresses)) {
					additionalRows.push([
						`Subset ${index + 1} Not Ready Addresses`,
						<div className="text-sm">{subset.notReadyAddresses.length} address(es)</div>
					])
				}
				if (subset.ports && Array.isArray(subset.ports)) {
					additionalRows.push([
						`Subset ${index + 1} Ports`,
						<div className="text-sm">{subset.ports.length} port(s)</div>
					])
				}
			})
		}

		return additionalRows
	}, [endpointDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="Endpoints"
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
					// TODO: Implement endpoint restart functionality
					console.log('Restart endpoint:', item.name, 'in namespace:', item.namespace)
				}}
			>
				<IconRefresh className="size-4 mr-2" />
				Restart
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
							{loading ? "Loading detailed endpoint information..." : "Full endpoint details and configuration"}
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
								<IconRefresh className="size-4 animate-spin mr-2" />
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
