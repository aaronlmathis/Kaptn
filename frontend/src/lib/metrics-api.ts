/**
 * Extended TimeSeries API Client for Metric Explorer
 * 
 * Extends the existing timeseries API with additional functionality
 * while maintaining compatibility with the backend endpoints.
 */

import {
	fetchClusterSeries,
	openClusterLiveWS,
	type TimeSeriesKey,
	type TimeSeriesPoint,
	type TimeSeriesResponse,
	type Resolution
} from '@/lib/api/timeseries';

// Re-export Resolution type
export type { Resolution };

// All available metric keys based on TIMESERIES_METRICS.md
export type MetricKey =
	// Cluster-level metrics
	| 'cluster.cpu.used.cores'
	| 'cluster.cpu.capacity.cores'
	| 'cluster.cpu.allocatable.cores'
	| 'cluster.cpu.requested.cores'
	| 'cluster.mem.used.bytes'
	| 'cluster.mem.allocatable.bytes'
	| 'cluster.mem.requested.bytes'
	| 'cluster.net.rx.bps'
	| 'cluster.net.tx.bps'
	| 'cluster.nodes.count'
	| 'cluster.pods.running'
	| 'cluster.pods.pending'
	| 'cluster.pods.failed'
	| 'cluster.pods.succeeded'
	// Node-level metrics
	| 'node.cpu.usage.cores'
	| 'node.mem.usage.bytes'
	| 'node.mem.working_set.bytes'
	| 'node.capacity.cpu.cores'
	| 'node.capacity.mem.bytes'
	| 'node.allocatable.cpu.cores'
	| 'node.allocatable.mem.bytes'
	| 'node.net.rx.bps'
	| 'node.net.tx.bps'
	| 'node.fs.used.bytes'
	| 'node.fs.used.percent'
	| 'node.imagefs.used.bytes'
	| 'node.process.count'
	// Pod-level metrics
	| 'pod.cpu.usage.cores'
	| 'pod.mem.usage.bytes'
	| 'pod.mem.working_set.bytes'
	| 'pod.net.rx.bps'
	| 'pod.net.tx.bps'
	| 'pod.ephemeral.used.bytes'
	// Container-level metrics
	| 'ctr.cpu.usage.cores'
	| 'ctr.mem.working_set.bytes'
	| 'ctr.rootfs.used.bytes'
	| 'ctr.logs.used.bytes';

// Scope definitions
export type MetricScope = 'cluster' | 'node' | 'namespace' | 'workload' | 'pod' | 'container';

// Timespan options
export type Timespan = '5m' | '15m' | '1h' | '6h' | '24h' | '7d' | 'custom';

// Data point structure (extends existing)
export interface MetricPoint extends TimeSeriesPoint {
	entity?: string; // entity identifier (node name, pod name, etc.)
}

// Series data
export interface MetricSeries {
	key: MetricKey;
	points: MetricPoint[];
	metadata?: {
		unit?: string;
		aggregation?: string;
		entity?: string;
	};
}

// API response structure (extends existing)
export interface MetricsResponse extends TimeSeriesResponse {
	metadata?: {
		resolution: string;
		timespan: string;
		scope: MetricScope;
		entity?: string;
	};
}

// Filter parameters
export interface MetricFilters {
	scope: MetricScope;
	entity?: string;
	resolution: Resolution;
	search?: string;
}

// WebSocket message types (extends existing)
export interface MetricsInitMessage {
	type: 'init';
	data: MetricsResponse;
}

export interface MetricsAppendMessage {
	type: 'append';
	key: string;
	point: MetricPoint;
}

export interface MetricsErrorMessage {
	type: 'error';
	error: string;
}

export type MetricsWSMessage = MetricsInitMessage | MetricsAppendMessage | MetricsErrorMessage;

// WebSocket handlers
export interface MetricsWSHandlers {
	onInit?: (data: MetricsResponse) => void;
	onAppend?: (key: string, point: MetricPoint) => void;
	onError?: (error: Error) => void;
	onConnect?: () => void;
	onDisconnect?: () => void;
}

/**
 * Fetch timeseries data with filtering - calls actual backend endpoints
 */
