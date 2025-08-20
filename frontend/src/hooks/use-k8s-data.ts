import { useState, useEffect, useCallback } from 'react';
import { k8sService } from '@/lib/k8s-service';
import {
	type NodeTableRow,
	type DashboardNamespace,
	type DashboardResourceQuota,
	type DashboardAPIResource,
	type OverviewData,
	transformNodesToUI,
	transformNamespacesToUI,
	transformResourceQuotasToUI,
	transformAPIResourcesToUI
} from '@/lib/k8s-cluster';
import {
	type DashboardConfigMap,
	type DashboardPersistentVolume,
	type DashboardPersistentVolumeClaim,
	type DashboardStorageClass,
	type DashboardCSIDriver,
	type DashboardVolumeSnapshotClass,
	type DashboardVolumeSnapshot,
	transformConfigMapsToUI,
	transformPersistentVolumesToUI,
	transformPersistentVolumeClaimsToUI,
	transformStorageClassesToUI,
	transformCSIDriversToUI,
	transformVolumeSnapshotClassesToUI,
	transformVolumeSnapshotsToUI
} from '@/lib/k8s-storage';
import {
	type ServiceTableRow,
	type DashboardEndpoints,
	type DashboardEndpointSlice,
	type DashboardIngress,
	type DashboardNetworkPolicy,
	getServices,
	getEndpoints,
	getEndpointSlices,
	getIngresses,
	getNetworkPolicies,
	transformServicesToUI,
	transformEndpointsToUI,
	transformEndpointSlicesToUI,
	transformIngressesToUI,
	transformNetworkPoliciesToUI
} from '@/lib/k8s-services';
import {
	type DashboardPod,
	type DashboardDeployment,
	type DashboardStatefulSet,
	type DashboardDaemonSet,
	type DashboardReplicaSet,
	type DashboardJob,
	type DashboardCronJob,
	transformPodsToUI,
	transformDeploymentsToUI,
	transformStatefulSetsToUI,
	transformDaemonSetsToUI,
	transformReplicaSetsToUI,
	transformJobsToUI,
	transformCronJobsToUI,
	getPods,
	getDeployments,
	getStatefulSets,
	getDaemonSets,
	getReplicaSets,
	getJobs,
	getCronJobs
} from '@/lib/k8s-workloads';
import { wsService } from '@/lib/websocket';
import { useNamespace } from '@/contexts/namespace-context';
import { type LoadBalancer } from '@/lib/schemas/loadbalancer';

