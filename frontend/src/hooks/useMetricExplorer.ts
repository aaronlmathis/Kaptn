/**
 * Metric Explorer Hook
 * 
 * Manages state for the metric explorer including filters, data fetching,
 * WebSocket connections, and section expansion state.
 */

import * as React from "react";
import {
  fetchMetrics,
  fetchEntities,
  fetchCapabilities,
  openMetricsWebSocket,
  getMetricsForScope,
  type MetricKey,
  type MetricFilters,
  type MetricScope,
  type Resolution,
} from "@/lib/metrics-api";
import type { GridDensity, AutoRefreshInterval } from "@/components/metric-explorer/filter-bar";
import type { ChartSeries } from "@/components/metric-explorer/charts";

// Hook state
export interface MetricExplorerState {
  // Filter state
  filters: MetricFilters;
  density: GridDensity;
  autoRefresh: AutoRefreshInterval;
  
  // Data state
  seriesData: Record<string, ChartSeries>;
  capabilities: {
    metricsAPI: boolean;
    summaryAPI: boolean;
  } | null;
  
  // UI state
  expandedSections: string[];
  isLoading: boolean;
  error?: string;
  
  // Available entities for current scope
  availableEntities: Array<{ id: string; name: string; labels?: Record<string, string> }>;
  
  // WebSocket connection state
  isConnected: boolean;
}

// Hook actions
export interface MetricExplorerActions {
  // Filter actions
  updateFilters: (filters: Partial<MetricFilters>) => void;
  setDensity: (density: GridDensity) => void;
  setAutoRefresh: (interval: AutoRefreshInterval) => void;
  
  // Data actions
  refresh: () => Promise<void>;
  searchEntities: (search: string) => Promise<void>;
  
  // UI actions
  setExpandedSections: (sections: string[]) => void;
  expandAllSections: () => void;
  collapseAllSections: () => void;
  
  // Connection actions
  connect: () => void;
  disconnect: () => void;
}

// Combined hook return type
export interface UseMetricExplorerResult extends MetricExplorerState, MetricExplorerActions {}

// Default section IDs
const DEFAULT_SECTIONS = ['cpu', 'memory', 'network', 'storage', 'cluster-state'];

/**
 * URL state management - simplified
 */
function useURLState() {
  const [urlParams, setURLParams] = React.useState(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  });

  // Disable URL updates for now to prevent refresh loops
  const updateURL = React.useCallback((params: URLSearchParams) => {
    // Temporarily disabled to prevent refresh loops
    // if (typeof window === 'undefined') return;
    // const newURL = `${window.location.pathname}?${params.toString()}`;
    // window.history.replaceState({}, '', newURL);
    setURLParams(new URLSearchParams(params));
  }, []);

  return { urlParams, updateURL };
}

/**
 * Convert time series data to chart series format
 */
function convertToChartSeries(data: Record<string, Array<{ t: number; v: number; entity?: string }>>): Record<string, ChartSeries> {
  const result: Record<string, ChartSeries> = {};
  
  Object.entries(data).forEach(([key, points]) => {
    result[key] = {
      key,
      name: formatSeriesName(key),
      data: points.map(p => [p.t, p.v] as [number, number]),
      color: undefined, // Will be assigned by chart components
    };
  });
  
  return result;
}

/**
 * Format series key to display name
 */
function formatSeriesName(key: string): string {
  const parts = key.split('.');
  const metric = parts[parts.length - 1];
  const unit = parts[parts.length - 2];
  
  // Capitalize and format
  const formatted = metric
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, str => str.toUpperCase());
  
  return `${formatted} (${unit})`;
}

/**
 * Main hook implementation
 */
