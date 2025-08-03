import * as React from "react"
import { Button } from "@/components/ui/button"
import { IconEye } from "@tabler/icons-react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

interface DetailViewerTriggerProps {
	children: React.ReactNode
	variant?: "name" | "menuItem"
	className?: string
	onClick?: () => void
}

/**
 * A generic trigger component that can be used for both name cells and dropdown menu items
 * to open resource detail drawers. Provides consistent styling and behavior.
 */
export function DetailViewerTrigger({
	children,
	variant = "name",
	className,
	onClick
}: DetailViewerTriggerProps) {
	if (variant === "menuItem") {
		return (
			<DropdownMenuItem onClick={onClick} className={className}>
				<IconEye className="size-4 mr-2" />
				View Details
			</DropdownMenuItem>
		)
	}

	return (
		<Button
			variant="link"
			className={`text-foreground w-fit px-0 text-left ${className || ""}`}
			onClick={onClick}
		>
			{children}
		</Button>
	)
}
