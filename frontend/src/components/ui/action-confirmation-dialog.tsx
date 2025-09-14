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
import { buttonVariants } from "@/components/ui/button"

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
    // Optional type-to-confirm UX
    requireTextConfirm?: boolean
    confirmPrompt?: string
    confirmValue?: string
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
    requireTextConfirm = false,
    confirmPrompt,
    confirmValue,
}: ActionConfirmationDialogProps) {
    const [confirmText, setConfirmText] = React.useState("")
    React.useEffect(() => {
        // Clear text when dialog closes or target value changes
        if (!open) setConfirmText("")
    }, [open])
    const handleConfirm = async () => {
        try {
            await onConfirm()
        } catch (error) {
            console.error('Action failed:', error)
            // Error handling is done by the caller
        }
    }

	const hasErrors = safetyViolations.some(v => v.severity === "error" || v.severity === "critical")

    const needsConfirm = !!requireTextConfirm && !!(confirmValue && confirmValue.length > 0)
    const confirmOK = !needsConfirm || confirmText.trim() === (confirmValue ?? "")

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
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
									<div key={index} className="flex items-start gap-2 text-xs bg-transparent border border-yellow-600/20 p-2 rounded text-yellow-600">
										<IconAlertTriangle className="size-3 mt-0.5 shrink-0" />
										<span>{warning}</span>
									</div>
								))}
							</div>
						)}

						{safetyViolations.length > 0 && (
							<div className="space-y-2">
								<div className="text-sm font-medium text-destructive">Safety Concerns:</div>
								{safetyViolations.map((violation, index) => (
									<div key={index} className="flex items-start gap-2 text-xs bg-transparent border border-destructive/20 p-2 rounded text-destructive">
										<IconAlertTriangle className={`size-3 mt-0.5 shrink-0 ${violation.severity === "critical" ? "text-destructive" :
											violation.severity === "error" ? "text-destructive" : "text-yellow-600"
											}`} />
										<div>
											<div className="font-medium">{violation.rule}</div>
											<div className="opacity-90">{violation.description}</div>
										</div>
									</div>
								))}
							</div>
						)}

                        {variant === "destructive" && (
                            <div className="bg-transparent border border-destructive/20 p-3 rounded text-destructive">
                                <div className="text-sm font-medium mb-1">
                                    This action cannot be undone
                                </div>
                                <div className="text-xs opacity-90">
                                    Please make sure you want to proceed with this destructive action.
                                </div>
                            </div>
                        )}

                        {needsConfirm && (
                            <div className="space-y-2">
                                <div className="text-sm font-medium">{confirmPrompt || 'Type to confirm'}</div>
                                <input
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    placeholder={confirmValue}
                                    className="w-full px-2 py-1.5 border rounded bg-background"
                                />
                                {!confirmOK && (
                                    <div className="text-xs text-destructive">Confirmation text does not match.</div>
                                )}
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
                        disabled={isExecuting || hasErrors || !confirmOK}
                        className={variant === "destructive" ? buttonVariants({ variant: "destructive" }) : ""}
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
