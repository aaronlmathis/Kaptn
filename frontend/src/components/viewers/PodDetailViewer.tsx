import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconTerminal, IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle } from "@tabler/icons-react"
import { ResourceDetailDrawer, DetailRows } from "@/components/ResourceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"

// Import the pod schema and status badge function from the main dashboard component
import { podSchema } from "@/components/kubernetes-dashboard"

function getStatusBadge(status: string) {
	// We'll reuse the same status badge logic from the main component

	switch (status) {
		case "Running":
			return (
				<Badge variant="outline" className="text-green-600 border-border bg-transparent px-1.5">
					<IconCircleCheckFilled className="size-3 fill-green-600 mr-1" />
					{status}
				</Badge>
			)
		case "Pending":
			return (
				<Badge variant="outline" className="text-yellow-600 border-border bg-transparent px-1.5">
					<IconLoader className="size-3 text-yellow-600 mr-1" />
					{status}
				</Badge>
			)
		case "CrashLoopBackOff":
		case "Failed":
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

interface PodDetailViewerProps {
	item: z.infer<typeof podSchema>
	trigger?: React.ReactNode
}

/**
 * PodDetailViewer displays detailed information about a Pod in a drawer.
 * Provides actions for exec shell and YAML editing.
 */
export function PodDetailViewer({ item, trigger }: PodDetailViewerProps) {
	const defaultTrigger = (
		<Button variant="link" className="text-foreground w-fit px-0 text-left">
			{item.name}
		</Button>
	)

	const rows: Array<[string, React.ReactNode]> = [
		["Pod Name", item.name],
		["Namespace", item.namespace],
		["Status", getStatusBadge(item.status)],
		["Node", item.node],
		["Ready", item.ready],
		["Restarts", item.restarts],
		["Age", item.age],
		["CPU Usage", item.cpu],
		["Memory Usage", item.memory],
		["Container Image", item.image || "Unknown"],
	]

	const actions = (
		<>
			<Button size="sm" className="w-full">
				<IconTerminal className="size-4 mr-2" />
				Exec Shell
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="Pod"
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
			description="Pod details and configuration"
			actions={actions}
		>
			<DetailRows rows={rows} />
		</ResourceDetailDrawer>
	)
}
