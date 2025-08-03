import * as React from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { IconX } from "@tabler/icons-react"

interface ResourceDetailDrawerProps {
	trigger: React.ReactNode
	title: string
	description: string
	children: React.ReactNode
	actions?: React.ReactNode
}

/**
 * Generic ResourceDetailDrawer component that provides a consistent drawer interface
 * for viewing Kubernetes resource details. Supports both mobile (bottom drawer) and
 * desktop (right drawer) layouts.
 * 
 * @param trigger - The element that opens the drawer when clicked
 * @param title - The title to display in the drawer header
 * @param description - The description to display in the drawer header
 * @param children - The content to display in the drawer body
 * @param actions - Optional action buttons to display in the footer
 */
export function ResourceDetailDrawer({
	trigger,
	title,
	description,
	children,
	actions
}: ResourceDetailDrawerProps) {
	const isMobile = useIsMobile()

	return (
		<Drawer direction={isMobile ? "bottom" : "right"}>
			<DrawerTrigger asChild>
				{trigger}
			</DrawerTrigger>

			<DrawerContent>
				{/* Header with title/description */}
				<DrawerHeader className="flex justify-between items-start">
					<div className="space-y-1">
						<DrawerTitle>{title}</DrawerTitle>
						<DrawerDescription>{description}</DrawerDescription>
					</div>
				</DrawerHeader>

				{/* Content area with scrolling */}
				<div className="overflow-y-auto px-6 text-sm">
					{children}
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

interface DetailRowsProps {
	rows: Array<[string, React.ReactNode]>
}

/**
 * Component for displaying key-value pairs in a consistent format
 * within the resource detail drawer.
 */
export function DetailRows({ rows }: DetailRowsProps) {
	return (
		<dl className="divide-y divide-border rounded-md bg-muted/5">
			{rows.map(([label, value], idx) => (
				<div key={idx} className="flex items-center justify-between px-4 py-3">
					<dt className="font-medium text-muted-foreground">{label}</dt>
					<dd className="text-right">{value}</dd>
				</div>
			))}
		</dl>
	)
}
