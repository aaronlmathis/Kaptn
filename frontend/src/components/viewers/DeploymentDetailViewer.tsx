import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEye, IconEdit, IconRefresh } from "@tabler/icons-react"
import { ResourceDetailDrawer, DetailRows } from "@/components/ResourceDetailDrawer"
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"

// Import the deployment schema from the main dashboard component
import { deploymentSchema } from "@/components/kubernetes-dashboard"

interface DeploymentDetailViewerProps {
	item: z.infer<typeof deploymentSchema>
	trigger?: React.ReactNode
}

/**
 * DeploymentDetailViewer displays detailed information about a Deployment in a drawer.
 * Provides actions for scaling, restarting, and YAML editing.
 */
export function DeploymentDetailViewer({ item, trigger }: DeploymentDetailViewerProps) {
	const defaultTrigger = (
		<Button variant="link" className="text-foreground w-fit px-0 text-left">
			{item.name}
		</Button>
	)

	const rows: Array<[string, React.ReactNode]> = [
		["Deployment Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Ready Replicas", <div className="font-mono text-sm">{item.ready}</div>],
		["Up-to-date", <div className="font-mono text-sm">{item.upToDate}</div>],
		["Available", <div className="font-mono text-sm">{item.available}</div>],
		["Container Image", <div className="font-mono text-sm truncate max-w-48">{item.image}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	const actions = (
		<>
			<Button size="sm" className="w-full">
				<IconRefresh className="size-4 mr-2" />
				Scale Deployment
			</Button>
			<Button variant="outline" size="sm" className="w-full">
				<IconRefresh className="size-4 mr-2" />
				Restart Deployment
			</Button>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace={item.namespace}
				resourceKind="Deployment"
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
			description="Deployment details and configuration"
			actions={actions}
		>
			<DetailRows rows={rows} />
		</ResourceDetailDrawer>
	)
}
