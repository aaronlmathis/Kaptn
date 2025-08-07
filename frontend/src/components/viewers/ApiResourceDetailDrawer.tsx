import * as React from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconEdit, IconTrash, IconCircleCheckFilled } from "@tabler/icons-react"
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

// Import the API resource schema from the main data table component
import { apiResourceSchema } from "@/components/data_tables/ApiResourcesDataTable"

function getNamespacedBadge(namespaced: string) {
	if (namespaced === "Yes") {
		return (
			<Badge variant="outline" className="text-blue-600 border-border bg-transparent px-1.5">
				<IconCircleCheckFilled className="size-3 fill-blue-600 mr-1" />
				{namespaced}
			</Badge>
		)
	} else {
		return (
			<Badge variant="outline" className="text-gray-600 border-border bg-transparent px-1.5">
				{namespaced}
			</Badge>
		)
	}
}

interface ApiResourceDetailDrawerProps {
	item: z.infer<typeof apiResourceSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled ApiResourceDetailDrawer that can be opened programmatically.
 * This shows full API resource details including all metadata and configuration.
 */
export function ApiResourceDetailDrawer({ item, open, onOpenChange }: ApiResourceDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Rows for API resource details
	const allRows: Array<[string, React.ReactNode]> = [
		["Resource Name", item.name],
		["Singular Name", <div className="font-mono text-sm">{item.singularName}</div>],
		["Short Names", <div className="font-mono text-sm">{item.shortNames || '<none>'}</div>],
		["Kind", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{item.kind}
			</Badge>
		)],
		["Group", <div className="text-sm">{item.group}</div>],
		["Version", <div className="font-mono text-sm">{item.version}</div>],
		["API Version", <div className="font-mono text-sm">{item.apiVersion}</div>],
		["Namespaced", getNamespacedBadge(item.namespaced)],
		["Categories", <div className="text-sm">{item.categories || '<none>'}</div>],
		["Supported Verbs", <div className="font-mono text-sm break-all">{item.verbs}</div>],
	]

	const handleDeleteAPIResource = () => {
		// TODO: Implement API resource deletion functionality
		console.log('Delete API resource:', item.name)
		onOpenChange(false)
	}

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace=""
				resourceKind="APIResource"
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
				onClick={handleDeleteAPIResource}
			>
				<IconTrash className="size-4 mr-2" />
				Delete API Resource
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
							Kubernetes API resource details and configuration
						</DrawerDescription>
					</div>
				</DrawerHeader>

				{/* Content area with styled scrolling */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 text-sm">
						<DetailRows rows={allRows} />
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
