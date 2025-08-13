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

interface CRDDetails {
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

interface ConfigMapDetails {
	summary: {
		name: string
		namespace: string
		age: string
		dataKeysCount: number
		dataSize: string
		dataSizeBytes: number
		dataKeys: string[]
		labelsCount: number
		annotationsCount: number
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

interface PersistentVolumeDetails {
	summary: {
		name: string
		capacity: string
		accessModes: string[]
		accessModesDisplay: string
		reclaimPolicy: string
		status: string
		claim: string
		storageClass: string
		volumeSource: string
		age: string
		labelsCount: number
		annotationsCount: number
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec: Record<string, unknown>
	status: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

interface PersistentVolumeClaimDetails {
	summary: {
		name: string
		namespace: string
		status: string
		volume: string
		capacity: string
		accessModes: string[]
		accessModesDisplay: string
		storageClass: string
		age: string
		labelsCount: number
		annotationsCount: number
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec: Record<string, unknown>
	status: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

interface StorageClassDetails {
	summary: {
		name: string
		provisioner: string
		reclaimPolicy: string
		volumeBindingMode: string
		allowVolumeExpansion: boolean
		isDefault: boolean
		age: string
		labelsCount: number
		annotationsCount: number
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

interface VolumeSnapshotDetails {
	summary: {
		name: string
		namespace: string
		sourcePVC: string
		volumeSnapshotClassName: string
		readyToUse: boolean
		restoreSize: string
		creationTime: string
		snapshotHandle: string
		age: string
		labelsCount: number
		annotationsCount: number
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec: Record<string, unknown>
	status: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

interface VolumeSnapshotClassDetails {
	summary: {
		name: string
		driver: string
		deletionPolicy: string
		age: string
		labelsCount: number
		annotationsCount: number
		parametersCount: number
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
		parameters?: Record<string, string>
	}
	spec: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

export function useConfigMapDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<ConfigMapDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchConfigMapDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/config-maps/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch config map details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchConfigMapDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useLoadBalancerDetails(namespace: string, name: string, enabled: boolean = true) {
	// LoadBalancers are Services with type=LoadBalancer, so we can reuse the service details hook
	return useServiceDetails(namespace, name, enabled)
}

export function usePersistentVolumeDetails(name: string, enabled: boolean = true) {
	const [data, setData] = useState<PersistentVolumeDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !name) {
			setData(null)
			return
		}

		const fetchPersistentVolumeDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/persistent-volumes/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch persistent volume details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchPersistentVolumeDetails()
	}, [name, enabled])

	return { data, loading, error }
}

export function usePersistentVolumeClaimDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<PersistentVolumeClaimDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchPersistentVolumeClaimDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/persistent-volume-claims/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch persistent volume claim details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchPersistentVolumeClaimDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useStorageClassDetails(name: string, enabled: boolean = true) {
	const [data, setData] = useState<StorageClassDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !name) {
			setData(null)
			return
		}

		const fetchStorageClassDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/storage-classes/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch storage class details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchStorageClassDetails()
	}, [name, enabled])

	return { data, loading, error }
}

export function useVolumeSnapshotDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<VolumeSnapshotDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchVolumeSnapshotDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/volume-snapshots/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch volume snapshot details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchVolumeSnapshotDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useVolumeSnapshotClassDetails(name: string, enabled: boolean = true) {
	const [data, setData] = useState<VolumeSnapshotClassDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !name) {
			setData(null)
			return
		}

		const fetchVolumeSnapshotClassDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/volume-snapshot-classes/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch volume snapshot class details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchVolumeSnapshotClassDetails()
	}, [name, enabled])

	return { data, loading, error }
}

interface CSIDriverDetails {
	summary: {
		name: string
		attachRequired: boolean
		podInfoOnMount: boolean
		requiresRepublish: boolean
		storageCapacity: boolean
		fsGroupPolicy: string
		volumeLifecycleModes: number
		tokenRequests: number
		age: string
		labelsCount: number
		annotationsCount: number
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

export function useCSIDriverDetails(name: string, enabled: boolean = true) {
	const [data, setData] = useState<CSIDriverDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !name) {
			setData(null)
			return
		}

		const fetchCSIDriverDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/csi-drivers/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch CSI driver details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchCSIDriverDetails()
	}, [name, enabled])

	return { data, loading, error }
}

interface NodeDetails {
	summary: {
		name: string
		status: {
			ready: boolean
			unschedulable: boolean
			conditions: Array<{
				type: string
				status: string
				lastTransitionTime: string
				message: string
				reason: string
			}>
		}
		capacity: {
			cpu: string
			memory: string
			[key: string]: string
		}
		allocatable: {
			cpu: string
			memory: string
			[key: string]: string
		}
		nodeInfo: {
			kubeletVersion: string
			osImage: string
			containerRuntimeVersion: string
			architecture: string
			operatingSystem: string
		}
		age: string
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec: Record<string, unknown>
	status: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

interface NamespaceDetails {
	summary: {
		name: string
		status: string
		age: string
		labelsCount: number
		annotationsCount: number
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
	}
	spec: Record<string, unknown>
	status: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

interface ResourceQuotaDetails {
	summary: {
		name: string
		namespace: string
		age: string
		labelsCount: number
		annotationsCount: number
		creationTimestamp: string
		labels?: Record<string, string>
		annotations?: Record<string, string>
		hardLimits: Array<{
			name: string
			limit: string
		}>
		usedResources: Array<{
			name: string
			used: string
		}>
	}
	spec: Record<string, unknown>
	status: Record<string, unknown>
	metadata: Record<string, unknown>
	kind: string
	apiVersion: string
}

export function useNamespaceDetails(name: string, enabled: boolean = true) {
	const [data, setData] = useState<NamespaceDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !name) {
			setData(null)
			return
		}

		const fetchNamespaceDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/namespaces/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch namespace details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchNamespaceDetails()
	}, [name, enabled])

	return { data, loading, error }
}

export function useResourceQuotaDetails(namespace: string, name: string, enabled: boolean = true) {
	const [data, setData] = useState<ResourceQuotaDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !namespace || !name) {
			setData(null)
			return
		}

		const fetchResourceQuotaDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/resource-quotas/${namespace}/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch resource quota details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchResourceQuotaDetails()
	}, [namespace, name, enabled])

	return { data, loading, error }
}

export function useNodeDetails(name: string, enabled: boolean = true) {
	const [data, setData] = useState<NodeDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !name) {
			setData(null)
			return
		}

		const fetchNodeDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/nodes/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch node details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchNodeDetails()
	}, [name, enabled])

	return { data, loading, error }
}

export function useCRDDetails(name: string, enabled: boolean = true) {
	const [data, setData] = useState<CRDDetails | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!enabled || !name) {
			setData(null)
			return
		}

		const fetchCRDDetails = async () => {
			setLoading(true)
			setError(null)

			try {
				const response = await fetch(`/api/v1/crds/${name}`)
				const result = await response.json()

				if (result.status === 'success') {
					setData(result.data)
				} else {
					setError(result.error || 'Failed to fetch CRD details')
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error')
			} finally {
				setLoading(false)
			}
		}

		fetchCRDDetails()
	}, [name, enabled])

	return { data, loading, error }
}
