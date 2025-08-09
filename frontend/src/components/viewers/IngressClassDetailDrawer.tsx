import * as React from "react"
import { z } from "zod"
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
import { ingressClassSchema } from "@/lib/schemas/ingress-class"

interface IngressClassDetailDrawerProps {
	item: z.infer<typeof ingressClassSchema>
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * Controlled IngressClassDetailDrawer that can be opened programmatically.
 * This shows full ingress class details from the summary data.
 */
export function IngressClassDetailDrawer({ item, open, onOpenChange }: IngressClassDetailDrawerProps) {
	const isMobile = useIsMobile()

	// Basic rows from summary data (available immediately)
	const basicRows: Array<[string, React.ReactNode]> = [
		["IngressClass Name", item.name],
		["Age", <div className="font-mono text-sm">{item.age}</div>],
		["Controller", <div className="text-sm font-mono">{item.controller}</div>],
		["Default Class", (
			<Badge variant={item.isDefault ? "default" : "outline"} className={item.isDefault ? "text-green-600" : "text-muted-foreground"}>
				{item.isDefault ? "Yes" : "No"}
			</Badge>
		)],
		["Parameters Kind", (
			<div className="text-sm">
				{item.parametersKind ? (
					<div className="font-mono text-xs">{item.parametersKind}</div>
				) : (
					<span className="text-muted-foreground">No parameters kind</span>
				)}
			</div>
		)],
		["Parameters Name", (
			<div className="text-sm">
				{item.parametersName ? (
					<div className="font-mono text-xs">{item.parametersName}</div>
				) : (
					<span className="text-muted-foreground">No parameters name</span>
				)}
			</div>
		)],
	]

	const actions = (
		<>
			<ResourceYamlEditor
				resourceName={item.name}
				namespace="" // IngressClass is cluster-scoped
				resourceKind="IngressClass"
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
					// TODO: Implement ingress class restart functionality
					console.log('Restart ingress class:', item.name)
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
							IngressClass configuration and details
						</DrawerDescription>
					</div>
				</DrawerHeader>

				{/* Content area with styled scrolling */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 text-sm">
						<DetailRows rows={basicRows} />
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
