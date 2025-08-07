"use client"

import * as React from "react"
import { useCallback, useState } from 'react'
import { IconCloudUpload, IconFile, IconX, IconAlertCircle, IconUpload } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface UploadedFile {
	name: string
	content: string
	size: number
	error?: string
}

interface UploadDialogProps {
	onFilesUpload: (files: UploadedFile[]) => void
	acceptedFiles?: string[]
	maxFileSize?: number // in bytes
	multiple?: boolean
	trigger?: React.ReactNode
}

/**
 * UploadDialog component for YAML file uploads within a dialog.
 * 
 * Features:
 * - Dialog-based upload interface
 * - Drag and drop support
 * - File validation (.yaml/.yml)
 * - Multiple file support
 * - File size limits
 * - Error handling and feedback
 * - Visual feedback for drag states
 */
export function UploadDialog({
	onFilesUpload,
	acceptedFiles = ['.yaml', '.yml'],
	maxFileSize = 1024 * 1024, // 1MB default
	multiple = true,
	trigger,
}: UploadDialogProps) {
	const [isOpen, setIsOpen] = useState(false)
	const [isDragOver, setIsDragOver] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])

	const validateFile = useCallback((file: File): string | null => {
		// Check file extension
		const extension = '.' + file.name.split('.').pop()?.toLowerCase()
		if (!acceptedFiles.includes(extension)) {
			return `File must have one of these extensions: ${acceptedFiles.join(', ')}`
		}

		// Check file size
		if (file.size > maxFileSize) {
			return `File size must be less than ${Math.round(maxFileSize / 1024)}KB`
		}

		return null
	}, [acceptedFiles, maxFileSize])

	const processFiles = useCallback(async (files: FileList) => {
		setError(null)
		const newFiles: UploadedFile[] = []
		const errors: string[] = []

		for (let i = 0; i < files.length; i++) {
			const file = files[i]
			const validationError = validateFile(file)

			if (validationError) {
				errors.push(`${file.name}: ${validationError}`)
				continue
			}

			try {
				const content = await file.text()
				newFiles.push({
					name: file.name,
					content,
					size: file.size,
				})
			} catch {
				errors.push(`${file.name}: Failed to read file content`)
			}
		}

		if (errors.length > 0) {
			setError(errors.join('; '))
		}

		if (newFiles.length > 0) {
			const updatedFiles = multiple ? [...uploadedFiles, ...newFiles] : newFiles
			setUploadedFiles(updatedFiles)
		}
	}, [validateFile, multiple, uploadedFiles])

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragOver(true)
	}, [])

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragOver(false)
	}, [])

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault()
		e.stopPropagation()
		setIsDragOver(false)

		const files = e.dataTransfer.files
		if (files.length > 0) {
			processFiles(files)
		}
	}, [processFiles])

	const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files
		if (files && files.length > 0) {
			processFiles(files)
		}
		// Reset input to allow uploading the same file again
		e.target.value = ''
	}, [processFiles])

	const removeFile = useCallback((index: number) => {
		const updatedFiles = uploadedFiles.filter((_, i) => i !== index)
		setUploadedFiles(updatedFiles)
	}, [uploadedFiles])

	const clearFiles = useCallback(() => {
		setUploadedFiles([])
		setError(null)
	}, [])

	const handleUpload = useCallback(() => {
		if (uploadedFiles.length > 0) {
			onFilesUpload(uploadedFiles)
			setIsOpen(false)
			// Reset state for next time
			setUploadedFiles([])
			setError(null)
		}
	}, [uploadedFiles, onFilesUpload])

	const handleCancel = useCallback(() => {
		setIsOpen(false)
		// Reset state
		setUploadedFiles([])
		setError(null)
		setIsDragOver(false)
	}, [])

	const defaultTrigger = (
		<Button variant="outline" size="sm" className="gap-2">
			<IconUpload className="size-4" />
			Upload Files
		</Button>
	)

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				{trigger || defaultTrigger}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[600px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconCloudUpload className="size-5" />
						Upload YAML Files
					</DialogTitle>
					<DialogDescription>
						Upload YAML or YML files to add them to the editor. You can drag and drop files or click to browse.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Upload Area */}
					<Card
						className={cn(
							"border-2 border-dashed transition-colors cursor-pointer",
							isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
							"hover:border-primary/50 hover:bg-primary/5"
						)}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
					>
						<CardContent className="p-6 text-center">
							<input
								type="file"
								id="dialog-file-upload"
								multiple={multiple}
								accept={acceptedFiles.join(',')}
								onChange={handleFileInput}
								className="hidden"
							/>
							<label htmlFor="dialog-file-upload" className="cursor-pointer block">
								<IconCloudUpload className="size-10 mx-auto text-muted-foreground mb-3" />
								<h3 className="text-base font-medium mb-2">
									Drop YAML files here, or click to browse
								</h3>
								<p className="text-sm text-muted-foreground mb-2">
									Supports {acceptedFiles.join(', ')} files up to {Math.round(maxFileSize / 1024)}KB each
								</p>
								{multiple && (
									<p className="text-xs text-muted-foreground">
										You can upload multiple files at once
									</p>
								)}
							</label>
						</CardContent>
					</Card>

					{/* Error Display */}
					{error && (
						<Alert variant="destructive">
							<IconAlertCircle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					{/* Uploaded Files List */}
					{uploadedFiles.length > 0 && (
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<h4 className="font-medium text-sm">Uploaded Files ({uploadedFiles.length})</h4>
								<Button
									variant="outline"
									size="sm"
									onClick={clearFiles}
									className="h-8"
								>
									Clear All
								</Button>
							</div>
							<div className="space-y-2 max-h-40 overflow-y-auto">
								{uploadedFiles.map((file, index) => (
									<div
										key={`${file.name}-${index}`}
										className="flex items-center justify-between p-3 bg-muted rounded-lg"
									>
										<div className="flex items-center gap-3">
											<IconFile className="size-4 text-muted-foreground flex-shrink-0" />
											<div className="min-w-0">
												<p className="font-medium text-sm truncate">{file.name}</p>
												<p className="text-xs text-muted-foreground">
													{(file.size / 1024).toFixed(1)} KB
												</p>
											</div>
											{file.error && (
												<Badge variant="destructive" className="text-xs">
													Error
												</Badge>
											)}
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => removeFile(index)}
											className="h-8 w-8 p-0 flex-shrink-0"
										>
											<IconX className="size-4" />
										</Button>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={handleCancel}>
						Cancel
					</Button>
					<Button
						onClick={handleUpload}
						disabled={uploadedFiles.length === 0}
						className="gap-2"
					>
						<IconUpload className="size-4" />
						Upload {uploadedFiles.length > 0 && `(${uploadedFiles.length})`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
