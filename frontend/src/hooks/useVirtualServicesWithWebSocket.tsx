import * as React from "react"
import { z } from "zod"
import { useNamespace } from "@/contexts/namespace-context"
import { virtualServiceSchema } from "@/types/virtual-service"

// Type for raw API response
interface VirtualServiceApiItem {
	metadata: {
		name: string
		namespace: string
		creationTimestamp: string
	}
	spec: {
		gateways?: string[]
		hosts?: string[]
	}
}

// Hook for fetching virtual services with WebSocket updates
export function useVirtualServicesWithWebSocket(enableWebSocket = true) {
	const [data, setData] = React.useState<z.infer<typeof virtualServiceSchema>[]>([])
	const [loading, setLoading] = React.useState(true)
	const [error, setError] = React.useState<string | null>(null)
	const [isConnected, setIsConnected] = React.useState(false)
	const { selectedNamespace } = useNamespace()

	React.useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true)
				const url = selectedNamespace === "all"
					? "/api/v1/istio/virtualservices"
					: `/api/v1/istio/virtualservices?namespace=${selectedNamespace}`

				const response = await fetch(url)
				if (!response.ok) {
					throw new Error(`Failed to fetch virtual services: ${response.statusText}`)
				}

				const result = await response.json()
				if (result.status === 'success') {
					const transformedData = result.data.items.map((item: VirtualServiceApiItem, index: number) => ({
						id: index + 1,
						name: item.metadata.name,
						namespace: item.metadata.namespace,
						gateways: item.spec.gateways || [],
						hosts: item.spec.hosts || [],
						age: calculateAge(item.metadata.creationTimestamp),
					}))
					setData(transformedData)
				} else {
					throw new Error(result.error || 'Failed to fetch virtual services')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchData()

		// WebSocket implementation
		if (enableWebSocket && selectedNamespace) {
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
			const wsUrl = `${protocol}//${window.location.host}/api/v1/ws/istio/virtualservices`

			const ws = new WebSocket(wsUrl)

			ws.onopen = () => {
				setIsConnected(true)
				// Send namespace filter if needed
				if (selectedNamespace !== "all") {
					ws.send(JSON.stringify({ namespace: selectedNamespace }))
				}
			}

			ws.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data)
					if (message.type === 'virtualservices' && message.data) {
						const transformedData = message.data.items.map((item: VirtualServiceApiItem, index: number) => ({
							id: index + 1,
							name: item.metadata.name,
							namespace: item.metadata.namespace,
							gateways: item.spec.gateways || [],
							hosts: item.spec.hosts || [],
							age: calculateAge(item.metadata.creationTimestamp),
						}))
						setData(transformedData)
					}
				} catch (err) {
					console.error('Error parsing WebSocket message:', err)
				}
			}

			ws.onclose = () => {
				setIsConnected(false)
			}

			ws.onerror = (error) => {
				console.error('WebSocket error:', error)
				setIsConnected(false)
			}

			return () => {
				ws.close()
			}
		}
	}, [selectedNamespace, enableWebSocket])

	const refetch = React.useCallback(async () => {
		// Re-trigger the fetch
		setLoading(true)
		try {
			const url = selectedNamespace === "all"
				? "/api/v1/istio/virtualservices"
				: `/api/v1/istio/virtualservices?namespace=${selectedNamespace}`

			const response = await fetch(url)
			if (!response.ok) {
				throw new Error(`Failed to fetch virtual services: ${response.statusText}`)
			}

			const result = await response.json()
			if (result.status === 'success') {
				const transformedData = result.data.items.map((item: VirtualServiceApiItem, index: number) => ({
					id: index + 1,
					name: item.metadata.name,
					namespace: item.metadata.namespace,
					gateways: item.spec.gateways || [],
					hosts: item.spec.hosts || [],
					age: calculateAge(item.metadata.creationTimestamp),
				}))
				setData(transformedData)
			} else {
				throw new Error(result.error || 'Failed to fetch virtual services')
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error')
		} finally {
			setLoading(false)
		}
	}, [selectedNamespace])

	return { data, loading, error, refetch, isConnected }
}

// Helper function to calculate age
function calculateAge(creationTimestamp: string): string {
	const created = new Date(creationTimestamp)
	const now = new Date()
	const diffMs = now.getTime() - created.getTime()
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

	if (diffDays === 0) {
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
		if (diffHours === 0) {
			const diffMinutes = Math.floor(diffMs / (1000 * 60))
			return `${diffMinutes}m`
		}
		return `${diffHours}h`
	}
	return `${diffDays}d`
}
