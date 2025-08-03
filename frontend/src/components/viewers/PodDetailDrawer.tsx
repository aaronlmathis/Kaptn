import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconTerminal, IconEdit, IconCircleCheckFilled, IconLoader, IconAlertTriangle, IconX } from "@tabler/icons-react"
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
import { ResourceYamlEditor } from "@/components/ResourceYamlEditor"
import { usePodDetails } from "@/hooks/use-resource-details"

// Import the pod schema from the main dashboard component
import { podSchema } from "@/components/kubernetes-dashboard"

function getStatusBadge(status: string) {
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

interface PodDetailDrawerProps {
	item: z.infer<typeof podSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled PodDetailDrawer that can be opened programmatically.
 * This shows full pod details from the detailed API endpoint instead of the condensed version.
 */
export function PodDetailDrawer({ item, open, onOpenChange }: PodDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed pod information
	const { data: podDetails, loading, error } = usePodDetails(item.namespace, item.name, open)

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Pod Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Status", getStatusBadge(item.status)],
		["Node", item.node],
		["Ready", <div className="font-mono text-sm">{item.ready}</div>],
		["Restarts", <div className="font-mono text-sm">{item.restarts}</div>],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["CPU Usage", <div className="font-mono text-sm">{item.cpu}</div>],
		["Memory Usage", <div className="font-mono text-sm">{item.memory}</div>],
		["Container Image", <div className="font-mono text-sm break-all">{item.image || "Unknown"}</div>],
	]

	// Additional detailed rows from API (when available)
	const detailedRows: Array<[string, React.ReactNode]> = React.useMemo(() => {
		if (!podDetails) return []

		const additionalRows: Array<[string, React.ReactNode]> = []

		// Add additional details from the full pod spec and status
		if (podDetails.metadata?.labels) {
			const labelCount = Object.keys(podDetails.metadata.labels).length
			additionalRows.push(["Labels", <div className="text-sm">{labelCount} label(s)</div>])
		}

		if (podDetails.metadata?.annotations) {
			const annotationCount = Object.keys(podDetails.metadata.annotations).length
			additionalRows.push(["Annotations", <div className="text-sm">{annotationCount} annotation(s)</div>])
		}

		if (podDetails.spec?.serviceAccountName) {
			additionalRows.push(["Service Account", <div className="font-mono text-sm">{podDetails.spec.serviceAccountName}</div>])
		}

		if (podDetails.spec?.nodeName) {
			additionalRows.push(["Scheduled Node", <div className="font-mono text-sm">{podDetails.spec.nodeName}</div>])
		}

		if (podDetails.status?.podIP) {
			additionalRows.push(["Pod IP", <div className="font-mono text-sm">{podDetails.status.podIP}</div>])
		}

		if (podDetails.status?.hostIP) {
			additionalRows.push(["Host IP", <div className="font-mono text-sm">{podDetails.status.hostIP}</div>])
		}

		if (podDetails.spec?.containers) {
			const containerCount = podDetails.spec.containers.length
			additionalRows.push(["Containers", <div className="text-sm">{containerCount} container(s)</div>])
		}

		if (podDetails.status?.conditions) {
			const readyCondition = podDetails.status.conditions.find((c: any) => c.type === 'Ready')
			if (readyCondition) {
				additionalRows.push(["Ready Condition", (
					<div className="text-sm">
						{readyCondition.status === 'True' ? '✅' : '❌'} {readyCondition.reason || 'N/A'}
					</div>
				)])
			}
		}

		return additionalRows
	}, [podDetails])

	// Combine basic and detailed rows
	const allRows = [...basicRows, ...detailedRows]

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
		<Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				{/* Header with title/description */}
				<DrawerHeader className="flex justify-between items-start">
					<div className="space-y-1">
						<DrawerTitle>{item.name}</DrawerTitle>
						<DrawerDescription>
							{loading ? "Loading detailed pod information..." : "Full pod details and configuration"}
						</DrawerDescription>
					</div>
				</DrawerHeader>

				{/* Content area with scrolling */}
				<div className="overflow-y-auto px-6 text-sm">
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

				{/* Footer with actions */}
				<DrawerFooter className="flex flex-col gap-2 px-6 pb-6 pt-4">
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
