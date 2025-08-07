import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconTrash } from "@tabler/icons-react"
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
import { useResourceQuotaDetails } from "@/hooks/use-resource-details"
import { type DashboardResourceQuota } from "@/lib/k8s-api"

interface ResourceQuotaDetailDrawerProps {
	item: DashboardResourceQuota
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled ResourceQuotaDetailDrawer that can be opened programmatically.
 * This shows full resource quota details from the detailed API endpoint instead of the condensed version.
 */
export function ResourceQuotaDetailDrawer({ item, open, onOpenChange }: ResourceQuotaDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Fetch detailed resource quota information
	const { data: resourceQuotaDetails, loading, error } = useResourceQuotaDetails(item.namespace, item.name, open)

	const handleDelete = () => {
		// TODO: Implement delete functionality
		console.log('Delete resource quota:', item.name, 'in namespace:', item.namespace)
		onOpenChange(false)
	}

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["Resource Quota Name", item.name],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.namespace}
			</Badge>
		)],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["Hard Limits", (
			<div className="space-y-1">
				{item.hardLimits.map((limit, index) => (
					<div key={index} className="font-mono text-sm">
						{limit.name}: {limit.limit} (used: {limit.used})
					</div>
				))}
			</div>
		)],
		["Used Resources", (
			<div className="space-y-1">
				{item.usedResources.map((resource, index) => (
					<div key={index} className="font-mono text-sm">
						{resource.name}: {resource.quantity}
					</div>
				))}
			</div>
		)],
	]

	// Extended rows from detailed data (only when loaded)
	const detailedRows: Array<[string, React.ReactNode]> = []
	if (resourceQuotaDetails && !loading && !error) {
		detailedRows.push(
			["Creation Timestamp", <div className="font-mono text-sm">{resourceQuotaDetails.summary.creationTimestamp}</div>],
			["Labels Count", <div className="font-mono text-sm">{resourceQuotaDetails.summary.labelsCount}</div>],
			["Annotations Count", <div className="font-mono text-sm">{resourceQuotaDetails.summary.annotationsCount}</div>]
		)

		if (resourceQuotaDetails.summary.labels && Object.keys(resourceQuotaDetails.summary.labels).length > 0) {
			detailedRows.push([
				"Labels",
				<div className="space-y-1">
					{Object.entries(resourceQuotaDetails.summary.labels).map(([key, value]) => (
						<div key={key} className="font-mono text-sm">
							{key}: {value}
						</div>
					))}
				</div>
			])
		}

		if (resourceQuotaDetails.summary.annotations && Object.keys(resourceQuotaDetails.summary.annotations).length > 0) {
			detailedRows.push([
				"Annotations",
				<div className="space-y-1">
					{Object.entries(resourceQuotaDetails.summary.annotations).map(([key, value]) => (
						<div key={key} className="font-mono text-sm break-all">
							{key}: {value}
						</div>
					))}
				</div>
			])
		}
	}

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="max-h-[96%]">
				<div className="mx-auto w-full max-w-4xl">
					<DrawerHeader>
						<DrawerTitle className="text-left">Resource Quota Details</DrawerTitle>
						<DrawerDescription className="text-left">
							Detailed information for resource quota <code className="text-sm bg-muted px-1 rounded">{item.name}</code> in namespace <code className="text-sm bg-muted px-1 rounded">{item.namespace}</code>
						</DrawerDescription>
					</DrawerHeader>
					<div className="px-4 pb-0">
						<ScrollArea className={isMobile ? "h-[50vh]" : "h-[60vh]"}>
							{loading && (
								<div className="flex items-center justify-center py-8">
									<div className="text-sm text-muted-foreground">Loading detailed information...</div>
								</div>
							)}
							{error && (
								<div className="flex items-center justify-center py-8">
									<div className="text-sm text-red-600">Error loading details: {error}</div>
								</div>
							)}
							<DetailRows rows={basicRows.concat(detailedRows)} />
							{loading && (
								<div className="flex items-center justify-center py-4 text-muted-foreground">
									Loading detailed information...
								</div>
							)}
							<ScrollBar orientation="vertical" />
						</ScrollArea>
					</div>
					<DrawerFooter>
						<div className="flex gap-2">
							<ResourceYamlEditor
								resourceName={item.name}
								namespace={item.namespace}
								resourceKind="ResourceQuota"
							>
								<Button variant="outline" className="flex-1">
									<IconEdit className="size-4 mr-2" />
									Edit YAML
								</Button>
							</ResourceYamlEditor>
							<Button
								variant="destructive"
								className="flex-1"
								onClick={handleDelete}
							>
								<IconTrash className="size-4 mr-2" />
								Delete Resource Quota
							</Button>
						</div>
						<DrawerClose asChild>
							<Button variant="outline">Close</Button>
						</DrawerClose>
					</DrawerFooter>
				</div>
			</DrawerContent>
		</Drawer>
	)
}
