import { apiClient } from './api-client';

// Pod interfaces based on the actual backend API response
export interface Pod {
	name: string;
	namespace: string;
	phase: string;
	ready: string; // Format like "1/1"
	node: string;
	podIP: string;
	age: string;
	creationTimestamp: string;
	restartCount: number;
	labels: Record<string, string>;
	cpu?: {
		milli: number;
		ofLimitPercent?: number | null;
	};
	memory?: {
		bytes: number;
		ofLimitPercent?: number | null;
	};
	statusReason?: string | null;
}

// Node interfaces based on the actual backend API response
export interface Node {
	name: string;
	roles: string[];
	age: string;
	creationTimestamp: string;
	status: {
		ready: boolean;
		unschedulable: boolean;
		conditions: Array<{
			type: string;
			status: string;
			lastTransitionTime: string;
			message: string;
			reason: string;
		}>;
	};
	capacity: {
		cpu: string;
		memory: string;
		[key: string]: string;
	};
	allocatable: {
		cpu: string;
		memory: string;
		[key: string]: string;
	};
	nodeInfo: {
		kubeletVersion: string;
		osImage: string;
		containerRuntime: string;
		architecture: string;
		kernel: string;
	};
	labels: Record<string, string>;
	taints?: Array<{
		key: string;
		value?: string;
		effect: string;
	}> | null;
}// Service interfaces based on the actual backend API response
export interface Service {
	name: string;
	namespace: string;
	type: string;
	clusterIP: string;
	externalIPs: string[] | null;
	age: string;
	creationTimestamp: string;
	ports: Array<{
		name?: string;
		port: number;
		protocol: string;
		targetPort: string | number;
		nodePort?: number;
	}> | null;
	selector: Record<string, string> | null;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
}

// Ingress interfaces based on the actual backend API response
export interface Ingress {
	name: string;
	namespace: string;
	age: string;
	ingressClass: string;
	hosts: string[];
	hostsDisplay: string;
	paths: string[];
	externalIPs: string[];
	externalIPsDisplay: string;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
}

// Deployment interfaces based on the actual backend API response
export interface Deployment {
	name: string;
	namespace: string;
	age: string;
	creationTimestamp: string;
	labels: Record<string, string>;
	replicas: {
		desired: number;
		ready: number;
		available: number;
		updated: number;
	};
	conditions: Array<{
		type: string;
		status: string;
		reason: string;
		message: string;
	}>;
}

// StatefulSet interfaces based on the actual backend API response
export interface StatefulSet {
	name: string;
	namespace: string;
	age: string;
	creationTimestamp: string;
	labels: Record<string, string>;
	replicas: {
		desired: number;
		ready: number;
		current: number;
		updated: number;
	};
	conditions: Array<{
		type: string;
		status: string;
		reason: string;
		message: string;
	}>;
	serviceName: string;
	updateStrategy: string;
	currentRevision?: string;
	updateRevision?: string;
}

// DaemonSet interfaces based on the actual backend API response
export interface DaemonSet {
	name: string;
	namespace: string;
	age: string;
	creationTimestamp: string;
	labels: Record<string, string>;
	status: {
		desired: number;
		current: number;
		ready: number;
		available: number;
		unavailable: number;
	};
	conditions: Array<{
		type: string;
		status: string;
		reason: string;
		message: string;
	}>;
	updateStrategy: string;
	selector: Record<string, unknown>;
}

// ReplicaSet interfaces based on the actual backend API response
export interface ReplicaSet {
	name: string;
	namespace: string;
	age: string;
	creationTimestamp: string;
	labels: Record<string, string>;
	replicas: {
		desired: number;
		ready: number;
		available: number;
		fullyLabeled: number;
	};
	conditions: Array<{
		type: string;
		status: string;
		reason: string;
		message: string;
	}>;
	selector: Record<string, unknown>;
}

