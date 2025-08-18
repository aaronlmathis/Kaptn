/**
 * OpsView Hook
 * 
 * Manages state for the operations view including filters, data fetching,
 * WebSocket connections, and section expansion state.
 */

import * as React from "react";
import {
	fetchMetrics,
	fetchEntities,
	fetchCapabilities,
	getMetricsForScope,
	type MetricKey,
	type MetricFilters,
	type MetricScope,
	type Resolution,
} from "@/lib/metrics-api";
import type { ChartSeries } from "@/components/metric-explorer/charts";

// Grid density for layout
export type GridDensity = 'compact' | 'cozy' | 'comfortable';

// Hook state
export interface OpsViewState {
	// Filter state
	filters: MetricFilters;
	density: GridDensity;
	autoRefresh: 'off'; // Simplified - auto-refresh disabled for now

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
export interface OpsViewActions {
	// Filter actions
	updateFilters: (filters: Partial<MetricFilters>) => void;
	setDensity: (density: GridDensity) => void;
	setAutoRefresh: (interval: 'off') => void; // Simplified - auto-refresh disabled

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
export interface UseOpsViewResult extends OpsViewState, OpsViewActions { }

// Default section IDs for OpsView - all 12 sections available
const DEFAULT_OPSVIEW_SECTIONS = [
	'cluster-overview',
	'capacity-headroom',
	'scheduling-pressure',
	'reliability',
	'limits-compliance',
	'noisy-neighbors',
	'over-limits',
	'node-health',
	'pod-lifecycle',
	'ephemeral-storage',
	'network-health',
	'namespace-views'
];

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
function convertToChartSeries(data: Record<string, Array<{ t: number; v: number; entity?: string }>> | null | undefined): Record<string, ChartSeries> {
	const result: Record<string, ChartSeries> = {};

	// Guard against null/undefined data
	if (!data) {
		return result;
	}

	Object.entries(data).forEach(([key, points]) => {
		// Guard against null/undefined points array
		if (!points || !Array.isArray(points)) {
			return;
		}

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
export function useOpsView(): UseOpsViewResult {
	const { urlParams } = useURLState();

	// Initialize state from URL params - default to cluster scope for ops view
	const [filters, setFilters] = React.useState<MetricFilters>(() => ({
		scope: (urlParams.get('scope') as MetricScope) || 'cluster',
		entity: urlParams.get('entity') || undefined,
		resolution: (urlParams.get('resolution') as Resolution) || 'lo',
		search: urlParams.get('search') || undefined,
	}));

	const [density, setDensityState] = React.useState<GridDensity>(
		(urlParams.get('density') as GridDensity) || 'cozy'
	);

	const [autoRefresh, setAutoRefreshState] = React.useState<'off'>('off');

	// Data state
	const [seriesData, setSeriesData] = React.useState<Record<string, ChartSeries>>({});
	const [capabilities, setCapabilities] = React.useState<{
		metricsAPI: boolean;
		summaryAPI: boolean;
	} | null>(null);

	// UI state - default to cluster overview expanded
	const [expandedSections, setExpandedSections] = React.useState<string[]>(['cluster-overview']);
	const [isLoading, setIsLoading] = React.useState(false);
	const [error, setError] = React.useState<string | undefined>();

	// Entity state
	const [availableEntities, setAvailableEntities] = React.useState<Array<{ id: string; name: string; labels?: Record<string, string> }>>([]);

	// WebSocket state - now handled by LiveSeriesClient
	const [isConnected, setIsConnected] = React.useState(false);
	const autoRefreshTimerRef = React.useRef<number | null>(null);

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
			console.log('OpsView: Fetching metrics:', metricsToFetch, 'with filters:', filtersToUse);

			const response = await fetchMetrics(metricsToFetch, filtersToUse);
			console.log('OpsView: API response:', response);

			// Ensure response has the expected structure
			const seriesData = response?.series || {};
			console.log('OpsView: Processing series data:', seriesData);

			setSeriesData(convertToChartSeries(seriesData));

			if (response?.capabilities) {
				setCapabilities(response.capabilities);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to fetch operations data';
			console.error('OpsView: Fetch error:', err);
			setError(errorMessage);
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

	// WebSocket connection management - disabled, using LiveSeriesClient instead
	const connect = React.useCallback(() => {
		// WebSocket is now handled by individual LiveMetricAreaChart components
		// via the LiveSeriesClient. This prevents duplicate connections.
		console.log('WebSocket connection delegated to LiveSeriesClient');
		setIsConnected(true); // Assume connected for now
	}, []);

	const disconnect = React.useCallback(() => {
		// WebSocket disconnection is handled by LiveSeriesClient
		console.log('WebSocket disconnection delegated to LiveSeriesClient');
		setIsConnected(false);
	}, []);

	// Cleanup on unmount - LiveSeriesClient handles its own cleanup
	React.useEffect(() => {
		return () => {
			if (autoRefreshTimerRef.current) {
				clearInterval(autoRefreshTimerRef.current);
			}
		};
	}, []);

	// Action implementations
	const updateFilters = React.useCallback((newFilters: Partial<MetricFilters>) => {
		setFilters(prev => ({ ...prev, ...newFilters }));
	}, []);

	const setDensity = React.useCallback((newDensity: GridDensity) => {
		setDensityState(newDensity);
	}, []);

	const setAutoRefresh = React.useCallback((interval: 'off') => {
		setAutoRefreshState(interval);
	}, []);

	const refresh = React.useCallback(async () => {
		disconnect(); // Disconnect from LiveSeriesClient before manual refresh
		await fetchData();
		connect(); // Reconnect to LiveSeriesClient after refresh
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
		setExpandedSections(DEFAULT_OPSVIEW_SECTIONS);
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