export async function fetchMetrics(
	seriesKeys: MetricKey[],
	filters: MetricFilters
): Promise<MetricsResponse> {
	try {
		let response: TimeSeriesResponse;

		if (filters.scope === 'cluster') {
			// Use existing cluster endpoint for cluster-level metrics
			const timeSeriesKeys = seriesKeys as TimeSeriesKey[];
			response = await fetchClusterSeries(
				timeSeriesKeys,
				filters.resolution,
				'1h'
			);
		} else if (filters.scope === 'node') {
			// Use new nodes endpoint
			const url = new URL('/api/v1/timeseries/nodes', window.location.origin);

			// Add query parameters
			if (seriesKeys.length > 0) {
				// Convert node metrics to base keys (remove the base suffix for the API)
				const baseKeys = seriesKeys.map(key => key.replace(/\.cores$|\.bytes$|\.bps$|\.percent$|\.count$/, ''));
				url.searchParams.set('series', baseKeys.join(','));
			}
			url.searchParams.set('res', filters.resolution);
			url.searchParams.set('since', '1h');

			if (filters.entity) {
				url.searchParams.set('node', filters.entity);
			}

			const fetchResponse = await fetch(url.toString());

			if (!fetchResponse.ok) {
				throw new Error(`Failed to fetch node metrics: ${fetchResponse.statusText}`);
			}

			response = await fetchResponse.json();
		} else if (filters.scope === 'pod' || filters.scope === 'namespace' || filters.scope === 'workload') {
			// Use new pods endpoint
			const url = new URL('/api/v1/timeseries/pods', window.location.origin);

			// Add query parameters
			if (seriesKeys.length > 0) {
				// Convert pod metrics to base keys
				const baseKeys = seriesKeys.map(key => key.replace(/\.cores$|\.bytes$|\.bps$/, ''));
				url.searchParams.set('series', baseKeys.join(','));
			}
			url.searchParams.set('res', filters.resolution);
			url.searchParams.set('since', '1h');

			if (filters.entity) {
				// Parse entity filter - could be namespace, namespace/pod, etc.
				const parts = filters.entity.split('/');
				if (parts.length >= 1) {
					url.searchParams.set('namespace', parts[0]);
				}
				if (parts.length >= 2) {
					url.searchParams.set('pod', parts[1]);
				}
			}

			const fetchResponse = await fetch(url.toString());

			if (!fetchResponse.ok) {
				throw new Error(`Failed to fetch pod metrics: ${fetchResponse.statusText}`);
			}

			response = await fetchResponse.json();
		} else {
			throw new Error(`Unsupported scope: ${filters.scope}`);
		}

		// Return in our extended format
		return {
			...response,
			metadata: {
				resolution: filters.resolution,
				timespan: '1h',
				scope: filters.scope,
				entity: filters.entity,
			}
		};
	} catch (error) {
		console.error('Error fetching metrics:', error);
		throw error;
	}
}

/**
 * Get available entities for a given scope
 */
export async function fetchEntities(
	scope: MetricScope,
	search?: string
): Promise<{ entities: Array<{ id: string; name: string; labels?: Record<string, string> }> }> {
	// For cluster scope, no entities
	if (scope === 'cluster') {
		return { entities: [] };
	}

	try {
		if (scope === 'node') {
			// Fetch node metrics to get available nodes
			const url = new URL('/api/v1/timeseries/nodes', window.location.origin);
			url.searchParams.set('series', 'node.process.count'); // Use a simple metric to get node list
			url.searchParams.set('res', 'lo');
			url.searchParams.set('since', '5m');

			const response = await fetch(url.toString());
			if (!response.ok) {
				throw new Error(`Failed to fetch nodes: ${response.statusText}`);
			}

			const data = await response.json();
			const entities: Array<{ id: string; name: string; labels?: Record<string, string> }> = [];
			
			// Extract node names from series keys
			for (const seriesKey of Object.keys(data.series || {})) {
				const match = seriesKey.match(/^node\.process\.count\.(.+)$/);
				if (match) {
					const nodeName = match[1];
					if (!search || nodeName.toLowerCase().includes(search.toLowerCase())) {
						entities.push({
							id: nodeName,
							name: nodeName,
							labels: { type: 'node' }
						});
					}
				}
			}

			return { entities };
		} else if (scope === 'pod' || scope === 'namespace' || scope === 'workload') {
			// Fetch pod metrics to get available pods
			const url = new URL('/api/v1/timeseries/pods', window.location.origin);
			url.searchParams.set('series', 'pod.cpu.usage'); // Use a common pod metric
			url.searchParams.set('res', 'lo');
			url.searchParams.set('since', '5m');

			const response = await fetch(url.toString());
			if (!response.ok) {
				throw new Error(`Failed to fetch pods: ${response.statusText}`);
			}

			const data = await response.json();
			const entities: Array<{ id: string; name: string; labels?: Record<string, string> }> = [];
			
			// Extract namespace/pod names from series keys
			for (const seriesKey of Object.keys(data.series || {})) {
				const match = seriesKey.match(/^pod\.cpu\.usage\.cores\.([^.]+)\.(.+)$/);
				if (match) {
					const namespace = match[1];
					const podName = match[2];
					const entityId = `${namespace}/${podName}`;
					const entityName = scope === 'namespace' ? namespace : `${namespace}/${podName}`;
					
					if (!search || entityName.toLowerCase().includes(search.toLowerCase())) {
						entities.push({
							id: entityId,
							name: entityName,
							labels: { 
								type: 'pod',
								namespace: namespace,
								pod: podName
							}
						});
					}
				}
			}

			// For namespace scope, group by namespace
			if (scope === 'namespace') {
				const namespaceMap = new Map<string, { id: string; name: string; labels?: Record<string, string> }>();
				entities.forEach(entity => {
					const namespace = entity.labels?.namespace;
					if (namespace && !namespaceMap.has(namespace)) {
						namespaceMap.set(namespace, {
							id: namespace,
							name: namespace,
							labels: { type: 'namespace' }
						});
					}
				});
				return { entities: Array.from(namespaceMap.values()) };
			}

			return { entities };
		}

		return { entities: [] };
	} catch (error) {
		console.error(`Failed to fetch entities for scope ${scope}:`, error);
		return { entities: [] };
	}
}

