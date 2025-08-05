import { useState, useEffect, useCallback } from 'react';
import {
	k8sService,
	type DashboardPod,
	type NodeTableRow,
	type ServiceTableRow,
	type DashboardDeployment,
	type DashboardStatefulSet,
	type DashboardDaemonSet,
	type DashboardReplicaSet,
	type DashboardJob,
	type DashboardCronJob,
	type DashboardEndpoints,
	type DashboardIngress,
	type DashboardNetworkPolicy,
	type OverviewData,
	transformPodsToUI,
	transformNodesToUI,
	transformServicesToUI,
	transformDeploymentsToUI,
	transformStatefulSetsToUI,
	transformDaemonSetsToUI,
	transformReplicaSetsToUI,
	transformJobsToUI,
	transformCronJobsToUI,
	transformEndpointsToUI,
	transformIngressesToUI,
	transformNetworkPoliciesToUI
} from '@/lib/k8s-api';
import { wsService } from '@/lib/websocket';
import { useNamespace } from '@/contexts/namespace-context';

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
			const pods = await k8sService.getPods(namespace);
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
			const services = await k8sService.getServices(namespace);
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
			const deployments = await k8sService.getDeployments(namespace);
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
			const statefulSets = await k8sService.getStatefulSets(namespace);
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
			const daemonSets = await k8sService.getDaemonSets(namespace);
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
			const replicaSets = await k8sService.getReplicaSets(namespace);
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
			const jobs = await k8sService.getJobs(namespace);
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
			const cronJobs = await k8sService.getCronJobs(namespace);
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
			const endpoints = await k8sService.getEndpoints(namespace);
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
			const ingresses = await k8sService.getIngresses(namespace);
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
			const networkPolicies = await k8sService.getNetworkPolicies(namespace);
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
		console.log('Setting up WebSocket connection for overview...');
		wsService.connect('/stream/overview');

		const handleOverviewUpdate = (message: any) => {
			console.log('Overview update received:', message);
			if (message.type === 'overviewUpdate') {
				console.log('Setting new overview data:', message.data);
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
