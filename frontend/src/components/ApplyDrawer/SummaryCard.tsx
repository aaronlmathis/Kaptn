"use client"

import React from 'react'
import { IconCheck, IconAlertTriangle, IconX, IconEye, IconEdit, IconTerminal } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { EnhancedResourceResult, ValidationError, ApplySummary, DangerousAction } from '@/hooks/useApplyYaml'

interface SummaryCardProps {
	resources: EnhancedResourceResult[]
	errors: ValidationError[]
	warnings: string[]
	summary?: ApplySummary
	dangerousActions?: DangerousAction[]
	isDryRun?: boolean
	className?: string
}

/**
 * SummaryCard component displays parsed YAML resources, validation results, and operation summary.
 * 
 * Features:
 * - Resource metadata display (kind, name, namespace)
 * - Status indicators (success, error, warning)
 * - Validation error details
 * - Dangerous action warnings
 * - Apply operation summary
 * - Links to resource views
 */
export function SummaryCard({
	resources,
	errors,
	warnings,
	summary,
	dangerousActions,
	isDryRun = false,
	className,
}: SummaryCardProps) {
	const hasResources = resources.length > 0
	const hasErrors = errors.length > 0
	const hasWarnings = warnings.length > 0
	const hasDangerousActions = dangerousActions && dangerousActions.length > 0

	if (!hasResources && !hasErrors && !hasWarnings) {
		return null
	}

	return (
		<div className={cn("space-y-4", className)}>
			{/* Summary Statistics */}
			{summary && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-lg">
							{isDryRun ? 'Dry Run Summary' : 'Apply Summary'}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
							<div className="text-center">
								<div className="text-2xl font-bold text-primary">{summary.totalResources}</div>
								<div className="text-sm text-muted-foreground">Total Resources</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-green-600">{summary.createdCount}</div>
								<div className="text-sm text-muted-foreground">
									{isDryRun ? 'Would Create' : 'Created'}
								</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-blue-600">{summary.updatedCount}</div>
								<div className="text-sm text-muted-foreground">
									{isDryRun ? 'Would Update' : 'Updated'}
								</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-red-600">{summary.errorCount}</div>
								<div className="text-sm text-muted-foreground">Errors</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Dangerous Actions Warning */}
			{hasDangerousActions && (
				<Alert variant="destructive">
					<IconAlertTriangle className="h-4 w-4" />
					<AlertDescription>
						<div className="space-y-2">
							<p className="font-medium">Potentially dangerous operations detected:</p>
							<ul className="space-y-1">
								{dangerousActions?.map((action, index) => (
									<li key={index} className="text-sm">
										<span className="font-medium">{action.resource}:</span> {action.description}
										<Badge
											variant={action.risk === 'critical' ? 'destructive' : 'secondary'}
											className="ml-2"
										>
											{action.risk}
										</Badge>
									</li>
								))}
							</ul>
						</div>
					</AlertDescription>
				</Alert>
			)}

			{/* Validation Errors */}
			{hasErrors && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-lg text-red-600 flex items-center gap-2">
							<IconX className="size-5" />
							Validation Errors ({errors.length})
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{errors.map((error, index) => (
								<Alert key={index} variant="destructive">
									<AlertDescription>
										<div className="space-y-1">
											<p className="font-medium">{error.message}</p>
											{error.resource && (
												<p className="text-sm">Resource: {error.resource}</p>
											)}
											{error.field && (
												<p className="text-sm">Field: {error.field}</p>
											)}
											{error.line && (
												<p className="text-sm">Line: {error.line}</p>
											)}
											{error.suggestion && (
												<p className="text-sm text-blue-600">Suggestion: {error.suggestion}</p>
											)}
										</div>
									</AlertDescription>
								</Alert>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Warnings */}
			{hasWarnings && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-lg text-yellow-600 flex items-center gap-2">
							<IconAlertTriangle className="size-5" />
							Warnings ({warnings.length})
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{warnings.map((warning, index) => (
								<Alert key={index}>
									<AlertDescription>{warning}</AlertDescription>
								</Alert>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Resources List */}
			{hasResources && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-lg">
							Resources ({resources.length})
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{resources.map((resource, index) => (
								<div key={index} className="border rounded-lg p-3">
									<div className="flex items-start justify-between gap-3">
										<div className="flex-1 space-y-2">
											{/* Resource Header */}
											<div className="flex items-center gap-2">
												<StatusIcon status={resource.status} />
												<h4 className="font-medium">
													{resource.kind}/{resource.name}
												</h4>
												<ActionBadge action={resource.action} />
											</div>

											{/* Resource Details */}
											<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm text-muted-foreground">
												<div>
													<span className="font-medium">API Version:</span> {resource.apiVersion}
												</div>
												{resource.namespace && (
													<div>
														<span className="font-medium">Namespace:</span> {resource.namespace}
													</div>
												)}
												{resource.source && (
													<div>
														<span className="font-medium">Source:</span> {resource.source}
													</div>
												)}
											</div>

											{/* Error Message */}
											{resource.error && (
												<Alert variant="destructive">
													<AlertDescription>{resource.error}</AlertDescription>
												</Alert>
											)}
										</div>

										{/* Resource Actions */}
										{resource.links && resource.links.length > 0 && (
											<div className="flex gap-1">
												{resource.links.map((link, linkIndex) => (
													<Button
														key={linkIndex}
														variant="outline"
														size="sm"
														asChild
														className="h-8"
													>
														<a href={link.url} target="_blank" rel="noopener noreferrer">
															<LinkIcon type={link.type} />
															<span className="sr-only">{link.text}</span>
														</a>
													</Button>
												))}
											</div>
										)}
									</div>

									{/* Resource Metadata */}
									{resource.metadata && (Object.keys(resource.metadata.labels || {}).length > 0 ||
										Object.keys(resource.metadata.annotations || {}).length > 0) && (
											<>
												<Separator className="my-3" />
												<div className="space-y-2">
													{resource.metadata.labels && Object.keys(resource.metadata.labels).length > 0 && (
														<div>
															<p className="text-sm font-medium mb-1">Labels:</p>
															<div className="flex flex-wrap gap-1">
																{Object.entries(resource.metadata.labels).map(([key, value]) => (
																	<Badge key={key} variant="outline" className="text-xs">
																		{key}={value}
																	</Badge>
																))}
															</div>
														</div>
													)}
													{resource.metadata.annotations && Object.keys(resource.metadata.annotations).length > 0 && (
														<div>
															<p className="text-sm font-medium mb-1">Annotations:</p>
															<div className="flex flex-wrap gap-1">
																{Object.entries(resource.metadata.annotations).slice(0, 3).map(([key, value]) => (
																	<Badge key={key} variant="secondary" className="text-xs">
																		{key}={value.length > 20 ? value.substring(0, 20) + '...' : value}
																	</Badge>
																))}
																{Object.keys(resource.metadata.annotations).length > 3 && (
																	<Badge variant="secondary" className="text-xs">
																		+{Object.keys(resource.metadata.annotations).length - 3} more
																	</Badge>
																)}
															</div>
														</div>
													)}
												</div>
											</>
										)}
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
}

function StatusIcon({ status }: { status: string }) {
	switch (status) {
		case 'success':
			return <IconCheck className="size-4 text-green-600" />
		case 'error':
			return <IconX className="size-4 text-red-600" />
		case 'warning':
			return <IconAlertTriangle className="size-4 text-yellow-600" />
		default:
			return <IconCheck className="size-4 text-muted-foreground" />
	}
}

function ActionBadge({ action }: { action: string }) {
	const getVariant = (action: string) => {
		switch (action) {
			case 'created':
			case 'would-create':
				return 'default'
			case 'updated':
			case 'would-update':
				return 'secondary'
			case 'unchanged':
				return 'outline'
			case 'error':
				return 'destructive'
			default:
				return 'outline'
		}
	}

	return (
		<Badge variant={getVariant(action)} className="text-xs">
			{action.replace('-', ' ')}
		</Badge>
	)
}

function LinkIcon({ type }: { type: string }) {
	switch (type) {
		case 'view':
			return <IconEye className="size-3" />
		case 'edit':
			return <IconEdit className="size-3" />
		case 'logs':
			return <IconTerminal className="size-3" />
		default:
			return <IconEye className="size-3" />
	}
}