// Job interfaces based on the actual backend API response
export interface Job {
	name: string;
	namespace: string;
	status: string;
	completions: string;
	duration: string;
	age: string;
	image: string;
	labels: Record<string, string>;
	creationTimestamp: string;
	parallelism: number;
	backoffLimit: number;
	activeDeadlineSeconds?: number;
	conditions: Array<{
		type: string;
		status: string;
		lastTransitionTime: string;
		reason: string;
		message: string;
	}>;
}

// CronJob interfaces based on the actual backend API response
export interface CronJob {
	name: string;
	namespace: string;
	schedule: string;
	suspend: boolean;
	active: number;
	lastSchedule: string;
	nextSchedule: string;
	age: string;
	image: string;
	labels: Record<string, string>;
	creationTimestamp: string;
	concurrencyPolicy: string;
	startingDeadlineSeconds?: number;
	successfulJobsHistoryLimit: number;
	failedJobsHistoryLimit: number;
}

// Namespace interface
export interface Namespace {
	metadata: {
		name: string;
		creationTimestamp: string;
		labels?: Record<string, string>;
	};
	status: {
		phase: string;
	};
}

// Interface for transformed data that matches the current UI schema
export interface DashboardPod {
	id: number;
	name: string;
	namespace: string;
	node: string;
	status: string;
	ready: string;
	restarts: number;
	age: string;
	cpu: string;
	memory: string;
	image: string;
}

export interface NodeTableRow {
	id: number;
	name: string;
	status: string;
	roles: string;
	age: string;
	version: string;
}

export interface ServiceTableRow {
	id: number;
	name: string;
	namespace: string;
	type: string;
	clusterIP: string;
	externalIP: string;
	ports: string;
	age: string;
}

export interface DashboardService {
	id: number;
	name: string;
	namespace: string;
	type: string;
	clusterIP: string;
	externalIP: string;
	ports: string;
	age: string;
}

export interface DashboardDeployment {
	id: number;
	name: string;
	namespace: string;
	ready: string;
	upToDate: number;
	available: number;
	age: string;
	image: string;
}

export interface DashboardStatefulSet {
	id: number;
	name: string;
	namespace: string;
	ready: string;
	current: number;
	updated: number;
	age: string;
	serviceName: string;
	updateStrategy: string;
}

export interface DashboardDaemonSet {
	id: number;
	name: string;
	namespace: string;
	desired: number;
	current: number;
	ready: number;
	available: number;
	unavailable: number;
	age: string;
	updateStrategy: string;
}

export interface DashboardReplicaSet {
	id: number;
	name: string;
	namespace: string;
	ready: string;
	desired: number;
	current: number;
	available: number;
	age: string;
}

export interface DashboardJob {
	id: number;
	name: string;
	namespace: string;
	status: string;
	completions: string;
	duration: string;
	age: string;
	image: string;
}

export interface DashboardCronJob {
	id: number;
	name: string;
	namespace: string;
	schedule: string;
	suspend: boolean;
	active: number;
	lastSchedule: string;
	age: string;
	image: string;
}

export interface DashboardIngress {
	id: number;
	name: string;
	namespace: string;
	age: string;
	ingressClass: string;
	hosts: string[];
	hostsDisplay: string;
	paths: string[];
	externalIPs: string[];
	externalIPsDisplay: string;
}

export class K8sService {
	// Pod operations
	async getPods(namespace?: string): Promise<Pod[]> {
		const query = namespace ? `?namespace=${namespace}` : '';
		const response = await apiClient.get<{ data: { items: Pod[] }; status: string }>(`/pods${query}`);
		return response.data.items;
	}

	async getPod(namespace: string, name: string): Promise<Pod> {
		return apiClient.get<Pod>(`/pods/${namespace}/${name}`);
	}

	async deletePod(namespace: string, name: string): Promise<{ success: boolean; message: string }> {
		return apiClient.delete(`/pods/${namespace}/${name}`);
	}