/**
 * Get API capabilities
 */
export async function fetchCapabilities(): Promise<{
	capabilities: {
		metricsAPI: boolean;
		summaryAPI: boolean;
	};
}> {
	try {
		// Try to fetch cluster series to test API availability
		const response = await fetchClusterSeries([], 'lo', '5m');
		return {
			capabilities: response.capabilities
		};
	} catch (error) {
		console.error('Failed to fetch capabilities:', error);
		return {
			capabilities: {
				metricsAPI: false,
				summaryAPI: false,
			}
		};
	}
}

/**
 * Get available metric keys for a given scope
 */
export function getMetricsForScope(scope: MetricScope): MetricKey[] {
	switch (scope) {
		case 'cluster':
			// Return cluster-level metrics that are supported by the backend
			return [
				// CPU metrics
				'cluster.cpu.used.cores',
				'cluster.cpu.capacity.cores',
				'cluster.cpu.allocatable.cores',
				'cluster.cpu.requested.cores',
				// Memory metrics  
				'cluster.mem.used.bytes',
				'cluster.mem.allocatable.bytes',
				'cluster.mem.requested.bytes',
				// Network metrics
				'cluster.net.rx.bps',
				'cluster.net.tx.bps',
				// State metrics
				'cluster.nodes.count',
				'cluster.pods.running',
				'cluster.pods.pending',
				'cluster.pods.failed',
				'cluster.pods.succeeded'
			];

		case 'node':
			// Node-level metrics
			return [
				'node.cpu.usage.cores',
				'node.mem.usage.bytes',
				'node.mem.working_set.bytes',
				'node.capacity.cpu.cores',
				'node.capacity.mem.bytes',
				'node.allocatable.cpu.cores',
				'node.allocatable.mem.bytes',
				'node.net.rx.bps',
				'node.net.tx.bps',
				'node.fs.used.bytes',
				'node.fs.used.percent',
				'node.imagefs.used.bytes',
				'node.process.count',
			];

		case 'namespace':
		case 'workload':
		case 'pod':
			// Pod-level metrics
			return [
				'pod.cpu.usage.cores',
				'pod.mem.usage.bytes',
				'pod.mem.working_set.bytes',
				'pod.net.rx.bps',
				'pod.net.tx.bps',
				'pod.ephemeral.used.bytes',
			];

		case 'container':
			// Container-level metrics
			return [
				'ctr.cpu.usage.cores',
				'ctr.mem.working_set.bytes',
				'ctr.rootfs.used.bytes',
				'ctr.logs.used.bytes',
			];

		default:
			return [];
	}
}

/**
 * Open WebSocket connection for real-time updates
 */
export function openMetricsWebSocket(
	seriesKeys: MetricKey[],
	filters: MetricFilters,
	handlers: MetricsWSHandlers = {}
): WebSocket {
	// For now, only cluster scope is supported
	if (filters.scope !== 'cluster') {
		throw new Error(`WebSocket for scope '${filters.scope}' is not yet supported`);
	}

	// Convert to existing TimeSeriesKey format
	const timeSeriesKeys = seriesKeys.filter(key =>
		[
			'cluster.cpu.used.cores',
			'cluster.cpu.capacity.cores',
			'cluster.cpu.allocatable.cores',
			'cluster.cpu.requested.cores',
			'cluster.net.rx.bps',
			'cluster.net.tx.bps'
		].includes(key)
	) as TimeSeriesKey[];

	// Use existing WebSocket function with adapter handlers
	return openClusterLiveWS(timeSeriesKeys, {
		onConnect: handlers.onConnect,
		onDisconnect: handlers.onDisconnect,
		onError: handlers.onError,
		onInit: (data) => {
			// Adapt to our extended format
			const adaptedData: MetricsResponse = {
				...data,
				metadata: {
					resolution: filters.resolution,
					timespan: '1h',
					scope: filters.scope,
				}
			};
			handlers.onInit?.(adaptedData);
		},
		onAppend: (key, point) => {
			// Adapt point format
			const adaptedPoint: MetricPoint = {
				...point,
				entity: filters.entity,
			};
			handlers.onAppend?.(key, adaptedPoint);
		},
	});
}
