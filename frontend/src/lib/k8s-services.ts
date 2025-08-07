/**
 * Kubernetes Services and Networking API
 * 
 * This module handles all service and networking-related Kubernetes resources including:
 * - Services
 * - Endpoints
 * - EndpointSlices
 * - Ingresses
 * - NetworkPolicies
 */

import { apiClient } from './api-client';

// Service interfaces based on the actual backend API response
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

// Endpoints interfaces based on the actual backend API response
export interface Endpoints {
	name: string;
	namespace: string;
	age: string;
	subsets: number;
	totalAddresses: number;
	totalPorts: number;
	addresses: string[];
	ports: string[];
	addressesDisplay: string;
	portsDisplay: string;
	creationTimestamp: string;
	labels: Record<string, string>;
	annotations: Record<string, string>;
}

// EndpointSlice interfaces based on the actual backend API response
export interface EndpointSlice {
	name: string;
	namespace: string;
	age: string;
	addressType: string;
	endpoints: number;
	ready: string;
	readyCount: number;
	notReadyCount: number;
	ports: number;
	addresses: string[];
	portStrings: string[];
	addressesDisplay: string;
	portsDisplay: string;
	creationTimestamp: string;
	labels: Record<string, string>;
	annotations: Record<string, string>;
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

// NetworkPolicy interfaces based on the actual backend API response
export interface NetworkPolicy {
	name: string;
	namespace: string;
	age: string;
	creationTimestamp: string;
	labels: Record<string, string>;
	annotations: Record<string, string>;
	podSelector: string;
	ingressRules: number;
	egressRules: number;
	policyTypes: string;
	affectedPods: number;
}

// Dashboard interfaces for transformed data that matches the current UI schema
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

export interface DashboardEndpoints {
	id: number;
	name: string;
	namespace: string;
	age: string;
	subsets: number;
	totalAddresses: number;
	totalPorts: number;
	addresses: string[];
	ports: string[];
	addressesDisplay: string;
	portsDisplay: string;
}

export interface DashboardEndpointSlice {
	id: number;
	name: string;
	namespace: string;
	age: string;
	addressType: string;
	endpoints: number;
	ready: string;
	readyCount: number;
	notReadyCount: number;
	ports: number;
	addresses: string[];
	portStrings: string[];
	addressesDisplay: string;
	portsDisplay: string;
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

export interface DashboardNetworkPolicy {
	id: number;
	name: string;
	namespace: string;
	age: string;
	podSelector: string;
	ingressRules: number;
	egressRules: number;
	policyTypes: string;
	affectedPods: number;
}

/**
 * Service operations
 */

// Service operations
export async function getServices(namespace?: string): Promise<Service[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: Service[] }; status: string }>(`/services${query}`);
	return response.data?.items || [];
}

// Endpoints operations
export async function getEndpoints(namespace?: string): Promise<Endpoints[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: Endpoints[] }; status: string }>(`/endpoints${query}`);
	return response.data?.items || [];
}

export async function getEndpoint(namespace: string, name: string): Promise<Endpoints> {
	return apiClient.get<Endpoints>(`/endpoints/${namespace}/${name}`);
}

// EndpointSlices operations
export async function getEndpointSlices(namespace?: string): Promise<EndpointSlice[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: EndpointSlice[] }; status: string }>(`/endpoint-slices${query}`);
	return response.data?.items || [];
}

export async function getEndpointSlice(namespace: string, name: string): Promise<{ summary: EndpointSlice; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: EndpointSlice; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/endpoint-slices/${namespace}/${name}`);
	return response.data;
}

// Ingress operations
export async function getIngresses(namespace?: string): Promise<Ingress[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: Ingress[] }; status: string }>(`/ingresses${query}`);
	return response.data?.items || [];
}

export async function getIngress(namespace: string, name: string): Promise<{ summary: Ingress; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: Ingress; spec: Record<string, unknown>; status: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/ingresses/${namespace}/${name}`);
	return response.data;
}

// Network Policy operations
export async function getNetworkPolicies(namespace?: string): Promise<NetworkPolicy[]> {
	const query = namespace ? `?namespace=${namespace}` : '';
	const response = await apiClient.get<{ data: { items: NetworkPolicy[] }; status: string }>(`/network-policies${query}`);
	return response.data?.items || [];
}

export async function getNetworkPolicy(namespace: string, name: string): Promise<{ summary: NetworkPolicy; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }> {
	const response = await apiClient.get<{ data: { summary: NetworkPolicy; spec: Record<string, unknown>; metadata: Record<string, unknown>; kind: string; apiVersion: string }; status: string }>(`/network-policies/${namespace}/${name}`);
	return response.data;
}

/**
 * Transform functions to convert backend data to UI-compatible format
 */

export function transformServicesToUI(services: Service[]): ServiceTableRow[] {
	if (!services || !Array.isArray(services)) {
		return [];
	}
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

export function transformEndpointsToUI(endpoints: Endpoints[]): DashboardEndpoints[] {
	if (!endpoints || !Array.isArray(endpoints)) {
		return [];
	}
	return endpoints.map((endpoint, index) => ({
		id: index + 1,
		name: endpoint.name,
		namespace: endpoint.namespace,
		age: endpoint.age,
		subsets: endpoint.subsets,
		totalAddresses: endpoint.totalAddresses,
		totalPorts: endpoint.totalPorts,
		addresses: endpoint.addresses,
		ports: endpoint.ports,
		addressesDisplay: endpoint.addressesDisplay,
		portsDisplay: endpoint.portsDisplay
	}));
}

export function transformEndpointSlicesToUI(endpointSlices: EndpointSlice[]): DashboardEndpointSlice[] {
	if (!endpointSlices || !Array.isArray(endpointSlices)) {
		return [];
	}
	return endpointSlices.map((endpointSlice, index) => ({
		id: index + 1,
		name: endpointSlice.name,
		namespace: endpointSlice.namespace,
		age: endpointSlice.age,
		addressType: endpointSlice.addressType,
		endpoints: endpointSlice.endpoints,
		ready: endpointSlice.ready,
		readyCount: endpointSlice.readyCount,
		notReadyCount: endpointSlice.notReadyCount,
		ports: endpointSlice.ports,
		addresses: endpointSlice.addresses,
		portStrings: endpointSlice.portStrings,
		addressesDisplay: endpointSlice.addressesDisplay,
		portsDisplay: endpointSlice.portsDisplay
	}));
}

export function transformIngressesToUI(ingresses: Ingress[]): DashboardIngress[] {
	if (!ingresses || !Array.isArray(ingresses)) {
		return [];
	}
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

export function transformNetworkPoliciesToUI(networkPolicies: NetworkPolicy[]): DashboardNetworkPolicy[] {
	if (!networkPolicies || !Array.isArray(networkPolicies)) {
		return [];
	}
	return networkPolicies.map((networkPolicy, index) => ({
		id: index + 1,
		name: networkPolicy.name,
		namespace: networkPolicy.namespace,
		age: networkPolicy.age,
		podSelector: networkPolicy.podSelector,
		ingressRules: networkPolicy.ingressRules,
		egressRules: networkPolicy.egressRules,
		policyTypes: networkPolicy.policyTypes,
		affectedPods: networkPolicy.affectedPods
	}));
}

/**
 * Utility functions
 */

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
}
