"use client"

import * as React from "react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { IconAlertTriangle, IconLoader } from "@tabler/icons-react"

interface ActionConfirmationDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	description: string
	actionLabel: string
	variant?: "default" | "destructive"
	isExecuting?: boolean
	onConfirm: () => void | Promise<void>
	resources?: Array<{
		name: string
		namespace?: string
	}>
	warnings?: string[]
	safetyViolations?: Array<{
		rule: string
		description: string
		severity: "warning" | "error" | "critical"
	}>
}

export function ActionConfirmationDialog({
	open,
	onOpenChange,
	title,
	description,
	actionLabel,
	variant = "default",
	isExecuting = false,
	onConfirm,
	resources = [],
	warnings = [],
	safetyViolations = [],
}: ActionConfirmationDialogProps) {
	const handleConfirm = async () => {
		try {
			await onConfirm()
		} catch (error) {
			console.error('Action failed:', error)
			// Error handling is done by the caller
		}
	}

	const hasErrors = safetyViolations.some(v => v.severity === "error" || v.severity === "critical")

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						{variant === "destructive" && (
							<IconAlertTriangle className="size-5 text-red-600" />
						)}
						{title}
					</AlertDialogTitle>
					<AlertDialogDescription className="space-y-4">
						<div>{description}</div>

						{resources.length > 0 && (
							<div>
								<div className="text-sm font-medium mb-2">
									Affected resources ({resources.length}):
								</div>
								<div className="max-h-24 overflow-y-auto space-y-1">
									{resources.map((resource, index) => (
										<div key={index} className="flex items-center gap-2 text-xs">
											<Badge variant="outline" className="font-mono">
												{resource.name}
											</Badge>
											{resource.namespace && (
												<span className="text-muted-foreground">
													in {resource.namespace}
												</span>
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{warnings.length > 0 && (
							<div className="space-y-2">
								<div className="text-sm font-medium text-yellow-600">Warnings:</div>
								{warnings.map((warning, index) => (
									<div key={index} className="flex items-start gap-2 text-xs bg-yellow-50 p-2 rounded border border-yellow-200">
										<IconAlertTriangle className="size-3 text-yellow-600 mt-0.5 shrink-0" />
										<span className="text-yellow-800">{warning}</span>
									</div>
								))}
							</div>
						)}

						{safetyViolations.length > 0 && (
							<div className="space-y-2">
								<div className="text-sm font-medium text-red-600">Safety Concerns:</div>
								{safetyViolations.map((violation, index) => (
									<div key={index} className="flex items-start gap-2 text-xs bg-red-50 p-2 rounded border border-red-200">
										<IconAlertTriangle className={`size-3 mt-0.5 shrink-0 ${violation.severity === "critical" ? "text-red-600" :
												violation.severity === "error" ? "text-red-500" : "text-yellow-600"
											}`} />
										<div>
											<div className="font-medium text-red-800">{violation.rule}</div>
											<div className="text-red-700">{violation.description}</div>
										</div>
									</div>
								))}
							</div>
						)}

						{variant === "destructive" && (
							<div className="bg-red-50 p-3 rounded border border-red-200">
								<div className="text-sm font-medium text-red-800 mb-1">
									This action cannot be undone
								</div>
								<div className="text-xs text-red-700">
									Please make sure you want to proceed with this destructive action.
								</div>
							</div>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isExecuting}>
						Cancel
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleConfirm}
						disabled={isExecuting || hasErrors}
						className={variant === "destructive" ? "bg-red-600 hover:bg-red-700" : ""}
					>
						{isExecuting ? (
							<>
								<IconLoader className="size-4 mr-2 animate-spin" />
								Processing...
							</>
						) : (
							actionLabel
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
