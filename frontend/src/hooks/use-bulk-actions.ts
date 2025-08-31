import * as React from "react"
import { bulkActionsApi, type BulkActionTarget, type BulkActionResponse } from "@/lib/api/bulk-actions"

interface UseBulkActionsOptions {
	onSuccess?: (response: BulkActionResponse) => void
	onError?: (error: Error) => void
}

export function useBulkActions(options: UseBulkActionsOptions = {}) {
	const [isExecuting, setIsExecuting] = React.useState(false)
	const [lastResponse, setLastResponse] = React.useState<BulkActionResponse | null>(null)
	const [error, setError] = React.useState<Error | null>(null)

	const executeAction = React.useCallback(async (
		resource: string,
		action: string,
		targets: BulkActionTarget[],
		forceConfirm = false
	) => {
		try {
			setIsExecuting(true)
			setError(null)

			const response = await bulkActionsApi.executeBulkAction(resource, {
				action,
				targets,
				force_confirm: forceConfirm,
			})

			setLastResponse(response)

			if (response.success) {
				options.onSuccess?.(response)
			} else {
				const error = new Error(response.message || 'Action failed')
				setError(error)
				options.onError?.(error)
			}

			return response
		} catch (err) {
			const error = err instanceof Error ? err : new Error('Unknown error occurred')
			setError(error)
			options.onError?.(error)
			throw error
		} finally {
			setIsExecuting(false)
		}
	}, [options])

	const validateAction = React.useCallback(async (
		resource: string,
		action: string,
		targets: BulkActionTarget[]
	) => {
		try {
			const response = await bulkActionsApi.validateAction(resource, {
				action,
				targets,
				dry_run: true,
			})
			return response
		} catch (err) {
			const error = err instanceof Error ? err : new Error('Validation failed')
			setError(error)
			throw error
		}
	}, [])

	// Specific action methods
	const restartPods = React.useCallback(
		(targets: BulkActionTarget[], forceConfirm = false) =>
			executeAction('pods', 'restart-pods', targets, forceConfirm),
		[executeAction]
	)

	const deletePods = React.useCallback(
		(targets: BulkActionTarget[], forceConfirm = false) =>
			executeAction('pods', 'delete-pods', targets, forceConfirm),
		[executeAction]
	)

	const restartDeployments = React.useCallback(
		(targets: BulkActionTarget[], forceConfirm = false) =>
			executeAction('deployments', 'restart-deployments', targets, forceConfirm),
		[executeAction]
	)

	const deleteDeployments = React.useCallback(
		(targets: BulkActionTarget[], forceConfirm = false) =>
			executeAction('deployments', 'delete-deployments', targets, forceConfirm),
		[executeAction]
	)

	const clearError = React.useCallback(() => {
		setError(null)
	}, [])

	return {
		isExecuting,
		lastResponse,
		error,
		executeAction,
		validateAction,
		restartPods,
		deletePods,
		restartDeployments,
		deleteDeployments,
		clearError,
	}
}
