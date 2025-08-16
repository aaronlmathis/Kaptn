/**
 * Example usage of the cluster timeseries hook
 * 
 * This example demonstrates how to use the useClusterTimeseries hook
 * in a React component to display real-time cluster metrics.
 */

import React from 'react';
import { useClusterTimeseries } from '@/hooks/useClusterTimeseries';
import type { TimeSeriesKey } from '@/lib/api/timeseries';

interface TimeseriesExampleProps {
  /** Which metrics to display */
  metrics?: TimeSeriesKey[];
  /** Enable debug logging */
  debug?: boolean;
}

export function TimeseriesExample({ 
  metrics = ['cluster.cpu.used.cores', 'cluster.cpu.capacity.cores'],
  debug = false 
}: TimeseriesExampleProps) {
  const {
    series,
    capabilities,
    connectionState,
    refresh,
    connect,
    disconnect
  } = useClusterTimeseries(metrics, {
    enableStreaming: true,
    timeWindow: '60m',
    initialResolution: 'lo',
    debug
  });

  if (connectionState.isLoading) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center space-x-2">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span className="text-blue-700">Loading timeseries data...</span>
        </div>
      </div>
    );
  }

  if (connectionState.hasError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="text-red-700 font-medium">Error loading timeseries data</div>
        <div className="text-red-600 text-sm mt-1">
          {connectionState.error?.message || 'Unknown error'}
        </div>
        <button
          onClick={refresh}
          className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <div className={`h-2 w-2 rounded-full ${
            connectionState.isConnected ? 'bg-green-500' : 'bg-yellow-500'
          }`}></div>
          <span className="text-sm font-medium">
            {connectionState.isConnected ? 'Live Updates Active' : 'Disconnected'}
          </span>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={refresh}
            className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
          >
            Refresh
          </button>
          
          {connectionState.isConnected ? (
            <button
              onClick={disconnect}
              className="px-2 py-1 text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={connect}
              className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* Capabilities Status */}
      {capabilities && (
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-sm font-medium mb-2">API Capabilities</div>
          <div className="flex space-x-4 text-xs">
            <div className={`flex items-center space-x-1 ${
              capabilities.metricsAPI ? 'text-green-600' : 'text-red-600'
            }`}>
              <span>{capabilities.metricsAPI ? '✓' : '✗'}</span>
              <span>Metrics API</span>
            </div>
            <div className={`flex items-center space-x-1 ${
              capabilities.summaryAPI ? 'text-green-600' : 'text-red-600'
            }`}>
              <span>{capabilities.summaryAPI ? '✓' : '✗'}</span>
              <span>Summary API</span>
            </div>
          </div>
        </div>
      )}

      {/* Series Data */}
      <div className="space-y-3">
        <div className="text-lg font-medium">Time Series Data</div>
        
        {series.length === 0 ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="text-yellow-700">
              No data available. This could mean:
            </div>
            <ul className="text-yellow-600 text-sm mt-1 ml-4 list-disc">
              <li>The metrics APIs are not available in your cluster</li>
              <li>The aggregator is not running</li>
              <li>No data has been collected yet</li>
            </ul>
          </div>
        ) : (
          series.map((serie) => (
            <div key={serie.key} className="p-3 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div 
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: serie.color }}
                  ></div>
                  <span className="font-medium">{serie.name}</span>
                  <span className="text-xs text-gray-500">({serie.key})</span>
                </div>
                <span className="text-sm text-gray-600">
                  {serie.data.length} points
                </span>
              </div>
              
              {/* Latest Value */}
              {serie.data.length > 0 && (
                <div className="text-sm text-gray-600">
                  Latest: <span className="font-mono">
                    {serie.data[serie.data.length - 1][1].toFixed(2)}
                  </span>
                  {' '}
                  <span className="text-xs">
                    ({new Date(serie.data[serie.data.length - 1][0]).toLocaleTimeString()})
                  </span>
                </div>
              )}

              {/* Mini chart representation */}
              <div className="mt-2 h-8 bg-gray-100 rounded relative overflow-hidden">
                {serie.data.length > 1 && (
                  <div className="absolute inset-0 flex items-end">
                    {serie.data.slice(-20).map((point, idx) => {
                      const maxValue = Math.max(...serie.data.slice(-20).map(p => p[1]));
                      const height = maxValue > 0 ? (point[1] / maxValue) * 100 : 0;
                      return (
                        <div
                          key={idx}
                          className="flex-1 bg-blue-400 opacity-70 mr-px"
                          style={{ height: `${height}%` }}
                        ></div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Debug Information */}
      {debug && (
        <div className="mt-6 p-3 bg-gray-100 rounded-lg">
          <div className="text-sm font-medium mb-2">Debug Information</div>
          <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-40">
            {JSON.stringify({
              connectionState,
              capabilities,
              seriesCount: series.length,
              dataPoints: series.reduce((acc, s) => acc + s.data.length, 0)
            }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
