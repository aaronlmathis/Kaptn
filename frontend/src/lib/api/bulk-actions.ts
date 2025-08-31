// API service for bulk actions
export interface BulkActionTarget {
	namespace?: string
	name: string
}

export interface BulkActionRequest {
	action: string
	targets: BulkActionTarget[]
	params?: Record<string, unknown>
	dry_run?: boolean
	force_confirm?: boolean
}

export interface BulkActionResponse {
	success: boolean
	request_id: string
	message: string
	resources_affected: number
	resources_total: number
	details?: Record<string, unknown>
	requires_confirmation?: boolean
	safety_violations?: Array<{
		rule: string
		description: string
		severity: "warning" | "error" | "critical"
		namespace?: string
		resource?: string
	}>
	warnings?: string[]
}

class BulkActionsApi {
	private baseUrl = '/api/v1/actions'

	async executeBulkAction(resource: string, request: BulkActionRequest): Promise<BulkActionResponse> {
		const response = await fetch(`${this.baseUrl}/${resource}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(request),
		})

		if (!response.ok) {
			// Try to parse error response
			try {
				const errorData = await response.json()
				throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`)
			} catch {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}
		}

		return response.json()
	}

	async validateAction(resource: string, request: BulkActionRequest): Promise<BulkActionResponse> {
		const response = await fetch(`${this.baseUrl}/validate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				...request,
				resource_type: resource,
			}),
		})

		if (!response.ok) {
			try {
				const errorData = await response.json()
				throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`)
			} catch {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}
		}

		return response.json()
	}

	// Resource-specific methods
	async restartPods(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
		return this.executeBulkAction('pods', {
			action: 'restart-pods',
			targets,
			force_confirm: forceConfirm,
		})
	}

	async deletePods(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
		return this.executeBulkAction('pods', {
			action: 'delete-pods',
			targets,
			force_confirm: forceConfirm,
		})
	}

	async getPodLogs(targets: BulkActionTarget[]): Promise<BulkActionResponse> {
		return this.executeBulkAction('pods', {
			action: 'get-logs',
			targets,
		})
	}

	async describePods(targets: BulkActionTarget[]): Promise<BulkActionResponse> {
		return this.executeBulkAction('pods', {
			action: 'describe-pods',
			targets,
		})
	}

	async exportPodsYaml(targets: BulkActionTarget[]): Promise<BulkActionResponse> {
		return this.executeBulkAction('pods', {
			action: 'export-yaml',
			targets,
		})
	}

	async restartDeployments(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
		return this.executeBulkAction('deployments', {
			action: 'restart-deployments',
			targets,
			force_confirm: forceConfirm,
		})
	}

	async deleteDeployments(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
		return this.executeBulkAction('deployments', {
			action: 'delete-deployments',
			targets,
			force_confirm: forceConfirm,
		})
	}

	async scaleDeployments(targets: BulkActionTarget[], replicas: number, forceConfirm = false): Promise<BulkActionResponse> {
		return this.executeBulkAction('deployments', {
			action: 'scale-deployments',
			targets,
			params: { replicas },
			force_confirm: forceConfirm,
		})
	}

	async deleteSecrets(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
		return this.executeBulkAction('secrets', {
			action: 'delete-secrets',
			targets,
			force_confirm: forceConfirm,
		})
	}

	async viewSecrets(targets: BulkActionTarget[]): Promise<BulkActionResponse> {
		return this.executeBulkAction('secrets', {
			action: 'view-secrets',
			targets,
		})
	}

	async editSecrets(targets: BulkActionTarget[], forceConfirm = false): Promise<BulkActionResponse> {
		return this.executeBulkAction('secrets', {
			action: 'edit-secrets',
			targets,
			force_confirm: forceConfirm,
		})
	}
}

export const bulkActionsApi = new BulkActionsApi()