	// Node operations
	async getNodes(): Promise<Node[]> {
		const response = await apiClient.get<{ data: { items: Node[] }; status: string }>('/nodes');
		return response.data.items;
	} async cordonNode(nodeName: string): Promise<{ success: boolean; message: string }> {
		return apiClient.post(`/nodes/${nodeName}/cordon`);
	}

	async uncordonNode(nodeName: string): Promise<{ success: boolean; message: string }> {
		return apiClient.post(`/nodes/${nodeName}/uncordon`);
	}

	async drainNode(
		nodeName: string,
		options: { timeoutSeconds?: number; force?: boolean; deleteLocalData?: boolean; ignoreDaemonSets?: boolean } = {}
	): Promise<{ jobId: string; message: string; status: string }> {
		return apiClient.post(`/nodes/${nodeName}/drain`, options);
	}

	// Service operations
	async getServices(namespace?: string): Promise<Service[]> {
		const endpoint = namespace ? `/services/${namespace}` : '/services';
		const response = await apiClient.get<{ data: { items: Service[] }; status: string }>(endpoint);
		return response.data.items;
	}

	// Deployment operations (these might need to be implemented in the backend)
	async getDeployments(namespace?: string): Promise<Deployment[]> {
		const query = namespace ? `?namespace=${namespace}` : '';
		const response = await apiClient.get<{ data: { items: Deployment[] }; status: string }>(`/deployments${query}`);
		return response.data.items;
	}

	// StatefulSet operations
	async getStatefulSets(namespace?: string): Promise<StatefulSet[]> {
		const query = namespace ? `?namespace=${namespace}` : '';
		const response = await apiClient.get<{ data: { items: StatefulSet[] }; status: string }>(`/statefulsets${query}`);
		return response.data.items;
	}

	// DaemonSet operations
	async getDaemonSets(namespace?: string): Promise<DaemonSet[]> {
		const query = namespace ? `?namespace=${namespace}` : '';
		const response = await apiClient.get<{ data: { items: DaemonSet[] }; status: string }>(`/daemonsets${query}`);
		return response.data.items;
	}

	// ReplicaSet operations
	async getReplicaSets(namespace?: string): Promise<ReplicaSet[]> {
		const query = namespace ? `?namespace=${namespace}` : '';
		const response = await apiClient.get<{ data: { items: ReplicaSet[] }; status: string }>(`/replicasets${query}`);
		return response.data.items;
	}

	// Job operations
	async getJobs(namespace?: string): Promise<Job[]> {
		const query = namespace ? `?namespace=${namespace}` : '';
		const response = await apiClient.get<{ data: { items: Job[] }; status: string }>(`/k8s-jobs${query}`);
		return response.data.items;
	}

	async getJob(namespace: string, name: string): Promise<Job> {
		return apiClient.get<Job>(`/k8s-jobs/${namespace}/${name}`);
	}

	// CronJob operations
	async getCronJobs(namespace?: string): Promise<CronJob[]> {
		const query = namespace ? `?namespace=${namespace}` : '';
		const response = await apiClient.get<{ data: { items: CronJob[] }; status: string }>(`/cronjobs${query}`);
		return response.data.items;
	}

	async getCronJob(namespace: string, name: string): Promise<CronJob> {
		return apiClient.get<CronJob>(`/cronjobs/${namespace}/${name}`);
	}

	// Ingress operations
	async getIngresses(namespace?: string): Promise<Ingress[]> {
		const query = namespace ? `?namespace=${namespace}` : '';
		const response = await apiClient.get<{ data: { items: Ingress[] }; status: string }>(`/ingresses${query}`);
		return response.data.items;
	}

