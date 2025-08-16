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
  timespan: Timespan;
  customTimeRange?: {
    start: Date;
    end: Date;
  };
  resolution: Resolution;
  topN?: number;
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
    ['cluster.cpu.used.cores', 'cluster.cpu.capacity.cores', 'cluster.net.rx.bps', 'cluster.net.tx.bps'].includes(key)
  ) as TimeSeriesKey[];

  if (timeSeriesKeys.length === 0) {
    throw new Error('No supported metrics found for the current selection');
  }

  // Use the existing fetchClusterSeries function
  const response = await fetchClusterSeries(
    timeSeriesKeys,
    filters.resolution,
    filters.timespan
  );

  // Return in our extended format
  return {
    ...response,
    metadata: {
      resolution: filters.resolution,
      timespan: filters.timespan,
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
  _search?: string
): Promise<{ entities: Array<{ id: string; name: string; labels?: Record<string, string> }> }> {
  // For cluster scope, no entities
  if (scope === 'cluster') {
    return { entities: [] };
  }

  // For other scopes, return mock data for now
  // In the future, this would call the appropriate backend endpoints
  return { entities: [] };
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
  } catch (_error) {
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
        'cluster.cpu.used.cores',
        'cluster.cpu.capacity.cores',
        'cluster.net.rx.bps',
        'cluster.net.tx.bps'
      ] as MetricKey[];
    
    case 'node':
    case 'namespace':
    case 'workload':
    case 'pod':
    case 'container':
      // For other scopes, return empty array for now
      // These would be implemented when backend support is added
      return [];
    
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
    ['cluster.cpu.used.cores', 'cluster.cpu.capacity.cores', 'cluster.net.rx.bps', 'cluster.net.tx.bps'].includes(key)
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
          timespan: filters.timespan,
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
