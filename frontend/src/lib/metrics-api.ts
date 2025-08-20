/**
 * Extended TimeSeries API Client for Metric Explorer
 * 
 * Extends the existing timeseries API with additional functionality
 * while maintaining compatibility with the backend endpoints.
 */

import {
  fetchClusterSeries,
  type TimeSeriesKey,
  type TimeSeriesPoint,
  type TimeSeriesResponse,
  type Resolution
} from '@/lib/api/timeseries';

// Re-export Resolution type
export type { Resolution };

// All available metric keys based on existing API + TIMESERIES_METRICS.md
export type MetricKey = TimeSeriesKey;

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
 * Fetch timeseries data with filtering - delegates to existing API
 */
export async function fetchMetrics(
  seriesKeys: MetricKey[],
  filters: MetricFilters
): Promise<MetricsResponse> {
  // For now, only cluster scope is supported by the backend
  if (filters.scope !== 'cluster') {
    throw new Error(`Scope '${filters.scope}' is not yet supported. Only 'cluster' scope is available.`);
  }

  // Convert our metric keys to the existing TimeSeriesKey format
  const timeSeriesKeys = seriesKeys.filter(key =>
    [
      'cluster.cpu.used.cores',
      'cluster.cpu.capacity.cores',
      'cluster.mem.used.bytes',
      'cluster.mem.allocatable.bytes',
      'cluster.mem.requested.bytes',
      'cluster.net.rx.bps',
      'cluster.net.tx.bps'
    ].includes(key)
  ) as TimeSeriesKey[];

  if (timeSeriesKeys.length === 0) {
    throw new Error('No supported metrics found for the current selection');
  }

  // Use the existing fetchClusterSeries function with 1h fixed timespan
  const response = await fetchClusterSeries(
    timeSeriesKeys,
    filters.resolution,
    '1h'
  );

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
}

/**
 * Get available entities for a given scope
 */
