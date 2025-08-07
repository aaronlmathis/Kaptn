"use client"

import * as React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as yaml from 'js-yaml'
import { IconFileUpload, IconX, IconPlayerPlay, IconEye, IconRefresh, IconAlertTriangle } from "@tabler/icons-react"
import { useIsMobile } from "@/hooks/use-mobile"
import { useNamespace } from "@/contexts/namespace-context"
import { useApplyYaml } from "@/hooks/useApplyYaml"
import { toast } from "sonner"

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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

import { YamlEditor } from "./YamlEditor"
import { UploadDialog, type UploadedFile } from "./UploadDialog"
import { SummaryCard } from "./SummaryCard"
import { applyOptionsSchema, type ApplyOptionsFormData, defaultApplyOptions } from "./optionsSchema"

interface ApplyDrawerProps {
	trigger?: React.ReactNode
}

interface YamlTab {
	id: string
	title: string
	content: string
	source: 'inline' | 'file'
	filename?: string
	hasChanges: boolean
}

/**
 * ApplyDrawer component provides a comprehensive interface for applying Kubernetes YAML configurations.
 * 
 * Features:
 * - Monaco YAML editor with syntax highlighting
 * - File upload with drag & drop support
 * - Multiple YAML document support with tabs
 * - Apply options (namespace, dry-run, force, etc.)
 * - Validation and error feedback
 * - Preview diff functionality
 * - Resource summary and dangerous action warnings
 * - Keyboard shortcuts (Ctrl+Enter for apply, Ctrl+Shift+Enter for apply all)
 */
