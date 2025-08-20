/**
 * Hook for using the LiveSeriesClient with React components
 * 
 * Provides a React-friendly interface to the LiveSeriesClient singleton.
 */

import * as React from 'react';
import {
	liveSeriesClient,
	type SubscriptionConfig,
	type ConnectionState,
	type InitMessage,
	type AppendMessage,
} from '@/lib/live-series-client';

// Data structure for chart data points
export interface LiveDataPoint {
	t: number; // timestamp in milliseconds
	v: number; // value
}

// Hook return type
export interface UseLiveSeriesResult {
	// Connection state
	connectionState: ConnectionState;
	isConnected: boolean;

	// Data
	seriesData: Record<string, LiveDataPoint[]>;

	// Actions
	connect: () => Promise<void>;
	disconnect: () => void;
	subscribe: (config: SubscriptionConfig) => void;
	unsubscribe: (groupId: string, series?: string[]) => void;

	// Utilities
	backoff: () => void;
}

/**
 * React hook for LiveSeriesClient
 */
export function useLiveSeries(): UseLiveSeriesResult {
	const [connectionState, setConnectionState] = React.useState<ConnectionState>(
		liveSeriesClient.getConnectionState()
	);
	const [seriesData, setSeriesData] = React.useState<Record<string, LiveDataPoint[]>>({});

	// Connection state polling
	React.useEffect(() => {
		const interval = setInterval(() => {
			const newState = liveSeriesClient.getConnectionState();
			setConnectionState(newState);
		}, 1000);

		return () => clearInterval(interval);
	}, []);

	// Event listeners setup
	React.useEffect(() => {
		const handleConnect = () => {
			// console.log('🔌 useLiveSeries: Connected');
			// console.log('🔌 useLiveSeries: Connection state:', liveSeriesClient.getConnectionState());
			setConnectionState(liveSeriesClient.getConnectionState());
		};

		const handleDisconnect = () => {
			// console.log('🔌 useLiveSeries: Disconnected');
			// console.log('🔌 useLiveSeries: Connection state:', liveSeriesClient.getConnectionState());
			setConnectionState(liveSeriesClient.getConnectionState());
		};

		const handleInit = (data: unknown) => {
			const message = data as InitMessage;
			console.log(`📊 INIT: Group ${message.groupId} - ${Object.keys(message.data.series).length} series received`);

			// Convert server data format to our format
			const convertedData: Record<string, LiveDataPoint[]> = {};
			Object.entries(message.data.series).forEach(([key, points]) => {
				convertedData[key] = points.map(p => ({ t: p.t, v: p.v }));
			});

			setSeriesData(prev => {
				const newData = { ...prev, ...convertedData };
				console.log(`📊 INIT: Total series keys after merge: ${Object.keys(newData).length}`);
				return newData;
			});
		};

		const handleAppend = (data: unknown) => {
			const message = data as AppendMessage;
			// console.log(`📈 useLiveSeries: APPEND MESSAGE for ${message.key}`);
			// console.log('📈 useLiveSeries: Append data:', message);
			const { key, point } = message;

			setSeriesData(prev => {
				const existing = prev[key] || [];
				const updated = [...existing, { t: point.t, v: point.v }];

				// Keep only last 1000 points to prevent memory issues
				const trimmed = updated.slice(-1000);

				// console.log(`📈 useLiveSeries: Updated ${key}: ${existing.length} -> ${trimmed.length} points, latest value: ${point.v}`);

				return {
					...prev,
					[key]: trimmed,
				};
			});
		};

		const handleError = (data: unknown) => {
			const error = data as Error;
			console.error('❌ useLiveSeries: WebSocket Error:', error);
			console.error('❌ useLiveSeries: Error details:', JSON.stringify(error, null, 2));
			setConnectionState(liveSeriesClient.getConnectionState());
		};

		// Register event listeners
		liveSeriesClient.on('connect', handleConnect);
		liveSeriesClient.on('disconnect', handleDisconnect);
		liveSeriesClient.on('init', handleInit);
		liveSeriesClient.on('append', handleAppend);
		liveSeriesClient.on('error', handleError);

		// Cleanup on unmount
		return () => {
			liveSeriesClient.off('connect', handleConnect);
			liveSeriesClient.off('disconnect', handleDisconnect);
			liveSeriesClient.off('init', handleInit);
			liveSeriesClient.off('append', handleAppend);
			liveSeriesClient.off('error', handleError);
		};
	}, []);

	// Action functions
	const connect = React.useCallback(() => {
		return liveSeriesClient.connect();
	}, []);

	const disconnect = React.useCallback(() => {
		liveSeriesClient.disconnect();
		setSeriesData({}); // Clear data on disconnect
	}, []);

	const subscribe = React.useCallback((config: SubscriptionConfig) => {
		liveSeriesClient.subscribe(config);
	}, []);

	const unsubscribe = React.useCallback((groupId: string, series?: string[]) => {
		liveSeriesClient.unsubscribe(groupId, series);

		// Remove data for unsubscribed series
		if (series) {
			setSeriesData(prev => {
				const updated = { ...prev };
				series.forEach(key => {
					delete updated[key];
				});
				return updated;
			});
		} else {
			// Remove all data for the group - for now just clear everything
			// In a more sophisticated implementation, we'd track which series belong to which group
			setSeriesData({});
		}
	}, []);

	const backoff = React.useCallback(() => {
		liveSeriesClient.backoff();
	}, []);

	return {
		connectionState,
		isConnected: connectionState.connected,
		seriesData,
		connect,
		disconnect,
		subscribe,
		unsubscribe,
		backoff,
	};
}

