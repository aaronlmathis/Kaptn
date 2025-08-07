
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

export function CodeEditor() {
	const { namespaces, selectedNamespace } = useNamespace()
	const {
		isLoading,
		isSuccess,
		error,
		response,
		applyConfig,
		resetState
	} = useApplyYaml()

	// Transform namespaces from backend API format to select options
	const namespaceOptions = React.useMemo(() => {
		const options = [{ value: 'default', label: 'Default namespace' }]
		namespaces.forEach(ns => {
			if (ns.metadata.name !== 'default') {
				options.push({ value: ns.metadata.name, label: ns.metadata.name })
			}
		})
		return options
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

	const [applyOptions, setApplyOptions] = React.useState<ApplyOptions>({
		dryRun: true,
		forceApply: false,
		validate: true,
		showDiff: true,
		serverSideApply: false,
		namespace: selectedNamespace === 'all' ? 'default' : selectedNamespace
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
		try {
			// Collect all YAML content
			const yamlContent = configFiles
				.filter(file => file.content.trim())
				.map(file => file.content)
				.join('\n---\n')

			if (!yamlContent.trim()) {
				toast.error('No YAML content to apply')
				return
			}

			await applyConfig({
				yamlContent,
				namespace: applyOptions.namespace === 'default' ? undefined : applyOptions.namespace,
				dryRun: applyOptions.dryRun,
				force: applyOptions.forceApply,
				validate: applyOptions.validate,
				showDiff: applyOptions.showDiff,
				serverSide: applyOptions.serverSideApply,
			})
		} catch (error) {
			console.error('Apply failed:', error)
		}
	}

	const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files
		if (!files) return

		let lastFileId = ''
		Array.from(files).forEach(file => {
			const reader = new FileReader()
			reader.onload = (e) => {
				const content = e.target?.result as string
				const newFile: ConfigFile = {
					id: Date.now().toString() + Math.random().toString(),
					name: file.name,
					content
				}
				lastFileId = newFile.id
				setConfigFiles(prev => [...prev, newFile])
				setActiveFileId(lastFileId)
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

		let lastFileId = ''
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
					lastFileId = newFile.id
					setConfigFiles(prev => [...prev, newFile])
					setActiveFileId(lastFileId)
				}
				reader.readAsText(file)
			}
		})

		setUploadDialogOpen(false)
	}

	return (
		<div className="min-h-screen w-full flex flex-col p-2 sm:p-4 space-y-4">
			{/* Error Alert */}
			{error && (
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4" />
					<AlertTitle>Apply Error</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* Success/Dry Run Results Alert */}
			{response && isSuccess && (
				<Alert variant="default" className="border-green-200 bg-green-50/50 dark:bg-green-950/30 dark:border-green-800">
					<CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
					<AlertTitle className="text-green-800 dark:text-green-200">
						{applyOptions.dryRun ? 'Dry Run Completed' : 'Apply Completed'}
					</AlertTitle>
					<AlertDescription className="text-green-700 dark:text-green-300">
						{response.summary ? (
							<div className="space-y-2">
								<p>
									Applied {response.summary.totalResources} resources: {response.summary.createdCount} created, {response.summary.updatedCount} updated, {response.summary.unchangedCount} unchanged
									{response.summary.errorCount > 0 && `, ${response.summary.errorCount} errors`}
								</p>
								{response.resources && response.resources.length > 0 && (
									<div>
										<p className="font-medium">Resources processed:</p>
										<ul className="list-disc list-inside ml-4 space-y-1">
											{response.resources.map((resource, index) => (
												<li key={index} className="text-sm flex items-center gap-2">
													<span>
														{resource.kind}/{resource.name}
														{resource.namespace && ` (namespace: ${resource.namespace})`}
													</span>
													{resource.action && (
														<Badge
															variant={
																resource.action === 'created' || resource.action === 'would create' ? 'default' :
																	resource.action === 'updated' || resource.action === 'would update' ? 'secondary' :
																		resource.action === 'unchanged' ? 'outline' : 'default'
															}
															className="text-xs"
														>
															{resource.action}
														</Badge>
													)}
												</li>
											))}
										</ul>
									</div>
								)}
								{response.warnings && response.warnings.length > 0 && (
									<div>
										<p className="font-medium text-orange-600 dark:text-orange-400">Warnings:</p>
										<ul className="list-disc list-inside ml-4 space-y-1">
											{response.warnings.map((warning, index) => (
												<li key={index} className="text-sm text-orange-600 dark:text-orange-400">
													{warning}
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						) : (
							`${applyOptions.dryRun ? 'Dry run' : 'Apply'} completed successfully`
						)}
					</AlertDescription>
					<button
						onClick={resetState}
						className="absolute top-2 right-2 p-1 rounded-full hover:bg-green-200 dark:hover:bg-green-800 transition-colors"
					>
						<X className="h-4 w-4 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200" />
					</button>
				</Alert>
			)}

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

								<div className="flex items-center justify-between">
									<Label htmlFor="namespace">Namespace</Label>
									<Select
										value={applyOptions.namespace || 'default'}
										onValueChange={(value: string) =>
											setApplyOptions(prev => ({ ...prev, namespace: value === 'default' ? 'default' : value }))
										}
									>
										<SelectTrigger className="w-[180px]">
											<SelectValue placeholder="Select namespace" />
										</SelectTrigger>
										<SelectContent>
											{namespaceOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
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
						disabled={isLoading || !configFiles.some(f => f.content.trim())}
					>
						{isLoading
							? (applyOptions.dryRun ? 'Running Dry Run...' : 'Applying...')
							: (applyOptions.dryRun ? 'Run Dry Run' : 'Apply Configuration')
						}
					</Button>
				</div>
			</div>
		</div>
	)
}
