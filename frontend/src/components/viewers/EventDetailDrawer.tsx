import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconCalendarEvent, IconAlertTriangle, IconInfoCircle, IconClock } from "@tabler/icons-react"
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

// Helper function to get event level badge with appropriate styling
function getEventLevelBadge(level: string) {
	switch (level.toLowerCase()) {
		case "warning":
			return (
				<Badge variant="outline" className="text-orange-600 border-orange-600 bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 fill-orange-600 mr-1" />
					{level}
				</Badge>
			)
		case "error":
			return (
				<Badge variant="outline" className="text-red-600 border-red-600 bg-transparent px-1.5">
					<IconAlertTriangle className="size-3 fill-red-600 mr-1" />
					{level}
				</Badge>
			)
		case "normal":
		case "info":
			return (
				<Badge variant="outline" className="text-blue-600 border-blue-600 bg-transparent px-1.5">
					<IconInfoCircle className="size-3 fill-blue-600 mr-1" />
					{level}
				</Badge>
			)
		default:
			return (
				<Badge variant="outline" className="text-muted-foreground border-border bg-transparent px-1.5">
					{level}
				</Badge>
			)
	}
}

interface EventDetailDrawerProps {
	event: {
		id: number;
		name: string;
		namespace: string;
		type: string;
		reason: string;
		message: string;
		involvedObject: string;
		source: string;
		count: number;
		age: string;
		level: string;
	} | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * Controlled EventDetailDrawer that shows full event details.
 */
export function EventDetailDrawer({ event, open, onOpenChange }: EventDetailDrawerProps) {
	const isMobile = useIsMobile()

	if (!event) {
		return null
	}

	// Format rows for consistent display using DetailRows component
	const detailRows: Array<[string, React.ReactNode]> = [
		["Event Name", <div className="font-mono text-sm">{event.name}</div>],
		["Namespace", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{event.namespace}
			</Badge>
		)],
		["Type", (
			<Badge variant="outline" className="text-muted-foreground px-1.5">
				{event.type}
			</Badge>
		)],
		["Level", getEventLevelBadge(event.level)],
		["Reason", <div className="font-mono text-sm">{event.reason}</div>],
		["Count", <div className="font-mono text-sm">{event.count}</div>],
		["Age", (
			<div className="flex items-center gap-2">
				<IconClock className="size-4 text-muted-foreground" />
				<div className="font-mono text-sm">{event.age}</div>
			</div>
		)],
		["Source", <div className="font-mono text-sm">{event.source}</div>],
		["Involved Object", <div className="font-mono text-sm">{event.involvedObject}</div>],
	]

	const actions = (
		<>
			<Button
				size="sm"
				className="w-full"
				onClick={() => {
					// TODO: Implement event filtering by this object
					console.log('Filter events for object:', event.involvedObject)
				}}
			>
				<IconInfoCircle className="size-4 mr-2" />
				Filter by Object
			</Button>
		</>
	)

	return (
		<Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="flex flex-col h-full">
				{/* Header with title/description */}
				<DrawerHeader className="flex justify-between items-start flex-shrink-0">
					<div className="space-y-1">
						<DrawerTitle className="flex items-center gap-2">
							<IconCalendarEvent className="size-5 text-blue-600" />
							{event.name}
						</DrawerTitle>
						<DrawerDescription>
							Event details and information
						</DrawerDescription>
					</div>
				</DrawerHeader>

				{/* Content area with styled scrolling */}
				<ScrollArea className="flex-1 min-h-0">
					<div className="px-6 text-sm space-y-6">
						<DetailRows rows={detailRows} />

						{/* Message section with special formatting */}
						<div className="space-y-3">
							<h4 className="text-sm font-medium text-muted-foreground">Message</h4>
							<div className="bg-muted p-4 rounded-md border">
								<p className="text-sm whitespace-pre-wrap leading-relaxed">{event.message}</p>
							</div>
						</div>
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