/**
 * Hook for a specific series subscription
 * Manages the lifecycle of a single group subscription
 */
export function useLiveSeriesSubscription(
	groupId: string,
	series: string[],
	options: {
		res?: 'hi' | 'lo';
		since?: string;
		autoConnect?: boolean;
	} = {}
) {
	const {
		res = 'lo',
		since = '15m',
		autoConnect = true,
	} = options;

	const liveSeries = useLiveSeries();
	const [isSubscribed, setIsSubscribed] = React.useState(false);

	// Use ref to store series to avoid dependency issues
	const seriesRef = React.useRef(series);
	seriesRef.current = series;

	// Stable reference for series array
	const seriesKey = series.join(',');

	// Auto-connect and subscribe
	React.useEffect(() => {
		if (!autoConnect) return;

		const setup = async () => {
			try {
				if (!liveSeries.isConnected) {
					await liveSeries.connect();
				}

				console.log(`🚀 SUBSCRIBING: ${groupId} with ${seriesRef.current.length} series`);
				liveSeries.subscribe({
					groupId,
					series: seriesRef.current,
					res,
					since,
				});

				setIsSubscribed(true);
			} catch (error) {
				console.error(`❌ SUBSCRIPTION FAILED: ${groupId}`, error);
			}
		};

		setup();

		// Cleanup on unmount
		return () => {
			liveSeries.unsubscribe(groupId);
			setIsSubscribed(false);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [groupId, seriesKey, res, since, autoConnect]); // liveSeries intentionally omitted to prevent infinite loops

	// Filter series data for this subscription
	const subscriptionData = React.useMemo(() => {
		const filtered: Record<string, LiveDataPoint[]> = {};
		for (const key of seriesRef.current) {
			if (liveSeries.seriesData[key]) {
				filtered[key] = liveSeries.seriesData[key];
			}
		}
		
		// Only log when there's a mismatch
		if (Object.keys(filtered).length === 0 && seriesRef.current.length > 0) {
			console.log(`❌ FILTER MISMATCH: ${groupId} - Requested ${seriesRef.current.length} series, got 0`);
			console.log(`❌ Available: [${Object.keys(liveSeries.seriesData).slice(0, 5).join(', ')}...]`);
			console.log(`❌ Requested: [${seriesRef.current.slice(0, 5).join(', ')}...]`);
		}
		
		return filtered;
	}, [groupId, liveSeries.seriesData]); // seriesKey not needed since we use seriesRef.current

	return {
		...liveSeries,
		seriesData: subscriptionData,
		isSubscribed,
	};
}
