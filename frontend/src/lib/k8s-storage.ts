/**
 * k8s-storage.ts
 * 
 * This file handles all storage-related Kubernetes resources including ConfigMaps,
 * PersistentVolumes, PersistentVolumeClaims, StorageClasses, VolumeSnapshots,
 * VolumeSnapshotClasses, and CSIDrivers.
 * 
 * Contains:
 * - Interface definitions for storage resources
 * - Dashboard UI transformation interfaces
 * - Service methods for API operations
 * - Transform functions to convert backend data to UI format
 */

import { apiClient } from './api-client';

// ===== STORAGE RESOURCE INTERFACES =====

// ConfigMap interfaces based on the actual backend API response
export interface ConfigMap {
	name: string;
	namespace: string;
	age: string;
	dataKeysCount: number;
	dataSize: string;
	dataSizeBytes: number;
	dataKeys: string[];
	labelsCount: number;
	annotationsCount: number;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
}

export interface DashboardConfigMap {
	id: string;
	name: string;
	namespace: string;
	age: string;
	dataKeysCount: number;
	dataSize: string;
	dataSizeBytes: number;
	dataKeys: string[];
	labelsCount: number;
	annotationsCount: number;
}

// PersistentVolume interfaces based on the actual backend API response
export interface PersistentVolume {
	name: string;
	capacity: string;
	accessModes: string[];
	accessModesDisplay: string;
	reclaimPolicy: string;
	status: string;
	claim: string;
	storageClass: string;
	volumeSource: string;
	age: string;
	labelsCount: number;
	annotationsCount: number;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
}

export interface DashboardPersistentVolume {
	id: string;
	name: string;
	capacity: string;
	accessModes: string[];
	accessModesDisplay: string;
	reclaimPolicy: string;
	status: string;
	claim: string;
	storageClass: string;
	volumeSource: string;
	age: string;
	labelsCount: number;
	annotationsCount: number;
}

// PersistentVolumeClaim interfaces based on the actual backend API response
export interface PersistentVolumeClaim {
	name: string;
	namespace: string;
	status: string;
	volume: string;
	capacity: string;
	accessModes: string[];
	accessModesDisplay: string;
	storageClass: string;
	age: string;
	labelsCount: number;
	annotationsCount: number;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
}

export interface DashboardPersistentVolumeClaim {
	id: string;
	name: string;
	namespace: string;
	status: string;
	volume: string;
	capacity: string;
	accessModes: string[];
	accessModesDisplay: string;
	storageClass: string;
	age: string;
	labelsCount: number;
	annotationsCount: number;
}

// StorageClass interfaces based on the actual backend API response
export interface StorageClass {
	name: string;
	provisioner: string;
	reclaimPolicy: string;
	volumeBindingMode: string;
	allowVolumeExpansion: boolean;
	parametersCount: number;
	age: string;
	labelsCount: number;
	annotationsCount: number;
	isDefault: boolean;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
	parameters: Record<string, string> | null;
}

export interface DashboardStorageClass {
	id: string;
	name: string;
	provisioner: string;
	reclaimPolicy: string;
	volumeBindingMode: string;
	allowVolumeExpansion: boolean;
	parametersCount: number;
	age: string;
	labelsCount: number;
	annotationsCount: number;
	isDefault: boolean;
}

// VolumeSnapshot interfaces based on the actual backend API response
export interface VolumeSnapshot {
	name: string;
	namespace: string;
	sourcePVC: string;
	volumeSnapshotClassName: string;
	readyToUse: boolean;
	restoreSize: string;
	creationTime: string;
	snapshotHandle: string;
	age: string;
	labelsCount: number;
	annotationsCount: number;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
}

export interface DashboardVolumeSnapshot {
	id: string;
	name: string;
	namespace: string;
	sourcePVC: string;
	volumeSnapshotClassName: string;
	readyToUse: boolean;
	restoreSize: string;
	creationTime: string;
	snapshotHandle: string;
	age: string;
	labelsCount: number;
	annotationsCount: number;
}

// VolumeSnapshotClass interfaces based on the actual backend API response
export interface VolumeSnapshotClass {
	name: string;
	driver: string;
	deletionPolicy: string;
	age: string;
	labelsCount: number;
	annotationsCount: number;
	parametersCount: number;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
	parameters: Record<string, string> | null;
}

export interface DashboardVolumeSnapshotClass {
	id: string;
	name: string;
	driver: string;
	deletionPolicy: string;
	age: string;
	labelsCount: number;
	annotationsCount: number;
	parametersCount: number;
}

