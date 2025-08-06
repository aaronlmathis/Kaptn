import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconRefresh, IconLoader } from "@tabler/icons-react"
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
import { useDeploymentDetails } from "@/hooks/use-resource-details"

// Import the deployment schema from the main dashboard component
import { deploymentSchema } from "@/components/kubernetes-dashboard"

interface DeploymentDetailDrawerProps {
	item: z.infer<typeof deploymentSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled DeploymentDetailDrawer that can be opened programmatically.
 * This shows full deployment details from the detailed API endpoint instead of the condensed version.
 */
export function DeploymentDetailDrawer({ item, open, onOpenChange }: DeploymentDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed deployment information
	const { data: deploymentDetails, loading, error } = useDeploymentDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Deployment Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Ready Replicas", <div className="font-mono text-sm">{item.ready}</div>],
		["Up-to-date", <div className="font-mono text-sm">{item.upToDate}</div>],
		["Available", <div className="font-mono text-sm">{item.available}</div>],
		["Container Image", <div className="font-mono text-sm break-all">{item.image}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!deploymentDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full deployment spec and status
		if (deploymentDetails.metadata?.labels) {
			const labelCount = Object.keys(deploymentDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (deploymentDetails.metadata?.annotations) {
			const annotationCount = Object.keys(deploymentDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (deploymentDetails.spec?.replicas) {
			additionalRows.push(["Desired Replicas", <div className="font-mono text-sm">{deploymentDetails.spec.replicas}</div>])
		}

		if (deploymentDetails.spec?.strategy?.type) {
			additionalRows.push(["Update Strategy", <div className="font-mono text-sm">{deploymentDetails.spec.strategy.type}</div>])
		}

		if (deploymentDetails.spec?.selector?.matchLabels) {
			const selectorCount = Object.keys(deploymentDetails.spec.selector.matchLabels).length
			additionalRows.push(["Selector", <div className="text-sm">{selectorCount} label(s)</div>])
		}

		if (deploymentDetails.status?.conditions) {
			const availableCondition = deploymentDetails.status.conditions.find((c: any) => c.type === 'Available')
			if (availableCondition) {
				additionalRows.push(["Available Condition", (
					<div className="flex items-center gap-2">
						<Badge
							variant="outline"
							className={`px-1.5 ${availableCondition.status === 'True'
								? 'text-green-600 border-border bg-transparent'
								: 'text-red-600 border-border bg-transparent'
								}`}
						>
							{availableCondition.status === 'True' ? 'Available' : 'Not Available'}
						</Badge>
						<span className="text-sm text-muted-foreground">{availableCondition.reason || 'N/A'}</span>
					</div>
				)])
			}

			const progressingCondition = deploymentDetails.status.conditions.find((c: any) => c.type === 'Progressing')
			if (progressingCondition) {
				additionalRows.push(["Progressing Condition", (
					<div className="flex items-center gap-2">
						<Badge
							variant="outline"
							className={`px-1.5 ${progressingCondition.status === 'True'
								? 'text-green-600 border-border bg-transparent'
								: 'text-red-600 border-border bg-transparent'
								}`}
						>
							{progressingCondition.status === 'True' ? 'Progressing' : 'Not Progressing'}
						</Badge>
						<span className="text-sm text-muted-foreground">{progressingCondition.reason || 'N/A'}</span>
					</div>
				)])
			}
		}

		if (deploymentDetails.status?.observedGeneration) {
			additionalRows.push(["Observed Generation", <div className="font-mono text-sm">{deploymentDetails.status.observedGeneration}</div>])
		}

		return additionalRows
	}, [deploymentDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

	const actions = (
		<>
			<Button size="sm" className="w-full">
				<IconRefresh className="size-4 mr-2" />
				Scale Deployment
			</Button>
			<Button variant="destructive" size="sm" className="w-full">
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
		<Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="flex flex-col h-full">
				{/* Header with title/description */}
				<DrawerHeader className="flex justify-between items-start flex-shrink-0">
					<div className="space-y-1">
						<DrawerTitle>{item.name}</DrawerTitle>
						<DrawerDescription>
							{loading ? "Loading detailed deployment information..." : "Full deployment details and configuration"}
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
