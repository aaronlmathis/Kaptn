
import * as React from "react"
import { YamlEditor } from "@/components/ApplyDrawer/YamlEditor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertTriangle, CheckCircle, FileText, Upload, X, Plus } from "lucide-react"
import { useNamespace } from "@/contexts/namespace-context"
import { useApplyYaml } from "@/hooks/useApplyYaml"
import { SummaryCard } from "@/components/ApplyDrawer/SummaryCard"
import { toast } from "sonner"

interface ConfigFile {
	id: string
	name: string
	content: string
	hasChanges?: boolean
}

interface ApplyOptions {
	dryRun: boolean
	forceApply: boolean
	validate: boolean
	showDiff: boolean
	serverSideApply: boolean
	namespace: string
}

interface ApplyResult {
	type: 'success' | 'warning' | 'error'
	title: string
	message: string
	changes?: number
	warnings?: number
}

export function CodeEditor() {
	const { namespaces, loading: namespacesLoading } = useNamespace()

	// Transform namespaces from backend API format to combobox format
	const namespaceOptions = React.useMemo(() => {
		return namespaces.map(ns => ({
			value: ns.metadata.name,
			label: ns.metadata.name,
		}))
	}, [namespaces])
	const [configFiles, setConfigFiles] = React.useState<ConfigFile[]>([
		{
			id: '1',
			name: 'config.yaml',
			content: `# Sample YAML content
apiVersion: v1
kind: ConfigMap
metadata:
  name: example-config
  namespace: default
data:
  key1: value1
  key2: value2`
		}
	])

	const [activeFileId, setActiveFileId] = React.useState('1')
	const [uploadDialogOpen, setUploadDialogOpen] = React.useState(false)
	const [applyResults, setApplyResults] = React.useState<ApplyResult[]>([])
	const [namespaceOpen, setNamespaceOpen] = React.useState(false)

	const [applyOptions, setApplyOptions] = React.useState<ApplyOptions>({
		dryRun: true,
		forceApply: false,
		validate: true,
		showDiff: true,
		serverSideApply: false,
		namespace: 'default'
	})

	const activeFile = configFiles.find(file => file.id === activeFileId)

	const handleFileContentChange = (content: string) => {
		setConfigFiles(prev => prev.map(file =>
			file.id === activeFileId
				? { ...file, content, hasChanges: true }
				: file
		))
	}

	const handleAddFile = () => {
		const newFile: ConfigFile = {
			id: Date.now().toString(),
			name: `new-config-${configFiles.length + 1}.yaml`,
			content: '# New configuration file\n'
		}
		setConfigFiles(prev => [...prev, newFile])
		setActiveFileId(newFile.id)
	}

	const handleRemoveFile = (fileId: string) => {
		if (configFiles.length === 1) return // Don't remove the last file

		setConfigFiles(prev => prev.filter(file => file.id !== fileId))
		if (activeFileId === fileId) {
			const remainingFiles = configFiles.filter(file => file.id !== fileId)
			setActiveFileId(remainingFiles[0]?.id || '')
		}
	}

	const handleApplyConfiguration = async () => {
		// Simulate API call
		const result: ApplyResult = {
			type: applyOptions.dryRun ? 'warning' : 'success',
			title: applyOptions.dryRun ? 'Dry Run Completed' : 'Configuration Applied',
			message: applyOptions.dryRun
				? 'Configuration validated successfully. No changes were made.'
				: 'Configuration has been successfully applied to the cluster.',
			changes: applyOptions.dryRun ? 0 : 3,
			warnings: 1
		}

		setApplyResults(prev => [result, ...prev.slice(0, 2)]) // Keep last 3 results
	}

	const handleDismissAlert = (index: number) => {
		setApplyResults(prev => prev.filter((_, i) => i !== index))
	}

	const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files
		if (!files) return

		Array.from(files).forEach(file => {
			const reader = new FileReader()
			reader.onload = (e) => {
				const content = e.target?.result as string
				const newFile: ConfigFile = {
					id: Date.now().toString() + Math.random().toString(),
					name: file.name,
					content
				}
				setConfigFiles(prev => [...prev, newFile])
			}
			reader.readAsText(file)
		})

		setUploadDialogOpen(false)
	}

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
	}

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()

		const files = e.dataTransfer.files
		if (files.length === 0) return

		Array.from(files).forEach(file => {
			if (file.name.endsWith('.yaml') || file.name.endsWith('.yml') || file.name.endsWith('.json')) {
				const reader = new FileReader()
				reader.onload = (e) => {
					const content = e.target?.result as string
					const newFile: ConfigFile = {
						id: Date.now().toString() + Math.random().toString(),
						name: file.name,
						content
					}
					setConfigFiles(prev => [...prev, newFile])
				}
				reader.readAsText(file)
			}
		})

		setUploadDialogOpen(false)
	}

	return (
		<div className="min-h-screen w-full flex flex-col p-2 sm:p-4 space-y-4">
			{/* Alerts Section */}
			<div className="space-y-2">
				{applyResults.map((result, index) => (
					<Alert key={index} className={
						result.type === 'error' ? 'border-red-500' :
							result.type === 'warning' ? 'border-yellow-500' :
								'border-green-500'
					}>
						{result.type === 'error' ? <AlertTriangle className="h-4 w-4" /> :
							result.type === 'warning' ? <AlertTriangle className="h-4 w-4" /> :
								<CheckCircle className="h-4 w-4" />}
						<AlertTitle className="flex items-center justify-between">
							{result.title}
							<button
								onClick={() => handleDismissAlert(index)}
								className="ml-2 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
								aria-label="Dismiss alert"
							>
								<X />
							</button>
						</AlertTitle>
						<AlertDescription className="flex items-center gap-2">
							{result.message}
							{result.changes !== undefined && (
								<Badge variant="secondary">{result.changes} changes</Badge>
							)}
							{result.warnings !== undefined && result.warnings > 0 && (
								<Badge variant="outline">{result.warnings} warnings</Badge>
							)}
						</AlertDescription>
					</Alert>
				))}
			</div>

			{/* Main Content */}
			<div className="flex flex-col lg:flex-row gap-4">
				{/* Left Side - Code Editor */}
				<div className="flex-1 flex flex-col">
					{/* File Tabs */}
					<div className="flex items-center gap-2 mb-4">
						<Tabs value={activeFileId} onValueChange={setActiveFileId} className="flex-1">
							<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
								<TabsList className="flex-wrap">
									{configFiles.map(file => (
										<TabsTrigger key={file.id} value={file.id} className="flex items-center gap-2">
											<FileText className="h-4 w-4" />
											<span className="truncate max-w-[120px] sm:max-w-none">{file.name}</span>
											{file.hasChanges && <div className="w-2 h-2 bg-orange-500 rounded-full" />}
											{configFiles.length > 1 && (
												<button
													onClick={(e) => {
														e.stopPropagation()
														handleRemoveFile(file.id)
													}}
													className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
												>
													<X className="h-3 w-3" />
												</button>
											)}
										</TabsTrigger>
									))}
								</TabsList>
								<div className="flex gap-2 flex-shrink-0">
									<Button onClick={handleAddFile} size="sm" variant="outline">
										<Plus className="h-4 w-4 mr-1" />
										<span className="hidden sm:inline">Add File</span>
									</Button>
									<Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
										<DialogTrigger asChild>
											<Button size="sm" variant="outline">
												<Upload className="h-4 w-4 mr-1" />
												<span className="hidden sm:inline">Upload Files</span>
											</Button>
										</DialogTrigger>
										<DialogContent className="sm:max-w-md">
											<DialogHeader>
												<DialogTitle>Upload Configuration Files</DialogTitle>
												<DialogDescription>
													Select YAML or JSON configuration files to upload
												</DialogDescription>
											</DialogHeader>
											<div className="space-y-4">
												{/* Drag and Drop Area */}
												<div
													className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
													onDragOver={handleDragOver}
													onDrop={handleDrop}
												>
													<Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
													<div className="space-y-2">
														<p className="text-sm font-medium text-gray-700">
															Drag and drop files here
														</p>
														<p className="text-xs text-gray-500">
															or click to browse
														</p>
													</div>
													<Input
														type="file"
														multiple
														accept=".yaml,.yml,.json"
														onChange={handleFileUpload}
														className="hidden"
														id="file-upload"
													/>
													<Label
														htmlFor="file-upload"
														className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
													>
														Choose Files
													</Label>
												</div>

												{/* File Type Info */}
												<div className="text-xs text-gray-500 text-center">
													Supported formats: .yaml, .yml, .json
												</div>
											</div>
										</DialogContent>
									</Dialog>
								</div>
							</div>
						</Tabs>
					</div>

					{/* Code Editor */}
					<div className="border rounded-lg overflow-hidden">
						{activeFile && (
							<YamlEditor
								value={activeFile.content}
								onChange={handleFileContentChange}
								height="600px"
								className="w-full rounded-lg"
							/>
						)}
					</div>
				</div>

				{/* Right Side - Options & Summary */}
				<div className="w-full lg:w-80 flex flex-col gap-4">
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 lg:space-y-0 sm:space-y-0 lg:space-y-4">
						{/* Apply Options */}
						<Card>
							<CardHeader>
								<CardTitle>Apply Options</CardTitle>
								<CardDescription>Configure how to apply the configuration</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="flex items-center justify-between">
									<Label htmlFor="dry-run">Dry Run</Label>
									<Switch
										id="dry-run"
										checked={applyOptions.dryRun}
										onCheckedChange={(checked: boolean) =>
											setApplyOptions(prev => ({ ...prev, dryRun: checked }))
										}
									/>
								</div>

								<div className="flex items-center justify-between">
									<Label htmlFor="validate">Validate</Label>
									<Switch
										id="validate"
										checked={applyOptions.validate}
										onCheckedChange={(checked: boolean) =>
											setApplyOptions(prev => ({ ...prev, validate: checked }))
										}
									/>
								</div>

								<div className="flex items-center justify-between">
									<Label htmlFor="show-diff">Show Diff</Label>
									<Switch
										id="show-diff"
										checked={applyOptions.showDiff}
										onCheckedChange={(checked: boolean) =>
											setApplyOptions(prev => ({ ...prev, showDiff: checked }))
										}
									/>
								</div>

								<div className="flex items-center justify-between">
									<Label htmlFor="force-apply">Force Apply</Label>
									<Switch
										id="force-apply"
										checked={applyOptions.forceApply}
										onCheckedChange={(checked: boolean) =>
											setApplyOptions(prev => ({ ...prev, forceApply: checked }))
										}
									/>
								</div>

								<div className="flex items-center justify-between">
									<Label htmlFor="server-side">Server-Side Apply</Label>
									<Switch
										id="server-side"
										checked={applyOptions.serverSideApply}
										onCheckedChange={(checked: boolean) =>
											setApplyOptions(prev => ({ ...prev, serverSideApply: checked }))
										}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="namespace">Namespace</Label>
									<Popover open={namespaceOpen} onOpenChange={setNamespaceOpen}>
										<PopoverTrigger asChild>
											<Button
												variant="outline"
												role="combobox"
												aria-expanded={namespaceOpen}
												className="w-full justify-between"
												disabled={namespacesLoading}
											>
												{namespacesLoading ? "Loading namespaces..." :
													applyOptions.namespace
														? namespaceOptions.find((namespace) => namespace.value === applyOptions.namespace)?.label
														: "Select namespace..."}
												<ChevronsUpDown className="opacity-50" />
											</Button>
										</PopoverTrigger>
										<PopoverContent className="w-full p-0">
											<Command>
												<CommandInput placeholder="Search namespace..." className="h-9" />
												<ScrollArea className="h-[200px]">
													<CommandList>
														<CommandEmpty>
															{namespacesLoading ? "Loading namespaces..." : "No namespace found."}
														</CommandEmpty>
														<CommandGroup>
															{namespaceOptions.map((namespace) => (
																<CommandItem
																	key={namespace.value}
																	value={namespace.value}
																	onSelect={(currentValue) => {
																		setApplyOptions(prev => ({ ...prev, namespace: currentValue }))
																		setNamespaceOpen(false)
																	}}
																>
																	{namespace.label}
																	<Check
																		className={cn(
																			"ml-auto",
																			applyOptions.namespace === namespace.value ? "opacity-100" : "opacity-0"
																		)}
																	/>
																</CommandItem>
															))}
														</CommandGroup>
													</CommandList>
													<ScrollBar />
												</ScrollArea>
											</Command>
										</PopoverContent>
									</Popover>
								</div>
							</CardContent>
						</Card>

						{/* Summary Card */}
						<Card>
							<CardHeader>
								<CardTitle>Summary</CardTitle>
								<CardDescription>Configuration overview</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="space-y-2 text-sm">
									<div className="flex justify-between">
										<span>Files:</span>
										<span>{configFiles.length}</span>
									</div>
									<div className="flex justify-between">
										<span>Modified:</span>
										<span>{configFiles.filter(f => f.hasChanges).length}</span>
									</div>
									<div className="flex justify-between">
										<span>Target Namespace:</span>
										<span>{applyOptions.namespace}</span>
									</div>
									<div className="flex justify-between">
										<span>Mode:</span>
										<span>{applyOptions.dryRun ? 'Dry Run' : 'Apply'}</span>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Apply Button */}
					<Button
						onClick={handleApplyConfiguration}
						className="w-full"
						size="lg"
					>
						{applyOptions.dryRun ? 'Run Dry Run' : 'Apply Configuration'}
					</Button>
				</div>
			</div>
		</div>
	)
}