export async function fetchEntities(
  scope: MetricScope,
  search?: string
): Promise<{ entities: Array<{ id: string; name: string; labels?: Record<string, string> }> }> {
  // For cluster scope, no entities needed
  if (scope === 'cluster') {
    return { entities: [] };
  }

  let endpoint = '';
  switch (scope) {
    case 'node':
      endpoint = '/timeseries/entities/nodes';
      break;
    case 'namespace':
      endpoint = '/timeseries/entities/namespaces';
      break;
    case 'pod':
      endpoint = '/timeseries/entities/pods';
      if (search) {
        endpoint += `?namespace=${encodeURIComponent(search)}`;
      }
      break;
    default:
      return { entities: [] };
  }

  try {
    const response = await fetch(`/api/v1${endpoint}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${scope} entities: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${scope} entities:`, error);
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
    console.warn('Failed to fetch capabilities:', error);
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
export function getMetricsForScope(scope: MetricScope): string[] {
  switch (scope) {
    case 'cluster':
      // Return cluster-level metrics that are supported by the backend
      return [
        'cluster.cpu.used.cores',
        'cluster.cpu.capacity.cores',
        'cluster.mem.used.bytes',
        'cluster.mem.allocatable.bytes',
        'cluster.mem.requested.bytes',
        'cluster.net.rx.bps',
        'cluster.net.tx.bps'
      ];

    case 'node':
      // Return node metric base keys - actual keys will be built with entity names
      return [
        'node.cpu.usage.cores',
        'node.mem.usage.bytes',
        'node.net.rx.bps',
        'node.net.tx.bps',
        'node.capacity.cpu.cores',
        'node.capacity.mem.bytes'
      ];

    case 'namespace':
      // Return namespace metric base keys
      return [
        'ns.cpu.used.cores',
        'ns.mem.used.bytes',
        'ns.pods.running',
        'ns.cpu.request.cores',
        'ns.mem.request.bytes'
      ];

    case 'pod':
      // Return pod metric base keys
      return [
        'pod.cpu.usage.cores',
        'pod.mem.usage.bytes',
        'pod.net.rx.bps',
        'pod.net.tx.bps',
        'pod.restarts.total'
      ];

    case 'workload':
    case 'container':
      // Not yet implemented
      return [];

    default:
      return [];
  }
}

/**
 * Build metric keys for specific entities
 */
export function buildMetricKeys(
  scope: MetricScope,
  entities: Array<{ id: string; name: string; namespace?: string }>,
  metricBases: string[]
): string[] {
  if (scope === 'cluster') {
    // Cluster metrics don't need entity names
    return metricBases;
  }

  const keys: string[] = [];

  entities.forEach(entity => {
    metricBases.forEach(metricBase => {
      let key: string | undefined;

      switch (scope) {
        case 'node':
          key = `${metricBase}.${entity.name}`;
          break;
        case 'namespace':
          key = `${metricBase}.${entity.name}`;
          break;
        case 'pod':
          // Pod keys need namespace.podname format
          if (entity.namespace) {
            key = `${metricBase}.${entity.namespace}.${entity.name}`;
          }
          break;
        default:
          // Skip unknown scopes
          return;
      }

      if (key) {
        keys.push(key);
      }
    });
  });

  return keys;
}

/**
 * Open WebSocket connection for real-time updates
 */
export function openMetricsWebSocket(
  seriesKeys: MetricKey[],
  filters: MetricFilters,
  handlers: MetricsWSHandlers = {}
): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  // Use the unified timeseries WebSocket endpoint that supports all scopes
  const url = `${protocol}//${window.location.host}/api/v1/timeseries/live`;

  console.log('🔌 Opening unified timeseries WebSocket:', {
    url,
    seriesKeys,
    scope: filters.scope
  });

  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('✅ Connected to unified timeseries WebSocket');
    handlers.onConnect?.();
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'hello': {
          console.log('📋 Received capabilities:', message.capabilities);

          // Subscribe to the requested metrics after hello
          const subscribeMessage = {
            type: 'subscribe',
            groupId: `${filters.scope}-metrics-${Date.now()}`,
            res: filters.resolution,
            since: '15m', // Default time window
            series: seriesKeys
          };

          console.log('📤 Sending subscription:', subscribeMessage);
          ws.send(JSON.stringify(subscribeMessage));
          break;
        }

        case 'ack': {
          console.log('✅ Subscription acknowledged:', {
            accepted: message.accepted,
            rejected: message.rejected
          });

          if (message.rejected && message.rejected.length > 0) {
            console.warn('⚠️ Some metrics were rejected:', message.rejected);
          }
          break;
        }

        case 'init': {
          console.log('📊 Received initial data for:', Object.keys(message.data.series));

          // Adapt to our extended format
          const adaptedData: MetricsResponse = {
            ...message.data,
            metadata: {
              resolution: filters.resolution,
              timespan: '15m',
              scope: filters.scope,
              entity: filters.entity,
            }
          };

          handlers.onInit?.(adaptedData);
          break;
        }

        case 'append': {
          console.log(`📈 New data point for ${message.key}:`, message.point);

          // Convert to our extended format
          const point: MetricPoint = {
            ...message.point,
            entity: message.point.entity?.node || message.point.entity?.namespace || message.point.entity?.pod
          };

          handlers.onAppend?.(message.key, point);
          break;
        }

        case 'error': {
          console.error('❌ WebSocket error from server:', message.error);
          handlers.onError?.(new Error(message.error));
          break;
        }

        default: {
          console.warn('⚠️ Unknown message type:', message.type);
        }
      }
    } catch (error) {
      console.error('❌ Failed to process WebSocket message:', error);
      handlers.onError?.(error instanceof Error ? error : new Error('Message processing error'));
    }
  };

  ws.onerror = (error) => {
    console.error('❌ WebSocket connection error:', error);
    handlers.onError?.(new Error('WebSocket connection error'));
  };

  ws.onclose = (event) => {
    console.log(`🔌 WebSocket closed: ${event.code} ${event.reason}`);
    handlers.onDisconnect?.();
  };

  return ws;
}
