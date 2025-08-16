/**
 * Timeseries API Client for Kaptn Dashboard
 * 
 * Provides functions to fetch cluster time series data via REST API
 * and establish WebSocket connections for real-time updates.
 */

import { apiClient } from '@/lib/api-client';

// Available time series keys
export type TimeSeriesKey = 
  | 'cluster.cpu.used.cores'
  | 'cluster.cpu.capacity.cores'
  | 'cluster.net.rx.bps'
  | 'cluster.net.tx.bps';

// Resolution options
export type Resolution = 'hi' | 'lo';

// Time series point structure
export interface TimeSeriesPoint {
  t: number; // Timestamp in milliseconds
  v: number; // Value
}

// Time series data response
export interface TimeSeriesResponse {
  series: Record<string, TimeSeriesPoint[]>;
  capabilities: {
    metricsAPI: boolean;
    summaryAPI: boolean;
  };
}

// WebSocket message types
export interface TimeSeriesInitMessage {
  type: 'init';
  data: TimeSeriesResponse;
}

export interface TimeSeriesAppendMessage {
  type: 'append';
  key: string;
  point: TimeSeriesPoint;
}

export type TimeSeriesWSMessage = TimeSeriesInitMessage | TimeSeriesAppendMessage;

// WebSocket handlers
export interface TimeSeriesWSHandlers {
  onInit?: (data: TimeSeriesResponse) => void;
  onAppend?: (key: string, point: TimeSeriesPoint) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Fetch cluster time series data via REST API
 * 
 * @param keys - Array of series keys to fetch (optional, defaults to all)
 * @param res - Resolution: 'hi' or 'lo' (defaults to 'lo')
 * @param since - Duration string like '60m', '1h' (defaults to '60m')
 * @returns Promise with time series data and capabilities
 */
export async function fetchClusterSeries(
  keys?: TimeSeriesKey[],
  res: Resolution = 'lo',
  since = '60m'
): Promise<TimeSeriesResponse> {
  const params = new URLSearchParams();
  
  if (keys && keys.length > 0) {
    params.append('series', keys.join(','));
  }
  params.append('res', res);
  params.append('since', since);
  
  const endpoint = `/timeseries/cluster?${params.toString()}`;
  return await apiClient.get<TimeSeriesResponse>(endpoint);
}

/**
 * Open WebSocket connection for real-time cluster time series updates
 * 
 * @param keys - Array of series keys to stream (optional, defaults to all)
 * @param handlers - Event handlers for WebSocket messages
 * @returns WebSocket instance for connection management
 */
export function openClusterLiveWS(
  keys?: TimeSeriesKey[],
  handlers: TimeSeriesWSHandlers = {}
): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  
  if (keys && keys.length > 0) {
    params.append('series', keys.join(','));
  }
  
  // Get auth token from session if available
  const session = (window as any).__KAPTN_SESSION__;
  if (session?.token) {
    params.append('token', session.token);
  }
  
  const queryString = params.toString() ? `?${params.toString()}` : '';
  const url = `${protocol}//${window.location.host}/api/v1/timeseries/cluster/live${queryString}`;
  
  const ws = new WebSocket(url);
  
  ws.onopen = () => {
    console.log('✅ Timeseries WebSocket connected to:', url);
    handlers.onConnect?.();
  };
  
  ws.onmessage = (event) => {
    try {
      // Add extra validation to ensure this is a timeseries message
      let message: any;
      
      try {
        message = JSON.parse(event.data);
      } catch (parseError) {
        console.error('❌ Timeseries WebSocket: Invalid JSON received:', {
          error: parseError,
          data: event.data?.substring(0, 200) + '...',
          dataLength: event.data?.length
        });
        handlers.onError?.(new Error('Invalid JSON format in WebSocket message'));
        return;
      }
      
      // Validate message structure for timeseries
      if (!message || typeof message !== 'object') {
        console.error('❌ Timeseries WebSocket: Invalid message structure:', message);
        handlers.onError?.(new Error('Invalid message structure'));
        return;
      }
      
      // Check if this is actually a timeseries message by looking for expected fields
      const isTimeseriesMessage = 
        (message.type === 'init' && message.data?.series) ||
        (message.type === 'append' && message.key && message.point);
      
      if (!isTimeseriesMessage) {
        console.warn('⚠️ Timeseries WebSocket: Received non-timeseries message, ignoring:', {
          type: message.type,
          hasData: !!message.data,
          hasKey: !!message.key,
          hasPoint: !!message.point
        });
        return;
      }
      
      // Process valid timeseries message
      const tsMessage = message as TimeSeriesWSMessage;
      
      switch (tsMessage.type) {
        case 'init':
          console.log('📊 Received initial timeseries data:', Object.keys(tsMessage.data.series));
          handlers.onInit?.(tsMessage.data);
          break;
          
        case 'append':
          console.log(`📈 New data point for ${tsMessage.key}:`, tsMessage.point);
          handlers.onAppend?.(tsMessage.key, tsMessage.point);
          break;
          
        default:
          console.warn('⚠️ Unknown timeseries message type:', (tsMessage as any).type);
      }
    } catch (error) {
      console.error('❌ Failed to process timeseries WebSocket message:', {
        error: error instanceof Error ? error.message : error,
        data: event.data?.substring(0, 200) + '...'
      });
      handlers.onError?.(error instanceof Error ? error : new Error('Message processing error'));
    }
  };
  
  ws.onerror = (error) => {
    console.error('❌ Timeseries WebSocket error:', error);
    handlers.onError?.(new Error('WebSocket connection error'));
  };
  
  ws.onclose = (event) => {
    console.log(`🔌 Timeseries WebSocket closed: ${event.code} ${event.reason}`);
    handlers.onDisconnect?.();
  };
  
  return ws;
}

/**
 * Helper function to format time series data for chart libraries
 * Converts from API format to [timestamp, value] tuples
 */
export function formatSeriesForChart(
  points: TimeSeriesPoint[]
): [number, number][] {
  return points
    .filter(point => 
      point && 
      Number.isFinite(point.t) && 
      Number.isFinite(point.v) && 
      point.t > 0
    )
    .map(point => [point.t, point.v]);
}

/**
 * Helper function to get a time window in milliseconds
 */
export function getTimeWindow(durationStr: string): number {
  const match = durationStr.match(/^(\d+)([smh])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${durationStr}`);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      throw new Error(`Unsupported time unit: ${unit}`);
  }
}

/**
 * Helper function to prune old data points from a series
 * Keeps only points within the specified time window
 */
export function pruneOldPoints(
  points: TimeSeriesPoint[],
  windowMs: number
): TimeSeriesPoint[] {
  const cutoff = Date.now() - windowMs;
  return points.filter(point => point.t >= cutoff);
}