	async getIngress(namespace: string, name: string): Promise<{ summary: Ingress; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
		const response = await apiClient.get<{ data: { summary: Ingress; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/ingresses/${namespace}/${name}`);
		return response.data;
	}

	// Namespace operations
	async getNamespaces(): Promise<Namespace[]> {
		return apiClient.get<Namespace[]>('/namespaces');
	}

	// YAML operations
	async applyYaml(
		namespace: string,
		yaml: string,
		options: { dryRun?: boolean; force?: boolean } = {}
	): Promise<{ success: boolean; resources: Array<{ name: string; action: string }>; errors?: string[] }> {
		const query = new URLSearchParams();
		if (options.dryRun) query.append('dryRun', 'true');
		if (options.force) query.append('force', 'true');

		const endpoint = `/namespaces/${namespace}/apply${query.toString() ? `?${query}` : ''}`;
		return apiClient.postYaml(endpoint, yaml);
	}

	// Scale operations
	async scaleResource(
		namespace: string,
		kind: string,
		name: string,
		replicas: number
	): Promise<{ success: boolean; message: string }> {
		return apiClient.post('/scale', {
			namespace,
			kind,
			name,
			replicas
		});
	}

	// Export operations
	async exportResource(namespace: string, kind: string, name: string): Promise<Record<string, unknown>> {
		const response = await apiClient.get<Record<string, unknown>>(`/export/${namespace}/${kind}/${name}`);
		return response;
	}

	// Overview operations
	async getOverview(): Promise<OverviewData> {
		const response = await apiClient.get<{ data: OverviewData; status: string }>('/overview');
		return response.data;
	}
}

// Utility functions to transform backend data to UI-compatible format
export function transformPodsToUI(pods: Pod[]): DashboardPod[] {
	return pods.map((pod, index) => ({
		id: index + 1,
		name: pod.name,
		namespace: pod.namespace,
		node: pod.node,
		status: pod.phase,
		ready: pod.ready,
		restarts: pod.restartCount,
		age: pod.age,
		cpu: pod.cpu ? `${pod.cpu.milli}m` : '0m',
		memory: pod.memory ? formatMemory(pod.memory.bytes) : '0Mi',
		image: getImageFromLabels(pod.labels)
	}));
}

function getNodeStatus(status: Node['status']): string {
	return status.ready ? 'Ready' : 'NotReady';
}

function formatNodeRoles(roles: string[]): string {
	return roles.join(', ') || '<none>';
}

export function transformNodesToUI(nodes: Node[]): NodeTableRow[] {
	return nodes.map((node, index) => ({
		id: index,
		name: node.name,
		status: getNodeStatus(node.status),
		roles: formatNodeRoles(node.roles),
		age: node.age,
		version: node.nodeInfo.kubeletVersion
	}));
} export function transformServicesToUI(services: Service[]): ServiceTableRow[] {
	return services.map((service, index) => ({
		id: index,
		name: service.name,
		namespace: service.namespace,
		type: service.type,
		clusterIP: service.clusterIP || '<none>',
		externalIP: getExternalIP(service),
		ports: formatPorts(service.ports),
		age: service.age
	}));
}

export function transformDeploymentsToUI(deployments: Deployment[]): DashboardDeployment[] {
	return deployments.map((deployment, index) => ({
		id: index,
		name: deployment.name,
		namespace: deployment.namespace,
		ready: `${deployment.replicas.ready}/${deployment.replicas.desired}`,
		upToDate: deployment.replicas.updated,
		available: deployment.replicas.available,
		age: deployment.age,
		image: 'Multiple' // Backend doesn't provide image info in this API
	}));
}

export function transformStatefulSetsToUI(statefulSets: StatefulSet[]): DashboardStatefulSet[] {
	return statefulSets.map((statefulSet, index) => ({
		id: index,
		name: statefulSet.name,
		namespace: statefulSet.namespace,
		ready: `${statefulSet.replicas.ready}/${statefulSet.replicas.desired}`,
		current: statefulSet.replicas.current,
		updated: statefulSet.replicas.updated,
		age: statefulSet.age,
		serviceName: statefulSet.serviceName || '<none>',
		updateStrategy: statefulSet.updateStrategy || 'RollingUpdate'
	}));
}

export function transformDaemonSetsToUI(daemonSets: DaemonSet[]): DashboardDaemonSet[] {
	return daemonSets.map((daemonSet, index) => ({
		id: index,
		name: daemonSet.name,
		namespace: daemonSet.namespace,
		desired: daemonSet.status.desired,
		current: daemonSet.status.current,
		ready: daemonSet.status.ready,
		available: daemonSet.status.available,
		unavailable: daemonSet.status.unavailable,
		age: daemonSet.age,
		updateStrategy: daemonSet.updateStrategy || 'RollingUpdate'
	}));
}

export function transformReplicaSetsToUI(replicaSets: ReplicaSet[]): DashboardReplicaSet[] {
	return replicaSets.map((replicaSet, index) => ({
		id: index,
		name: replicaSet.name,
		namespace: replicaSet.namespace,
		ready: `${replicaSet.replicas.ready}/${replicaSet.replicas.desired}`,
		desired: replicaSet.replicas.desired,
		current: replicaSet.replicas.available, // Using available as current
		available: replicaSet.replicas.available,
		age: replicaSet.age
	}));
}

export function transformJobsToUI(jobs: Job[]): DashboardJob[] {
	return jobs.map((job, index) => ({
		id: index,
		name: job.name,
		namespace: job.namespace,
		status: job.status,
		completions: job.completions,
		duration: job.duration,
		age: job.age,
		image: job.image
	}));
}

export function transformCronJobsToUI(cronJobs: CronJob[]): DashboardCronJob[] {
	return cronJobs.map((cronJob, index) => ({
		id: index,
		name: cronJob.name,
		namespace: cronJob.namespace,
		schedule: cronJob.schedule,
		suspend: cronJob.suspend,
		active: cronJob.active,
		lastSchedule: cronJob.lastSchedule,
		age: cronJob.age,
		image: cronJob.image
	}));
}

export function transformIngressesToUI(ingresses: Ingress[]): DashboardIngress[] {
	return ingresses.map((ingress, index) => ({
		id: index + 1,
		name: ingress.name,
		namespace: ingress.namespace,
		age: ingress.age,
		ingressClass: ingress.ingressClass,
		hosts: ingress.hosts,
		hostsDisplay: ingress.hostsDisplay,
		paths: ingress.paths,
		externalIPs: ingress.externalIPs,
		externalIPsDisplay: ingress.externalIPsDisplay
	}));
}

function getExternalIP(service: Service): string {
	if (service.externalIPs && service.externalIPs.length > 0) {
		return service.externalIPs[0];
	}
	return '<none>';
}

function formatPorts(ports?: Array<{ port: number; protocol: string; targetPort?: string | number; nodePort?: number }> | null): string {
	if (!ports || ports.length === 0) return '<none>';
	return ports.map(p => {
		let portStr = `${p.port}/${p.protocol}`;
		if (p.nodePort) {
			portStr += `:${p.nodePort}`;
		}
		return portStr;
	}).join(', ');
} function formatMemory(bytes: number): string {
	if (bytes === 0) return '0Mi';
	const mi = bytes / (1024 * 1024);
	if (mi < 1) return `${Math.round(bytes / 1024)}Ki`;
	if (mi < 1024) return `${Math.round(mi)}Mi`;
	return `${Math.round(mi / 1024)}Gi`;
}

function getImageFromLabels(labels: Record<string, string> | null | undefined): string {
	// Handle null or undefined labels
	if (!labels) return 'Unknown';

	// Try to infer image from common labels
	if (labels.app) return labels.app;
	if (labels['k8s-app']) return labels['k8s-app'];
	if (labels.component) return labels.component;
	return 'Unknown';
}

// Overview data interface
export interface OverviewData {
	pods: {
		running: number;
		total: number;
		pending: number;
	};
	nodes: {
		ready: number;
		total: number;
	};
	cpu: {
		usagePercent: number;
	};
	memory: {
		usagePercent: number;
	};
	advisories: string[];
	asOf: string;
}

// Global K8s service instance
export const k8sService = new K8sService();
