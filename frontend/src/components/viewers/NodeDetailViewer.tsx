import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEye, IconEdit, IconRefresh, IconCircleCheckFilled, IconAlertTriangle } from "@tabler/icons-react"
import { ResourceDetailDrawer, DetailRows } from "@/components/ResourceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"

// Import the node schema from the main dashboard component
import { nodeSchema } from "@/components/kubernetes-dashboard"

function getNodeStatusBadge(status: string) {

	switch (status) {
		case "Ready":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					{status}
				</Badge>
			)
		case "NotReady":
			return (
				<Badge variant="outline" className="text-red-600 border-border bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 text-red-600 mr-1" />
					{status}
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

interface NodeDetailViewerProps {
	item: z.infer<typeof nodeSchema>
	trigger?: React.ReactNode
}

/**
 * NodeDetailViewer displays detailed information about a Node in a drawer.
 * Provides actions for cordon/uncordon, drain, and YAML editing.
 */
export function NodeDetailViewer({ item, trigger }: NodeDetailViewerProps) {
	const defaultTrigger = (
		<Button variant="link" className="text-foreground w-fit px-0 text-left">
			{item.name}
		</Button>
	)

	const rows: Array<[string, React.ReactNode]> = [
		["Node Name", item.name],
		["Status", getNodeStatusBadge(item.status)],
		["Roles", item.roles],
		["Kubernetes Version", item.version],
		["CPU Capacity", item.cpu],
		["Memory Capacity", item.memory],
		["Age", item.age],
	]

	const actions = (
		<>
			<Button size="sm" className="w-full">
				<IconRefresh className="size-4 mr-2" />
				Cordon Node
			</Button>
			<Button variant="outline" size="sm" className="w-full">
				<IconEdit className="size-4 mr-2" />
				Drain Node
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace="" // Nodes are cluster-scoped
				resourceKind="Node"
			>
				<Button variant="outline" size="sm" className="w-full">
					<IconEdit className="size-4 mr-2" />
					Edit YAML
				</Button>
			</ResourceYamlEditor>
		</>
	)

	return (
		<ResourceDetailDrawer
			trigger={trigger || defaultTrigger}
			title={item.name}
			description="Node details and configuration"
			actions={actions}
		>
			<DetailRows rows={rows} />
		</ResourceDetailDrawer>
	)
}