interface UseK8sDataResult<T> {
	data: T[];
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

export function usePods(): UseK8sDataResult<DashboardPod> {
	const [data, setData] = useState<DashboardPod[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const pods = await getPods(namespace);
			const transformedPods = transformPodsToUI(pods);
			setData(transformedPods);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch pods');
			console.error('Error fetching pods:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useNodes(): UseK8sDataResult<NodeTableRow> {
	const [data, setData] = useState<NodeTableRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const nodes = await k8sService.getNodes();
			const transformedNodes = transformNodesToUI(nodes);
			setData(transformedNodes);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch nodes');
			console.error('Error fetching nodes:', err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useServices(): UseK8sDataResult<ServiceTableRow> {
	const [data, setData] = useState<ServiceTableRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const services = await getServices(namespace);
			const transformedServices = transformServicesToUI(services);
			setData(transformedServices);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch services');
			console.error('Error fetching services:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useLoadBalancers(): UseK8sDataResult<LoadBalancer> {
	const [data, setData] = useState<LoadBalancer[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const services = await getServices(namespace);
			// Filter to only LoadBalancer type services
			const loadBalancerServices = services.filter(service => service.type === 'LoadBalancer');
			const transformedServices = transformServicesToUI(loadBalancerServices);
			// Transform to LoadBalancer format (they have the same structure for now)
			const loadBalancers: LoadBalancer[] = transformedServices.map(service => ({
				...service,
				loadBalancerIP: service.externalIP !== '<none>' ? service.externalIP : undefined,
				ingressPoints: service.externalIP !== '<none>' ? [service.externalIP] : undefined,
			}));
			setData(loadBalancers);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch load balancers');
			console.error('Error fetching load balancers:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useDeployments(): UseK8sDataResult<DashboardDeployment> {
	const [data, setData] = useState<DashboardDeployment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const deployments = await getDeployments(namespace);
			const transformedDeployments = transformDeploymentsToUI(deployments);
			setData(transformedDeployments);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch deployments');
			console.error('Error fetching deployments:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useStatefulSets(): UseK8sDataResult<DashboardStatefulSet> {
	const [data, setData] = useState<DashboardStatefulSet[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const statefulSets = await getStatefulSets(namespace);
			const transformedStatefulSets = transformStatefulSetsToUI(statefulSets);
			setData(transformedStatefulSets);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch statefulsets');
			console.error('Error fetching statefulsets:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useDaemonSets(): UseK8sDataResult<DashboardDaemonSet> {
	const [data, setData] = useState<DashboardDaemonSet[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const daemonSets = await getDaemonSets(namespace);
			const transformedDaemonSets = transformDaemonSetsToUI(daemonSets);
			setData(transformedDaemonSets);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch daemonsets');
			console.error('Error fetching daemonsets:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useReplicaSets(): UseK8sDataResult<DashboardReplicaSet> {
	const [data, setData] = useState<DashboardReplicaSet[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const replicaSets = await getReplicaSets(namespace);
			const transformedReplicaSets = transformReplicaSetsToUI(replicaSets);
			setData(transformedReplicaSets);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch replicasets');
			console.error('Error fetching replicasets:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useJobs(): UseK8sDataResult<DashboardJob> {
	const [data, setData] = useState<DashboardJob[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const jobs = await getJobs(namespace);
			const transformedJobs = transformJobsToUI(jobs);
			setData(transformedJobs);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
			console.error('Error fetching jobs:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useCronJobs(): UseK8sDataResult<DashboardCronJob> {
	const [data, setData] = useState<DashboardCronJob[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const cronJobs = await getCronJobs(namespace);
			const transformedCronJobs = transformCronJobsToUI(cronJobs);
			setData(transformedCronJobs);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch cronjobs');
			console.error('Error fetching cronjobs:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useEndpoints(): UseK8sDataResult<DashboardEndpoints> {
	const [data, setData] = useState<DashboardEndpoints[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const endpoints = await getEndpoints(namespace);
			const transformedEndpoints = transformEndpointsToUI(endpoints);
			setData(transformedEndpoints);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch endpoints');
			console.error('Error fetching endpoints:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useEndpointSlices(): UseK8sDataResult<DashboardEndpointSlice> {
	const [data, setData] = useState<DashboardEndpointSlice[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const endpointSlices = await getEndpointSlices(namespace);
			const transformedEndpointSlices = transformEndpointSlicesToUI(endpointSlices);
			setData(transformedEndpointSlices);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch endpoint slices');
			console.error('Error fetching endpoint slices:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useIngresses(): UseK8sDataResult<DashboardIngress> {
	const [data, setData] = useState<DashboardIngress[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const ingresses = await getIngresses(namespace);
			const transformedIngresses = transformIngressesToUI(ingresses);
			setData(transformedIngresses);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch ingresses');
			console.error('Error fetching ingresses:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useNetworkPolicies(): UseK8sDataResult<DashboardNetworkPolicy> {
	const [data, setData] = useState<DashboardNetworkPolicy[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const networkPolicies = await getNetworkPolicies(namespace);
			const transformedNetworkPolicies = transformNetworkPoliciesToUI(networkPolicies);
			setData(transformedNetworkPolicies);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch network policies');
			console.error('Error fetching network policies:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useConfigMaps(): UseK8sDataResult<DashboardConfigMap> {
	const [data, setData] = useState<DashboardConfigMap[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const configMaps = await k8sService.getConfigMaps(namespace);
			const transformedConfigMaps = transformConfigMapsToUI(configMaps);
			setData(transformedConfigMaps);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch config maps');
			console.error('Error fetching config maps:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

// Generic hook for any K8s resource with refresh functionality
export function useK8sData<T>(
	fetchFn: () => Promise<T[]>,
	transformFn: (data: T[]) => any[],
	deps: any[] = []
) {
	const [data, setData] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const result = await fetchFn();
			const transformed = transformFn(result);
			setData(transformed);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch data');
			console.error('Error fetching data:', err);
		} finally {
			setLoading(false);
		}
	}, deps); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useOverview(): UseK8sDataResult<OverviewData> {
	const [data, setData] = useState<OverviewData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const overview = await k8sService.getOverview();
			setData(overview);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch overview');
			console.error('Error fetching overview:', err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData();

		// Set up real-time WebSocket updates
		//console.log('Setting up WebSocket connection for overview...');
		wsService.connect('/stream/overview');

		const handleOverviewUpdate = (message: any) => {
			//console.log('Overview update received:', message);
			if (message.type === 'overviewUpdate') {
				//console.log('Setting new overview data:', message.data);
				setData(message.data);
			}
		};

		wsService.on('overviewUpdate', handleOverviewUpdate);

		return () => {
			console.log('Cleaning up WebSocket connection...');
			wsService.off('overviewUpdate', handleOverviewUpdate);
			wsService.disconnect();
		};
	}, [fetchData]);

	// Return data as an array to maintain compatibility with UseK8sDataResult interface
	return {
		data: data ? [data] : [],
		loading,
		error,
		refetch: fetchData
	} as UseK8sDataResult<OverviewData>;
}

export function usePersistentVolumes(): UseK8sDataResult<DashboardPersistentVolume> {
	const [data, setData] = useState<DashboardPersistentVolume[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const persistentVolumes = await k8sService.getPersistentVolumes();
			const transformedPVs = transformPersistentVolumesToUI(persistentVolumes);
			setData(transformedPVs);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch persistent volumes');
			console.error('Error fetching persistent volumes:', err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function usePersistentVolumeClaims(): UseK8sDataResult<DashboardPersistentVolumeClaim> {
	const [data, setData] = useState<DashboardPersistentVolumeClaim[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const persistentVolumeClaims = await k8sService.getPersistentVolumeClaims(namespace);
			const transformedPVCs = transformPersistentVolumeClaimsToUI(persistentVolumeClaims);
			setData(transformedPVCs);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch persistent volume claims');
			console.error('Error fetching persistent volume claims:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useStorageClasses(): UseK8sDataResult<DashboardStorageClass> {
	const [data, setData] = useState<DashboardStorageClass[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			// StorageClasses are cluster-scoped, so no namespace parameter needed
			const storageClasses = await k8sService.getStorageClasses();
			const transformedStorageClasses = transformStorageClassesToUI(storageClasses);
			setData(transformedStorageClasses);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch storage classes');
			console.error('Error fetching storage classes:', err);
		} finally {
			setLoading(false);
		}
	}, []); // No dependency on selectedNamespace since StorageClasses are cluster-scoped

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useCSIDrivers(): UseK8sDataResult<DashboardCSIDriver> {
	const [data, setData] = useState<DashboardCSIDriver[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			// CSIDrivers are cluster-scoped, so no namespace parameter needed
			const csiDrivers = await k8sService.getCSIDrivers();
			const transformedCSIDrivers = transformCSIDriversToUI(csiDrivers);
			setData(transformedCSIDrivers);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch CSI drivers');
			console.error('Error fetching CSI drivers:', err);
		} finally {
			setLoading(false);
		}
	}, []); // No dependency on selectedNamespace since CSIDrivers are cluster-scoped

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useVolumeSnapshots(): UseK8sDataResult<DashboardVolumeSnapshot> {
	const [data, setData] = useState<DashboardVolumeSnapshot[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const volumeSnapshots = await k8sService.getVolumeSnapshots(namespace);
			const transformedVolumeSnapshots = transformVolumeSnapshotsToUI(volumeSnapshots);
			setData(transformedVolumeSnapshots);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch volume snapshots');
			console.error('Error fetching volume snapshots:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useNamespaces(): UseK8sDataResult<DashboardNamespace> {
	const [data, setData] = useState<DashboardNamespace[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			// Namespaces are cluster-scoped, so no namespace parameter needed
			const namespaces = await k8sService.getNamespaces();
			const transformedNamespaces = transformNamespacesToUI(namespaces);
			setData(transformedNamespaces);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch namespaces');
			console.error('Error fetching namespaces:', err);
		} finally {
			setLoading(false);
		}
	}, []); // No dependency on selectedNamespace since Namespaces are cluster-scoped

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useResourceQuotas(): UseK8sDataResult<DashboardResourceQuota> {
	const [data, setData] = useState<DashboardResourceQuota[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { selectedNamespace } = useNamespace();

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const namespace = selectedNamespace === 'all' ? undefined : selectedNamespace;
			const resourceQuotas = await k8sService.getResourceQuotas(namespace);
			const transformedResourceQuotas = transformResourceQuotasToUI(resourceQuotas);
			setData(transformedResourceQuotas);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch resource quotas');
			console.error('Error fetching resource quotas:', err);
		} finally {
			setLoading(false);
		}
	}, [selectedNamespace]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useVolumeSnapshotClasses(): UseK8sDataResult<DashboardVolumeSnapshotClass> {
	const [data, setData] = useState<DashboardVolumeSnapshotClass[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			// VolumeSnapshotClasses are cluster-scoped, so no namespace parameter needed
			const volumeSnapshotClasses = await k8sService.getVolumeSnapshotClasses();
			const transformedVolumeSnapshotClasses = transformVolumeSnapshotClassesToUI(volumeSnapshotClasses);
			setData(transformedVolumeSnapshotClasses);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch volume snapshot classes');
			console.error('Error fetching volume snapshot classes:', err);
		} finally {
			setLoading(false);
		}
	}, []); // No dependency on selectedNamespace since VolumeSnapshotClasses are cluster-scoped

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}

export function useAPIResources(): UseK8sDataResult<DashboardAPIResource> {
	const [data, setData] = useState<DashboardAPIResource[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const apiResources = await k8sService.getAPIResources();
			const transformedAPIResources = transformAPIResourcesToUI(apiResources);
			setData(transformedAPIResources);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch API resources');
			console.error('Error fetching API resources:', err);
		} finally {
			setLoading(false);
		}
	}, []); // No dependencies since API resources are cluster-scoped and static

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	return { data, loading, error, refetch: fetchData };
}
