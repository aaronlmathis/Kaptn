/**
 * React Hook for Cluster Time Series Data
 * 
 * Manages fetching initial time series data and streaming live updates
 * for cluster-level metrics like CPU usage, CPU capacity, and network traffic.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  fetchClusterSeries,
  openClusterLiveWS,
  formatSeriesForChart,
  pruneOldPoints,
  getTimeWindow,
  type TimeSeriesKey,
  type TimeSeriesPoint,
  type Resolution
} from '@/lib/api/timeseries';

// Hook configuration options
export interface UseClusterTimeseriesOptions {
  /** Whether to enable WebSocket streaming (default: true) */
  enableStreaming?: boolean;
  /** Time window to maintain in memory (default: '60m') */
  timeWindow?: string;
  /** Initial resolution for REST fetch (default: 'lo') */
  initialResolution?: Resolution;
  /** Whether to log debug information (default: false) */
  debug?: boolean;
}

// Connection state tracking
export interface ConnectionState {
  isLoading: boolean;
  isConnected: boolean;
  hasError: boolean;
  error?: Error;
}

// Chart-ready series data
export interface ChartSeries {
  name: string;
  key: TimeSeriesKey;
  data: [number, number][]; // [timestamp, value] tuples
  color?: string;
}

// Return type for the hook
export interface UseClusterTimeseriesResult {
  /** Current time series data formatted for charts */
  series: ChartSeries[];
  /** Raw time series data */
  rawData: Record<string, TimeSeriesPoint[]>;
  /** API capabilities (metrics/summary availability) */
  capabilities: {
    metricsAPI: boolean;
    summaryAPI: boolean;
  } | null;
  /** Connection and loading state */
  connectionState: ConnectionState;
  /** Manually refresh data */
  refresh: () => Promise<void>;
  /** Connect/disconnect WebSocket */
  connect: () => void;
  disconnect: () => void;
}

// Default series display configuration
const SERIES_CONFIG: Record<TimeSeriesKey, { name: string; color?: string }> = {
  'cluster.cpu.used.cores': {
    name: 'CPU Used',
    color: '#ff6b6b'
  },
  'cluster.cpu.capacity.cores': {
    name: 'CPU Capacity',
    color: '#4ecdc4'
  },
  'cluster.net.rx.bps': {
    name: 'Network RX',
    color: '#45b7d1'
  },
  'cluster.net.tx.bps': {
    name: 'Network TX',
    color: '#f39c12'
  },
  'cluster.mem.used.bytes': {
    name: 'Memory Used',
    color: '#9b59b6'
  },
  'cluster.mem.allocatable.bytes': {
    name: 'Memory Allocatable',
    color: '#2ecc71'
  },
  'cluster.mem.requested.bytes': {
    name: 'Memory Requested',
    color: '#e74c3c'
  }
};

/**
 * Hook for managing cluster time series data with real-time updates
 * 
 * @param seriesKeys - Array of time series keys to track
 * @param options - Configuration options
 * @returns Time series data and connection management functions
 */
