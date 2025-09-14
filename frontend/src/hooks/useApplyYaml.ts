import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'

// Types for the enhanced apply API
export interface ApplyConfigRequest {
	yamlContent: string
	files?: FileUpload[]
	namespace?: string
	dryRun: boolean
	force: boolean
	validate: boolean
	fieldManager?: string
	showDiff: boolean
	serverSide: boolean
}

export interface FileUpload {
	name: string
	content: string
}

export interface EnhancedResourceResult {
	name: string
	namespace?: string
	kind: string
	apiVersion: string
	action: string // "created", "updated", "unchanged", "error", "would-create", "would-update"
	error?: string
	diff?: Record<string, unknown>
	source?: string // "inline", "file:filename.yaml"
	metadata: ResourceMetadata
	status: string // "success", "error", "warning"
	links?: ResourceLink[]
}

export interface ResourceMetadata {
	labels?: Record<string, string>
	annotations?: Record<string, string>
	createdAt?: string
	ownerRefs?: string[]
}

export interface ResourceLink {
	type: string // "view", "edit", "logs"
	url: string
	text: string
}

export interface ValidationError {
	type: string // "parsing", "schema", "conflict", "auth"
	message: string
	field?: string
	resource?: string
	line?: number
	severity: string // "error", "warning"
	suggestion?: string
}

export interface ApplySummary {
	totalResources: number
	createdCount: number
	updatedCount: number
	unchangedCount: number
	errorCount: number
	namespacedCount: number
	clusterScopedCount: number
}

export interface DangerousAction {
	type: string // "delete", "overwrite", "crd", "rbac"
	resource: string
	description: string
	risk: string // "low", "medium", "high", "critical"
	confirmation: boolean // whether user confirmation is required
}

export interface ApplyConfigResponse {
	success: boolean
	resources: EnhancedResourceResult[]
	errors?: ValidationError[]
	warnings?: string[]
	message?: string
	summary?: ApplySummary
	dangerousActions?: DangerousAction[]
}

export interface ApplyState {
	isLoading: boolean
	isSuccess: boolean
	error: string | null
	response: ApplyConfigResponse | null
}

export function useApplyYaml() {
	const [state, setState] = useState<ApplyState>({
		isLoading: false,
		isSuccess: false,
		error: null,
		response: null,
	})

	const resetState = useCallback(() => {
		setState({
			isLoading: false,
			isSuccess: false,
			error: null,
			response: null,
		})
	}, [])

	const applyConfig = useCallback(async (request: ApplyConfigRequest): Promise<ApplyConfigResponse> => {
		setState(prev => ({ ...prev, isLoading: true, error: null }))

		try {
			// Return structured JSON even when the server responds with 4xx containing validation errors
			const response = await apiClient.postJSONAllowError<ApplyConfigResponse>('/apply', request)

			setState(prev => ({
				...prev,
				isLoading: false,
				isSuccess: response.success,
				response,
				error: response.success ? null : response.message || 'Apply operation failed'
			}))

			// Show success/error toasts
			if (response.success) {
				const { summary } = response
				if (summary) {
					if (request.dryRun) {
						toast.success(`Dry run completed successfully`, {
							description: `Would affect ${summary.totalResources} resources (${summary.createdCount} new, ${summary.updatedCount} updated)`
						})
					} else {
						toast.success(`Configuration applied successfully`, {
							description: `${summary.totalResources} resources processed (${summary.createdCount} created, ${summary.updatedCount} updated)`
						})
					}
				} else {
					toast.success(request.dryRun ? 'Dry run completed' : 'Configuration applied')
				}
			} else {
				// Build a concise, actionable error description from validation errors
				const errs = Array.isArray(response.errors) ? response.errors : []
				const maxItems = 5
				const lines = errs.slice(0, maxItems).map((e) => {
					const parts: string[] = []
					if (e.severity) parts.push(e.severity.toUpperCase())
					if (e.type) parts.push(e.type)
					const head = parts.length ? `[${parts.join('/')}] ` : ''
					const where: string[] = []
					if (e.resource) where.push(String(e.resource))
					if (e.field) where.push(`field ${e.field}`)
					if (typeof e.line === 'number') where.push(`line ${e.line}`)
					const whereStr = where.length ? ` (${where.join(', ')})` : ''
					return `${head}${e.message || 'Unknown error'}${whereStr}`
				})

				const more = errs.length > maxItems ? `\n• +${errs.length - maxItems} more...` : ''
				const desc = lines.length
					? `Encountered ${errs.length} error${errs.length === 1 ? '' : 's'}:\n• ${lines.join('\n• ')}${more}`
					: (response.message || 'Please check the errors and try again')

				toast.error('Apply operation failed', {
					description: desc,
				})

				// Optionally surface warnings as a separate toast for visibility
				if (Array.isArray((response as any).warnings) && (response as any).warnings.length > 0) {
					const warns = ((response as any).warnings as string[]).slice(0, 5)
					toast.warning('Apply warnings', { description: warns.join('\n• ') })
				}
			}

			return response
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to apply configuration'
			setState(prev => ({
				...prev,
				isLoading: false,
				isSuccess: false,
				error: errorMessage,
				response: null
			}))

			toast.error('Apply operation failed', {
				description: errorMessage
			})

			throw error
		}
	}, [])

	const applyYaml = useCallback(async (
		yamlContent: string,
		options: {
			namespace?: string
			dryRun?: boolean
			force?: boolean
			validate?: boolean
			fieldManager?: string
			showDiff?: boolean
			serverSide?: boolean
		} = {}
	): Promise<ApplyConfigResponse> => {
		const request: ApplyConfigRequest = {
			yamlContent,
			namespace: options.namespace,
			dryRun: options.dryRun ?? false,
			force: options.force ?? false,
			validate: options.validate ?? true,
			fieldManager: options.fieldManager,
			showDiff: options.showDiff ?? false,
			serverSide: options.serverSide ?? false,
		}

		return applyConfig(request)
	}, [applyConfig])

	const applyFiles = useCallback(async (
		files: FileUpload[],
		options: {
			namespace?: string
			dryRun?: boolean
			force?: boolean
			validate?: boolean
			fieldManager?: string
			showDiff?: boolean
			serverSide?: boolean
		} = {}
	): Promise<ApplyConfigResponse> => {
		const request: ApplyConfigRequest = {
			yamlContent: '', // Empty since we're using files
			files,
			namespace: options.namespace,
			dryRun: options.dryRun ?? false,
			force: options.force ?? false,
			validate: options.validate ?? true,
			fieldManager: options.fieldManager,
			showDiff: options.showDiff ?? false,
			serverSide: options.serverSide ?? false,
		}

		return applyConfig(request)
	}, [applyConfig])

	return {
		...state,
		applyConfig,
		applyYaml,
		applyFiles,
		resetState,
	}
}