// CSIDriver interfaces based on the actual backend API response
export interface CSIDriver {
	name: string;
	attachRequired: boolean;
	podInfoOnMount: boolean;
	requiresRepublish: boolean;
	storageCapacity: boolean;
	fsGroupPolicy: string;
	volumeLifecycleModes: number;
	tokenRequests: number;
	age: string;
	labelsCount: number;
	annotationsCount: number;
	creationTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
}

export interface DashboardCSIDriver {
	id: string;
	name: string;
	attachRequired: boolean;
	podInfoOnMount: boolean;
	requiresRepublish: boolean;
	storageCapacity: boolean;
	fsGroupPolicy: string;
	volumeLifecycleModes: number;
	tokenRequests: number;
	age: string;
	labelsCount: number;
	annotationsCount: number;
}

// ===== SERVICE METHODS =====

// ConfigMap operations
export async function getConfigMaps(namespace?: string): Promise<ConfigMap[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: ConfigMap[] }; status: string }>(`/config-maps${query}`);
	return response.data?.items || [];
}

export async function getConfigMap(namespace: string, name: string): Promise<{ summary: ConfigMap; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: ConfigMap; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/config-maps/${namespace}/${name}`);
	return response.data;
}

// PersistentVolume operations
export async function getPersistentVolumes(): Promise<PersistentVolume[]> {
	const response = await apiClient.get<{ data: { items: PersistentVolume[] }; status: string }>(`/persistent-volumes`);
	return response.data?.items || [];
}

export async function getPersistentVolume(name: string): Promise<{ summary: PersistentVolume; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: PersistentVolume; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/persistent-volumes/${name}`);
	return response.data;
}

// PersistentVolumeClaim operations
export async function getPersistentVolumeClaims(namespace?: string): Promise<PersistentVolumeClaim[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: PersistentVolumeClaim[] }; status: string }>(`/persistent-volume-claims${query}`);
	return response.data?.items || [];
}

export async function getPersistentVolumeClaim(namespace: string, name: string): Promise<{ summary: PersistentVolumeClaim; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: PersistentVolumeClaim; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/persistent-volume-claims/${namespace}/${name}`);
	return response.data;
}

// StorageClass operations
export async function getStorageClasses(): Promise<StorageClass[]> {
	const response = await apiClient.get<{ data: { items: StorageClass[] }; status: string }>(`/storage-classes`);
	return response.data?.items || [];
}

export async function getStorageClass(name: string): Promise<{ summary: StorageClass; parameters: Record<string, string>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: StorageClass; parameters: Record<string, string>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/storage-classes/${name}`);
	return response.data;
}

// VolumeSnapshot operations
export async function getVolumeSnapshots(namespace?: string): Promise<VolumeSnapshot[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: VolumeSnapshot[] }; status: string }>(`/volume-snapshots${query}`);
	return response.data?.items || [];
}

export async function getVolumeSnapshot(namespace: string, name: string): Promise<{ summary: VolumeSnapshot; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: VolumeSnapshot; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/volume-snapshots/${namespace}/${name}`);
	return response.data;
}

// VolumeSnapshotClass operations
export async function getVolumeSnapshotClasses(): Promise<VolumeSnapshotClass[]> {
	const response = await apiClient.get<{ data: { items: VolumeSnapshotClass[] }; status: string }>(`/volume-snapshot-classes`);
	return response.data?.items || [];
}

export async function getVolumeSnapshotClass(name: string): Promise<{ summary: VolumeSnapshotClass; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: VolumeSnapshotClass; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/volume-snapshot-classes/${name}`);
	return response.data;
}

// CSIDriver operations
export async function getCSIDrivers(): Promise<CSIDriver[]> {
	const response = await apiClient.get<{ data: { items: CSIDriver[] }; status: string }>(`/csi-drivers`);
	return response.data?.items || [];
}