export function ApplyDrawer({ trigger }: ApplyDrawerProps) {
	const isMobile = useIsMobile()
	const [isOpen, setIsOpen] = useState(false)
	const [yamlTabs, setYamlTabs] = useState<YamlTab[]>([
		{
			id: 'main',
			title: 'Main',
			content: '',
			source: 'inline',
			hasChanges: false,
		}
	])
	const [activeYamlTab, setActiveYamlTab] = useState('main')
	const [parsedResources, setParsedResources] = useState<Record<string, unknown>[]>([])
	const [validationErrors, setValidationErrors] = useState<string[]>([])

	const { namespaces, selectedNamespace } = useNamespace()
	const {
		isLoading,
		isSuccess,
		error,
		response,
		applyConfig,
		resetState
	} = useApplyYaml()

	// Form for apply options
	const form = useForm<ApplyOptionsFormData>({
		resolver: zodResolver(applyOptionsSchema),
		defaultValues: {
			...defaultApplyOptions,
			namespace: selectedNamespace === 'all' ? undefined : selectedNamespace,
		},
	})

	// Update namespace when context changes
	useEffect(() => {
		if (selectedNamespace !== 'all') {
			form.setValue('namespace', selectedNamespace)
		}
	}, [selectedNamespace, form])

	// Parse YAML content to extract resources
	const parseYamlContent = useCallback((content: string) => {
		if (!content.trim()) {
			setParsedResources([])
			setValidationErrors([])
			return
		}

		try {
			const documents = yaml.loadAll(content)
			const resources = documents.filter(doc => doc && typeof doc === 'object') as Record<string, unknown>[]
			setParsedResources(resources)
			setValidationErrors([])
		} catch (error) {
			setParsedResources([])
			setValidationErrors([error instanceof Error ? error.message : 'Invalid YAML syntax'])
		}
	}, [])

	// Current tab content
	const currentYamlTab = useMemo(() =>
		yamlTabs.find(tab => tab.id === activeYamlTab) || yamlTabs[0],
		[yamlTabs, activeYamlTab]
	)

	// Parse current tab content
	useEffect(() => {
		if (currentYamlTab) {
			parseYamlContent(currentYamlTab.content)
		}
	}, [currentYamlTab, parseYamlContent])

	// Update YAML tab content
	const updateYamlTab = useCallback((tabId: string, content: string) => {
		setYamlTabs(prev => prev.map(tab =>
			tab.id === tabId
				? { ...tab, content, hasChanges: content !== '' }
				: tab
		))
	}, [])

	// Add new YAML tab
	const addYamlTab = useCallback((title: string, content: string, source: 'inline' | 'file' = 'inline', filename?: string) => {
		const id = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
		const newTab: YamlTab = {
			id,
			title,
			content,
			source,
			filename,
			hasChanges: content !== '',
		}
		setYamlTabs(prev => [...prev, newTab])
		setActiveYamlTab(id)
	}, [])

	// Remove YAML tab
	const removeYamlTab = useCallback((tabId: string) => {
		if (yamlTabs.length <= 1) return // Keep at least one tab

		setYamlTabs(prev => {
			const filtered = prev.filter(tab => tab.id !== tabId)
			if (activeYamlTab === tabId && filtered.length > 0) {
				setActiveYamlTab(filtered[0].id)
			}
			return filtered
		})
	}, [yamlTabs.length, activeYamlTab])

	// Handle file uploads
	const handleFileUpload = useCallback((files: UploadedFile[]) => {
		files.forEach(file => {
			console.log('Processing file:', file.name, 'Content length:', file.content.length)

			// Check if file contains multiple YAML documents
			// YAML documents are separated by lines starting with ---
			const yamlSeparatorRegex = /^[\s]*---[\s]*$/gm
			const separatorMatches = file.content.match(yamlSeparatorRegex)

			if (!separatorMatches || separatorMatches.length === 0) {
				// Single document - add the entire file content
				addYamlTab(file.name, file.content, 'file', file.name)
			} else {
				// Multiple documents - split properly
				const documents = file.content.split(/^[\s]*---[\s]*$/gm)
					.map(doc => doc.trim())
					.filter(doc => doc.length > 0 && doc !== '---')

				if (documents.length <= 1) {
					// Only one actual document after splitting
					addYamlTab(file.name, file.content, 'file', file.name)
				} else {
					// Multiple documents - create separate tabs
					documents.forEach((doc, index) => {
						const title = `${file.name} (${index + 1})`
						addYamlTab(title, doc, 'file', file.name)
					})
				}
			}
		})
	}, [addYamlTab])

	// Reset drawer state
	const resetDrawer = useCallback(() => {
		setYamlTabs([{
			id: 'main',
			title: 'Main',
			content: '',
			source: 'inline',
			hasChanges: false,
		}])
		setActiveYamlTab('main')
		setParsedResources([])
		setValidationErrors([])
		form.reset()
		resetState()
	}, [form, resetState])

	// Apply configuration
	const handleApply = useCallback(async (dryRun = false) => {
		const formData = form.getValues()

		try {
			// Collect all YAML content
			const yamlContent = yamlTabs
				.filter(tab => tab.content.trim())
				.map(tab => tab.content)
				.join('\n---\n')

			if (!yamlContent.trim()) {
				toast.error('No YAML content to apply')
				return
			}

			await applyConfig({
				yamlContent,
				namespace: formData.namespace,
				dryRun,
				force: formData.force,
				validate: formData.validate,
				fieldManager: formData.fieldManager,
				showDiff: formData.showDiff,
				serverSide: formData.serverSide,
			})

			if (!dryRun && isSuccess) {
				// Close drawer on successful apply
				setTimeout(() => setIsOpen(false), 2000)
			}
		} catch (error) {
			console.error('Apply failed:', error)
		}
	}, [form, yamlTabs, applyConfig, isSuccess])

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!isOpen) return

			if (e.ctrlKey || e.metaKey) {
				if (e.key === 'Enter') {
					e.preventDefault()
					if (e.shiftKey) {
						// Ctrl+Shift+Enter: Apply all
						handleApply(false)
					} else {
						// Ctrl+Enter: Apply current tab or dry run
						handleApply(form.getValues().dryRun)
					}
				}
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [isOpen, handleApply, form])

	// Generate namespace options
	const namespaceOptions = useMemo(() => {
		const options = [{ value: 'default', label: 'Default namespace' }]
		namespaces.forEach(ns => {
			options.push({ value: ns.metadata.name, label: ns.metadata.name })
		})
		return options
	}, [namespaces])

	// Check for dangerous operations
	const hasDangerousActions = response?.dangerousActions && response.dangerousActions.length > 0

	// Default trigger button if none provided
	const defaultTrigger = (
		<Button variant="default" size="sm" className="gap-2">
			<IconFileUpload className="size-4" />
			Apply Config
		</Button>
	)

	return (
		<TooltipProvider>
			<Drawer
				direction={isMobile ? "bottom" : "right"}
				open={isOpen}
				onOpenChange={setIsOpen}
			>
				<DrawerTrigger asChild>
					{trigger || defaultTrigger}
				</DrawerTrigger>

				<DrawerContent
					className="flex flex-col h-full"
					style={
						!isMobile
							? {
								width: 'min(50vw, 800px)',
								maxWidth: 'min(50vw, 800px)',
								minWidth: '500px'
							}
							: undefined
					}
				>
					{/* Header */}
					<DrawerHeader className="flex justify-between items-start flex-shrink-0 border-b">
						<div className="space-y-1">
							<DrawerTitle className="flex items-center gap-2">
								<IconFileUpload className="size-5" />
								Apply Kubernetes YAML
								{hasDangerousActions && (
									<Badge variant="destructive" className="gap-1">
										<IconAlertTriangle className="size-3" />
										Dangerous
									</Badge>
								)}
							</DrawerTitle>
							<DrawerDescription>
								Upload, edit, and apply Kubernetes manifests to your cluster
							</DrawerDescription>
						</div>
						<DrawerClose asChild>
							<Button variant="ghost" size="icon" className="h-6 w-6">
								<IconX className="size-4" />
								<span className="sr-only">Close</span>
							</Button>
						</DrawerClose>
					</DrawerHeader>

					{/* Content Area */}
					<div className="flex-1 min-h-0 p-6">
						<ScrollArea className="h-full">
							<div className="space-y-6">
								{/* File Upload Section */}
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<h3 className="text-lg font-semibold">Upload Files</h3>
										<div className="flex gap-2">
											<UploadDialog onFilesUpload={handleFileUpload} />
											<Button
												variant="outline"
												size="sm"
												onClick={() => addYamlTab('New Tab', '')}
											>
												Add Tab
											</Button>
										</div>
									</div>
								</div>

								{/* YAML Editor Section */}
								<div className="space-y-4">
									<h3 className="text-lg font-semibold">YAML Editor</h3>

									{/* YAML Tabs */}
									<Tabs value={activeYamlTab} onValueChange={setActiveYamlTab}>
										<TabsList className="w-full justify-start">
											{yamlTabs.map((tab) => (
												<TabsTrigger key={tab.id} value={tab.id} className="relative">
													{tab.title}
													{tab.hasChanges && (
														<div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
													)}
													{yamlTabs.length > 1 && (
														<Button
															variant="ghost"
															size="sm"
															className="ml-2 h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
															onClick={(e) => {
																e.stopPropagation()
																removeYamlTab(tab.id)
															}}
														>
															<IconX className="size-3" />
														</Button>
													)}
												</TabsTrigger>
											))}
										</TabsList>

										{yamlTabs.map((tab) => (
											<TabsContent key={tab.id} value={tab.id}>
												<YamlEditor
													value={tab.content}
													onChange={(content) => updateYamlTab(tab.id, content)}
													height="300px"
													className="border rounded-lg"
												/>
											</TabsContent>
										))}
									</Tabs>
								</div>

								{/* Apply Options Form */}
								<div className="space-y-4">
									<h3 className="text-lg font-semibold">Apply Options</h3>
									<Form {...form}>
										<form className="space-y-4">
											<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
												{/* Namespace Selection */}
												<FormField
													control={form.control}
													name="namespace"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Namespace</FormLabel>
															<Select
																onValueChange={(value: string) => field.onChange(value === 'default' ? undefined : value)}
																value={field.value || 'default'}
															>
																<FormControl>
																	<SelectTrigger>
																		<SelectValue placeholder="Select namespace" />
																	</SelectTrigger>
																</FormControl>
																<SelectContent>
																	{namespaceOptions.map((option) => (
																		<SelectItem key={option.value} value={option.value}>
																			{option.label}
																		</SelectItem>
																	))}
																</SelectContent>
															</Select>
														</FormItem>
													)}
												/>

												{/* Field Manager */}
												<FormField
													control={form.control}
													name="fieldManager"
													render={({ field }) => (
														<FormItem>
															<FormLabel>Field Manager</FormLabel>
															<FormControl>
																<Input
																	placeholder="kaptn-dashboard"
																	value={field.value as string || ''}
																	onChange={field.onChange}
																	name={field.name}
																/>
															</FormControl>
														</FormItem>
													)}
												/>
											</div>

											{/* Checkboxes in a grid */}
											<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
												<FormField
													control={form.control}
													name="dryRun"
													render={({ field }) => (
														<FormItem className="flex flex-row items-start space-x-3 space-y-0">
															<FormControl>
																<Switch
																	checked={field.value}
																	onCheckedChange={field.onChange}
																/>
															</FormControl>
															<div className="space-y-1 leading-none">
																<FormLabel>Dry Run</FormLabel>
																<FormDescription className="text-xs">
																	Preview only
																</FormDescription>
															</div>
														</FormItem>
													)}
												/>

												<FormField
													control={form.control}
													name="force"
													render={({ field }) => (
														<FormItem className="flex flex-row items-start space-x-3 space-y-0">
															<FormControl>
																<Switch
																	checked={field.value}
																	onCheckedChange={field.onChange}
																/>
															</FormControl>
															<div className="space-y-1 leading-none">
																<FormLabel>Force Apply</FormLabel>
																<FormDescription className="text-xs">
																	Bypass conflicts
																</FormDescription>
															</div>
														</FormItem>
													)}
												/>

												<FormField
													control={form.control}
													name="validate"
													render={({ field }) => (
														<FormItem className="flex flex-row items-start space-x-3 space-y-0">
															<FormControl>
																<Switch
																	checked={field.value}
																	onCheckedChange={field.onChange}
																/>
															</FormControl>
															<div className="space-y-1 leading-none">
																<FormLabel>Validate</FormLabel>
																<FormDescription className="text-xs">
																	Schema validation
																</FormDescription>
															</div>
														</FormItem>
													)}
												/>

												<FormField
													control={form.control}
													name="serverSide"
													render={({ field }) => (
														<FormItem className="flex flex-row items-start space-x-3 space-y-0">
															<FormControl>
																<Switch
																	checked={field.value}
																	onCheckedChange={field.onChange}
																/>
															</FormControl>
															<div className="space-y-1 leading-none">
																<FormLabel>Server-side Apply</FormLabel>
																<FormDescription className="text-xs">
																	Better conflict resolution
																</FormDescription>
															</div>
														</FormItem>
													)}
												/>

												<FormField
													control={form.control}
													name="showDiff"
													render={({ field }) => (
														<FormItem className="flex flex-row items-start space-x-3 space-y-0">
															<FormControl>
																<Switch
																	checked={field.value}
																	onCheckedChange={field.onChange}
																/>
															</FormControl>
															<div className="space-y-1 leading-none">
																<FormLabel>Show Diff</FormLabel>
																<FormDescription className="text-xs">
																	Display changes
																</FormDescription>
															</div>
														</FormItem>
													)}
												/>
											</div>
										</form>
									</Form>
								</div>

								{/* YAML Summary */}
								{(parsedResources.length > 0 || validationErrors.length > 0) && (
									<>
										<Separator />
										<SummaryCard
											resources={response?.resources || []}
											errors={response?.errors || validationErrors.map(err => ({
												type: 'parsing',
												message: err,
												severity: 'error' as const,
											}))}
											warnings={response?.warnings || []}
											summary={response?.summary}
											dangerousActions={response?.dangerousActions}
											isDryRun={form.getValues().dryRun}
										/>
									</>
								)}
							</div>
							<ScrollBar orientation="vertical" />
						</ScrollArea>
					</div>

					{/* Footer */}
					<DrawerFooter className="flex flex-row gap-3 p-6 pt-0 border-t flex-shrink-0">
						{isLoading && (
							<div className="flex items-center gap-2 w-full">
								<Progress value={undefined} className="flex-1" />
								<span className="text-sm text-muted-foreground">
									{form.getValues().dryRun ? 'Running dry run...' : 'Applying...'}
								</span>
							</div>
						)}

						{!isLoading && (
							<>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											onClick={() => handleApply(false)}
											disabled={!currentYamlTab?.content.trim() || validationErrors.length > 0}
											className="flex-1"
											variant={hasDangerousActions ? "destructive" : "default"}
											size="default"
										>
											<IconPlayerPlay className="size-4 mr-2" />
											Apply
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										<p>Apply configuration (Ctrl+Enter)</p>
									</TooltipContent>
								</Tooltip>

								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											onClick={() => handleApply(true)}
											disabled={!currentYamlTab?.content.trim()}
											className="flex-1"
											size="default"
										>
											<IconEye className="size-4 mr-2" />
											Dry Run
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										<p>Preview changes without applying</p>
									</TooltipContent>
								</Tooltip>

								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											onClick={resetDrawer}
											className="flex-1"
											size="default"
										>
											<IconRefresh className="size-4 mr-2" />
											Reset
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										<p>Clear all content and reset options</p>
									</TooltipContent>
								</Tooltip>
							</>
						)}
					</DrawerFooter>

					{/* Error/Success Messages */}
					{error && (
						<Alert variant="destructive" className="mx-6 mb-4">
							<IconAlertTriangle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</DrawerContent>
			</Drawer>
		</TooltipProvider>
	)
}
