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

interface StatefulSetDetails {
	summary: any
	spec: any
	status: any
	metadata: any
	kind: string
	apiVersion: string
}

interface DaemonSetDetails {
	summary: any
	spec: any
	status: any
	metadata: any
	kind: string
	apiVersion: string
}

interface ReplicaSetDetails {
	summary: any
	spec: any
	status: any
	metadata: any
	kind: string
	apiVersion: string
}

interface JobDetails {
	summary: any
	spec: any
	status: any
	metadata: any
	kind: string
	apiVersion: string
}

interface CronJobDetails {
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

interface ServiceDetails {
	summary: Record<string, unknown>
	spec: Record<string, unknown>
	status: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

export function useServiceDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<ServiceDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchServiceDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/services/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch service details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchServiceDetails()
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

export function useStatefulSetDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<StatefulSetDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchStatefulSetDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/statefulsets/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch statefulset details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchStatefulSetDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useDaemonSetDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<DaemonSetDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchDaemonSetDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/daemonsets/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch daemonset details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchDaemonSetDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useReplicaSetDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<ReplicaSetDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchReplicaSetDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/replicasets/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch replicaset details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchReplicaSetDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useJobDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<JobDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchJobDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/k8s-jobs/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch job details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchJobDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useCronJobDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<CronJobDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchCronJobDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/cronjobs/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === "success") {
					setData(result.data)
				} else {
					setError(result.error || "Failed to fetch cronjob details")
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error")
			} finally {
				setLoading(false)
			}
		}

		fetchCronJobDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

interface IngressDetails {
	summary: Record<string, unknown>
	spec: Record<string, unknown>
	status: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

interface EndpointsDetails {
	summary: Record<string, unknown>
	subsets: Record<string, unknown>[]
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

export function useIngressDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<IngressDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchIngressDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/ingresses/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch ingress details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchIngressDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useEndpointsDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<EndpointsDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchEndpointsDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/endpoints/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch endpoints details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchEndpointsDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

interface EndpointSliceDetails {
	summary: Record<string, unknown>
	spec: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

export function useEndpointSliceDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<EndpointSliceDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchEndpointSliceDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/endpoint-slices/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch endpoint slice details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchEndpointSliceDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

interface NetworkPolicyDetails {
	summary: {
		name: string
		namespace: string
		age: string
		podSelector: string
		ingressRules: number
		egressRules: number
		policyTypes: string
		affectedPods: number
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

export function useNetworkPolicyDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<NetworkPolicyDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchNetworkPolicyDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/network-policies/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch network policy details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchNetworkPolicyDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useLoadBalancerDetails(namespace: string, name: string, enabled: boolean = true) {
	// LoadBalancers are Services with type=LoadBalancer, so we can reuse the service details hook
	return useServiceDetails(namespace, name, enabled)
}