export async function getCSIDriver(name: string): Promise<{ summary: CSIDriver; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: CSIDriver; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/csi-drivers/${name}`);
	return response.data;
}

// ===== TRANSFORM FUNCTIONS =====

export function transformConfigMapsToUI(configMaps: ConfigMap[]): DashboardConfigMap[] {
	if (!configMaps || !Array.isArray(configMaps)) {
		return [];
	}
	return configMaps.map((configMap) => ({
		id: `${configMap.namespace}-${configMap.name}`,
		name: configMap.name,
		namespace: configMap.namespace,
		age: configMap.age,
		dataKeysCount: configMap.dataKeysCount,
		dataSize: configMap.dataSize,
		dataSizeBytes: configMap.dataSizeBytes,
		dataKeys: configMap.dataKeys,
		labelsCount: configMap.labelsCount,
		annotationsCount: configMap.annotationsCount
	}));
}

export function transformPersistentVolumesToUI(persistentVolumes: PersistentVolume[]): DashboardPersistentVolume[] {
	if (!persistentVolumes || !Array.isArray(persistentVolumes)) {
		return [];
	}
	return persistentVolumes.map((pv) => ({
		id: pv.name,
		name: pv.name,
		capacity: pv.capacity,
		accessModes: pv.accessModes,
		accessModesDisplay: pv.accessModesDisplay,
		reclaimPolicy: pv.reclaimPolicy,
		status: pv.status,
		claim: pv.claim,
		storageClass: pv.storageClass,
		volumeSource: pv.volumeSource,
		age: pv.age,
		labelsCount: pv.labelsCount,
		annotationsCount: pv.annotationsCount
	}));
}

export function transformPersistentVolumeClaimsToUI(persistentVolumeClaims: PersistentVolumeClaim[]): DashboardPersistentVolumeClaim[] {
	if (!persistentVolumeClaims || !Array.isArray(persistentVolumeClaims)) {
		return [];
	}
	return persistentVolumeClaims.map((pvc) => ({
		id: `${pvc.namespace}-${pvc.name}`,
		name: pvc.name,
		namespace: pvc.namespace,
		status: pvc.status,
		volume: pvc.volume,
		capacity: pvc.capacity,
		accessModes: pvc.accessModes,
		accessModesDisplay: pvc.accessModesDisplay,
		storageClass: pvc.storageClass,
		age: pvc.age,
		labelsCount: pvc.labelsCount,
		annotationsCount: pvc.annotationsCount
	}));
}

export function transformStorageClassesToUI(storageClasses: StorageClass[]): DashboardStorageClass[] {
	if (!storageClasses || !Array.isArray(storageClasses)) {
		return [];
	}
	return storageClasses.map((sc) => ({
		id: sc.name,
		name: sc.name,
		provisioner: sc.provisioner,
		reclaimPolicy: sc.reclaimPolicy,
		volumeBindingMode: sc.volumeBindingMode,
		allowVolumeExpansion: sc.allowVolumeExpansion,
		parametersCount: sc.parametersCount,
		age: sc.age,
		labelsCount: sc.labelsCount,
		annotationsCount: sc.annotationsCount,
		isDefault: sc.isDefault
	}));
}

export function transformVolumeSnapshotsToUI(volumeSnapshots: VolumeSnapshot[]): DashboardVolumeSnapshot[] {
	if (!volumeSnapshots || !Array.isArray(volumeSnapshots)) {
		return [];
	}
	return volumeSnapshots.map((vs) => ({
		id: `${vs.namespace}-${vs.name}`,
		name: vs.name,
		namespace: vs.namespace,
		sourcePVC: vs.sourcePVC,
		volumeSnapshotClassName: vs.volumeSnapshotClassName,
		readyToUse: vs.readyToUse,
		restoreSize: vs.restoreSize,
		creationTime: vs.creationTime,
		snapshotHandle: vs.snapshotHandle,
		age: vs.age,
		labelsCount: vs.labelsCount,
		annotationsCount: vs.annotationsCount
	}));
}

export function transformVolumeSnapshotClassesToUI(volumeSnapshotClasses: VolumeSnapshotClass[]): DashboardVolumeSnapshotClass[] {
	if (!volumeSnapshotClasses || !Array.isArray(volumeSnapshotClasses)) {
		return [];
	}
	return volumeSnapshotClasses.map((vsc) => ({
		id: vsc.name,
		name: vsc.name,
		driver: vsc.driver,
		deletionPolicy: vsc.deletionPolicy,
		age: vsc.age,
		labelsCount: vsc.labelsCount,
		annotationsCount: vsc.annotationsCount,
		parametersCount: vsc.parametersCount
	}));
}

export function transformCSIDriversToUI(csiDrivers: CSIDriver[]): DashboardCSIDriver[] {
	if (!csiDrivers || !Array.isArray(csiDrivers)) {
		return [];
	}
	return csiDrivers.map((csi) => ({
		id: csi.name,
		name: csi.name,
		attachRequired: csi.attachRequired,
		podInfoOnMount: csi.podInfoOnMount,
		requiresRepublish: csi.requiresRepublish,
		storageCapacity: csi.storageCapacity,
		fsGroupPolicy: csi.fsGroupPolicy,
		volumeLifecycleModes: csi.volumeLifecycleModes,
		tokenRequests: csi.tokenRequests,
		age: csi.age,
		labelsCount: csi.labelsCount,
		annotationsCount: csi.annotationsCount
	}));
}

// ===== SECRET INTERFACES =====

// Secret interfaces based on Kubernetes API structure
export interface Secret {
	id: string;
	name: string;
	namespace: string;
	type: string;
	keys: string[];
	keyCount: number;
	age: string;
	ageTimestamp: string;
	labels: Record<string, string> | null;
	annotations: Record<string, string> | null;
	creationTimestamp: string;
	resourceVersion: string;
	uid: string;
}

export interface DashboardSecret {
	id: string;
	name: string;
	namespace: string;
	type: string;
	keysCount: number;
	dataSize: string;
	dataSizeBytes: number;
	keys: string[];
	age: string;
	labelsCount: number;
	annotationsCount: number;
}

export interface SecretData {
	[key: string]: string;
}

export interface SecretUsage {
	asVolume: string;
	asEnvVar: string;
	typeSpecific?: string;
}

export interface SecretType {
	name: string;
	description: string;
	usage: string;
}

export interface SecretDetails {
	metadata: Record<string, unknown>;
	spec: Record<string, unknown>;
	summary: Record<string, unknown>;
}

// ===== SECRET SERVICE METHODS =====

export async function getSecrets(namespace?: string): Promise<Secret[]> {
	try {
		const endpoint = namespace ? `/secrets?namespace=${namespace}` : '/secrets';
		const response = await apiClient.get<{ data: { items: Secret[] }; status: string }>(endpoint);
		return response.data?.items || [];
	} catch (error) {
		console.error('Failed to fetch secrets:', error);
		throw error;
	}
}

export async function getSecret(namespace: string, name: string): Promise<SecretDetails> {
	try {
		const response = await apiClient.get<{ data: SecretDetails; status: string }>(`/secrets/${namespace}/${name}`);
		return response.data;
	} catch (error) {
		console.error(`Failed to fetch secret ${namespace}/${name}:`, error);
		throw error;
	}
}

export async function getSecretData(namespace: string, name: string, key: string): Promise<SecretData> {
	try {
		const response = await apiClient.get<{ data: SecretData; status: string }>(`/secrets/${namespace}/${name}/data/${key}`);
		return response.data;
	} catch (error) {
		console.error(`Failed to fetch secret data ${namespace}/${name}/${key}:`, error);
		throw error;
	}
}

export async function getSecretUsage(namespace: string, name: string): Promise<SecretUsage> {
	try {
		const response = await apiClient.get<{ data: SecretUsage; status: string }>(`/secrets/${namespace}/${name}/usage`);
		return response.data;
	} catch (error) {
		console.error(`Failed to fetch secret usage ${namespace}/${name}:`, error);
		throw error;
	}
}

export async function getSecretTypes(): Promise<SecretType[]> {
	try {
		const response = await apiClient.get<{ data: { items: SecretType[] }; status: string }>('/secrets/types');
		return response.data?.items || [];
	} catch (error) {
		console.error('Failed to fetch secret types:', error);
		throw error;
	}
}

export async function createSecret(secret: Partial<Secret>): Promise<Secret> {
	try {
		const response = await apiClient.post<{ data: Secret; status: string }>('/secrets', secret);
		return response.data;
	} catch (error) {
		console.error('Failed to create secret:', error);
		throw error;
	}
}

export async function updateSecret(namespace: string, name: string, secret: Partial<Secret>): Promise<Secret> {
	try {
		const response = await apiClient.put<{ data: Secret; status: string }>(`/secrets/${namespace}/${name}`, secret);
		return response.data;
	} catch (error) {
		console.error(`Failed to update secret ${namespace}/${name}:`, error);
		throw error;
	}
}

export async function deleteSecret(namespace: string, name: string): Promise<void> {
	try {
		await apiClient.delete(`/secrets/${namespace}/${name}`);
	} catch (error) {
		console.error(`Failed to delete secret ${namespace}/${name}:`, error);
		throw error;
	}
}

// ===== SECRET TRANSFORM FUNCTIONS =====

export function transformSecretsToUI(secrets: Secret[]): DashboardSecret[] {
	return secrets.map((secret) => {
		// Calculate data size based on number of keys (rough estimation)
		const estimatedSizeBytes = secret.keyCount * 512; // Rough estimate
		const dataSize = estimatedSizeBytes < 1024 ? `${estimatedSizeBytes} B` :
			estimatedSizeBytes < 1024 * 1024 ? `${(estimatedSizeBytes / 1024).toFixed(1)} KB` :
				`${(estimatedSizeBytes / (1024 * 1024)).toFixed(1)} MB`;

		return {
			id: `${secret.namespace}-${secret.name}`,
			name: secret.name,
			namespace: secret.namespace,
			type: secret.type,
			keysCount: secret.keyCount,
			dataSize: dataSize,
			dataSizeBytes: estimatedSizeBytes,
			keys: secret.keys,
			age: secret.age,
			labelsCount: secret.labels ? Object.keys(secret.labels).length : 0,
			annotationsCount: secret.annotations ? Object.keys(secret.annotations).length : 0
		};
	});
}