export function useMetricExplorer(): UseMetricExplorerResult {
  const { urlParams } = useURLState();
  
  // Initialize state from URL params
  const [filters, setFilters] = React.useState<MetricFilters>(() => ({
    scope: (urlParams.get('scope') as MetricScope) || 'cluster',
    entity: urlParams.get('entity') || undefined,
    resolution: (urlParams.get('resolution') as Resolution) || 'lo',
    search: urlParams.get('search') || undefined,
  }));
  
  const [density, setDensityState] = React.useState<GridDensity>(
    (urlParams.get('density') as GridDensity) || 'cozy'
  );
  
  const [autoRefresh, setAutoRefreshState] = React.useState<AutoRefreshInterval>('off');
  
  // Data state
  const [seriesData, setSeriesData] = React.useState<Record<string, ChartSeries>>({});
  const [capabilities, setCapabilities] = React.useState<{
    metricsAPI: boolean;
    summaryAPI: boolean;
  } | null>(null);
  
  // UI state
  const [expandedSections, setExpandedSections] = React.useState<string[]>(['cpu', 'memory']);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  
  // Entity state
  const [availableEntities, setAvailableEntities] = React.useState<Array<{ id: string; name: string; labels?: Record<string, string> }>>([]);
  
  // WebSocket state
  const [isConnected, setIsConnected] = React.useState(false);
  const wsRef = React.useRef<WebSocket | null>(null);
  const autoRefreshTimerRef = React.useRef<number | null>(null);

  // Update URL when filters change - disabled to prevent refresh loops
  React.useEffect(() => {
    // Temporarily disable URL updates to prevent refresh loops
    // const params = new URLSearchParams();
    // 
    // params.set('scope', filters.scope);
    // if (filters.entity) params.set('entity', filters.entity);
    // params.set('timespan', filters.timespan);
    // params.set('resolution', filters.resolution);
    // if (filters.topN) params.set('topN', filters.topN.toString());
    // if (filters.search) params.set('search', filters.search);
    // params.set('density', density);
    // 
    // updateURL(params);
  }, []); // Empty dependency array to prevent updates

  // Fetch capabilities on mount
  React.useEffect(() => {
    fetchCapabilities()
      .then(response => setCapabilities(response.capabilities))
      .catch(err => console.error('Failed to fetch capabilities:', err));
  }, []);

  // Fetch entities when scope changes
  React.useEffect(() => {
    if (filters.scope !== 'cluster') {
      fetchEntities(filters.scope)
        .then(response => setAvailableEntities(response.entities))
        .catch(err => {
          console.error('Failed to fetch entities:', err);
          setAvailableEntities([]);
        });
    } else {
      setAvailableEntities([]);
    }
  }, [filters.scope]);

  // Store filters in a ref to avoid dependency cycles
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;

  // Fetch data function - inline version to avoid dependency cycles
  const performFetch = React.useCallback(async (filtersToUse: MetricFilters) => {
    setIsLoading(true);
    setError(undefined);

    try {
      const metricsToFetch = getMetricsForScope(filtersToUse.scope) as MetricKey[];
      const response = await fetchMetrics(metricsToFetch, filtersToUse);
      
      setSeriesData(convertToChartSeries(response.series));
      if (response.capabilities) {
        setCapabilities(response.capabilities);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch metrics';
      setError(errorMessage);
      console.error('Failed to fetch metrics:', err);
    } finally {
      setIsLoading(false);
    }
  }, []); // No dependencies

  // Public fetch function for manual refresh
  const fetchData = React.useCallback(async () => {
    await performFetch(filtersRef.current);
  }, [performFetch]);

  // Auto-refresh timer - disabled for debugging
  React.useEffect(() => {
    if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }

    // Temporarily disable auto-refresh to prevent refresh loops
    // if (autoRefresh !== 'off') {
    //   const intervalMs = parseInt(autoRefresh) * 1000;
    //   autoRefreshTimerRef.current = window.setInterval(fetchData, intervalMs);
    // }

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, [autoRefresh, fetchData]);

  // Initial data fetch - only once
  const [isInitialized, setIsInitialized] = React.useState(false);
  
  React.useEffect(() => {
    if (!isInitialized) {
      performFetch(filtersRef.current);
      setIsInitialized(true);
    }
  }, [isInitialized, performFetch]);

  // Refetch when scope changes - use a ref-based approach
  const prevScopeRef = React.useRef(filters.scope);
  React.useEffect(() => {
    if (isInitialized && prevScopeRef.current !== filters.scope) {
      prevScopeRef.current = filters.scope;
      performFetch(filtersRef.current);
    }
  }, [filters.scope, isInitialized, performFetch]);

  // WebSocket connection management - use ref to avoid dependency cycles
  const connect = React.useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    try {
      const currentFilters = filtersRef.current;
      const metricsToStream = getMetricsForScope(currentFilters.scope) as MetricKey[];
      
      wsRef.current = openMetricsWebSocket(metricsToStream, currentFilters, {
        onConnect: () => {
          setIsConnected(true);
          console.log('Metric explorer WebSocket connected');
        },
        
        onInit: (data) => {
          setSeriesData(convertToChartSeries(data.series));
          if (data.capabilities) {
            setCapabilities(data.capabilities);
          }
        },
        
        onAppend: (key, point) => {
          setSeriesData(prev => {
            const existing = prev[key];
            if (!existing) return prev;
            
            const updatedData = [...existing.data, [point.t, point.v] as [number, number]];
            
            // Keep only last 1000 points to prevent memory issues
            const trimmedData = updatedData.slice(-1000);
            
            return {
              ...prev,
              [key]: {
                ...existing,
                data: trimmedData,
              },
            };
          });
        },
        
        onError: (err) => {
          setError(`WebSocket error: ${err.message}`);
          setIsConnected(false);
        },
        
        onDisconnect: () => {
          setIsConnected(false);
          console.log('Metric explorer WebSocket disconnected');
        },
      });
    } catch (err) {
      console.error('Failed to open WebSocket:', err);
      setError('Failed to establish real-time connection');
    }
  }, []); // No dependencies to prevent cycles

  const disconnect = React.useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      disconnect();
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [disconnect]);

  // Action implementations
  const updateFilters = React.useCallback((newFilters: Partial<MetricFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const setDensity = React.useCallback((newDensity: GridDensity) => {
    setDensityState(newDensity);
  }, []);

  const setAutoRefresh = React.useCallback((interval: AutoRefreshInterval) => {
    setAutoRefreshState(interval);
  }, []);

  const refresh = React.useCallback(async () => {
    disconnect(); // Disconnect WebSocket before manual refresh
    await fetchData();
    connect(); // Reconnect after refresh
  }, [fetchData, disconnect, connect]);

  const searchEntities = React.useCallback(async (search: string) => {
    if (filters.scope === 'cluster') return;
    
    try {
      const response = await fetchEntities(filters.scope, search);
      setAvailableEntities(response.entities);
    } catch (err) {
      console.error('Failed to search entities:', err);
    }
  }, [filters.scope]);

  const expandAllSections = React.useCallback(() => {
    setExpandedSections(DEFAULT_SECTIONS);
  }, []);

  const collapseAllSections = React.useCallback(() => {
    setExpandedSections([]);
  }, []);

  return {
    // State
    filters,
    density,
    autoRefresh,
    seriesData,
    capabilities,
    expandedSections,
    isLoading,
    error,
    availableEntities,
    isConnected,
    
    // Actions
    updateFilters,
    setDensity,
    setAutoRefresh,
    refresh,
    searchEntities,
    setExpandedSections,
    expandAllSections,
    collapseAllSections,
    connect,
    disconnect,
  };
}
