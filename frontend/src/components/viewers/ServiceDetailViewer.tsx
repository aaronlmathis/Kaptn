import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEye, IconEdit } from "@tabler/icons-react"
import { ResourceDetailDrawer, DetailRows } from "@/components/ResourceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"

// Import the service schema from the main dashboard component
import { serviceSchema } from "@/components/kubernetes-dashboard"

interface ServiceDetailViewerProps {
	item: z.infer<typeof serviceSchema>
	trigger?: React.ReactNode
}

/**
 * ServiceDetailViewer displays detailed information about a Service in a drawer.
 * Provides actions for YAML editing and service management.
 */
export function ServiceDetailViewer({ item, trigger }: ServiceDetailViewerProps) {
	const defaultTrigger = (
		<Button variant="link" className="text-foreground w-fit px-0 text-left">
			{item.name}
		</Button>
	)

	const rows: Array<[string, React.ReactNode]> = [
		["Service Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Type", (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				{item.type}
			</Badge>
		)],
		["Cluster IP", <div className="font-mono text-sm">{item.clusterIP}</div>],
		["External IP", <div className="font-mono text-sm">{item.externalIP}</div>],
		["Ports", <div className="font-mono text-sm">{item.ports}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	const actions = (
		<>
			<Button size="sm" className="w-full">
				<IconEye className="size-4 mr-2" />
				View Endpoints
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="Service"
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
			description="Service details and configuration"
			actions={actions}
		>
			<DetailRows rows={rows} />
		</ResourceDetailDrawer>
	)
}