export function useClusterTimeseries(
  seriesKeys: TimeSeriesKey[],
  options: UseClusterTimeseriesOptions = {}
): UseClusterTimeseriesResult {
  const {
    enableStreaming = false, // Disabled by default to prevent conflicts
    timeWindow = '60m',
    initialResolution = 'lo',
    debug = false
  } = options;

  // State management
  const [rawData, setRawData] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [capabilities, setCapabilities] = useState<{
    metricsAPI: boolean;
    summaryAPI: boolean;
  } | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isLoading: false,
    isConnected: false,
    hasError: false
  });

  // Refs for cleanup and connection management
  const wsRef = useRef<WebSocket | null>(null);
  const timeWindowMs = useRef<number>(getTimeWindow(timeWindow));
  const mountedRef = useRef(true);

  // Debug logging helper
  const log = useCallback((message: string, ...args: any[]) => {
    if (debug) {
      console.log(`[useClusterTimeseries] ${message}`, ...args);
    }
  }, [debug]);

  // Update time window when it changes
  useEffect(() => {
    timeWindowMs.current = getTimeWindow(timeWindow);
  }, [timeWindow]);

  // Helper to safely update state only if component is mounted
  const safeSetState = useCallback((updater: () => void) => {
    if (mountedRef.current) {
      updater();
    }
  }, []);

  // Add new data point and prune old data
  const addDataPoint = useCallback((key: string, point: TimeSeriesPoint) => {
    safeSetState(() => {
      setRawData(prev => {
        const existing = prev[key] || [];
        const updated = [...existing, point];
        const pruned = pruneOldPoints(updated, timeWindowMs.current);
        
        log(`Added point to ${key}:`, point, `(${pruned.length} total points)`);
        
        return {
          ...prev,
          [key]: pruned
        };
      });
    });
  }, [safeSetState, log]);

  // Update multiple series data (from initial fetch)
  const updateSeriesData = useCallback((seriesData: Record<string, TimeSeriesPoint[]>) => {
    safeSetState(() => {
      setRawData(prev => {
        const updated = { ...prev };
        
        Object.entries(seriesData).forEach(([key, points]) => {
          const pruned = pruneOldPoints(points, timeWindowMs.current);
          updated[key] = pruned;
          log(`Updated ${key}:`, `${pruned.length} points`);
        });
        
        return updated;
      });
    });
  }, [safeSetState, log]);

  // Fetch initial data from REST API
  const fetchInitialData = useCallback(async () => {
    log('Fetching initial data...', { seriesKeys, resolution: initialResolution, timeWindow });
    
    safeSetState(() => {
      setConnectionState(prev => ({ ...prev, isLoading: true, hasError: false, error: undefined }));
    });

    try {
      const response = await fetchClusterSeries(seriesKeys, initialResolution, timeWindow);
      
      log('Initial data received:', response);
      
      safeSetState(() => {
        setCapabilities(response.capabilities);
        updateSeriesData(response.series);
        setConnectionState(prev => ({ ...prev, isLoading: false }));
      });
      
    } catch (error) {
      console.error('Failed to fetch initial timeseries data:', error);
      
      safeSetState(() => {
        setConnectionState(prev => ({
          ...prev,
          isLoading: false,
          hasError: true,
          error: error instanceof Error ? error : new Error('Unknown error')
        }));
      });
    }
  }, [seriesKeys, initialResolution, timeWindow, log, safeSetState, updateSeriesData]);

  // Connect to WebSocket for live updates
  const connect = useCallback(() => {
    if (!enableStreaming) {
      log('Streaming disabled, skipping WebSocket connection');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      log('WebSocket already connected');
      return;
    }

    log('Connecting to WebSocket...', { seriesKeys });

    try {
      wsRef.current = openClusterLiveWS(seriesKeys, {
        onConnect: () => {
          log('WebSocket connected');
          safeSetState(() => {
            setConnectionState(prev => ({ ...prev, isConnected: true, hasError: false, error: undefined }));
          });
        },

        onInit: (data) => {
          log('Received initial WebSocket data');
          safeSetState(() => {
            setCapabilities(data.capabilities);
            updateSeriesData(data.series);
          });
        },

        onAppend: (key, point) => {
          log('Received data point:', { key, point });
          addDataPoint(key, point);
        },

        onError: (error) => {
          console.error('Timeseries WebSocket error:', error);
          safeSetState(() => {
            setConnectionState(prev => ({ ...prev, hasError: true, error }));
          });
          
          // Disconnect on error to prevent interference with other WebSocket connections
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            log('Disconnecting WebSocket due to error to prevent conflicts');
            wsRef.current.close();
            wsRef.current = null;
          }
        },

        onDisconnect: () => {
          log('WebSocket disconnected');
          safeSetState(() => {
            setConnectionState(prev => ({ ...prev, isConnected: false }));
          });
        }
      });

    } catch (error) {
      console.error('Failed to create timeseries WebSocket connection:', error);
      safeSetState(() => {
        setConnectionState(prev => ({
          ...prev,
          hasError: true,
          error: error instanceof Error ? error : new Error('Connection failed')
        }));
      });
    }
  }, [enableStreaming, seriesKeys, log, safeSetState, updateSeriesData, addDataPoint]);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      log('Disconnecting WebSocket...');
      wsRef.current.close();
      wsRef.current = null;
      
      safeSetState(() => {
        setConnectionState(prev => ({ ...prev, isConnected: false }));
      });
    }
  }, [log, safeSetState]);

  // Manual refresh function
  const refresh = useCallback(async () => {
    log('Manual refresh requested');
    await fetchInitialData();
  }, [fetchInitialData, log]);

  // Format data for chart consumption
  const series: ChartSeries[] = React.useMemo(() => {
    if (!seriesKeys || !Array.isArray(seriesKeys)) {
      return [];
    }
    
    return seriesKeys
      .filter(key => rawData[key] && rawData[key].length > 0)
      .map(key => ({
        name: SERIES_CONFIG[key]?.name || key,
        key,
        data: formatSeriesForChart(rawData[key]),
        color: SERIES_CONFIG[key]?.color
      }));
  }, [seriesKeys, rawData]);

  // Initialize on mount
  useEffect(() => {
    log('Hook initializing...', { seriesKeys, options });
    fetchInitialData();
    
    // Set up WebSocket connection after initial fetch
    const connectTimer = setTimeout(() => {
      connect();
    }, 100);

    return () => {
      clearTimeout(connectTimer);
    };
  }, []); // Empty dependency array for mount-only effect

  // Handle series keys changes
  useEffect(() => {
    log('Series keys changed, reconnecting...', { seriesKeys });
    disconnect();
    
    // Small delay to ensure clean disconnection
    const reconnectTimer = setTimeout(() => {
      fetchInitialData().then(() => {
        connect();
      });
    }, 100);

    return () => {
      clearTimeout(reconnectTimer);
    };
  }, [seriesKeys.join(',')]); // Dependency on serialized keys

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  // Prune old data periodically
  useEffect(() => {
    const pruneInterval = setInterval(() => {
      if (mountedRef.current) {
        safeSetState(() => {
          setRawData(prev => {
            const updated = { ...prev };
            let hasChanges = false;
            
            Object.entries(prev).forEach(([key, points]) => {
              const pruned = pruneOldPoints(points, timeWindowMs.current);
              if (pruned.length !== points.length) {
                updated[key] = pruned;
                hasChanges = true;
              }
            });
            
            return hasChanges ? updated : prev;
          });
        });
      }
    }, 30000); // Prune every 30 seconds

    return () => clearInterval(pruneInterval);
  }, [safeSetState]);

  return {
    series,
    rawData,
    capabilities,
    connectionState,
    refresh,
    connect,
    disconnect
  };
}
