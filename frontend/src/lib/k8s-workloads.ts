/**
 * Kubernetes Workloads API
 * 
 * This module handles all workload-related Kubernetes resources including:
 * - Pods
 * - Deployments
 * - StatefulSets
 * - DaemonSets
 * - ReplicaSets
 * - Jobs
 * - CronJobs
 * - Ingresses
 */

import { apiClient } from './api-client';
import { formatMemory, getImageFromLabels } from './k8s-common';

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

// Dashboard interfaces for transformed data that matches the current UI schema
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

/**
 * Workload service methods
 */

// Pod operations
export async function getPods(namespace?: string): Promise<Pod[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: Pod[] }; status: string }>(`/pods${query}`);
	return response.data?.items || [];
}

export async function getPod(namespace: string, name: string): Promise<Pod> {
	return apiClient.get<Pod>(`/pods/${namespace}/${name}`);
}

export async function deletePod(namespace: string, name: string): Promise<{ success: boolean; message: string }> {
	return apiClient.delete(`/pods/${namespace}/${name}`);
}

// Deployment operations
export async function getDeployments(namespace?: string): Promise<Deployment[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: Deployment[] }; status: string }>(`/deployments${query}`);
	return response.data?.items || [];
}

// StatefulSet operations
export async function getStatefulSets(namespace?: string): Promise<StatefulSet[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: StatefulSet[] }; status: string }>(`/statefulsets${query}`);
	return response.data?.items || [];
}

// DaemonSet operations
export async function getDaemonSets(namespace?: string): Promise<DaemonSet[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: DaemonSet[] }; status: string }>(`/daemonsets${query}`);
	return response.data?.items || [];
}

// ReplicaSet operations
export async function getReplicaSets(namespace?: string): Promise<ReplicaSet[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: ReplicaSet[] }; status: string }>(`/replicasets${query}`);
	return response.data?.items || [];
}

// Job operations
export async function getJobs(namespace?: string): Promise<Job[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: Job[] }; status: string }>(`/k8s-jobs${query}`);
	return response.data?.items || [];
}

export async function getJob(namespace: string, name: string): Promise<Job> {
	return apiClient.get<Job>(`/k8s-jobs/${namespace}/${name}`);
}

// CronJob operations
export async function getCronJobs(namespace?: string): Promise<CronJob[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: CronJob[] }; status: string }>(`/cronjobs${query}`);
	return response.data?.items || [];
}

export async function getCronJob(namespace: string, name: string): Promise<CronJob> {
	return apiClient.get<CronJob>(`/cronjobs/${namespace}/${name}`);
}

/**
 * Transform functions to convert backend data to UI-compatible format
 */

export function transformPodsToUI(pods: Pod[]): DashboardPod[] {
	if (!pods || !Array.isArray(pods)) {
		return [];
	}
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

export function transformDeploymentsToUI(deployments: Deployment[]): DashboardDeployment[] {
	if (!deployments || !Array.isArray(deployments)) {
		return [];
	}
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
	if (!statefulSets || !Array.isArray(statefulSets)) {
		return [];
	}
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
	if (!daemonSets || !Array.isArray(daemonSets)) {
		return [];
	}
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
	if (!replicaSets || !Array.isArray(replicaSets)) {
		return [];
	}
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
	if (!jobs || !Array.isArray(jobs)) {
		return [];
	}
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
	if (!cronJobs || !Array.isArray(cronJobs)) {
		return [];
	}
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

// Ingress interfaces based on the actual backend API response
export interface Ingress {
	name: string;
	namespace: string;
	age: string;
	creationTimestamp: string;
	ingressClass: string;
	hosts: string[];
	paths: string[];
	externalIPs: string[];
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

// Ingress API functions
export async function getIngresses(namespace?: string): Promise<Ingress[]> {
	try {
		const query = namespace ? `?namespace=${namespace}` : '';
		const response = await apiClient.get<{ data: { items: Ingress[] }; status: string }>(`/api/v1/ingresses${query}`);
		return response.data?.items || [];
	} catch (error) {
		console.error('Failed to fetch ingresses:', error);
		return [];
	}
}

export function transformIngressesToUI(ingresses: Ingress[]): DashboardIngress[] {
	if (!ingresses || !Array.isArray(ingresses)) {
		return [];
	}
	return ingresses.map((ingress, index) => {
		// Create display strings for hosts and external IPs
		const hostsDisplay = ingress.hosts.length > 0
			? ingress.hosts.length === 1
				? ingress.hosts[0]
				: `${ingress.hosts[0]} (+${ingress.hosts.length - 1} more)`
			: '';

		const externalIPsDisplay = ingress.externalIPs.length > 0
			? ingress.externalIPs.length === 1
				? ingress.externalIPs[0]
				: `${ingress.externalIPs[0]} (+${ingress.externalIPs.length - 1} more)`
			: '';

		return {
			id: index,
			name: ingress.name,
			namespace: ingress.namespace,
			age: ingress.age,
			ingressClass: ingress.ingressClass,
			hosts: ingress.hosts,
			hostsDisplay,
			paths: ingress.paths,
			externalIPs: ingress.externalIPs,
			externalIPsDisplay
		};
	});
}


