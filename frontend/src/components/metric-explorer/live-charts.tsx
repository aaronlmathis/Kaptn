/**
 * LiveMetricAreaChart - Enhanced area chart with LiveSeriesClient integration
 * 
 * This component extends the standard MetricAreaChart to use real-time data
 * from the LiveSeriesClient for specific series.
 */

import * as React from 'react';
import { MetricAreaChart } from './charts';
import { useLiveSeriesSubscription } from '@/hooks/useLiveSeries';
import type { ChartSeries } from './charts';

interface LiveMetricAreaChartProps {
	// Chart configuration
	title: string;
	subtitle?: string;
	unit?: string;
	formatter?: (value: number) => string;
	stacked?: boolean;
	height?: number;

	// Live data configuration
	groupId: string;
	seriesKeys: string[];

	// Fallback data (for when live is not available)
	fallbackSeries?: ChartSeries[];

	// UI state
	isLoading?: boolean;
	error?: string;
	capabilities?: React.ReactNode;
	scopeLabel?: string;
	timespanLabel?: string;
	resolutionLabel?: string;
}

/**
 * Convert live data to ChartSeries format
 */
function convertLiveDataToChartSeries(
	liveData: Record<string, Array<{ t: number; v: number }>>,
	seriesKeys: string[]
): ChartSeries[] {
	return seriesKeys
		.filter(key => liveData[key] && liveData[key].length > 0)
		.map(key => ({
			key,
			name: formatSeriesName(key),
			data: liveData[key].map(point => [point.t, point.v] as [number, number]),
			color: undefined, // Will be assigned by chart component
		}));
}

/**
 * Format series key to display name
 */
function formatSeriesName(key: string): string {
	const parts = key.split('.');
	const metric = parts[parts.length - 1];
	const scope = parts[0];

	// Handle common patterns
	if (key.includes('mem.used')) return 'Memory Used';
	if (key.includes('mem.allocatable')) return 'Memory Allocatable';
	if (key.includes('mem.requested')) return 'Memory Requested';

	// Capitalize and format
	const formatted = metric
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/^./, str => str.toUpperCase());

	return `${scope.charAt(0).toUpperCase() + scope.slice(1)} ${formatted}`;
}

export function LiveMetricAreaChart({
	title,
	subtitle,
	unit,
	formatter,
	stacked,
	height,
	groupId,
	seriesKeys,
	fallbackSeries = [],
	isLoading,
	error,
	capabilities,
	scopeLabel,
	timespanLabel,
	resolutionLabel,
}: LiveMetricAreaChartProps) {
	// Use live series subscription
	const {
		seriesData: liveData,
		isConnected,
		connectionState,
	} = useLiveSeriesSubscription(groupId, seriesKeys, {
		res: 'hi', // Use high resolution for better real-time updates
		since: '15m', // 15 minutes of history
		autoConnect: true,
	});

	// Convert live data to chart format
	const liveSeries = React.useMemo(() => {
		if (!isConnected || Object.keys(liveData).length === 0) {
			return [];
		}
		return convertLiveDataToChartSeries(liveData, seriesKeys);
	}, [liveData, seriesKeys, isConnected]);

	// Use live data if available, fallback to provided series
	const series = liveSeries.length > 0 ? liveSeries : fallbackSeries;

	// Enhanced title to show connection status
	const enhancedTitle = React.useMemo(() => {
		if (isConnected && liveSeries.length > 0) {
			return `${title} 🔴`; // Red dot for live
		}
		return title;
	}, [title, isConnected, liveSeries.length]);

	// Enhanced subtitle to show data source
	const enhancedSubtitle = React.useMemo(() => {
		const baseSubtitle = subtitle || '';
		if (isConnected && liveSeries.length > 0) {
			return `${baseSubtitle} (Live data)`;
		}
		if (connectionState.lastError) {
			return `${baseSubtitle} (Using fallback data)`;
		}
		return baseSubtitle;
	}, [subtitle, isConnected, liveSeries.length, connectionState.lastError]);

	return (
		<MetricAreaChart
			title={enhancedTitle}
			subtitle={enhancedSubtitle}
			series={series}
			unit={unit}
			formatter={formatter}
			stacked={stacked}
			isLoading={isLoading && series.length === 0}
			error={error}
			capabilities={capabilities}
			scopeLabel={scopeLabel}
			timespanLabel={timespanLabel}
			resolutionLabel={resolutionLabel}
			height={height}
		/>
	);
}
