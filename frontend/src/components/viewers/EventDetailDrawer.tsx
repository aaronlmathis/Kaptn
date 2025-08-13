import * as React from "react"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

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

export function EventDetailDrawer({ event, open, onOpenChange }: EventDetailDrawerProps) {
	if (!event) {
		return null;
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-[600px] sm:max-w-[600px]">
				<SheetHeader>
					<SheetTitle>Event Details</SheetTitle>
				</SheetHeader>
				<ScrollArea className="h-[calc(100vh-100px)] mt-4">
					<div className="space-y-6">
						{/* Basic Information */}
						<div>
							<h3 className="text-lg font-semibold mb-3">Basic Information</h3>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="text-sm font-medium text-muted-foreground">Name</label>
									<p className="text-sm font-mono">{event.name}</p>
								</div>
								<div>
									<label className="text-sm font-medium text-muted-foreground">Namespace</label>
									<Badge variant="outline" className="text-xs">{event.namespace}</Badge>
								</div>
								<div>
									<label className="text-sm font-medium text-muted-foreground">Type</label>
									<Badge variant="outline" className="text-xs">{event.type}</Badge>
								</div>
								<div>
									<label className="text-sm font-medium text-muted-foreground">Level</label>
									<Badge
										variant="outline"
										className={`text-xs ${event.level === 'Warning' ? 'text-orange-600 border-orange-600' :
												event.level === 'Error' ? 'text-red-600 border-red-600' :
													'text-blue-600 border-blue-600'
											}`}
									>
										{event.level}
									</Badge>
								</div>
								<div>
									<label className="text-sm font-medium text-muted-foreground">Reason</label>
									<p className="text-sm font-mono">{event.reason}</p>
								</div>
								<div>
									<label className="text-sm font-medium text-muted-foreground">Count</label>
									<p className="text-sm font-mono">{event.count}</p>
								</div>
								<div>
									<label className="text-sm font-medium text-muted-foreground">Age</label>
									<p className="text-sm font-mono">{event.age}</p>
								</div>
								<div>
									<label className="text-sm font-medium text-muted-foreground">Source</label>
									<p className="text-sm font-mono">{event.source}</p>
								</div>
							</div>
						</div>

						<Separator />

						{/* Involved Object */}
						<div>
							<h3 className="text-lg font-semibold mb-3">Involved Object</h3>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Object</label>
								<p className="text-sm font-mono">{event.involvedObject}</p>
							</div>
						</div>

						<Separator />

						{/* Message */}
						<div>
							<h3 className="text-lg font-semibold mb-3">Message</h3>
							<div className="bg-muted p-3 rounded-md">
								<p className="text-sm whitespace-pre-wrap">{event.message}</p>
							</div>
						</div>
					</div>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}
