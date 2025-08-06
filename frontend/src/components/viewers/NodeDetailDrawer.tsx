import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle, IconRefresh, IconPlayerPause, IconDroplets, IconTrash } from "@tabler/icons-react"
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
import { useNodeDetails } from "@/hooks/use-resource-details"
import { k8sService } from "@/lib/k8s-api"
import { nodeSchema } from "@/lib/schemas/node"

function getNodeStatusBadge(status: string) {
	switch (status.toLowerCase()) {
		case "ready":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					Ready
				</Badge>
			)
		case "notready":
		case "not ready":
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					Not Ready
				</Badge>
			)
		case "schedulingdisabled":
		case "scheduling disabled":
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconPlayerPause className="size-3 text-yellow-600 mr-1" />
					Cordoned
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

interface NodeDetailDrawerProps {
	item: z.infer<typeof nodeSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled NodeDetailDrawer that can be opened programmatically.
 * This shows full node details from the detailed API endpoint instead of the condensed version.
 */
export function NodeDetailDrawer({ item, open, onOpenChange }: NodeDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed node information - temporarily disabled until backend endpoint is implemented
	const { data: nodeDetails, loading, error } = useNodeDetails(item.name, open)

	const handleCordonNode = async () => {
		try {
			const result = await k8sService.cordonNode(item.name)
			if (result.success) {
				// Optionally close the detail drawer or refetch data
				console.log('Node cordoned successfully:', result.message)
			}
		} catch (error) {
			console.error('Failed to cordon node:', error)
		}
	}

	const handleUncordonNode = async () => {
		try {
			const result = await k8sService.uncordonNode(item.name)
			if (result.success) {
				console.log('Node uncordoned successfully:', result.message)
			}
		} catch (error) {
			console.error('Failed to uncordon node:', error)
		}
	}

	const handleDrainNode = async () => {
		try {
			const result = await k8sService.drainNode(item.name)
			console.log('Node drain operation initiated:', result)
		} catch (error) {
			console.error('Failed to drain node:', error)
		}
	}

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Node Name", item.name],
		["Status", getNodeStatusBadge(item.status)],
		["Roles", <div className="text-sm">{item.roles || "worker"}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["Kubernetes Version", <div className="font-mono text-sm">{item.version}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!nodeDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full node spec and status
		if (nodeDetails.metadata?.labels) {
			const labelCount = Object.keys(nodeDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (nodeDetails.metadata?.annotations) {
			const annotationCount = Object.keys(nodeDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (nodeDetails.summary?.nodeInfo) {
			const nodeInfo = nodeDetails.summary.nodeInfo
			if (nodeInfo.osImage) {
				additionalRows.push(["OS Image", <div className="font-mono text-sm">{nodeInfo.osImage}</div>])
			}
			if (nodeInfo.containerRuntimeVersion) {
				additionalRows.push(["Container Runtime", <div className="font-mono text-sm">{nodeInfo.containerRuntimeVersion}</div>])
			}
			if (nodeInfo.kubeletVersion) {
				additionalRows.push(["Kubelet Version", <div className="font-mono text-sm">{nodeInfo.kubeletVersion}</div>])
			}
		}

		if (nodeDetails.summary?.capacity) {
			const capacity = nodeDetails.summary.capacity
			if (capacity.cpu) {
				additionalRows.push(["CPU Capacity", <div className="font-mono text-sm">{capacity.cpu}</div>])
			}
			if (capacity.memory) {
				additionalRows.push(["Memory Capacity", <div className="font-mono text-sm">{capacity.memory}</div>])
			}
		}

		if (nodeDetails.summary?.allocatable) {
			const allocatable = nodeDetails.summary.allocatable
			if (allocatable.cpu) {
				additionalRows.push(["Allocatable CPU", <div className="font-mono text-sm">{allocatable.cpu}</div>])
			}
			if (allocatable.memory) {
				additionalRows.push(["Allocatable Memory", <div className="font-mono text-sm">{allocatable.memory}</div>])
			}
		}

		if (nodeDetails.summary?.status?.conditions) {
			const conditions = nodeDetails.summary.status.conditions
			const readyCondition = conditions.find((c: { type: string; status: string; reason?: string }) => c.type === 'Ready')
			if (readyCondition) {
				additionalRows.push(["Ready Condition", (
					<div className="flex items-center gap-2">
						<Badge
							variant="outline"
							className={`px-1.5 ${readyCondition.status === 'True'
								? 'text-green-600 border-border bg-transparent'
								: 'text-red-600 border-border bg-transparent'
								}`}
						>
							{readyCondition.status === 'True' ? 'Ready' : 'Not Ready'}
						</Badge>
						<span className="text-sm text-muted-foreground">{readyCondition.reason || 'N/A'}</span>
					</div>
				)])
			}
		}

		return additionalRows
	}, [nodeDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	// Determine if node is cordoned based on status
	const isCordoned = item.status.toLowerCase().includes('scheduling') || item.status.toLowerCase().includes('disabled')

	const actions = (
		<>
			{!isCordoned ? (
				<Button size="sm" className="w-full" onClick={handleCordonNode}>
					<IconPlayerPause className="size-4 mr-2" />
					Cordon Node
				</Button>
			) : (
				<Button size="sm" className="w-full" onClick={handleUncordonNode}>
					<IconRefresh className="size-4 mr-2" />
					Uncordon Node
				</Button>
			)}
			<Button variant="outline" size="sm" className="w-full" onClick={handleDrainNode}>
				<IconDroplets className="size-4 mr-2" />
				Drain Node
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace=""
				resourceKind="Node"
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
					// TODO: Implement node delete functionality (if applicable)
					console.log('Delete node:', item.name)
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
							{loading ? "Loading detailed node information..." : "Full node details and configuration"}
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
