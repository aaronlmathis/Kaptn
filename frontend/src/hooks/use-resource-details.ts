import { useState, useEffect } from 'react'

interface PodDetails {
	summary: any
	spec: any
	status: any
	metadata: any
	kind: string
	apiVersion: string
}

interface DeploymentDetails {
	summary: any
	spec: any
	status: any
	metadata: any
	kind: string
	apiVersion: string
}

export function usePodDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<PodDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchPodDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/pods/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch pod details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchPodDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useDeploymentDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<DeploymentDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchDeploymentDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/deployments/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch deployment details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchDeploymentDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}
