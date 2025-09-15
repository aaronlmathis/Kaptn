"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { IconCopy } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

interface CopyTooltipProps {
	/**
	 * The text content to display in the tooltip and copy to clipboard
	 */
	message: string
	/**
	 * The trigger element (usually the truncated text)
	 */
	children: React.ReactNode
	/**
	 * Optional custom copy text (defaults to message)
	 */
	copyText?: string
	/**
	 * Tooltip positioning
	 */
	side?: "top" | "right" | "bottom" | "left"
	/**
	 * Maximum width of the tooltip content
	 */
	maxWidth?: string
	/**
	 * Additional CSS classes for the tooltip content
	 */
	contentClassName?: string
	/**
	 * Additional CSS classes for the message display
	 */
	messageClassName?: string
	/**
	 * Time in milliseconds to show the success state (default: 2000)
	 */
	successDuration?: number
	/**
	 * Custom copy button title
	 */
	copyButtonTitle?: string
	/**
	 * Whether to show the copy button (default: true)
	 */
	showCopyButton?: boolean

}

export function CopyTooltip({
	message,
	children,
	copyText,
	side = "top",
	maxWidth = "800px",
	contentClassName,
	messageClassName,
	successDuration = 2000,
	copyButtonTitle = "Copy message",
	showCopyButton = true
}: CopyTooltipProps) {
	const handleCopy = React.useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			const textToCopy = copyText || message
			navigator.clipboard.writeText(textToCopy)

			const button = e.currentTarget
			const icon = button.querySelector('svg')
			if (icon) {
				// Store original icon HTML
				const originalIconHTML = icon.innerHTML
				// Change to checkmark and green color
				icon.innerHTML = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 12l5 5l10 -10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
				button.className = button.className.replace('text-muted-foreground hover:text-foreground', 'text-green-600 hover:text-green-700')
				// Reset after specified duration
				setTimeout(() => {
					icon.innerHTML = originalIconHTML
					button.className = button.className.replace('text-green-600 hover:text-green-700', 'text-muted-foreground hover:text-foreground')
				}, successDuration)
			}
		},
		[message, copyText, successDuration]
	)

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				{children}
			</TooltipTrigger>
			<TooltipContent
				side={side}
				className={cn(
					"bg-popover text-popover-foreground/80 border border-border p-4",
					contentClassName
				)}
				style={{ maxWidth }}
			>
				<div className="relative">
					{showCopyButton && (
						<Button
							variant="ghost"
							size="icon"
							className="absolute top-0 right-0 h-6 w-6 text-muted-foreground hover:text-foreground transition-colors"
							onClick={handleCopy}
							title={copyButtonTitle}
						>
							<IconCopy className="h-3 w-3" />
						</Button>
					)}
					<div
						className={cn(
							"font-mono text-xs whitespace-pre-wrap break-words leading-relaxed",
							showCopyButton && "pr-8",
							messageClassName
						)}
					>
						{message}
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	)
}
